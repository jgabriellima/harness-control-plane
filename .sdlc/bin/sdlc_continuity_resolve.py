#!/usr/bin/env python3
"""
Command-level continuity resolver (ADR-020 Phase 4).

Usage:
  python3 .sdlc/bin/sdlc_continuity_resolve.py resolve --command /sdlc:spec --intent "..." [--json]
  python3 .sdlc/bin/sdlc_continuity_resolve.py resolve --command /sdlc:spec --intent "..." --continue
  python3 .sdlc/bin/sdlc_continuity_resolve.py resolve --command /sdlc:spec --intent "..." --redo-node spec-phase
  python3 .sdlc/bin/sdlc_continuity_resolve.py resolve --command /sdlc:spec --intent "..." --new-run
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:
    print("ERROR: PyYAML required. pip install pyyaml", file=sys.stderr)
    sys.exit(1)

from _sdlc_paths import ACTIVE_WORKFLOW_RUN_POINTER, REPO_ROOT, SDLC_ROOT, WORKFLOW_RUNS_DIR

sys.path.insert(0, str(SDLC_ROOT / "bin"))

from sdlc_workflow_manifest import (  # noqa: E402
    WORKFLOW_ID_ALIASES,
    _load_yaml,
    default_continuity,
    get_active_pointer,
    load_manifest,
    manifest_path,
)
from sdlc_workflow_run_resolve import resolve_goal_run_id  # noqa: E402

GOAL_WORKFLOW_IDS = frozenset({"goal-flow", "e2e-orchestration-flow"})
GOAL_COMMANDS = frozenset({"/sdlc:goal", "/sdlc:e2e"})
SPEC_CREATE_COMMAND = "/sdlc:spec"
IMPLEMENT_COMMAND = "/sdlc:implement"
ACTIVE_RUN_STATUSES = frozenset({"in_progress", "blocked", "paused", "awaiting_human"})

COMMAND_ALIASES: dict[str, str] = {
    "/sdlc:e2e": "/sdlc:goal",
    "/spec:create": "/sdlc:spec",
    "/plan": "/sdlc:plan",
    "/feature": "/sdlc:feature",
    "/implement-feature": "/sdlc:implement",
    "/deploy-release": "/sdlc:deploy",
    "/fix-incident": "/sdlc:incident",
    "/hydrate-context": "/sdlc:hydrate",
    "/handoff": "/sdlc:handoff",
    "/reset": "/sdlc:reset",
    "/run-e2e": "/run:e2e",
    "/browser-use": "/run:browser",
    "/browser-user": "/run:browser",
    "/sdlc:cua": "/run:cua",
}


def normalize_command(command: str) -> str:
    command = command.strip()
    if not command.startswith("/"):
        command = f"/{command}"
    return COMMAND_ALIASES.get(command, command)


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_sdlc_config() -> dict[str, Any]:
    path = SDLC_ROOT / "sdlc.yaml"
    if not path.is_file():
        raise SystemExit(f"ERROR: missing {path}")
    return _load_yaml(path)


def command_workflow_map(config: dict[str, Any]) -> dict[str, str]:
    """Map slash command trigger → workflow binding key / id."""
    mapping: dict[str, str] = {}
    workflows = config.get("workflows") or {}
    if not isinstance(workflows, dict):
        return mapping
    for _key, binding in workflows.items():
        if not isinstance(binding, dict):
            continue
        trigger = binding.get("trigger")
        definition = binding.get("definition", "")
        if isinstance(trigger, str) and trigger.startswith("/"):
            wf_id = Path(str(definition)).stem if definition else str(_key)
            mapping[trigger] = wf_id
    return mapping


def iter_active_runs() -> list[tuple[str, dict[str, Any]]]:
    runs: list[tuple[str, dict[str, Any]]] = []
    if not WORKFLOW_RUNS_DIR.is_dir():
        return runs
    for entry in sorted(WORKFLOW_RUNS_DIR.iterdir()):
        if not entry.is_dir():
            continue
        mf = entry / "manifest.yaml"
        if not mf.is_file():
            continue
        manifest = _load_yaml(mf)
        status = manifest.get("status")
        if status in ACTIVE_RUN_STATUSES:
            runs.append((entry.name, manifest))
    return runs


def _normalize_workflow_id(workflow_id: str) -> str:
    return WORKFLOW_ID_ALIASES.get(workflow_id, workflow_id)


def find_goal_runs() -> list[tuple[str, dict[str, Any]]]:
    out: list[tuple[str, dict[str, Any]]] = []
    for run_id, manifest in iter_active_runs():
        wf = (manifest.get("metadata") or {}).get("workflow_id", "")
        if _normalize_workflow_id(str(wf)) == "goal-flow":
            out.append((run_id, manifest))
    return out


def _intent_tokens(text: str) -> set[str]:
    return {t for t in re.sub(r"[^a-z0-9]+", " ", text.lower()).split() if len(t) > 3}


def _artifact_index(manifest: dict[str, Any]) -> dict[str, Any]:
    index: dict[str, Any] = {"spec_paths": [], "ticket_ids": list((manifest.get("tickets") or {}).keys())}
    for _nid, state in (manifest.get("nodes") or {}).items():
        arts = state.get("artifacts") if isinstance(state.get("artifacts"), dict) else {}
        spec_path = arts.get("spec_path")
        if isinstance(spec_path, str):
            index["spec_paths"].append(spec_path)
    return index


def _plane_hierarchy_done(manifest: dict[str, Any]) -> bool:
    nodes = manifest.get("nodes") or {}
    ph = nodes.get("plane-hierarchy") or {}
    if ph.get("status") == "completed":
        return True
    index = _artifact_index(manifest)
    return bool(index["ticket_ids"] or index["spec_paths"])


def _intent_overlaps_goal(intent: str, manifest: dict[str, Any]) -> bool:
    run_intent = str(manifest.get("intent", ""))
    if not run_intent.strip():
        return True
    a = _intent_tokens(intent)
    b = _intent_tokens(run_intent)
    if not a or not b:
        return True
    return len(a & b) >= min(2, len(a), len(b))


def _record_resolution(manifest: dict[str, Any], decision: dict[str, Any]) -> None:
    continuity = manifest.setdefault("continuity", default_continuity())
    continuity["last_resolution"] = {**decision, "recorded_at": _utc_now()}


def resolve_command(
    command: str,
    intent: str,
    *,
    continue_run: bool = False,
    redo_node: str | None = None,
    new_run: bool = False,
) -> dict[str, Any]:
    command = normalize_command(command)

    wf_map = command_workflow_map(load_sdlc_config())
    target_workflow = wf_map.get(command)

    active_id = get_active_pointer()
    goal_runs = find_goal_runs()

    base: dict[str, Any] = {
        "command": command,
        "target_workflow": target_workflow,
        "active_run_id": active_id,
        "goal_runs_in_progress": [rid for rid, _ in goal_runs],
    }

    if new_run:
        return {
            **base,
            "action": "new_run",
            "reason": "Operator requested --new-run",
        }

    if redo_node:
        run_id = active_id
        if not run_id and goal_runs:
            run_id = goal_runs[0][0]
        return {
            **base,
            "action": "redo_node",
            "run_id": run_id,
            "node_id": redo_node,
            "reason": f"Operator requested --redo-node {redo_node}",
            "cli": (
                f"python3 .sdlc/bin/sdlc_workflow_run.py node-redo --run-id {run_id} --node {redo_node}"
                if run_id
                else None
            ),
        }

    if continue_run:
        run_id = active_id
        if not run_id and goal_runs:
            run_id = goal_runs[0][0]
        return {
            **base,
            "action": "resume",
            "run_id": run_id,
            "reason": "Operator requested --continue on active goal run",
            "cli": (
                f"python3 .sdlc/bin/sdlc_workflow_run.py step --run-id {run_id} --mode agent"
                if run_id
                else None
            ),
        }

    if command == SPEC_CREATE_COMMAND and goal_runs:
        for run_id, manifest in goal_runs:
            if not _plane_hierarchy_done(manifest):
                continue
            if not _intent_overlaps_goal(intent, manifest):
                continue
            index = _artifact_index(manifest)
            decision = {
                "action": "ask",
                "run_id": run_id,
                "reason": (
                    "Active goal run already completed plane-hierarchy or has tickets/spec artifacts; "
                    "duplicate /sdlc:spec would fork continuity"
                ),
                "artifacts": index,
                "options": ["--continue", "--redo-node plane-hierarchy", "--new-run"],
            }
            if manifest_path(run_id).is_file():
                m = load_manifest(run_id)
                _record_resolution(m, decision)
                from sdlc_workflow_manifest import save_manifest  # noqa: WPS433

                save_manifest(run_id, m)
            return {**base, **decision}

    if command in GOAL_COMMANDS:
        from sdlc_workflow_overlap import find_open_integration_conflicts, format_conflict_message

        run_id = resolve_goal_run_id(active_id, goal_runs)
        if not run_id and not new_run:
            conflicts = find_open_integration_conflicts()
            if conflicts:
                resume_id = conflicts[0]["run_id"]
                return {
                    **base,
                    "action": "block",
                    "run_id": resume_id,
                    "reason": format_conflict_message(conflicts),
                    "cli": (
                        f"python3 .sdlc/bin/sdlc_workflow_run.py step --run-id {resume_id} --mode agent"
                    ),
                    "mandatory_cli": [
                        f"python3 .sdlc/bin/sdlc_workflow_migrate.py migrate --run-id {resume_id}"
                        if conflicts[0]["storage"] == "legacy"
                        else f"python3 .sdlc/bin/sdlc_workflow_run.py step --run-id {resume_id} --mode agent",
                    ],
                }
        cli_run = (
            f"python3 .sdlc/bin/sdlc_workflow_run.py run --workflow goal-flow "
            f'--intent "{intent}" --mode agent'
        )
        cli_step = (
            f"python3 .sdlc/bin/sdlc_workflow_run.py step --run-id {run_id} --mode agent"
            if run_id
            else None
        )
        decision: dict[str, Any] = {
            "action": "proceed",
            "run_id": run_id,
            "reason": (
                "Goal invocation — runner authority only; agentPolicy in goal-flow.yaml forbids "
                "orchestrator app implementation and conversational completion branches"
            ),
            "mandatory_cli": [cli_run] if not run_id else [cli_step],
            "forbidden_behaviors": [
                "implement_app_code_in_orchestrator_session",
                "ask_operator_worktree_vs_pr_vs_local_review",
                "conversational_branching_at_end_of_turn",
            ],
        }
        if run_id and manifest_path(run_id).is_file():
            m = load_manifest(run_id)
            _record_resolution(m, decision)
            from sdlc_workflow_manifest import save_manifest  # noqa: WPS433

            save_manifest(run_id, m)
        return {**base, **decision}

    if command == IMPLEMENT_COMMAND and active_id:
        mf = manifest_path(active_id)
        if mf.is_file():
            manifest = load_manifest(active_id)
            wf = _normalize_workflow_id(str((manifest.get("metadata") or {}).get("workflow_id", "")))
            if wf == "goal-flow":
                return {
                    **base,
                    "action": "proceed",
                    "run_id": active_id,
                    "reason": "Micro implement-feature under active goal — use child feature-flow run",
                }

    return {
        **base,
        "action": "proceed",
        "reason": "No continuity conflict detected",
    }


def cmd_resolve(args: argparse.Namespace) -> int:
    decision = resolve_command(
        args.command,
        args.intent,
        continue_run=args.continue_run,
        redo_node=args.redo_node,
        new_run=args.new_run,
    )
    if args.json:
        print(json.dumps(decision, indent=2))
    else:
        print(f"action={decision.get('action')} run_id={decision.get('run_id', '-')}")
        print(decision.get("reason", ""))
        if decision.get("cli"):
            print(f"cli: {decision['cli']}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="SDLC continuity resolver (ADR-020)")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("resolve", help="Resolve slash command against active workflow runs")
    p.add_argument("--command", required=True, help="Slash command e.g. /sdlc:spec")
    p.add_argument("--intent", required=True, help="Operator intent text")
    p.add_argument("--json", action="store_true", help="Emit JSON decision")
    p.add_argument("--continue", dest="continue_run", action="store_true", help="Resume active run")
    p.add_argument("--redo-node", metavar="NODE", help="Redo node and downstream on active run")
    p.add_argument("--new-run", action="store_true", help="Force new run (no reuse)")
    p.set_defaults(func=cmd_resolve)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
