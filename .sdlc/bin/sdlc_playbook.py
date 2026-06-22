#!/usr/bin/env python3
"""
Playbook runtime — catalog, resolve, provision, verify, research-gate.

Domain procedural specs live in .sdlc/playbooks/ (ADR-010).
Skills (.cursor/skills/{name}/SKILL.md) are NOT modified by this script.

Usage:
  python3 .sdlc/bin/sdlc_playbook.py catalog [--summary] [--json]
  python3 .sdlc/bin/sdlc_playbook.py validate [--id pb.vendor.name]
  python3 .sdlc/bin/sdlc_playbook.py resolve --domain tag1,tag2 [--json]
  python3 .sdlc/bin/sdlc_playbook.py resolve --query "OpenAI realtime Web3D" [--json]
  python3 .sdlc/bin/sdlc_playbook.py resolve --capability http:openai-api [--json]
  python3 .sdlc/bin/sdlc_playbook.py learn-init --query "..." [--run-id slug]
  python3 .sdlc/bin/sdlc_playbook.py research-gate --run-id slug
  python3 .sdlc/bin/sdlc_playbook.py provision --ids pb.a,pb.b [--json]
  python3 .sdlc/bin/sdlc_playbook.py register --file domains/vendor/name.pb.yaml
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from _sdlc_paths import REPO_ROOT, SDLC_ROOT

try:
    import yaml
except ImportError:
    print("ERROR: PyYAML required. pip install pyyaml", file=sys.stderr)
    sys.exit(1)

PLAYBOOKS_DIR = SDLC_ROOT / "playbooks"
RESEARCH_DIR = PLAYBOOKS_DIR / ".research"
SCHEMA_PATH = PLAYBOOKS_DIR / "playbook.schema.json"
PLAYBOOKS_INDEX = PLAYBOOKS_DIR / "PLAYBOOKS.md"
INDEX_PATH = SDLC_ROOT / "INDEX.md"
RESEARCH_TEMPLATE = SDLC_ROOT / "templates" / "playbook-research-report.md"
DELIVERY_TEMPLATE = SDLC_ROOT / "templates" / "playbook-delivery.md"

PLAN_LANGUAGE_RE = re.compile(
    r"\b(consider|you could|you may|alternatively|optionally|one approach|another option)\b",
    re.IGNORECASE,
)

REQUIRED_RESEARCH_SECTIONS = (
    "## Capability Targets",
    "## Sources",
    "## Decision Log",
    "## Rejected Alternatives",
    "## MUST / MUST NOT",
    "## Gate Checklist",
)

MIN_SOURCES_PER_TARGET = 2

# Paths a /sdlc:learn run may touch (F0–F3 register-only). Everything else is contamination.
LEARN_ALLOWED_PREFIXES = (
    ".sdlc/playbooks/",
    ".sdlc/templates/playbook-",
    ".sdlc/templates/design-contract.md",
    ".sdlc/bin/sdlc_playbook.py",
    ".sdlc/bin/visual_fidelity_check.py",
)

LEARN_ALLOWED_EXACT = (
    ".sdlc/playbooks/PLAYBOOKS.md",
)

# Never modified by learn unless --wire is recorded in manifest.wire_targets
LEARN_FORBIDDEN_PREFIXES = (
    ".cursor/agents/",
    ".cursor/rules/",
    ".cursor/skills/",
    ".cursor/hooks/",
    ".cursor/memories/",
    "app/",
    ".sdlc/workflows/",
)

LEARN_FORBIDDEN_EXACT = (
    ".sdlc/sdlc.yaml",
    ".cursor/commands/sdlc-implement.md",
    ".cursor/commands/sdlc-reflect.md",
    ".cursor/commands/sdlc-implement.md",
)


def _git_status_paths() -> set[str]:
    """All paths with working-tree changes (modified, added, deleted, untracked)."""
    result = subprocess.run(
        ["git", "-C", str(REPO_ROOT), "status", "--porcelain"],
        capture_output=True,
        text=True,
        check=False,
    )
    paths: set[str] = set()
    for line in result.stdout.splitlines():
        if len(line) < 4:
            continue
        raw = line[3:].strip()
        if " -> " in raw:
            raw = raw.split(" -> ", 1)[1]
        paths.add(raw)
    return paths


def _is_allowed_learn_path(path: str, wire_targets: list[str]) -> bool:
    if path in LEARN_ALLOWED_EXACT:
        return True
    for prefix in LEARN_ALLOWED_PREFIXES:
        if path.startswith(prefix):
            return True
    for target in wire_targets:
        if target.startswith("workflow:") and path.startswith(".sdlc/workflows/"):
            return True
        if target.startswith("command:") and path.startswith(".cursor/commands/"):
            allowed = target.split(":", 1)[1]
            if path == allowed or path.endswith("/" + allowed):
                return True
    return False


def _is_forbidden_learn_path(path: str, wire_targets: list[str]) -> bool:
    if path in LEARN_FORBIDDEN_EXACT:
        return True
    for prefix in LEARN_FORBIDDEN_PREFIXES:
        if path.startswith(prefix):
            if prefix == ".sdlc/workflows/" and wire_targets:
                continue
            if prefix == ".cursor/skills/" and any(t.startswith("skill:") for t in wire_targets):
                continue
            return True
    if path.startswith(".cursor/commands/") and not any(
        t.startswith("command:") for t in wire_targets
    ):
        if path not in (".cursor/commands/sdlc-learn.md",):
            return True
    if path.startswith(".sdlc/context/learnings/"):
        return True
    return False


def check_learn_contamination(
    baseline: set[str], wire_targets: list[str] | None = None
) -> list[str]:
    """Return contamination errors for files changed since learn-init baseline."""
    wire = wire_targets or []
    current = _git_status_paths()
    delta = current - baseline
    errors: list[str] = []
    for path in sorted(delta):
        if _is_forbidden_learn_path(path, wire):
            errors.append(f"FORBIDDEN touch: {path}")
        elif not _is_allowed_learn_path(path, wire):
            errors.append(f"UNALLOWED touch (not in learn allowlist): {path}")
    return errors


def _load_yaml(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as f:
        data = yaml.safe_load(f)
    if not isinstance(data, dict):
        raise ValueError(f"Expected mapping in {path}")
    return data


def discover_playbook_files() -> list[Path]:
    return sorted(PLAYBOOKS_DIR.glob("**/*.pb.yaml"))


def load_playbook(path: Path) -> dict[str, Any]:
    data = _load_yaml(path)
    data["_path"] = str(path.relative_to(REPO_ROOT))
    return data


def load_catalog() -> dict[str, dict[str, Any]]:
    catalog: dict[str, dict[str, Any]] = {}
    for path in discover_playbook_files():
        try:
            pb = load_playbook(path)
            pid = pb.get("metadata", {}).get("id")
            if pid:
                catalog[pid] = pb
        except Exception as exc:
            print(f"WARN: skip {path}: {exc}", file=sys.stderr)
    return catalog


def validate_playbook(pb: dict[str, Any], path: Path | None = None) -> list[str]:
    errors: list[str] = []
    for field in ("apiVersion", "kind", "metadata", "objective", "procedure", "done", "observability"):
        if field not in pb:
            errors.append(f"missing required field: {field}")

    meta = pb.get("metadata") or {}
    pid = meta.get("id", "")
    if not re.match(r"^pb\.[a-z0-9]+(\.[a-z0-9-]+)+$", pid or ""):
        errors.append(f"metadata.id invalid: {pid!r}")

    ver = meta.get("version", "")
    if not re.match(r"^\d+\.\d+\.\d+$", ver or ""):
        errors.append(f"metadata.version invalid: {ver!r}")

    domain = meta.get("domain")
    if not domain or not isinstance(domain, list):
        errors.append("metadata.domain must be non-empty array")

    proc = pb.get("procedure") or []
    if not proc:
        errors.append("procedure must have at least one step")
    for step in proc:
        if step.get("mode") not in ("deterministic", "adaptive"):
            errors.append(f"step {step.get('id')}: mode must be deterministic|adaptive")
        if step.get("mode") == "adaptive" and proc.index(step) == len(proc) - 1:
            if not step.get("validate"):
                errors.append(f"step {step.get('id')}: adaptive last step needs validate[]")

    done = pb.get("done") or []
    if not done:
        errors.append("done must have at least one gate")

    obs = pb.get("observability") or {}
    trace = obs.get("trace") or {}
    if not trace.get("start") or not trace.get("done"):
        errors.append("observability.trace requires start and done")

    if path and errors:
        errors = [f"{path}: {e}" for e in errors]
    return errors


def resolve_deps(catalog: dict[str, dict[str, Any]], ids: list[str]) -> tuple[list[str], list[str]]:
    """Topological closure of playbook deps. Returns (ordered_ids, errors)."""
    errors: list[str] = []
    ordered: list[str] = []
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(pid: str) -> None:
        if pid in visited:
            return
        if pid in visiting:
            errors.append(f"circular dependency: {pid}")
            return
        if pid not in catalog:
            errors.append(f"missing playbook: {pid}")
            return
        visiting.add(pid)
        deps = (catalog[pid].get("deps") or {}).get("playbooks") or []
        for d in deps:
            visit(d)
        visiting.remove(pid)
        visited.add(pid)
        ordered.append(pid)

    for pid in ids:
        visit(pid)
    # deps first — visit appends after recursion
    seen: set[str] = set()
    unique: list[str] = []
    for pid in ordered:
        if pid not in seen:
            seen.add(pid)
            unique.append(pid)
    return unique, errors


def tokenize_query(query: str) -> set[str]:
    return {t.lower() for t in re.findall(r"[a-z0-9]+", query.lower()) if len(t) > 2}


def score_playbook(pb: dict[str, Any], tokens: set[str], domain_filter: set[str] | None) -> float:
    meta = pb.get("metadata") or {}
    domains = set(meta.get("domain") or [])
    tags = set(meta.get("tags") or [])
    vocab = domains | tags | set(pid_part for pid_part in meta.get("id", "").split(".")[1:])
    if domain_filter:
        if not domains & domain_filter:
            return 0.0
        base = 10.0
    else:
        base = 0.0
    overlap = len(tokens & vocab)
    return base + overlap


def cmd_catalog(args: argparse.Namespace) -> int:
    catalog = load_catalog()
    if getattr(args, "summary", False):
        domains: set[str] = set()
        for pb in catalog.values():
            for d in (pb.get("metadata") or {}).get("domain") or []:
                domains.add(d)
        summary = {
            "count": len(catalog),
            "domains": sorted(domains),
            "ids": sorted(catalog.keys()),
            "catalog_file": str(PLAYBOOKS_INDEX.relative_to(REPO_ROOT)),
            "hydration": "lazy — not loaded at sessionStart or hydrate-context",
        }
        if args.json:
            print(json.dumps(summary, indent=2))
        else:
            dom = ",".join(summary["domains"]) or "none"
            print(
                f"playbooks={summary['count']} domains={dom} "
                f"catalog={summary['catalog_file']} (lazy-load only)"
            )
        return 0

    rows = []
    for pid, pb in sorted(catalog.items()):
        meta = pb.get("metadata") or {}
        rows.append(
            {
                "id": pid,
                "version": meta.get("version"),
                "domain": meta.get("domain"),
                "file": pb.get("_path"),
                "load_context": meta.get("load_context", "on_provision"),
            }
        )
    if args.json:
        print(json.dumps(rows, indent=2))
    else:
        if not rows:
            print("[PLAYBOOKS] empty — run /sdlc:learn to acquire domain capabilities")
        for r in rows:
            dom = ",".join(r["domain"] or [])
            print(f"{r['id']} v{r['version']} domain={dom} file={r['file']}")
    return 0


def cmd_validate(args: argparse.Namespace) -> int:
    catalog = load_catalog()
    targets = catalog.values() if not args.id else [catalog[args.id]] if args.id in catalog else []
    if args.id and args.id not in catalog:
        print(f"ERROR: unknown playbook {args.id}", file=sys.stderr)
        return 1
    all_errors: list[str] = []
    for pb in targets:
        path = REPO_ROOT / pb.get("_path", "")
        all_errors.extend(validate_playbook(pb, path if path.exists() else None))
    if all_errors:
        for e in all_errors:
            print(f"FAIL: {e}", file=sys.stderr)
        return 1
    print(f"OK: {len(targets)} playbook(s) valid")
    return 0


def cmd_resolve(args: argparse.Namespace) -> int:
    catalog = load_catalog()
    domain_filter: set[str] | None = None
    tokens: set[str] = set()

    if args.domain:
        domain_filter = {d.strip().lower() for d in args.domain.split(",") if d.strip()}
    if args.query:
        tokens = tokenize_query(args.query)
    if args.capability:
        tokens |= tokenize_query(args.capability.replace(":", " "))

    scored: list[tuple[float, str, dict[str, Any]]] = []
    for pid, pb in catalog.items():
        caps = set((pb.get("runtime") or {}).get("requires", {}).get("capabilities") or [])
        if args.capability and args.capability not in caps:
            continue
        s = score_playbook(pb, tokens, domain_filter)
        if s > 0 or (domain_filter and (set(pb.get("metadata", {}).get("domain") or []) & domain_filter)):
            scored.append((s, pid, pb))

    scored.sort(key=lambda x: (-x[0], x[1]))
    matched_ids = [pid for _, pid, _ in scored]
    ordered, dep_errors = resolve_deps(catalog, matched_ids) if matched_ids else ([], [])

    # Detect gaps: query tokens not covered by any matched domain/tag
    covered: set[str] = set()
    for pid in matched_ids:
        meta = catalog[pid].get("metadata") or {}
        covered |= set(meta.get("domain") or []) | set(meta.get("tags") or [])

    missing_domains: list[str] = []
    if args.query and tokens:
        for t in tokens:
            if t not in covered and not any(t in pid for pid in matched_ids):
                missing_domains.append(t)

    user_reqs: list[dict[str, str]] = []
    for pid in ordered:
        for req in catalog[pid].get("user_prerequisites") or []:
            user_reqs.append({"playbook": pid, **req})

    result = {
        "query": args.query,
        "domain": args.domain,
        "playbooks_matched": matched_ids,
        "playbooks_ordered": ordered,
        "playbooks_missing": list(dict.fromkeys(missing_domains)),
        "dep_errors": dep_errors,
        "user_prerequisites": user_reqs,
        "runtime_prep": {
            "mcps": list(
                {
                    m
                    for pid in ordered
                    for m in (catalog[pid].get("runtime") or {}).get("requires", {}).get("mcps") or []
                }
            ),
            "env": list(
                {
                    e
                    for pid in ordered
                    for e in (catalog[pid].get("runtime") or {}).get("requires", {}).get("env") or []
                }
            ),
        },
    }

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        if matched_ids:
            print(f"matched: {', '.join(matched_ids)}")
        else:
            print("matched: (none)")
        if missing_domains:
            print(f"missing: {', '.join(missing_domains)} — run /sdlc:learn")
        if dep_errors:
            for e in dep_errors:
                print(f"ERROR: {e}", file=sys.stderr)
            return 1
    return 0


def cmd_provision(args: argparse.Namespace) -> int:
    catalog = load_catalog()
    ids = [i.strip() for i in args.ids.split(",") if i.strip()]
    ordered, dep_errors = resolve_deps(catalog, ids)
    if dep_errors:
        for e in dep_errors:
            print(f"ERROR: {e}", file=sys.stderr)
        return 1

    run_id = datetime.now(timezone.utc).strftime("pb-run-%Y%m%d-%H%M%S")
    steps: list[dict[str, Any]] = []
    for pid in ordered:
        pb = catalog[pid]
        for step in pb.get("procedure") or []:
            steps.append(
                {
                    "playbook": pid,
                    "step": step.get("id"),
                    "mode": step.get("mode"),
                }
            )

    packet_parts = [f"ids={','.join(ordered)}", f"steps={len(steps)}", f"gates={sum(len(pb.get('done') or []) for pb in (catalog[i] for i in ordered))}"]
    plan = {
        "run_id": run_id,
        "playbooks": ordered,
        "steps": steps,
        "context_packet": f"[PLAYBOOK_RUN] {' '.join(packet_parts)}",
        "trace_sink": f".sdlc/playbooks/.research/{run_id}/trace.jsonl",
    }

    if args.json:
        print(json.dumps(plan, indent=2))
    else:
        print(plan["context_packet"])
        print(f"trace: {plan['trace_sink']}")
    return 0


def cmd_learn_init(args: argparse.Namespace) -> int:
    run_id = args.run_id or datetime.now(timezone.utc).strftime("learn-%Y%m%d-%H%M%S")
    run_dir = RESEARCH_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    report_path = run_dir / "report.md"
    if not report_path.exists() and RESEARCH_TEMPLATE.is_file():
        tpl = RESEARCH_TEMPLATE.read_text(encoding="utf-8")
        report_path.write_text(
            tpl.replace("{run_id}", run_id)
            .replace("{query}", args.query)
            .replace("{date}", datetime.now(timezone.utc).strftime("%Y-%m-%d")),
            encoding="utf-8",
        )

    manifest = {
        "run_id": run_id,
        "query": args.query,
        "created": datetime.now(timezone.utc).isoformat(),
        "phase": "F0_research",
        "gate_passed": False,
        "playbooks_created": [],
        "wire_targets": [],
        "baseline_git_paths": sorted(_git_status_paths()),
    }
    (run_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    print(f"run_id: {run_id}")
    print(f"report: {report_path.relative_to(REPO_ROOT)}")
    print("next: complete F0 research, then: python3 .sdlc/bin/sdlc_playbook.py research-gate --run-id", run_id)
    return 0


def _parse_targets_from_report(text: str) -> list[str]:
    targets: list[str] = []
    in_targets = False
    for line in text.splitlines():
        if line.strip() == "## Capability Targets":
            in_targets = True
            continue
        if in_targets and line.startswith("## "):
            break
        if in_targets and line.startswith("|") and "{target_id}" not in line and "---" not in line:
            cols = [c.strip() for c in line.split("|") if c.strip()]
            if cols and cols[0] not in ("Target ID",):
                targets.append(cols[0])
    return targets


def _count_sources_for_target(text: str, target_id: str) -> int:
    count = 0
    in_sources = False
    for line in text.splitlines():
        if line.strip() == "## Sources":
            in_sources = True
            continue
        if in_sources and line.startswith("## "):
            break
        if in_sources and line.startswith("|") and target_id in line and "{url}" not in line:
            count += 1
    return count


def gate_research_report(report_path: Path) -> list[str]:
    errors: list[str] = []
    if not report_path.is_file():
        return [f"report not found: {report_path}"]

    text = report_path.read_text(encoding="utf-8")

    for section in REQUIRED_RESEARCH_SECTIONS:
        if section not in text:
            errors.append(f"missing section: {section}")

    targets = _parse_targets_from_report(text)
    if not targets:
        errors.append("no capability targets defined in report")

    if "## Sources" in text:
        official_count = len(re.findall(r"\|\s*official\s*\|", text, re.IGNORECASE))
        if official_count < len(targets):
            errors.append(f"need >=1 official source per target ({official_count} official, {len(targets)} targets)")

    for target in targets:
        src_count = _count_sources_for_target(text, target)
        if src_count < MIN_SOURCES_PER_TARGET:
            errors.append(f"target {target}: need >={MIN_SOURCES_PER_TARGET} sources (found {src_count})")

    if "## Decision Log" in text:
        if re.search(r"\|\s*\{single_choice\}\s*\|", text) or "| {single_choice} |" in text:
            errors.append("decision log still has template placeholders")
        rows = 0
        for line in text.splitlines():
            if line.startswith("|") and "MUST choice" not in line and "---" not in line and "Decision" not in line:
                if line.count("|") >= 4:
                    rows += 1
        if rows < 1:
            errors.append("decision log must have at least one completed row")

    plan_hits = PLAN_LANGUAGE_RE.findall(text)
    # Exclude Gate Checklist line that mentions plan language as rule
    filtered_hits = [h for h in plan_hits if h.lower() not in ("optionally",)]
    if len(filtered_hits) > 2:
        errors.append(f"plan language detected in report: {filtered_hits[:5]}")

    checklist = re.search(r"## Gate Checklist([\s\S]*?)(?:\n## |\Z)", text)
    if checklist:
        unchecked = re.findall(r"- \[ \]", checklist.group(1))
        if unchecked:
            errors.append(f"gate checklist has {len(unchecked)} unchecked items")

    return errors


def cmd_research_gate(args: argparse.Namespace) -> int:
    run_dir = RESEARCH_DIR / args.run_id
    report_path = run_dir / "report.md"
    errors = gate_research_report(report_path)

    manifest_path = run_dir / "manifest.json"
    if manifest_path.is_file():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    else:
        manifest = {"run_id": args.run_id}

    if errors:
        for e in errors:
            print(f"FAIL: {e}", file=sys.stderr)
        manifest["gate_passed"] = False
        manifest["gate_errors"] = errors
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        return 1

    manifest["gate_passed"] = True
    manifest["phase"] = "F1_synthesis"
    manifest["gate_checked"] = datetime.now(timezone.utc).isoformat()
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"OK: research gate passed for {args.run_id}")
    print("next: F1 synthesis → F2 materialize playbooks → F3 delivery.md")
    return 0


def _index_entry(pb: dict[str, Any]) -> str:
    meta = pb.get("metadata") or {}
    pid = meta["id"]
    dom = ",".join(meta.get("domain") or [])
    caps = ",".join((pb.get("runtime") or {}).get("requires", {}).get("capabilities") or []) or "none"
    load = meta.get("load_context", "on_provision")
    fpath = pb.get("_path", "").replace(".sdlc/playbooks/", "")
    return f"{pid} domain={dom} caps={caps} version={meta.get('version')} file={fpath} load={load}"


def _upsert_index_section(content: str, section: str, entries: list[str]) -> str:
    open_tag = f"[{section}]"
    close_tag = f"[/{section}]"
    block = open_tag + "\n" + "\n".join(entries) + "\n" + close_tag
    if open_tag in content and close_tag in content:
        pre, rest = content.split(open_tag, 1)
        _, post = rest.split(close_tag, 1)
        return pre + block + post
    return content.rstrip() + "\n\n" + block + "\n"


def cmd_register(args: argparse.Namespace) -> int:
    path = Path(args.file)
    if not path.is_absolute():
        path = REPO_ROOT / path
    if not path.is_file():
        print(f"ERROR: file not found: {path}", file=sys.stderr)
        return 1

    pb = load_playbook(path)
    errors = validate_playbook(pb, path)
    if errors:
        for e in errors:
            print(f"FAIL: {e}", file=sys.stderr)
        return 1

    pid = pb["metadata"]["id"]
    entry = _index_entry(pb)

    # PLAYBOOKS.md
    pb_index = PLAYBOOKS_INDEX.read_text(encoding="utf-8") if PLAYBOOKS_INDEX.is_file() else ""
    entries = []
    if "[PLAYBOOKS]" in pb_index:
        catalog = load_catalog()
        catalog[pid] = pb
        entries = [_index_entry(catalog[p]) for p in sorted(catalog.keys())]
        pb_index = _upsert_index_section(pb_index, "PLAYBOOKS", entries)
    PLAYBOOKS_INDEX.write_text(pb_index, encoding="utf-8")

    print(f"OK: registered {pid}")
    print(f"catalog: {PLAYBOOKS_INDEX.relative_to(REPO_ROOT)} (INDEX.md not updated — lazy catalog)")
    return 0


def cmd_contamination_check(args: argparse.Namespace) -> int:
    run_dir = RESEARCH_DIR / args.run_id
    manifest_path = run_dir / "manifest.json"
    if not manifest_path.is_file():
        print(f"ERROR: manifest not found: {manifest_path}", file=sys.stderr)
        return 1

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    baseline = set(manifest.get("baseline_git_paths") or [])
    if not baseline:
        print("WARN: no baseline_git_paths in manifest — cannot detect delta; run learn-init first")
        baseline = set()

    wire_targets: list[str] = manifest.get("wire_targets") or []
    errors = check_learn_contamination(baseline, wire_targets)

    if errors:
        for e in errors:
            print(f"CONTAMINATION: {e}", file=sys.stderr)
        manifest["contamination_passed"] = False
        manifest["contamination_errors"] = errors
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        print(
            f"FAIL: {len(errors)} contamination violation(s). "
            "Revert forbidden files or pass --wire and record wire_targets in manifest.",
            file=sys.stderr,
        )
        return 1

    manifest["contamination_passed"] = True
    manifest["contamination_checked"] = datetime.now(timezone.utc).isoformat()
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"OK: no contamination detected for run {args.run_id}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="SDLC Playbook runtime (ADR-010)")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_cat = sub.add_parser("catalog", help="List registered playbooks")
    p_cat.add_argument("--json", action="store_true")
    p_cat.add_argument(
        "--summary",
        action="store_true",
        help="Count + domains only — safe for hydration checks without loading playbook bodies",
    )
    p_cat.set_defaults(func=cmd_catalog)

    p_val = sub.add_parser("validate", help="Validate playbook schema")
    p_val.add_argument("--id", help="Single playbook id")
    p_val.set_defaults(func=cmd_validate)

    p_res = sub.add_parser("resolve", help="Retrieve playbooks by domain/query/capability")
    p_res.add_argument("--domain", help="Comma-separated domain tags")
    p_res.add_argument("--query", help="Free-text query")
    p_res.add_argument("--capability", help="Capability id e.g. http:openai-api")
    p_res.add_argument("--json", action="store_true")
    p_res.set_defaults(func=cmd_resolve)

    p_prov = sub.add_parser("provision", help="Materialize execution plan")
    p_prov.add_argument("--ids", required=True, help="Comma-separated playbook ids")
    p_prov.add_argument("--json", action="store_true")
    p_prov.set_defaults(func=cmd_provision)

    p_learn = sub.add_parser("learn-init", help="Initialize /sdlc:learn research run (F0)")
    p_learn.add_argument("--query", required=True)
    p_learn.add_argument("--run-id")
    p_learn.set_defaults(func=cmd_learn_init)

    p_gate = sub.add_parser("research-gate", help="Validate F0 research report")
    p_gate.add_argument("--run-id", required=True)
    p_gate.set_defaults(func=cmd_research_gate)

    p_reg = sub.add_parser("register", help="Validate playbook and update INDEX")
    p_reg.add_argument("--file", required=True)
    p_reg.set_defaults(func=cmd_register)

    p_cont = sub.add_parser(
        "contamination-check",
        help="Verify learn run did not touch forbidden SDLC paths (ADR-010 isolation gate)",
    )
    p_cont.add_argument("--run-id", required=True)
    p_cont.set_defaults(func=cmd_contamination_check)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
