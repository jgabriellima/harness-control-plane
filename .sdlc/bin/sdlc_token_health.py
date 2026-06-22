#!/usr/bin/env python3
"""
/sdlc:token-health — full execution entrypoint.
Usage: python3 .sdlc/bin/sdlc_token_health.py [--fix] [--html] [--canvas] [--scope=PATH] [--threshold=FLOAT]
"""
from __future__ import annotations

import argparse
import glob
import math
import os
import pathlib
import re
import shutil
import statistics
import subprocess
import sys
from collections import defaultdict
from datetime import datetime

# load_context semantics:
#   always_injected     — file bytes loaded into LLM context every session (rules, memories)
#   on_invocation       — loaded when user invokes a command/agent/skill
#   session_output_injected — hook script runs; only its stdout JSON enters context (not source)
#   on_event_prompt     — prompt text from hooks.json injected on specific events (e.g. stop)
#   runtime_executed    — subprocess only (LangSmith trace, stub write); zero LLM context
INSTRUCTION_SCOPES = {
    ".cursor/rules": {"ext": ["*.mdc", "*.md"], "load_context": "always_injected", "weight": 3.0},
    ".cursor/commands": {"ext": ["*.md"], "load_context": "on_invocation", "weight": 2.0},
    ".cursor/agents": {"ext": ["*.md"], "load_context": "on_invocation", "weight": 2.0},
    ".cursor/skills": {"ext": ["*.md"], "load_context": "on_invocation", "weight": 1.5},
    ".cursor/memories": {"ext": ["*.md"], "load_context": "always_injected", "weight": 3.0},
    ".sdlc/workflows": {"ext": ["*.yaml", "*.yml"], "load_context": "on_invocation", "weight": 1.5},
    ".sdlc/playbooks": {"ext": ["*.yaml", "*.yml", "*.md"], "load_context": "on_provision", "weight": 1.5},
    ".sdlc/templates": {"ext": ["*.md"], "load_context": "on_invocation", "weight": 1.0},
    ".cursor/hooks": {"ext": ["*.sh", "*.py", "*.json"], "load_context": "hook", "weight": 0.0},
}

HOOK_FILE_LOAD: dict[str, tuple[str, float]] = {
    "hook_handler.py": ("runtime_executed", 0.0),
    "session-stop.sh": ("runtime_executed", 0.0),
    "session-start.sh": ("session_output_injected", 0.0),
    "hooks.json": ("on_event_prompt", 2.0),
}

EXCLUDE_PATTERNS = ["README.md", "ADR-000-template.md"]

RISK_TIERS = {
    "RED": "Token count > mean + 1.5σ. Bloated instruction file — dilutes agent focus, consumes disproportionate context window.",
    "ORANGE": "Token count > mean + 0.75σ. Above-average density — monitor, candidate for refactor.",
    "GREEN": "Within normal distribution band.",
    "THIN": "Token count < mean - 1.0σ. Potentially under-specified — verify intent is complete.",
}

DUPLICATION_PHRASES = [
    "no emojis",
    "no emoji",
    "TypeScript strict",
    "no `any`",
    "no any",
    "Tailwind",
    "worktree",
    "Plane ticket",
    "INDEX.md",
    "forbidden pattern",
    "output-standards",
    "architecture.mdc",
]

TIER_SYMBOL = {
    "RED": "[RED]",
    "ORANGE": "[ORANGE]",
    "GREEN": "[OK]",
    "THIN": "[THIN]",
    "N/A": "[RUNTIME]",
}

from bracket_compress import (
    apply_bracket_compression,
    apply_cross_ref_substitutions,
    compress_text,
    convert_markdown_tables,
)


def bootstrap_tokenizer():
    try:
        import tiktoken

        enc = tiktoken.get_encoding("cl100k_base")

        def count(text: str) -> int:
            return len(enc.encode(text))

        return count, "tiktoken:cl100k_base"
    except ImportError:
        try:
            subprocess.run(
                [sys.executable, "-m", "pip", "install", "tiktoken", "-q"],
                check=True,
                capture_output=True,
            )
            import tiktoken

            enc = tiktoken.get_encoding("cl100k_base")

            def count(text: str) -> int:
                return len(enc.encode(text))

            return count, "tiktoken:cl100k_base (just installed)"
        except Exception:

            def count(text: str) -> int:
                return max(1, len(text) // 4)

            return count, "heuristic:char/4 (tiktoken unavailable)"


def collect_corpus(root: str = ".") -> list[dict]:
    entries = []
    for scope_path, meta in INSTRUCTION_SCOPES.items():
        full_scope = os.path.join(root, scope_path)
        if not os.path.isdir(full_scope):
            continue
        for pattern in meta["ext"]:
            for filepath in glob.glob(os.path.join(full_scope, "**", pattern), recursive=True):
                basename = os.path.basename(filepath)
                if any(ex in basename for ex in EXCLUDE_PATTERNS):
                    continue
                try:
                    text = pathlib.Path(filepath).read_text(encoding="utf-8", errors="replace")
                except OSError:
                    continue
                load_context = meta["load_context"]
                weight = meta["weight"]
                if scope_path == ".cursor/hooks":
                    override = HOOK_FILE_LOAD.get(basename)
                    if override:
                        load_context, weight = override

                entries.append(
                    {
                        "path": filepath,
                        "scope": scope_path,
                        "load_context": load_context,
                        "weight": weight,
                        "text": text,
                        "char_count": len(text),
                    }
                )
    return entries


def analyze_corpus(entries: list[dict], count_fn) -> dict:
    for e in entries:
        e["token_count"] = count_fn(e["text"])
        e["weighted_tokens"] = e["token_count"] * e["weight"]

    instruction_entries = [e for e in entries if e["load_context"] != "runtime_executed"]
    token_counts = [e["token_count"] for e in instruction_entries]
    if len(token_counts) < 2:
        mean = token_counts[0] if token_counts else 0
        stdev = 0
    else:
        mean = statistics.mean(token_counts)
        stdev = statistics.stdev(token_counts)

    sorted_counts = sorted(token_counts)
    n = len(sorted_counts)
    p50 = sorted_counts[n // 2]
    p90 = sorted_counts[int(n * 0.90)] if n > 1 else sorted_counts[0]
    p95 = sorted_counts[int(n * 0.95)] if n > 1 else sorted_counts[0]

    rules_tokens = sum(e["token_count"] for e in entries if e["scope"] == ".cursor/rules")
    memories_tokens = sum(e["token_count"] for e in entries if e["scope"] == ".cursor/memories")
    always_injected_raw = rules_tokens + memories_tokens
    total_corpus = sum(e["token_count"] for e in instruction_entries)

    return {
        "mean": mean,
        "stdev": stdev,
        "p50": p50,
        "p90": p90,
        "p95": p95,
        "total_corpus": total_corpus,
        "always_injected_raw": always_injected_raw,
        "rules_tokens": rules_tokens,
        "memories_tokens": memories_tokens,
        "file_count": len(entries),
        "instruction_file_count": len(instruction_entries),
        "runtime_only_count": len(entries) - len(instruction_entries),
    }


def classify_file(entry: dict, stats: dict, threshold: float = 1.5) -> dict:
    tc = entry["token_count"]
    mean, stdev = stats["mean"], stats["stdev"]
    load = entry["load_context"]

    if load == "runtime_executed":
        entry["z_score"] = 0.0
        entry["duplication_signals"] = []
        entry["risk_tier"] = "N/A"
        entry["risk_description"] = "Runtime subprocess — source not loaded into LLM context."
        return entry

    z_score = (tc - mean) / stdev if stdev > 0 else 0
    entry["z_score"] = z_score

    if tc > mean + threshold * stdev:
        tier = "RED"
    elif tc > mean + 0.75 * stdev:
        tier = "ORANGE"
    elif tc < mean - 1.0 * stdev:
        tier = "THIN"
    else:
        tier = "GREEN"

    if load == "always_injected" and tier == "ORANGE":
        tier = "RED"

    text_lower = entry["text"].lower()
    dup_hits = [p for p in DUPLICATION_PHRASES if p.lower() in text_lower]
    entry["duplication_signals"] = dup_hits
    entry["risk_tier"] = tier
    entry["risk_description"] = RISK_TIERS[tier]

    return entry


def detect_cross_duplication(entries: list[dict]) -> list[dict]:
    phrase_occurrences = defaultdict(list)
    for e in entries:
        text_lower = e["text"].lower()
        for phrase in DUPLICATION_PHRASES:
            if phrase.lower() in text_lower:
                phrase_occurrences[phrase].append(e["path"])

    duplications = []
    for phrase, paths in phrase_occurrences.items():
        if len(paths) >= 2:
            always_injected_count = sum(
                1
                for p in paths
                if any(
                    p.startswith(scope)
                    for scope, m in INSTRUCTION_SCOPES.items()
                    if m["load_context"] == "always_injected"
                )
            )
            duplications.append(
                {
                    "phrase": phrase,
                    "occurrences": len(paths),
                    "files": paths,
                    "always_injected_count": always_injected_count,
                    "severity": "HIGH" if always_injected_count >= 2 else "MEDIUM",
                }
            )

    return sorted(duplications, key=lambda x: (-x["always_injected_count"], -x["occurrences"]))


def render_report(entries: list[dict], stats: dict, duplications: list[dict], tokenizer_label: str) -> str:
    lines = []
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    lines.append(f"SDLC Token Health Report — {ts}")
    lines.append(f"Tokenizer: {tokenizer_label}")
    lines.append("=" * 64)
    lines.append("")

    lines.append("[CORPUS.SUMMARY]")
    lines.append(f"files={stats['file_count']}")
    lines.append(f"total_tokens={stats['total_corpus']}")
    lines.append(f"always_injected_raw={stats['always_injected_raw']}")
    lines.append(f"rules_tokens={stats['rules_tokens']} memories_tokens={stats['memories_tokens']}")
    lines.append(f"runtime_only_files={stats.get('runtime_only_count', 0)}")
    lines.append(f"mean={stats['mean']:.0f} stdev={stats['stdev']:.0f}")
    lines.append("session_context=sessionStart→.cursor/hooks/session-start.sh→additional_context")
    lines.append("note=hook_handler.py|session-stop.sh excluded from risk tiers (runtime_executed)")
    lines.append(f"p50={stats['p50']} p90={stats['p90']} p95={stats['p95']}")
    lines.append("")

    by_scope = defaultdict(list)
    for e in entries:
        by_scope[e["scope"]].append(e)

    lines.append("[FILES.BY_SCOPE]")
    for scope in sorted(by_scope.keys()):
        scope_entries = sorted(by_scope[scope], key=lambda x: -x["token_count"])
        scope_total = sum(e["token_count"] for e in scope_entries)
        lines.append(f"  scope={scope} files={len(scope_entries)} tokens={scope_total}")
        for e in scope_entries:
            sym = TIER_SYMBOL[e["risk_tier"]]
            dup = f" dup:{len(e['duplication_signals'])}" if e["duplication_signals"] else ""
            lines.append(
                f"    {sym} {os.path.relpath(e['path'])} "
                f"tokens={e['token_count']} z={e['z_score']:+.2f}{dup}"
            )
    lines.append("")

    flagged = [e for e in entries if e.get("risk_tier") in ("RED", "ORANGE")]
    if flagged:
        lines.append("[RISK.REGISTER]")
        for e in sorted(flagged, key=lambda x: -x["token_count"]):
            lines.append(f"  {TIER_SYMBOL[e['risk_tier']]} {os.path.relpath(e['path'])}")
            lines.append(f"    tokens={e['token_count']} z={e['z_score']:+.2f} load={e['load_context']}")
            lines.append(f"    risk={e['risk_description']}")
            if e["duplication_signals"]:
                lines.append(f"    dup_signals={e['duplication_signals']}")
        lines.append("")

    thin = [e for e in entries if e["risk_tier"] == "THIN"]
    if thin:
        lines.append("[THIN.FILES]")
        for e in thin:
            lines.append(f"  [THIN] {os.path.relpath(e['path'])} tokens={e['token_count']} z={e['z_score']:+.2f}")
        lines.append("")

    if duplications:
        lines.append("[DUPLICATION.ANALYSIS]")
        for d in duplications:
            lines.append(
                f"  [{d['severity']}] phrase='{d['phrase']}' occurrences={d['occurrences']} "
                f"always_injected={d['always_injected_count']}"
            )
            for f in d["files"]:
                lines.append(f"    - {os.path.relpath(f)}")
        lines.append("")

    red_count = sum(1 for e in entries if e["risk_tier"] == "RED")
    orange_count = sum(1 for e in entries if e["risk_tier"] == "ORANGE")
    high_dup = sum(1 for d in duplications if d["severity"] == "HIGH")

    if red_count > 0 or high_dup > 0:
        verdict = "CRITICAL"
    elif orange_count > 0:
        verdict = "DEGRADED"
    else:
        verdict = "HEALTHY"

    lines.append("[VERDICT]")
    lines.append(f"status={verdict}")
    lines.append(f"red={red_count} orange={orange_count} thin={len(thin)} high_dup={high_dup}")
    if flagged or high_dup > 0:
        lines.append("action=run_with_--fix_to_compress_flagged_files")
    lines.append("")

    return "\n".join(lines)


def compress_file(entry: dict, count_fn, dry_run: bool = False) -> dict:
    original_text = entry["text"]
    original_tokens = entry["token_count"]
    filepath = entry["path"]

    compressed = compress_text(original_text)

    compressed_tokens = count_fn(compressed)
    reduction = (original_tokens - compressed_tokens) / original_tokens * 100 if original_tokens > 0 else 0

    result = {
        "path": filepath,
        "original_tokens": original_tokens,
        "compressed_tokens": compressed_tokens,
        "reduction_pct": reduction,
        "success": False,
    }

    if reduction < 5.0:
        result["skipped_reason"] = f"reduction {reduction:.1f}% below 5% threshold — no change applied"
        return result

    if dry_run:
        result["success"] = True
        result["note"] = "dry_run=True — changes not written"
        return result

    backup_path = filepath + ".pre-fix.bak"
    shutil.copy2(filepath, backup_path)

    try:
        pathlib.Path(filepath).write_text(compressed, encoding="utf-8")
        result["success"] = True
        result["backup"] = backup_path
    except OSError as exc:
        result["error"] = str(exc)
        shutil.copy2(backup_path, filepath)

    return result


def run_fix(flagged_entries: list[dict], count_fn) -> list[dict]:
    fix_results = []
    for entry in sorted(flagged_entries, key=lambda x: -x["token_count"]):
        result = compress_file(entry, count_fn)
        fix_results.append(result)
        status = "COMPRESSED" if result["success"] else "SKIPPED"
        skipped = result.get("skipped_reason", result.get("error", ""))
        print(
            f"  {status} {os.path.relpath(result['path'])}: "
            f"{result['original_tokens']} → {result['compressed_tokens']} tokens "
            f"({result['reduction_pct']:.1f}%) {skipped}"
        )
    return fix_results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fix", action="store_true", help="Apply compression to flagged files")
    parser.add_argument("--html", action="store_true", help="Write print-ready HTML report to .sdlc/")
    parser.add_argument("--canvas", action="store_true", help="Write Cursor canvas to IDE canvases path")
    parser.add_argument("--html-out", default=None, help="Override HTML output path")
    parser.add_argument("--canvas-out", default=None, help="Override canvas output path")
    parser.add_argument("--scope", default=None, help="Limit scan to a specific directory path")
    parser.add_argument("--threshold", type=float, default=1.5, help="σ multiplier for RED tier (default: 1.5)")
    args = parser.parse_args()

    count_fn, tokenizer_label = bootstrap_tokenizer()
    print(f"Tokenizer: {tokenizer_label}")

    from _sdlc_paths import REPO_ROOT

    root = str(REPO_ROOT)
    entries = collect_corpus(root)
    if args.scope:
        entries = [e for e in entries if e["scope"].startswith(args.scope) or args.scope in e["path"]]

    if not entries:
        print("No instruction files found in scope. Check --scope path.")
        sys.exit(0)

    stats = analyze_corpus(entries, count_fn)
    for e in entries:
        classify_file(e, stats, threshold=args.threshold)

    duplications = detect_cross_duplication(entries)
    report = render_report(entries, stats, duplications, tokenizer_label)
    print(report)

    if args.html or args.canvas:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        if script_dir not in sys.path:
            sys.path.insert(0, script_dir)
        from token_health_artifacts import (
            build_audit_bundle,
            default_canvas_path,
            write_artifacts,
        )

        bundle = build_audit_bundle(entries, stats, duplications, tokenizer_label, root)
        html_path = args.html_out or os.path.join(root, ".sdlc", "sdlc-token-health.html")
        canvas_path = args.canvas_out or default_canvas_path() if args.canvas else None
        html_out = html_path if args.html else None
        written = write_artifacts(bundle, html_path=html_out, canvas_path=canvas_path)
        print("\n[ARTIFACTS]")
        for path in written:
            print(f"  written={path}")

    if args.fix:
        import pathlib

        from sdlc_context_optimize import run_fix as context_run_fix

        print("[FIX] Phase 1: hydration corpus — INDEX archive, memory archive, bracket compress")
        ctx_result = context_run_fix(pathlib.Path(REPO_ROOT), dry_run=False)
        for action in ctx_result["actions"]:
            print(f"  {action}")
        post = ctx_result["post_audit"]
        print(
            f"  hydration_after: always_injected={post['always_injected_tokens']} "
            f"index={post['index_tokens']} status={post['status']}"
        )

        print("\n[FIX] Phase 2: flagged instruction corpus (RED/ORANGE tier)")
        entries = collect_corpus(root)
        if args.scope:
            entries = [e for e in entries if e["scope"].startswith(args.scope) or args.scope in e["path"]]
        for e in entries:
            e["token_count"] = count_fn(pathlib.Path(e["path"]).read_text(encoding="utf-8", errors="replace"))
        stats = analyze_corpus(entries, count_fn)
        for e in entries:
            classify_file(e, stats, threshold=args.threshold)

        flagged = [e for e in entries if e.get("risk_tier") in ("RED", "ORANGE")]
        if not flagged:
            print("[FIX] No RED/ORANGE files — phase 2 skipped.")
        else:
            print(f"[FIX] Compressing {len(flagged)} flagged files...")
            fix_results = run_fix(flagged, count_fn)
            total_before = sum(r["original_tokens"] for r in fix_results)
            total_after = sum(r["compressed_tokens"] for r in fix_results)
            reduction = (total_before - total_after) / total_before * 100 if total_before > 0 else 0
            print("\n[FIX.RESULTS.CORPUS]")
            print(f"files_processed={len(fix_results)}")
            print(f"total_tokens_before={total_before}")
            print(f"total_tokens_after={total_after}")
            print(f"total_reduction={reduction:.1f}%")
        print("backups_at=*.pre-fix.bak and *.pre-optimize.bak")


if __name__ == "__main__":
    main()
