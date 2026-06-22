#!/usr/bin/env python3
"""
Context budget audit for /sdlc:doctor Group 7 (detect + notify only).

Remediation is owned by /sdlc:token-health --fix (calls run_fix from this module).

Usage:
  python3 .sdlc/bin/sdlc_context_optimize.py audit [--json]   # doctor
  python3 .sdlc/bin/sdlc_context_optimize.py fix [--dry-run]  # token-health --fix (internal)
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import shutil
import sys
from datetime import datetime, timezone
from typing import Any

from _sdlc_paths import REPO_ROOT

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bracket_compress import compress_text  # noqa: E402
from sdlc_token_health import bootstrap_tokenizer  # noqa: E402

DEFAULT_BUDGET = {
    "always_injected_warn_tokens": 12000,
    "hydration_eager_warn_tokens": 8000,
    "index_section_limits": {
        "ACTIVE_WORK": 6,
        "SPECS": 15,
        "HANDOFFS": 5,
    },
    "terminal_statuses": [
        "complete",
        "done",
        "merged",
        "discontinued",
        "superseded",
        "closed",
    ],
    "memory_archive_dir": ".cursor/memories/archive",
    "index_archive_dir": ".sdlc/archive/index",
}

MEMORY_FILES = [
    ".cursor/memories/architecture.md",
    ".cursor/memories/operational-context.md",
    ".cursor/memories/business-rules.md",
    ".cursor/memories/incidents.md",
]

INDEX_PATH = ".sdlc/INDEX.md"

DIRECTORY_INDICES = [
    ".github/README.md",
    ".cursor/commands/README.md",
    ".cursor/agents/README.md",
    ".cursor/rules/README.md",
    ".cursor/skills/README.md",
    "scripts/README.md",
]

ARCHIVABLE_INDEX_SECTIONS = {"ACTIVE_WORK", "SPECS", "HANDOFFS", "QA_EVIDENCE", "INCIDENTS"}

ADR_CATALOG_REPLACEMENT = """[KEY_ARCHITECTURAL_DECISIONS]
catalog→.sdlc/INDEX.md#ADRS
rule→full_adr_index_in_INDEX_not_memory|load_on_demand
archive→.cursor/memories/archive/architecture-adrs.md
[/KEY_ARCHITECTURAL_DECISIONS]
"""


def deduplicate_memory_adr_table(text: str, repo_root: pathlib.Path, dry_run: bool) -> tuple[str, bool]:
    """Replace verbose ADR table in architecture memory with INDEX catalog pointer."""
    pattern = r"## Key Architectural Decisions\n\n(\|[^\n]+\n\|[-| ]+\n(?:\|[^\n]+\n)+)"
    match = re.search(pattern, text)
    if not match:
        return text, False

    archived_block = match.group(0)
    archive_dir = repo_root / DEFAULT_BUDGET["memory_archive_dir"]
    archive_path = archive_dir / "architecture-adrs.md"
    if not dry_run:
        archive_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        header = f"[ARCHIVE source=architecture.md section=Key_Architectural_Decisions archived_at={stamp}]\n"
        if archive_path.is_file():
            archive_path.write_text(
                archive_path.read_text(encoding="utf-8") + "\n" + archived_block,
                encoding="utf-8",
            )
        else:
            archive_path.write_text(header + archived_block, encoding="utf-8")

    new_text = text[: match.start()] + ADR_CATALOG_REPLACEMENT + text[match.end() :]
    return new_text, True


def load_budget(repo_root: pathlib.Path) -> dict[str, Any]:
    budget = dict(DEFAULT_BUDGET)
    sdlc_yaml = repo_root / ".sdlc" / "sdlc.yaml"
    if not sdlc_yaml.is_file():
        return budget
    try:
        import yaml

        data = yaml.safe_load(sdlc_yaml.read_text(encoding="utf-8")) or {}
        ctx = data.get("context_budget") or {}
        if isinstance(ctx, dict):
            budget.update({k: v for k, v in ctx.items() if k != "index_section_limits"})
            limits = ctx.get("index_section_limits")
            if isinstance(limits, dict):
                budget["index_section_limits"] = {**budget["index_section_limits"], **limits}
    except Exception:
        pass
    return budget


def _extract_status(line: str) -> str | None:
    match = re.search(r"\bstatus=([A-Za-z_]+)", line, re.IGNORECASE)
    if match:
        return match.group(1).lower()
    match = re.search(r"\bphase=([A-Za-z_]+)", line, re.IGNORECASE)
    if match:
        return match.group(1).lower()
    if re.search(r"\b(complete|done|merged|discontinued|superseded|closed)\b", line, re.I):
        for token in ("complete", "done", "merged", "discontinued", "superseded", "closed"):
            if re.search(rf"\b{token}\b", line, re.I):
                return token.lower()
    return None


def _line_id(line: str) -> str:
    head = line.strip().split()[0] if line.strip() else "entry"
    return re.sub(r"[^\w-]", "", head)[:48]


def parse_index_sections(text: str) -> dict[str, list[str]]:
    sections: dict[str, list[str]] = {}
    current: str | None = None
    for raw in text.splitlines():
        open_match = re.match(r"^\[([A-Z0-9_.]+)\]\s*$", raw.strip())
        close_match = re.match(r"^\[/([A-Z0-9_.]+)\]\s*$", raw.strip())
        if open_match:
            current = open_match.group(1)
            sections.setdefault(current, [])
            continue
        if close_match:
            current = None
            continue
        if current and raw.strip() and not raw.strip().startswith("#"):
            sections[current].append(raw.rstrip())
    return sections


def rebuild_index(text: str, sections: dict[str, list[str]]) -> str:
    out_lines: list[str] = []
    current: str | None = None
    for raw in text.splitlines():
        open_match = re.match(r"^\[([A-Z0-9_.]+)\]\s*$", raw.strip())
        close_match = re.match(r"^\[/([A-Z0-9_.]+)\]\s*$", raw.strip())
        if open_match:
            current = open_match.group(1)
            out_lines.append(raw)
            for line in sections.get(current, []):
                out_lines.append(line)
            continue
        if close_match:
            out_lines.append(raw)
            current = None
            continue
        if current is None:
            out_lines.append(raw)
    return "\n".join(out_lines) + ("\n" if text.endswith("\n") else "")


def audit_index_sections(
    sections: dict[str, list[str]], budget: dict[str, Any]
) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    limits = budget["index_section_limits"]
    terminal = {s.lower() for s in budget["terminal_statuses"]}

    for section, lines in sections.items():
        if section not in ARCHIVABLE_INDEX_SECTIONS:
            continue
        limit = limits.get(section)
        archivable = [ln for ln in lines if (_extract_status(ln) or "") in terminal]
        over_limit = limit is not None and len(lines) > limit
        if archivable or over_limit:
            findings.append(
                {
                    "section": section,
                    "lines": len(lines),
                    "limit": limit,
                    "archivable_terminal": len(archivable),
                    "over_limit": over_limit,
                }
            )
    return findings


def audit_corpus(repo_root: pathlib.Path, count_fn) -> dict[str, Any]:
    budget = load_budget(repo_root)
    files: list[dict[str, Any]] = []

    for rel in MEMORY_FILES:
        path = repo_root / rel
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        tokens = count_fn(text)
        table_rows = len(re.findall(r"^\|", text, re.MULTILINE))
        files.append(
            {
                "path": rel,
                "kind": "memory",
                "load": "always_injected",
                "tokens": tokens,
                "table_rows": table_rows,
                "compressible": table_rows >= 3,
            }
        )

    index_path = repo_root / INDEX_PATH
    index_tokens = 0
    index_findings: list[dict[str, Any]] = []
    if index_path.is_file():
        index_text = index_path.read_text(encoding="utf-8", errors="replace")
        index_tokens = count_fn(index_text)
        sections = parse_index_sections(index_text)
        index_findings = audit_index_sections(sections, budget)
        files.append(
            {
                "path": INDEX_PATH,
                "kind": "index",
                "load": "hydrate_scoped",
                "tokens": index_tokens,
                "table_rows": 0,
                "compressible": False,
                "section_findings": index_findings,
            }
        )

    for rel in DIRECTORY_INDICES:
        path = repo_root / rel
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        table_rows = len(re.findall(r"^\|", text, re.MULTILINE))
        files.append(
            {
                "path": rel,
                "kind": "dir_index",
                "load": "on_demand",
                "tokens": count_fn(text),
                "table_rows": table_rows,
                "compressible": table_rows >= 4,
            }
        )

    memories_tokens = sum(f["tokens"] for f in files if f["kind"] == "memory")
    always_injected = memories_tokens
    hydration_estimate = always_injected + index_tokens

    warnings: list[str] = []
    if always_injected > budget["always_injected_warn_tokens"]:
        warnings.append(
            f"always_injected={always_injected} exceeds budget={budget['always_injected_warn_tokens']}"
        )
    if hydration_estimate > budget["hydration_eager_warn_tokens"] + always_injected:
        warnings.append(
            f"hydration_eager_estimate={hydration_estimate} high — archive INDEX sections or compress memories"
        )
    for finding in index_findings:
        if finding["archivable_terminal"]:
            warnings.append(
                f"INDEX[{finding['section']}] has {finding['archivable_terminal']} terminal entries to archive"
            )
        if finding.get("over_limit"):
            warnings.append(
                f"INDEX[{finding['section']}] lines={finding['lines']} limit={finding['limit']}"
            )

    compressible = [f for f in files if f.get("compressible")]

    return {
        "budget": budget,
        "files": files,
        "memories_tokens": memories_tokens,
        "index_tokens": index_tokens,
        "always_injected_tokens": always_injected,
        "warnings": warnings,
        "compressible_count": len(compressible),
        "status": "DEGRADED" if warnings else "OK",
    }


def archive_index_section(
    repo_root: pathlib.Path,
    section: str,
    lines: list[str],
    budget: dict[str, Any],
    dry_run: bool,
) -> tuple[list[str], list[str], str | None]:
    """Move terminal lines to archive; return (kept, archived, archive_rel_path)."""
    terminal = {s.lower() for s in budget["terminal_statuses"]}
    limit = budget["index_section_limits"].get(section)

    kept: list[str] = []
    archived: list[str] = []
    for line in lines:
        status = (_extract_status(line) or "").lower()
        if status in terminal:
            archived.append(line)
        else:
            kept.append(line)

    if limit is not None and len(kept) > limit:
        overflow = kept[:-limit]
        kept = kept[-limit:]
        archived = overflow + archived

    archive_rel: str | None = None
    if archived:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
        archive_dir = repo_root / budget["index_archive_dir"]
        archive_rel = f"{budget['index_archive_dir']}/{section.lower()}-{stamp}.md"
        archive_path = repo_root / archive_rel
        if not dry_run:
            archive_dir.mkdir(parents=True, exist_ok=True)
            header = f"[ARCHIVE section={section} archived_at={stamp}]\n"
            body = "\n".join(archived) + "\n"
            if archive_path.is_file():
                archive_path.write_text(archive_path.read_text(encoding="utf-8") + body, encoding="utf-8")
            else:
                archive_path.write_text(header + body, encoding="utf-8")

        catalog_lines = [
            f"{_line_id(ln)}→archived={archive_rel}"
            for ln in archived[: min(len(archived), 20)]
        ]
        if len(archived) > 20:
            catalog_lines.append(f"...and_{len(archived) - 20}_more→archived={archive_rel}")
        kept = catalog_lines + kept

    return kept, archived, archive_rel


def archive_memory_tables(
    repo_root: pathlib.Path,
    rel_path: str,
    text: str,
    budget: dict[str, Any],
    dry_run: bool,
) -> tuple[str, int]:
    """Archive completed rows from operational-context tables; return (new_text, archived_rows)."""
    if not rel_path.endswith("operational-context.md"):
        return text, 0

    terminal = {s.lower() for s in budget["terminal_statuses"]}
    archived_rows: list[str] = []
    new_text = text

    def archive_table_section(content: str, header_pattern: str) -> str:
        nonlocal archived_rows
        match = re.search(
            rf"(## {header_pattern}\n\n)(\|[^\n]+\n\|[-| ]+\n)((?:\|[^\n]+\n)+)",
            content,
            re.MULTILINE,
        )
        if not match:
            return content
        prefix, header_row, body = match.group(1), match.group(2), match.group(3)
        kept_rows = [header_row]
        for row in body.splitlines():
            if not row.strip().startswith("|"):
                continue
            status = (_extract_status(row) or "").lower()
            if status in terminal or re.search(r"\bcomplete\b", row, re.I):
                archived_rows.append(row)
            else:
                kept_rows.append(row)
        if not archived_rows:
            return content
        replacement = prefix + "\n".join(kept_rows) + "\n"
        return content[: match.start()] + replacement + content[match.end() :]

    new_text = archive_table_section(new_text, r"Active Features In Progress")
    new_text = archive_table_section(new_text, r"Recent Handoffs")
    new_text = archive_table_section(new_text, r"Sprint Objectives")

    if archived_rows and not dry_run:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
        archive_dir = repo_root / budget["memory_archive_dir"]
        archive_dir.mkdir(parents=True, exist_ok=True)
        archive_path = archive_dir / f"operational-context-{stamp}.md"
        block = "[ARCHIVE source=operational-context.md]\n" + "\n".join(archived_rows) + "\n"
        if archive_path.is_file():
            archive_path.write_text(archive_path.read_text(encoding="utf-8") + block, encoding="utf-8")
        else:
            archive_path.write_text(block, encoding="utf-8")
        catalog = (
            f"\n[ARCHIVE_CATALOG]\n"
            f"operational_context_rows→{budget['memory_archive_dir']}/operational-context-{stamp}.md\n"
            f"[/ARCHIVE_CATALOG]\n"
        )
        if "[ARCHIVE_CATALOG]" not in new_text:
            new_text = new_text.rstrip() + "\n" + catalog

    return new_text, len(archived_rows)


def compress_file_at_path(
    repo_root: pathlib.Path,
    rel: str,
    count_fn,
    dry_run: bool,
) -> dict[str, Any]:
    path = repo_root / rel
    original = path.read_text(encoding="utf-8", errors="replace")
    original_tokens = count_fn(original)
    compressed = compress_text(original)
    compressed_tokens = count_fn(compressed)
    reduction = (
        (original_tokens - compressed_tokens) / original_tokens * 100 if original_tokens else 0.0
    )
    result = {
        "path": rel,
        "original_tokens": original_tokens,
        "compressed_tokens": compressed_tokens,
        "reduction_pct": round(reduction, 1),
        "applied": False,
    }
    if reduction < 5.0:
        result["skipped"] = "reduction below 5%"
        return result
    if dry_run:
        result["applied"] = True
        result["dry_run"] = True
        return result
    backup = str(path) + ".pre-optimize.bak"
    shutil.copy2(path, backup)
    path.write_text(compressed, encoding="utf-8")
    result["applied"] = True
    result["backup"] = backup
    return result


def run_fix(repo_root: pathlib.Path, dry_run: bool = False) -> dict[str, Any]:
    count_fn, _ = bootstrap_tokenizer()
    budget = load_budget(repo_root)
    actions: list[dict[str, Any]] = []

    index_path = repo_root / INDEX_PATH
    if index_path.is_file():
        text = index_path.read_text(encoding="utf-8", errors="replace")
        sections = parse_index_sections(text)
        for section in ARCHIVABLE_INDEX_SECTIONS:
            if section not in sections:
                continue
            kept, archived, archive_rel = archive_index_section(
                repo_root, section, sections[section], budget, dry_run
            )
            if archived:
                sections[section] = kept
                actions.append(
                    {
                        "action": "index_archive",
                        "section": section,
                        "archived_lines": len(archived),
                        "archive": archive_rel,
                        "dry_run": dry_run,
                    }
                )
        if any(a["action"] == "index_archive" for a in actions):
            new_index = rebuild_index(text, sections)
            if not dry_run:
                shutil.copy2(index_path, str(index_path) + ".pre-optimize.bak")
                index_path.write_text(new_index, encoding="utf-8")

    for rel in MEMORY_FILES:
        path = repo_root / rel
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        memory_changed = False

        if rel.endswith("architecture.md"):
            text, adr_deduped = deduplicate_memory_adr_table(text, repo_root, dry_run)
            if adr_deduped:
                memory_changed = True
                actions.append({"action": "memory_adr_dedup", "path": rel, "dry_run": dry_run})

        text, n_archived = archive_memory_tables(repo_root, rel, text, budget, dry_run)
        if n_archived:
            memory_changed = True
            actions.append(
                {"action": "memory_archive", "path": rel, "rows": n_archived, "dry_run": dry_run}
            )

        if memory_changed and not dry_run:
            shutil.copy2(path, str(path) + ".pre-optimize.bak")
            path.write_text(text, encoding="utf-8")

    targets = MEMORY_FILES + [p for p in DIRECTORY_INDICES if (repo_root / p).is_file()]
    for rel in targets:
        path = repo_root / rel
        if not path.is_file():
            continue
        table_rows = len(re.findall(r"^\|", path.read_text(encoding="utf-8"), re.MULTILINE))
        if table_rows < 3 and rel not in MEMORY_FILES:
            continue
        result = compress_file_at_path(repo_root, rel, count_fn, dry_run)
        if result.get("applied"):
            actions.append({"action": "bracket_compress", **result})

    post = audit_corpus(repo_root, count_fn)
    return {"actions": actions, "post_audit": post, "dry_run": dry_run}


def render_report(audit: dict[str, Any]) -> str:
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines = [
        f"SDLC Context Optimize Report — {ts}",
        "=" * 64,
        "",
        "[CONTEXT.BUDGET]",
        f"always_injected_tokens={audit['always_injected_tokens']}",
        f"index_tokens={audit['index_tokens']}",
        f"budget_warn={audit['budget']['always_injected_warn_tokens']}",
        f"status={audit['status']}",
        "",
        "[FILES]",
    ]
    for f in audit["files"]:
        flags = []
        if f.get("compressible"):
            flags.append("compressible")
        if f.get("section_findings"):
            flags.append(f"sections={len(f['section_findings'])}")
        flag_str = f" ({','.join(flags)})" if flags else ""
        lines.append(f"  {f['path']} tokens={f['tokens']} load={f['load']}{flag_str}")
    lines.append("")
    if audit["warnings"]:
        lines.append("[WARNINGS]")
        for w in audit["warnings"]:
            lines.append(f"  ⚠ {w}")
        lines.append("")
        lines.append("remediation=python3 .sdlc/bin/sdlc_token_health.py --fix")
    else:
        lines.append("[VERDICT] status=OK")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="SDLC context budget optimizer")
    sub = parser.add_subparsers(dest="command", required=True)
    audit_p = sub.add_parser("audit", help="Audit context corpus (default for doctor)")
    audit_p.add_argument("--json", action="store_true")
    fix_p = sub.add_parser("fix", help="Archive stale entries and bracket-compress tables")
    fix_p.add_argument("--dry-run", action="store_true")
    fix_p.add_argument("--json", action="store_true")

    args = parser.parse_args()
    repo_root = pathlib.Path(REPO_ROOT)
    count_fn, _ = bootstrap_tokenizer()

    if args.command == "audit":
        audit = audit_corpus(repo_root, count_fn)
        if args.json:
            print(json.dumps(audit, indent=2))
        else:
            print(render_report(audit))
        return 0 if audit["status"] == "OK" else 2

    if args.command == "fix":
        result = run_fix(repo_root, dry_run=getattr(args, "dry_run", False))
        if args.json:
            print(json.dumps(result, indent=2))
        else:
            print(render_report(result["post_audit"]))
            print("\n[FIX.ACTIONS]")
            for action in result["actions"]:
                print(f"  {action}")
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
