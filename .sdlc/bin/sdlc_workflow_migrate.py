#!/usr/bin/env python3
"""
Migrate legacy .sdlc/runs/{run_id}/ manifests to workflow-runs schema (ADR-027 FM-8).

Usage:
  python3 .sdlc/bin/sdlc_workflow_migrate.py check
  python3 .sdlc/bin/sdlc_workflow_migrate.py migrate --run-id <legacy_run_id> [--dry-run]
"""
from __future__ import annotations

import argparse
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:
    print("ERROR: PyYAML required", file=sys.stderr)
    sys.exit(1)

from _sdlc_paths import REPO_ROOT, SDLC_ROOT, WORKFLOW_RUNS_DIR

sys.path.insert(0, str(SDLC_ROOT / "bin"))

from sdlc_workflow_manifest import (  # noqa: E402
    default_continuity,
    default_node_shell,
    load_workflow_dsl,
    manifest_path,
    node_order_from_dsl,
    save_manifest,
    set_active,
    sync_nodes_from_dsl,
)

LEGACY_RUNS_DIR = SDLC_ROOT / "runs"
LEGACY_ACTIVE = LEGACY_RUNS_DIR / "ACTIVE"
WORKFLOW_ID = "goal-flow"

LEGACY_STAGE_TO_NODE: dict[str, str] = {
    "hydrate": "hydrate",
    "preflight": "preflight",
    "classify": "classify",
    "discovery": "discovery",
    "decomposition": "decomposition",
    "plane-hierarchy": "plane-hierarchy",
    "architecture": "architecture",
    "workspace-rebind": "workspace-rebind",
    "wave-planning": "wave-planning",
    "execution": "execution",
    "pr-creation": "pr-creation",
    "integration": "integration",
    "deploy": "deploy",
    "post-deploy": "post-deploy",
    "board-sync": "board-sync",
    "reflect": "reflect",
}

STAGE_STATUS_TO_NODE: dict[str, str] = {
    "completed": "completed",
    "skipped": "skipped",
    "failed": "failed",
    "in_progress": "running",
    "pending": "pending",
}

ADR027_SYNTHETIC_NODES: dict[str, str] = {
    "reference-detect": "discovery",
    "reference-confirm": "discovery",
    "feasibility-research": "architecture",
}


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _load_yaml(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        data = yaml.safe_load(handle)
    return data if isinstance(data, dict) else {}


def _dump_yaml(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        yaml.safe_dump(data, handle, default_flow_style=False, sort_keys=False, allow_unicode=True)


def legacy_manifest_path(run_id: str) -> Path:
    return LEGACY_RUNS_DIR / run_id / "manifest.yaml"


def is_legacy_run(run_id: str) -> bool:
    return legacy_manifest_path(run_id).is_file()


def is_migrated(run_id: str) -> bool:
    return manifest_path(run_id).is_file()


def _legacy_stage_status(stages: dict[str, Any], node_id: str) -> str | None:
    for stage_id, nid in LEGACY_STAGE_TO_NODE.items():
        if nid == node_id:
            stage = stages.get(stage_id)
            if isinstance(stage, dict):
                return str(stage.get("status", "pending"))
    return None


def _map_nodes(legacy: dict[str, Any]) -> dict[str, Any]:
    dsl = load_workflow_dsl(WORKFLOW_ID)
    order = node_order_from_dsl(dsl)
    stages = legacy.get("stages") if isinstance(legacy.get("stages"), dict) else {}
    nodes: dict[str, Any] = {}

    for node_id in order:
        shell = default_node_shell(node_id)
        stage_status = _legacy_stage_status(stages, node_id)
        if stage_status is not None:
            shell["status"] = STAGE_STATUS_TO_NODE.get(stage_status, "pending")
            if shell["status"] == "completed":
                shell["gate_outcome"] = "PASS"
                shell["migration_note"] = "imported from legacy stages"
        elif node_id in ADR027_SYNTHETIC_NODES:
            anchor = ADR027_SYNTHETIC_NODES[node_id]
            anchor_status = _legacy_stage_status(stages, anchor)
            if anchor_status == "completed":
                shell["status"] = "skipped"
                shell["gate_outcome"] = "SKIP"
                shell["migration_note"] = "pre-ADR-027 node — waived on legacy migration"
            else:
                shell["status"] = "pending"
        nodes[node_id] = shell
    return nodes


def build_workflow_manifest(run_id: str, legacy: dict[str, Any]) -> dict[str, Any]:
    dsl = load_workflow_dsl(WORKFLOW_ID)
    continuity = default_continuity()
    continuity["phase"] = WORKFLOW_ID
    continuity["resume_hints"] = [
        f"Migrated from .sdlc/runs/{run_id}/ at {_utc_now()}",
    ]

    manifest: dict[str, Any] = {
        "apiVersion": "sdlc.jambu/v1",
        "kind": "WorkflowRunManifest",
        "metadata": {
            "run_id": run_id,
            "workflow_id": WORKFLOW_ID,
            "recorded_at": legacy.get("created_at") or _utc_now(),
            "updated_at": _utc_now(),
            "migrated_from": f".sdlc/runs/{run_id}/manifest.yaml",
            "migrated_at": _utc_now(),
        },
        "status": legacy.get("status", "in_progress"),
        "intent": str(legacy.get("intent", "")).strip(),
        "execution": {
            "mode": "agent",
            "idempotency_key": None,
            "resume_from_node": None,
        },
        "workflow": {
            "command": "/sdlc:goal",
            "dsl_path": f".sdlc/workflows/{WORKFLOW_ID}.yaml",
        },
        "paths": {
            "output_dir": f".sdlc/workflow-runs/output/{WORKFLOW_ID}/{run_id}",
            "trace_path": f".sdlc/workflow-runs/traces/{run_id}.yaml",
            "state_path": f".sdlc/workflow-runs/{run_id}/workflow-state.yaml",
            "legacy_run_dir": f".sdlc/runs/{run_id}",
        },
        "nodes": _map_nodes(legacy),
        "continuity": continuity,
        "run_mode": legacy.get("mode"),
        "target": legacy.get("target") if isinstance(legacy.get("target"), dict) else {},
        "tickets": legacy.get("tickets") if isinstance(legacy.get("tickets"), dict) else {},
        "waves": legacy.get("waves") if isinstance(legacy.get("waves"), list) else [],
        "deployment": legacy.get("deployment") if isinstance(legacy.get("deployment"), dict) else {},
        "definition_of_done": legacy.get("definition_of_done")
        if isinstance(legacy.get("definition_of_done"), dict)
        else {},
        "migration": {
            "source": "legacy-runs",
            "legacy_version": legacy.get("version"),
            "legacy_stages": list((legacy.get("stages") or {}).keys()),
        },
    }
    sync_nodes_from_dsl(manifest, dsl)
    return manifest


def _copy_run_artifacts(run_id: str, output_dir: Path) -> None:
    legacy_dir = LEGACY_RUNS_DIR / run_id
    output_dir.mkdir(parents=True, exist_ok=True)
    for name in (
        "discovery-report.md",
        "master-spec.md",
        "decomposition.md",
        "mode-decision.md",
        "design-contract.md",
        "integration-report.md",
    ):
        src = legacy_dir / name
        if src.is_file():
            shutil.copy2(src, output_dir / name)
    ref_src = legacy_dir / "reference-screenshots"
    ref_dst = output_dir / "reference-screenshots"
    if ref_src.is_dir():
        if ref_dst.exists():
            shutil.rmtree(ref_dst)
        shutil.copytree(ref_src, ref_dst)


def cmd_check(_args: argparse.Namespace) -> int:
    pending: list[str] = []
    if not LEGACY_RUNS_DIR.is_dir():
        print("LEGACY_MIGRATE none")
        return 0
    for entry in sorted(LEGACY_RUNS_DIR.iterdir()):
        if not entry.is_dir() or entry.name in ("ACTIVE", "_archive"):
            continue
        mf = entry / "manifest.yaml"
        if not mf.is_file():
            continue
        legacy = _load_yaml(mf)
        if legacy.get("migrated_to_workflow_runs") is True:
            continue
        if is_migrated(entry.name):
            continue
        status = legacy.get("status")
        if status in ("in_progress", "blocked", "paused", "pending"):
            pending.append(entry.name)
    if pending:
        print(f"LEGACY_MIGRATE pending={len(pending)}")
        for run_id in pending:
            print(f"  {run_id}")
        return 1
    print("LEGACY_MIGRATE none")
    return 0


def cmd_migrate(args: argparse.Namespace) -> int:
    run_id = args.run_id.strip()
    legacy_path = legacy_manifest_path(run_id)
    if not legacy_path.is_file():
        print(f"ERROR: legacy manifest not found: {legacy_path}", file=sys.stderr)
        return 1
    if is_migrated(run_id) and not args.force:
        print(f"ERROR: workflow manifest already exists for {run_id} — use --force to overwrite", file=sys.stderr)
        return 1

    legacy = _load_yaml(legacy_path)
    manifest = build_workflow_manifest(run_id, legacy)
    wf_path = manifest_path(run_id)

    if args.dry_run:
        print(yaml.safe_dump(manifest, default_flow_style=False, sort_keys=False))
        return 0

    _dump_yaml(wf_path, manifest)
    output_dir = REPO_ROOT / manifest["paths"]["output_dir"]
    _copy_run_artifacts(run_id, output_dir)

    legacy["migrated_to_workflow_runs"] = True
    legacy["migrated_at"] = _utc_now()
    legacy["migrated_to"] = str(wf_path.relative_to(REPO_ROOT))
    legacy.setdefault("migration", {})["workflow_manifest"] = str(wf_path.relative_to(REPO_ROOT))
    _dump_yaml(legacy_path, legacy)

    if LEGACY_ACTIVE.is_file() and LEGACY_ACTIVE.read_text(encoding="utf-8").strip() == run_id:
        LEGACY_ACTIVE.unlink(missing_ok=True)
    set_active(run_id)

    print(f"MIGRATED {run_id} -> {wf_path.relative_to(REPO_ROOT)}")
    print(f"OUTPUT {manifest['paths']['output_dir']}")
    return 0


def legacy_blocks_mutation(run_id: str) -> str | None:
    """Return error message when legacy run must migrate before mutation."""
    legacy_path = legacy_manifest_path(run_id)
    if not legacy_path.is_file():
        return None
    if is_migrated(run_id):
        return None
    legacy = _load_yaml(legacy_path)
    if legacy.get("migrated_to_workflow_runs") is True:
        return None
    status = legacy.get("status")
    if status not in ("in_progress", "blocked", "paused", "pending"):
        return None
    return (
        f"legacy run {run_id} must migrate before stage-complete/update-ticket — "
        f"python3 .sdlc/bin/sdlc_workflow_migrate.py migrate --run-id {run_id}"
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Legacy runs → workflow-runs migration (ADR-027)")
    sub = parser.add_subparsers(dest="cmd", required=True)
    check = sub.add_parser("check", help="List unmigrated in-progress legacy runs")
    check.set_defaults(func=cmd_check)
    migrate = sub.add_parser("migrate", help="Migrate one legacy run")
    migrate.add_argument("--run-id", required=True)
    migrate.add_argument("--dry-run", action="store_true")
    migrate.add_argument("--force", action="store_true")
    migrate.set_defaults(func=cmd_migrate)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    return args.func(args)


if __name__ == "__main__":
    args = build_parser().parse_args()
    sys.exit(args.func(args))
