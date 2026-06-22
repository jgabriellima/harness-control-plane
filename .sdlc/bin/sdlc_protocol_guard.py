#!/usr/bin/env python3
"""
ADR-009 / ADR-021 protocol guard — workflow-runs control plane (ADR-017, ADR-020).

Consults `.sdlc/workflow-runs/ACTIVE` manifest before target_root / worktree edits.
Legacy `.sdlc/runs/ACTIVE` is secondary (deprecated).

Set SDL_PROTOCOL_ENFORCE=false to log-only (violations still recorded on workflow manifest).
"""
from __future__ import annotations

import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:
    yaml = None  # type: ignore[assignment]

BIN_DIR = Path(__file__).resolve().parent
if str(BIN_DIR) not in sys.path:
    sys.path.insert(0, str(BIN_DIR))

from _sdlc_paths import (  # noqa: E402
    ACTIVE_WORKFLOW_RUN_POINTER,
    REPO_ROOT,
    SDLC_ROOT,
    SDLC_YAML,
    WORKFLOW_RUNS_DIR,
    load_sdlc_yaml,
    workspace_target_root,
)

LEGACY_ACTIVE_POINTER = SDLC_ROOT / "runs" / "ACTIVE"
LEGACY_RUNS_DIR = SDLC_ROOT / "runs"

GOAL_TRIGGER_RE = re.compile(r"(?:^|\s)/sdlc:goal\b", re.I)
GOAL_ALIAS_RE = re.compile(r"(?:^|\s)/sdlc:e2e\b", re.I)

APP_WRITE_SHELL_PATTERNS = (
    # Case-sensitive: match Cursor tool names only — not "write" in path segments (e.g. composer-write-path).
    re.compile(r"\b(?:Write|StrReplace)\b.*\bapp/"),
    re.compile(r">\s*[^\s]*app/", re.I),
    re.compile(r"\btee\b.*\bapp/", re.I),
    re.compile(r"\b(?:npm run dev|astro dev)\b", re.I),
)

WORKFLOW_STEP_RE = re.compile(
    r"(?:sdlc|business)_workflow_run\.py\s+step\b.*?--run-id\s+(['\"]?)([^\s'\";&|]+)\1",
    re.I | re.S,
)
FEATURE_FLOW_SUFFIX_RE = re.compile(r"-ff-[a-z0-9-]+$", re.I)

_SHELL_CD_RE = re.compile(r"\bcd\s+([^\s;&|]+)")
_SHELL_ABS_PATH_RE = re.compile(r"/(?:[^\s;&|><'\"]+)")
_SHELL_APP_REL_RE = re.compile(r"\bapp/[^\s;&|><'\"]+")


def _enforce_blocking() -> bool:
    return os.environ.get("SDL_PROTOCOL_ENFORCE", "true").lower() not in ("0", "false", "no")


def _load_yaml(path: Path) -> dict[str, Any]:
    if yaml is None or not path.is_file():
        return {}
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    return data if isinstance(data, dict) else {}


def _qa_worktree_gate_enabled() -> bool:
    qa = load_sdlc_yaml().get("qa") or {}
    return isinstance(qa, dict) and qa.get("worktree_gate") is True


def _active_workflow_run() -> tuple[str | None, dict[str, Any] | None]:
    if not ACTIVE_WORKFLOW_RUN_POINTER.is_file():
        return None, None
    run_id = ACTIVE_WORKFLOW_RUN_POINTER.read_text(encoding="utf-8").strip()
    if not run_id:
        return None, None
    mf = WORKFLOW_RUNS_DIR / run_id / "manifest.yaml"
    if not mf.is_file():
        return run_id, None
    return run_id, _load_yaml(mf)


def _active_legacy_run() -> tuple[str | None, dict[str, Any] | None]:
    if not LEGACY_ACTIVE_POINTER.is_file():
        return None, None
    run_id = LEGACY_ACTIVE_POINTER.read_text(encoding="utf-8").strip()
    if not run_id:
        return None, None
    mf = LEGACY_RUNS_DIR / run_id / "manifest.yaml"
    if not mf.is_file():
        return run_id, None
    return run_id, _load_yaml(mf)


def _path_under_target(file_path: str) -> bool:
    if not file_path:
        return False
    try:
        resolved = Path(file_path).resolve()
        target = workspace_target_root()
        return resolved == target or target in resolved.parents
    except (OSError, ValueError):
        return "app/" in file_path.replace("\\", "/")


def _path_in_worktree_dir(file_path: str) -> bool:
    from sdlc_dsl_bindings import path_under_worktrees_root  # noqa: WPS433

    return path_under_worktrees_root(file_path)


def _registered_worktree_paths(manifest: dict[str, Any]) -> set[Path]:
    paths: set[Path] = set()
    for ticket in (manifest.get("tickets") or {}).values():
        if not isinstance(ticket, dict):
            continue
        wt = ticket.get("worktree")
        if wt:
            try:
                paths.add(Path(str(wt)).resolve())
            except (OSError, ValueError):
                pass
    return paths


def _path_in_registered_worktree(file_path: str, manifest: dict[str, Any]) -> bool:
    try:
        resolved = Path(file_path).resolve()
    except (OSError, ValueError):
        return False
    for wt in _registered_worktree_paths(manifest):
        if resolved == wt or wt in resolved.parents:
            return True
    return False


def _path_is_protected_target_edit(file_path: str) -> bool:
    if not file_path:
        return False
    if _path_under_target(file_path):
        return True
    if _path_in_worktree_dir(file_path):
        return True
    return False


def _workflow_execution_active(manifest: dict[str, Any]) -> bool:
    nodes = manifest.get("nodes") or {}
    exec_node = nodes.get("execution") or {}
    if exec_node.get("status") in ("running", "in_progress"):
        return True
    for _nid, state in nodes.items():
        if isinstance(state, dict) and state.get("status") == "running":
            return True
    return manifest.get("status") in ("in_progress", "blocked", "awaiting_human")


def _workflow_orchestrator_may_edit(manifest: dict[str, Any], file_path: str) -> tuple[bool, str]:
    """Goal orchestrator may only edit inside registered ticket worktrees during execution."""
    if not _path_is_protected_target_edit(file_path):
        return True, ""

    if _path_in_registered_worktree(file_path, manifest):
        if _workflow_execution_active(manifest):
            return True, ""
        return False, (
            "ADR-021: worktree path allowed only while execution is active on workflow manifest "
            "(runner step dispatch required)"
        )

    if _qa_worktree_gate_enabled():
        return False, (
            "ADR-021: qa.worktree_gate — edits under target_root must occur in a registered "
            "ticket worktree, not the main workspace. "
            "Register: python3 .sdlc/bin/sdlc_workflow_manifest.py register-ticket "
            f"--run-id {(manifest.get('metadata') or {}).get('run_id', '<run>')} "
            "--ticket JAMBU-N --worktree /path --branch feat/JAMBU-N-desc"
        )

    return False, (
        "ADR-009: edit under target_root outside registered worktrees "
        "(plane-hierarchy must register worktrees first)"
    )


def _legacy_orchestrator_may_edit(manifest: dict[str, Any], file_path: str) -> tuple[bool, str]:
    """Legacy .sdlc/runs manifest (stages.execution)."""
    if not _path_is_protected_target_edit(file_path):
        return True, ""

    exec_status = (manifest.get("stages") or {}).get("execution", {}).get("status")
    if exec_status not in ("in_progress", "completed"):
        return False, (
            "ADR-009 (legacy runs): edit blocked — execution stage not in_progress "
            "(migrate to workflow-runs /sdlc:goal)"
        )

    if _path_in_registered_worktree(file_path, manifest):
        dispatched = any(
            isinstance(t, dict) and t.get("subagent_dispatched") is True
            for t in (manifest.get("tickets") or {}).values()
        )
        if dispatched:
            return True, ""
        return False, "ADR-009: worktree registered but subagent_dispatched=false"

    if _qa_worktree_gate_enabled():
        return False, "ADR-021: worktree_gate — use workflow-runs ACTIVE manifest and registered worktrees"

    return False, "ADR-009: edit outside registered worktrees"


def record_protocol_violation(run_id: str, message: str, *, workflow: bool = True) -> None:
    base = WORKFLOW_RUNS_DIR if workflow else LEGACY_RUNS_DIR
    mf_path = base / run_id / "manifest.yaml"
    if yaml is None or not mf_path.is_file():
        return
    manifest = _load_yaml(mf_path)
    protocol = manifest.setdefault("protocol", {})
    protocol["violation"] = message
    protocol["violation_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    manifest["status"] = "blocked"
    manifest["updated_at"] = protocol["violation_at"]
    mf_path.write_text(
        yaml.safe_dump(manifest, sort_keys=False, allow_unicode=True),
        encoding="utf-8",
    )


def clear_protocol_violation(run_id: str, *, workflow: bool = True) -> None:
    base = WORKFLOW_RUNS_DIR if workflow else LEGACY_RUNS_DIR
    mf_path = base / run_id / "manifest.yaml"
    if yaml is None or not mf_path.is_file():
        return
    manifest = _load_yaml(mf_path)
    protocol = manifest.get("protocol") or {}
    if not protocol.get("violation"):
        return
    protocol["violation"] = None
    protocol["violation_cleared_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    manifest["protocol"] = protocol
    if manifest.get("status") == "blocked":
        manifest["status"] = "in_progress"
    manifest["updated_at"] = protocol["violation_cleared_at"]
    mf_path.write_text(
        yaml.safe_dump(manifest, sort_keys=False, allow_unicode=True),
        encoding="utf-8",
    )


def check_file_edit(file_path: str) -> dict[str, Any]:
    """Return {allowed, message, record_violation, run_id}."""
    if not _path_is_protected_target_edit(file_path):
        return {"allowed": True, "message": "", "record_violation": False}

    run_id, manifest = _active_workflow_run()
    workflow = True
    if not manifest:
        run_id, manifest = _active_legacy_run()
        workflow = False

    if not run_id or not manifest:
        if _qa_worktree_gate_enabled() and _path_under_target(file_path) and not _path_in_worktree_dir(
            file_path,
        ):
            return {
                "allowed": not _enforce_blocking(),
                "message": (
                    "ADR-021: no ACTIVE workflow run but qa.worktree_gate=true — "
                    "cannot edit target_root in main workspace. "
                    "Start: python3 .sdlc/bin/sdlc_workflow_run.py run --workflow goal-flow --intent \"...\" --mode agent"
                ),
                "record_violation": False,
            }
        return {"allowed": True, "message": "", "record_violation": False}

    if manifest.get("status") in ("completed",):
        if _qa_worktree_gate_enabled() and _path_under_target(file_path) and not _path_in_worktree_dir(
            file_path,
        ):
            return {
                "allowed": not _enforce_blocking(),
                "message": (
                    "ADR-021: goal run completed — new app work requires a new goal/feature run "
                    "and an isolated worktree, not main workspace edits"
                ),
                "record_violation": False,
            }
        return {"allowed": True, "message": "", "record_violation": False}

    ok, reason = (
        _workflow_orchestrator_may_edit(manifest, file_path)
        if workflow
        else _legacy_orchestrator_may_edit(manifest, file_path)
    )
    if ok:
        if manifest.get("protocol", {}).get("violation"):
            clear_protocol_violation(run_id, workflow=workflow)
        return {"allowed": True, "message": "", "record_violation": False}

    return {
        "allowed": not _enforce_blocking(),
        "message": reason,
        "record_violation": True,
        "run_id": run_id,
    }


def _effective_cwd(command: str, hook_cwd: str) -> Path:
    """Resolve working directory after the last `cd` in a chained shell command."""
    cd_matches = _SHELL_CD_RE.findall(command)
    if cd_matches:
        raw = cd_matches[-1].strip("'\"")
        segment = Path(raw)
        if segment.is_absolute():
            return segment
        base = Path(hook_cwd).resolve() if hook_cwd else REPO_ROOT.resolve()
        return (base / segment).resolve()
    if hook_cwd:
        return Path(hook_cwd).resolve()
    return REPO_ROOT.resolve()


def _resolve_shell_path(raw: str, cwd: Path) -> str | None:
    cleaned = raw.rstrip("'\",;)")
    if not cleaned:
        return None
    try:
        segment = Path(cleaned)
        resolved = segment.resolve() if segment.is_absolute() else (cwd / cleaned).resolve()
        return str(resolved)
    except (OSError, ValueError):
        return None


def _extract_shell_probe_paths(command: str, hook_cwd: str) -> list[str]:
    """Collect filesystem paths from a shell command that may touch target_root or worktrees."""
    cwd = _effective_cwd(command, hook_cwd)
    probes: list[str] = []
    seen: set[str] = set()

    def add(raw: str) -> None:
        resolved = _resolve_shell_path(raw, cwd)
        if resolved and resolved not in seen:
            seen.add(resolved)
            probes.append(resolved)

    for match in _SHELL_ABS_PATH_RE.finditer(command):
        add(match.group(0))

    for match in _SHELL_APP_REL_RE.finditer(command):
        add(match.group(0))

    return probes


def _shell_probe_paths(command: str, hook_cwd: str) -> list[str]:
    """
    Paths to validate for a matched shell write pattern.
    Prefer extracted command targets; fall back to effective cwd or target_root for implicit dev commands.
    """
    probes = _extract_shell_probe_paths(command, hook_cwd)
    if probes:
        return probes

    effective = str(_effective_cwd(command, hook_cwd))
    if _path_is_protected_target_edit(effective):
        return [effective]
    return [str(workspace_target_root())]


def _extract_workflow_step_run_id(command: str) -> str | None:
    match = WORKFLOW_STEP_RE.search(command or "")
    return match.group(2) if match else None


def _first_prescriptive_command(manifest: dict[str, Any]) -> str | None:
    continuity = manifest.get("continuity") if isinstance(manifest.get("continuity"), dict) else {}
    for act in continuity.get("required_actions") or []:
        if not isinstance(act, dict):
            continue
        if act.get("type") == "command" and isinstance(act.get("command"), str) and act["command"].strip():
            return act["command"].strip()
    return None


def _prescribed_child_run_ids(manifest: dict[str, Any], parent_run_id: str) -> list[str]:
    continuity = manifest.get("continuity") if isinstance(manifest.get("continuity"), dict) else {}
    child_ids: list[str] = []
    for act in continuity.get("required_actions") or []:
        if not isinstance(act, dict) or act.get("type") != "command":
            continue
        cmd = str(act.get("command") or "")
        rid = _extract_workflow_step_run_id(cmd)
        if not rid or rid == parent_run_id:
            continue
        if rid.startswith(f"{parent_run_id}-ff-") or FEATURE_FLOW_SUFFIX_RE.search(rid):
            child_ids.append(rid)
    return child_ids


def check_parent_step_delegate_violation(
    command: str,
    run_id: str | None,
    manifest: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """Deny parent step when continuity prescribes child feature-flow runs (ADR-026)."""
    if not manifest or not run_id:
        return None
    step_run_id = _extract_workflow_step_run_id(command)
    if not step_run_id or step_run_id != run_id:
        return None
    meta = manifest.get("metadata") if isinstance(manifest.get("metadata"), dict) else {}
    manifest_run_id = str(meta.get("run_id") or run_id)
    if step_run_id != manifest_run_id:
        return None
    child_ids = _prescribed_child_run_ids(manifest, step_run_id)
    if not child_ids:
        return None
    prescribed = _first_prescriptive_command(manifest)
    return {
        "allowed": False,
        "message": (
            f"Parent step blocked — manifest prescribes child feature-flow step(s) "
            f"{child_ids[:3]}. Execute first: {prescribed or child_ids[0]}"
        ),
        "record_violation": True,
    }


def check_shell_command(command: str, cwd: str = "") -> dict[str, Any]:
    run_id, manifest = _active_workflow_run()
    workflow = True
    if not manifest:
        run_id, manifest = _active_legacy_run()
        workflow = False

    cmd = command or ""
    delegate_block = check_parent_step_delegate_violation(cmd, run_id, manifest)
    if delegate_block and not delegate_block.get("allowed"):
        if delegate_block.get("record_violation") and run_id:
            record_protocol_violation(run_id, str(delegate_block["message"]), workflow=workflow)
        if _enforce_blocking():
            return delegate_block

    if not any(pattern.search(cmd) for pattern in APP_WRITE_SHELL_PATTERNS):
        return {"allowed": True, "message": "", "record_violation": False}

    for probe in _shell_probe_paths(cmd, cwd):
        if not _path_is_protected_target_edit(probe):
            continue
        result = check_file_edit(probe)
        if result.get("allowed"):
            continue
        out = dict(result)
        out["message"] = f"{result.get('message', '')} (shell: {cmd[:80]})"
        if out.get("record_violation") and run_id:
            record_protocol_violation(run_id, str(out["message"]), workflow=workflow)
        return out

    return {"allowed": True, "message": "", "record_violation": False}


def goal_invoke_prompt_context(prompt: str) -> str | None:
    """
    Machine-readable mandate injected on /sdlc:goal — replaces conversational branching.
    """
    if not (GOAL_TRIGGER_RE.search(prompt) or GOAL_ALIAS_RE.search(prompt)):
        return None

    run_id, manifest = _active_workflow_run()
    lines = [
        "## /sdlc:goal — runner authority (DSL agentPolicy — mandatory)",
        "",
        "This is a cognitive workflow, not a chat. Do not ask the operator to choose worktree vs PR vs local review.",
        "",
        "**First commands (in order):**",
        "1. `python3 .sdlc/bin/sdlc_continuity_resolve.py resolve --command /sdlc:goal --intent \"<intent>\" --json`",
        "2. `python3 .sdlc/bin/sdlc_workflow_run.py run --workflow goal-flow --intent \"<intent>\" --mode agent` "
        "(or `resume` / `step` if run exists)",
        "3. Loop: `step --mode agent` → on exit 42 execute node objective → `submit`",
        "",
        "**Forbidden:**",
        "- Implementing app/target_root code in the orchestrator session (delegate feature-flow per ticket)",
        "- Writing cognitive/*.json without prior step exit 42",
        "- Ending with conversational options (PR?, review locally?, say the word)",
        "- Skipping `pr-creation` node — use `python3 .sdlc/bin/sdlc_workflow_pr.py create --run-id <id>`",
        "",
    ]
    if run_id and manifest:
        status = manifest.get("status")
        continuity = manifest.get("continuity") or {}
        actions = continuity.get("required_actions") or []
        lines.append(f"**Active run:** `{run_id}` status=`{status}`")
        if actions:
            lines.append("**required_actions (manifest):**")
            for act in actions[:6]:
                if isinstance(act, dict):
                    desc = act.get("description") or act.get("command") or act.get("id")
                    lines.append(f"- {desc}")
        lines.append(
            f"`python3 .sdlc/bin/sdlc_workflow_run.py status --run-id {run_id}` for full continuity JSON"
        )
    else:
        lines.append("**No ACTIVE workflow run** — init with `sdlc_workflow_run.py run` before any app edits.")
    lines.append("")
    return "\n".join(lines)
