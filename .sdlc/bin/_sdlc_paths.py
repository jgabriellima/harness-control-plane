"""Shared path resolution for SDLC runtime scripts (ADR-011 W4).

All `.sdlc/bin/*` tools import from here instead of assuming `scripts/` layout.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

BIN_DIR = Path(__file__).resolve().parent
SDLC_ROOT = BIN_DIR.parent
REPO_ROOT = SDLC_ROOT.parent
SDLC_YAML = SDLC_ROOT / "sdlc.yaml"
GATES_DIR = SDLC_ROOT / "gates"
WORKFLOWS_DIR = SDLC_ROOT / "workflows"
SCHEMAS_DIR = SDLC_ROOT / "schemas"
WORKFLOW_RUNS_DIR = SDLC_ROOT / "workflow-runs"
WORKFLOW_RUN_MANIFEST_TEMPLATE = SDLC_ROOT / "templates" / "workflow-run-manifest.yaml"
ACTIVE_WORKFLOW_RUN_POINTER = WORKFLOW_RUNS_DIR / "ACTIVE"


@lru_cache(maxsize=1)
def load_sdlc_yaml() -> dict[str, Any]:
    if not SDLC_YAML.is_file():
        return {}
    try:
        import yaml
    except ImportError:
        return {}
    data = yaml.safe_load(SDLC_YAML.read_text(encoding="utf-8"))
    return data if isinstance(data, dict) else {}


def workspace_target_rel() -> str:
    workspace = load_sdlc_yaml().get("workspace") or {}
    if isinstance(workspace, dict):
        target = workspace.get("target_root")
        if isinstance(target, str) and target.strip():
            return target.strip().lstrip("/") or "."
    return "."


def workspace_target_root() -> Path:
    rel = workspace_target_rel()
    if rel == ".":
        return REPO_ROOT
    return REPO_ROOT / rel


def workflow_runtime_limits(dsl: dict[str, Any] | None = None) -> dict[str, int]:
    """Runner safety limits — sdlc.yaml runtime.workflow with optional DSL agentPolicy override."""
    cfg = load_sdlc_yaml().get("runtime") or {}
    wf = cfg.get("workflow") if isinstance(cfg.get("workflow"), dict) else {}
    policy: dict[str, Any] = {}
    if isinstance(dsl, dict):
        spec = dsl.get("spec") if isinstance(dsl.get("spec"), dict) else {}
        raw_policy = spec.get("agentPolicy")
        if isinstance(raw_policy, dict):
            policy = raw_policy

    def _int(key_yaml: str, key_policy: str, default: int, minimum: int) -> int:
        raw = policy.get(key_policy) if key_policy in policy else wf.get(key_yaml)
        try:
            value = int(raw) if raw is not None else default
        except (TypeError, ValueError):
            value = default
        return max(minimum, value)

    return {
        "max_step_depth": _int("max_step_depth", "maxStepDepth", 64, 1),
        "subprocess_timeout_seconds": _int(
            "subprocess_timeout_seconds",
            "subprocessTimeoutSeconds",
            300,
            30,
        ),
        "max_fanout_retries": _int("max_fanout_retries", "maxFanoutRetries", 12, 1),
    }


def integrations_dir() -> Path:
    return SDLC_ROOT / "integrations"
