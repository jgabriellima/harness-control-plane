#!/usr/bin/env python3
"""Detect overlapping goal runs and open integration stalls (ADR-027 FM-5)."""
from __future__ import annotations

from pathlib import Path
from typing import Any

from _sdlc_paths import REPO_ROOT, SDLC_ROOT, WORKFLOW_RUNS_DIR, workspace_target_rel

try:
    import yaml
except ImportError:
    yaml = None  # type: ignore[assignment]

OPEN_RUN_STATUSES = frozenset(
    {"pending", "in_progress", "blocked", "paused", "awaiting_human", "retry"},
)
GOAL_WORKFLOW_IDS = frozenset({"goal-flow", "e2e-orchestration-flow"})


def _load_yaml(path: Path) -> dict[str, Any]:
    if yaml is None:
        raise RuntimeError("PyYAML required")
    with path.open(encoding="utf-8") as handle:
        data = yaml.safe_load(handle)
    return data if isinstance(data, dict) else {}


def _normalize_workflow_id(raw: str) -> str:
    if raw == "e2e-orchestration-flow":
        return "goal-flow"
    return raw


def integration_pending(manifest: dict[str, Any]) -> bool:
    """True when execution completed but integration never finished."""
    nodes = manifest.get("nodes")
    if isinstance(nodes, dict) and nodes:
        execution = nodes.get("execution") or {}
        integration = nodes.get("integration") or {}
        if execution.get("status") == "completed":
            int_status = integration.get("status")
            if int_status in (None, "pending", "running", "retry", "in_progress"):
                return True
        return False

    stages = manifest.get("stages")
    if isinstance(stages, dict) and stages:
        execution = stages.get("execution") or {}
        integration = stages.get("integration") or {}
        if execution.get("status") == "completed":
            int_status = integration.get("status")
            if int_status in (None, "pending", "in_progress"):
                return True
    return False


def run_is_open(manifest: dict[str, Any]) -> bool:
    status = str(manifest.get("status", ""))
    return status in OPEN_RUN_STATUSES


def run_target_root(manifest: dict[str, Any]) -> str:
    target = manifest.get("target") if isinstance(manifest.get("target"), dict) else {}
    explicit = target.get("target_root")
    if isinstance(explicit, str) and explicit.strip():
        return explicit.strip().lstrip("/")
    return workspace_target_rel()


def run_route_surface(manifest: dict[str, Any]) -> str:
    target = manifest.get("target") if isinstance(manifest.get("target"), dict) else {}
    route = target.get("route")
    if isinstance(route, str) and route.strip():
        return route.strip()
    return "/"


def _same_surface(a: dict[str, Any], b: dict[str, Any]) -> bool:
    return run_target_root(a) == run_target_root(b) and run_route_surface(a) == run_route_surface(b)


def _is_goal_manifest(manifest: dict[str, Any]) -> bool:
    meta = manifest.get("metadata") if isinstance(manifest.get("metadata"), dict) else {}
    wf = _normalize_workflow_id(str(meta.get("workflow_id", "")))
    if wf in GOAL_WORKFLOW_IDS:
        return True
    wf_legacy = manifest.get("workflow")
    if isinstance(wf_legacy, str) and "goal" in wf_legacy.lower():
        return True
    stages = manifest.get("stages")
    return isinstance(stages, dict) and "execution" in stages and "integration" in stages


def iter_run_manifests() -> list[tuple[str, Path, dict[str, Any], str]]:
    """Yield (run_id, path, manifest, storage) where storage is workflow|legacy."""
    found: list[tuple[str, Path, dict[str, Any], str]] = []
    if WORKFLOW_RUNS_DIR.is_dir():
        for entry in sorted(WORKFLOW_RUNS_DIR.iterdir()):
            if not entry.is_dir() or entry.name == "ACTIVE":
                continue
            mf = entry / "manifest.yaml"
            if mf.is_file():
                found.append((entry.name, mf, _load_yaml(mf), "workflow"))
    legacy_root = SDLC_ROOT / "runs"
    if legacy_root.is_dir():
        for entry in sorted(legacy_root.iterdir()):
            if not entry.is_dir() or entry.name in ("ACTIVE", "_archive"):
                continue
            mf = entry / "manifest.yaml"
            if mf.is_file():
                found.append((entry.name, mf, _load_yaml(mf), "legacy"))
    return found


def find_open_integration_conflicts(
    *,
    target_root: str | None = None,
    route: str | None = None,
    exclude_run_id: str | None = None,
) -> list[dict[str, Any]]:
    """Return open goal runs with integration pending on overlapping surface."""
    target_root = target_root or workspace_target_rel()
    route = route if route is not None else "/"
    probe = {"target": {"target_root": target_root, "route": route}}
    conflicts: list[dict[str, Any]] = []

    for run_id, path, manifest, storage in iter_run_manifests():
        if exclude_run_id and run_id == exclude_run_id:
            continue
        if not _is_goal_manifest(manifest):
            continue
        if not run_is_open(manifest):
            continue
        if not integration_pending(manifest):
            continue
        if not _same_surface(probe, manifest):
            continue
        conflicts.append(
            {
                "run_id": run_id,
                "storage": storage,
                "manifest_path": str(path.relative_to(REPO_ROOT)),
                "status": manifest.get("status"),
                "target_root": run_target_root(manifest),
                "route": run_route_surface(manifest),
            },
        )
    return conflicts


def format_conflict_message(conflicts: list[dict[str, Any]]) -> str:
    if not conflicts:
        return ""
    parts = [
        f"{c['run_id']} ({c['storage']}, integration pending, status={c['status']})"
        for c in conflicts[:3]
    ]
    return (
        "open integration run(s) on same target_root/route — close or resume before new goal/deploy: "
        + "; ".join(parts)
    )
