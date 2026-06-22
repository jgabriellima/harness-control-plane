#!/usr/bin/env python3
"""
E2E execution bridge — fan-out feature-flow runs per ticket (workflow-run manifest only).

Usage:
  python3 .sdlc/bin/sdlc_e2e_execution.py dispatch [--workflow-run-id ID] [--parallel 4]
  python3 .sdlc/bin/sdlc_e2e_execution.py validate [--workflow-run-id ID]
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

from _sdlc_paths import ACTIVE_WORKFLOW_RUN_POINTER, BIN_DIR, REPO_ROOT, WORKFLOW_RUNS_DIR

sys.path.insert(0, str(BIN_DIR))

from sdlc_workflow_gate import check_feature_flow_complete  # noqa: E402
from sdlc_ref_resolver import RunContext  # noqa: E402
from sdlc_workflow_manifest import load_manifest, save_manifest  # noqa: E402
from sdlc_workflow_run_resolve import feature_flow_run_id, ensure_feature_flow_child_ticket  # noqa: E402

RUNNER = BIN_DIR / "sdlc_workflow_run.py"
MANIFEST_CLI = BIN_DIR / "sdlc_workflow_manifest.py"


def _resolve_workflow_run_id(explicit: str | None) -> str:
    if explicit:
        return explicit
    if ACTIVE_WORKFLOW_RUN_POINTER.is_file():
        value = ACTIVE_WORKFLOW_RUN_POINTER.read_text(encoding="utf-8").strip()
        if value:
            return value
    raise SystemExit(
        "ERROR: --workflow-run-id required (no .sdlc/workflow-runs/ACTIVE pointer)",
    )


def _active_wave_tickets(manifest: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    waves = manifest.get("waves") or []
    tickets = manifest.get("tickets") or {}
    active_wave = None
    for wave in waves:
        if wave.get("status") not in ("completed", "skipped"):
            active_wave = wave
            break
    if active_wave is None and waves:
        active_wave = waves[-1]
    if active_wave is None:
        return [
            (tid, t)
            for tid, t in tickets.items()
            if t.get("role") not in ("epic", "content-post")
        ]

    result: list[tuple[str, dict[str, Any]]] = []
    for tid in active_wave.get("tickets") or []:
        if tid in tickets:
            result.append((tid, tickets[tid]))
    return result


def _link_child_run(workflow_run_id: str, ticket_id: str, ff_run_id: str) -> None:
    manifest = load_manifest(workflow_run_id)
    tickets = manifest.setdefault("tickets", {})
    ticket = tickets.setdefault(ticket_id, {})
    ticket["child_run_id"] = ff_run_id
    ticket["feature_flow_complete"] = False
    save_manifest(workflow_run_id, manifest)


def _init_feature_flow(workflow_run_id: str, ticket_id: str, ticket: dict[str, Any]) -> str:
    ff_run_id = feature_flow_run_id(workflow_run_id, ticket_id)
    title = ticket.get("title") or ticket_id
    intent = f"Feature-flow for {ticket_id}: {title} (workflow={workflow_run_id})"
    proc = subprocess.run(
        [
            sys.executable,
            str(MANIFEST_CLI),
            "init",
            "--workflow",
            "feature-flow",
            "--intent",
            intent,
            "--run-id",
            ff_run_id,
            "--mode",
            "agent",
        ],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"feature-flow init failed for {ticket_id}: {proc.stderr or proc.stdout}",
        )
    return ff_run_id


def _dispatch_ticket(workflow_run_id: str, ticket_id: str, ticket: dict[str, Any]) -> dict[str, Any]:
    ff_run_id = _init_feature_flow(workflow_run_id, ticket_id, ticket)
    _link_child_run(workflow_run_id, ticket_id, ff_run_id)
    ensure_feature_flow_child_ticket(ff_run_id)
    return {
        "ticket_id": ticket_id,
        "feature_flow_run_id": ff_run_id,
        "worktree": ticket.get("worktree"),
        "branch": ticket.get("branch"),
        "delegated_command": "/sdlc:implement",
        "step_command": (
            f"python3 .sdlc/bin/sdlc_workflow_run.py step --run-id {ff_run_id} --mode agent"
        ),
    }


def cmd_dispatch(args: argparse.Namespace) -> int:
    workflow_run_id = _resolve_workflow_run_id(getattr(args, "workflow_run_id", None))
    manifest = load_manifest(workflow_run_id)
    pairs = _active_wave_tickets(manifest)
    if not pairs:
        print(
            "DISPATCH: no tickets in workflow manifest — "
            "register-ticket before execution",
            file=sys.stderr,
        )
        return 1

    parallel = max(1, int(args.parallel))
    dispatches: list[dict[str, Any]] = []

    if parallel == 1 or len(pairs) == 1:
        for ticket_id, ticket in pairs:
            dispatches.append(_dispatch_ticket(workflow_run_id, ticket_id, ticket))
    else:
        with ThreadPoolExecutor(max_workers=min(parallel, len(pairs))) as pool:
            futures = {
                pool.submit(_dispatch_ticket, workflow_run_id, tid, t): tid for tid, t in pairs
            }
            for future in as_completed(futures):
                tid = futures[future]
                try:
                    dispatches.append(future.result())
                except Exception as exc:
                    print(f"DISPATCH FAIL {tid}: {exc}", file=sys.stderr)
                    return 1

    payload = {
        "workflow_run_id": workflow_run_id,
        "ticket_count": len(dispatches),
        "parallel": parallel,
        "dispatches": dispatches,
        "gateHint": (
            "feature-flow-complete.pass requires each child_run manifest status=completed "
            "(dispatch alone does not satisfy execution postCondition)"
        ),
    }
    print(json.dumps(payload, indent=2))
    return 0


def cmd_validate(args: argparse.Namespace) -> int:
    workflow_run_id = _resolve_workflow_run_id(getattr(args, "workflow_run_id", None))
    manifest = load_manifest(workflow_run_id)
    ctx = RunContext(
        run_id=workflow_run_id,
        intent=manifest.get("intent", ""),
        manifest=manifest,
        node_id="execution",
        execution_mode="agent",
    )
    result = check_feature_flow_complete(ctx)
    if not result.passed:
        print(f"VALIDATE FAIL: {result.message}", file=sys.stderr)
        return 1
    print(f"VALIDATE PASS: feature-flow-complete for {workflow_run_id}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="E2E execution — feature-flow fan-out (workflow-run manifest)",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    dispatch_parser = sub.add_parser("dispatch", help="Init feature-flow runs for tickets")
    dispatch_parser.add_argument("--workflow-run-id")
    dispatch_parser.add_argument(
        "--e2e-run-id",
        help="Deprecated alias for --workflow-run-id",
    )
    dispatch_parser.add_argument("--parallel", type=int, default=4)

    validate_parser = sub.add_parser("validate", help="Validate feature-flow-complete gate")
    validate_parser.add_argument("--workflow-run-id")
    validate_parser.add_argument("--e2e-run-id", help="Deprecated alias")

    args = parser.parse_args()
    if getattr(args, "e2e_run_id", None) and not getattr(args, "workflow_run_id", None):
        args.workflow_run_id = args.e2e_run_id

    if args.cmd == "dispatch":
        return cmd_dispatch(args)
    if args.cmd == "validate":
        return cmd_validate(args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
