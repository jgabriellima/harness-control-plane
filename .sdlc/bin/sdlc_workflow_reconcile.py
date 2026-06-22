#!/usr/bin/env python3
"""
Workflow run integrity reconciliation (ADR-023).

Detects parent/child drift between goal-flow and feature-flow manifests.
CI gate: `check` exits non-zero when orphan or false-complete findings exist.

Usage:
  python3 .sdlc/bin/sdlc_workflow_reconcile.py scan [--json]
  python3 .sdlc/bin/sdlc_workflow_reconcile.py check [--json]
  python3 .sdlc/bin/sdlc_workflow_reconcile.py suppress --run-id ID --reason "..."
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:
    print("ERROR: PyYAML required. pip install pyyaml", file=sys.stderr)
    sys.exit(1)

from _sdlc_paths import REPO_ROOT, WORKFLOW_RUNS_DIR

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sdlc_workflow_run_resolve import (  # noqa: E402
    GOAL_WORKFLOW_ID,
    dispatch_is_stalled,
    feature_flow_run_id,
    run_metadata,
)
from sdlc_workflow_run_resolve import manifest_path as _resolve_manifest_path  # noqa: E402


def _manifest_path(run_id: str) -> Path:
    return _resolve_manifest_path(run_id)

SUPPRESSIONS_PATH = WORKFLOW_RUNS_DIR / "reconcile-suppressions.yaml"
CHILD_TERMINAL = frozenset({"completed", "failed"})
PARENT_DONE = frozenset({"completed"})


@dataclass
class Finding:
    code: str
    severity: str
    parent_run_id: str
    child_run_id: str
    ticket_id: str
    message: str

    def to_dict(self) -> dict[str, str]:
        return asdict(self)


def _utc_today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _load_yaml(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    return data if isinstance(data, dict) else {}


def _load_manifest(run_id: str) -> dict[str, Any] | None:
    path = _manifest_path(run_id)
    if not path.is_file():
        return None
    data = _load_yaml(path)
    return data if isinstance(data, dict) else None


def _execution_node_passed(manifest: dict[str, Any]) -> bool:
    nodes = manifest.get("nodes") if isinstance(manifest.get("nodes"), dict) else {}
    execution = nodes.get("execution") if isinstance(nodes.get("execution"), dict) else {}
    return execution.get("status") == "completed" and execution.get("gate_outcome") == "PASS"


def _child_reconciled_closed(child_doc: dict[str, Any], ticket: dict[str, Any]) -> bool:
    """Child run intentionally closed failed while parent delivery completed elsewhere."""
    if str(child_doc.get("status") or "") != "failed":
        return False
    if ticket.get("reconcile_note"):
        return True
    protocol = child_doc.get("protocol") if isinstance(child_doc.get("protocol"), dict) else {}
    if protocol.get("reconcile_note"):
        return True
    continuity = child_doc.get("continuity") if isinstance(child_doc.get("continuity"), dict) else {}
    for hint in continuity.get("resume_hints") or []:
        if "Reconciled closed" in str(hint):
            return True
    return False


def _parent_claims_ticket_done(ticket: dict[str, Any], parent: dict[str, Any]) -> bool:
    if str(parent.get("status") or "") in PARENT_DONE:
        return True
    if ticket.get("feature_flow_complete") is True:
        return True
    if _execution_node_passed(parent):
        return True
    return False


def _child_run_ids_for_ticket(parent_run_id: str, ticket_id: str, ticket: dict[str, Any]) -> list[str]:
    ids: list[str] = []
    child = ticket.get("child_run_id")
    if isinstance(child, str) and child.strip():
        ids.append(child.strip())
    derived = feature_flow_run_id(parent_run_id, ticket_id)
    if derived not in ids:
        ids.append(derived)
    return ids


def _first_running_stalled_node(child_run_id: str) -> str | None:
    doc = _load_manifest(child_run_id)
    if not doc:
        return None
    nodes = doc.get("nodes") if isinstance(doc.get("nodes"), dict) else {}
    for node_id, state in nodes.items():
        if not isinstance(state, dict):
            continue
        if state.get("status") == "running" and dispatch_is_stalled(child_run_id, str(node_id)):
            return str(node_id)
    return None


def scan_findings() -> list[Finding]:
    findings: list[Finding] = []
    if not WORKFLOW_RUNS_DIR.is_dir():
        return findings

    for entry in sorted(WORKFLOW_RUNS_DIR.iterdir()):
        if not entry.is_dir() or entry.name in ("output", "traces") or entry.name.startswith("."):
            continue
        mf = entry / "manifest.yaml"
        if not mf.is_file():
            continue
        parent_run_id = entry.name
        workflow_id, parent_status = run_metadata(parent_run_id)
        if workflow_id != GOAL_WORKFLOW_ID:
            continue

        parent = _load_manifest(parent_run_id)
        if not parent:
            continue

        tickets = parent.get("tickets") if isinstance(parent.get("tickets"), dict) else {}
        for ticket_id, ticket in tickets.items():
            if not isinstance(ticket, dict):
                continue
            if ticket.get("role") in ("epic", "content-post"):
                continue

            parent_claims_done = _parent_claims_ticket_done(ticket, parent)
            for child_run_id in _child_run_ids_for_ticket(parent_run_id, ticket_id, ticket):
                child_path = _manifest_path(child_run_id)
                if not child_path.is_file():
                    if parent_claims_done and ticket.get("feature_flow_complete") is True:
                        findings.append(
                            Finding(
                                code="false_feature_flow_complete",
                                severity="error",
                                parent_run_id=parent_run_id,
                                child_run_id=child_run_id,
                                ticket_id=ticket_id,
                                message=(
                                    f"ticket {ticket_id} feature_flow_complete=true but "
                                    f"child manifest missing at {child_run_id}"
                                ),
                            ),
                        )
                    continue

                _, child_status = run_metadata(child_run_id)
                child_doc = _load_manifest(child_run_id) or {}
                reconciled = _child_reconciled_closed(child_doc, ticket)

                if parent_claims_done and child_status not in CHILD_TERMINAL and not reconciled:
                    findings.append(
                        Finding(
                            code="orphan_child_run",
                            severity="error",
                            parent_run_id=parent_run_id,
                            child_run_id=child_run_id,
                            ticket_id=ticket_id,
                            message=(
                                f"parent status={parent_status!r} claims delivery done for "
                                f"{ticket_id} but child status={child_status!r}"
                            ),
                        ),
                    )

                if (
                    ticket.get("feature_flow_complete") is True
                    and child_status != "completed"
                    and not reconciled
                ):
                    findings.append(
                        Finding(
                            code="false_feature_flow_complete",
                            severity="error",
                            parent_run_id=parent_run_id,
                            child_run_id=child_run_id,
                            ticket_id=ticket_id,
                            message=(
                                f"ticket {ticket_id} feature_flow_complete=true but "
                                f"child {child_run_id} status={child_status!r}"
                            ),
                        ),
                    )

                stalled_node = _first_running_stalled_node(child_run_id)
                if stalled_node and child_status in ("in_progress", "pending", "blocked"):
                    findings.append(
                        Finding(
                            code="child_dispatch_stall",
                            severity="warn",
                            parent_run_id=parent_run_id,
                            child_run_id=child_run_id,
                            ticket_id=ticket_id,
                            message=(
                                f"child {child_run_id} node {stalled_node!r} running "
                                "without cognitive output (step/submit loop)"
                            ),
                        ),
                    )

    return findings


def _load_suppressions() -> dict[str, dict[str, str]]:
    doc = _load_yaml(SUPPRESSIONS_PATH)
    raw = doc.get("suppressions") if isinstance(doc.get("suppressions"), list) else []
    out: dict[str, dict[str, str]] = {}
    today = _utc_today()
    for item in raw:
        if not isinstance(item, dict):
            continue
        run_id = str(item.get("run_id") or "").strip()
        if not run_id:
            continue
        until = str(item.get("until") or "").strip()
        if until and until < today:
            continue
        out[run_id] = {
            "reason": str(item.get("reason") or ""),
            "until": until,
        }
    return out


def _filter_suppressed(findings: list[Finding], suppressions: dict[str, dict[str, str]]) -> list[Finding]:
    if not suppressions:
        return findings
    active: list[Finding] = []
    for f in findings:
        if f.child_run_id in suppressions or f.parent_run_id in suppressions:
            continue
        active.append(f)
    return active


def cmd_scan(args: argparse.Namespace) -> int:
    findings = scan_findings()
    if args.json:
        print(json.dumps([f.to_dict() for f in findings], indent=2))
    else:
        if not findings:
            print("RECONCILE: no findings")
            return 0
        for f in findings:
            print(f"{f.severity.upper()} {f.code} parent={f.parent_run_id} child={f.child_run_id}")
            print(f"  {f.message}")
    return 0


def cmd_check(args: argparse.Namespace) -> int:
    suppressions = _load_suppressions()
    findings = _filter_suppressed(scan_findings(), suppressions)
    errors = [f for f in findings if f.severity == "error"]
    warns = [f for f in findings if f.severity == "warn"]

    if args.json:
        print(
            json.dumps(
                {
                    "ok": len(errors) == 0,
                    "error_count": len(errors),
                    "warn_count": len(warns),
                    "suppression_count": len(suppressions),
                    "findings": [f.to_dict() for f in findings],
                },
                indent=2,
            ),
        )
    else:
        print(f"RECONCILE check: errors={len(errors)} warnings={len(warns)} suppressed={len(suppressions)}")
        for f in findings:
            print(f"  [{f.severity}] {f.code}: {f.message}")

    if errors:
        print(
            "RECONCILE FAIL — fix findings or add time-boxed entry to "
            ".sdlc/workflow-runs/reconcile-suppressions.yaml",
            file=sys.stderr,
        )
        return 1
    if warns and not args.ignore_warnings:
        print("RECONCILE WARN — stalled child runs present (pass --ignore-warnings for CI)", file=sys.stderr)
        return 1
    return 0


def cmd_suppress(args: argparse.Namespace) -> int:
    run_id = args.run_id.strip()
    reason = args.reason.strip()
    if not run_id or not reason:
        print("ERROR: --run-id and --reason required", file=sys.stderr)
        return 1

    doc = _load_yaml(SUPPRESSIONS_PATH)
    items = doc.get("suppressions") if isinstance(doc.get("suppressions"), list) else []
    items = [i for i in items if isinstance(i, dict) and i.get("run_id") != run_id]
    entry: dict[str, str] = {"run_id": run_id, "reason": reason, "recorded_at": _utc_today()}
    if args.until:
        entry["until"] = args.until.strip()
    items.append(entry)
    doc["suppressions"] = items
    SUPPRESSIONS_PATH.parent.mkdir(parents=True, exist_ok=True)
    SUPPRESSIONS_PATH.write_text(yaml.safe_dump(doc, sort_keys=False), encoding="utf-8")
    print(f"SUPPRESSED {run_id}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Workflow run parent/child reconciliation (ADR-023)")
    sub = parser.add_subparsers(dest="cmd", required=True)

    scan_p = sub.add_parser("scan", help="List all reconciliation findings")
    scan_p.add_argument("--json", action="store_true")
    scan_p.set_defaults(func=cmd_scan)

    check_p = sub.add_parser("check", help="Exit 1 when error-level findings exist (CI)")
    check_p.add_argument("--json", action="store_true")
    check_p.add_argument(
        "--ignore-warnings",
        action="store_true",
        help="Do not fail on warn-level findings (e.g. child_dispatch_stall)",
    )
    check_p.set_defaults(func=cmd_check)

    sup_p = sub.add_parser("suppress", help="Time-box suppression for a run_id")
    sup_p.add_argument("--run-id", required=True)
    sup_p.add_argument("--reason", required=True)
    sup_p.add_argument("--until", help="ISO date YYYY-MM-DD — suppression expires after this day")
    sup_p.set_defaults(func=cmd_suppress)

    args = parser.parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    sys.exit(main())
