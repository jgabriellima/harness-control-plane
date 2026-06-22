#!/usr/bin/env python3
"""
Goal-flow runtime enforcement for Cursor hooks (ADR-022).

Machine output only — no conversational branching. Hooks call these functions;
agents receive agent_message / additional_context / followup_message, not chat options.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

BIN_DIR = Path(__file__).resolve().parent
if str(BIN_DIR) not in sys.path:
    sys.path.insert(0, str(BIN_DIR))

from _sdlc_paths import (  # noqa: E402
    ACTIVE_WORKFLOW_RUN_POINTER,
    REPO_ROOT,
    SDLC_ROOT,
    WORKFLOW_RUNS_DIR,
    workspace_target_root,
)
from sdlc_workflow_run_resolve import (  # noqa: E402
    dispatch_is_stalled,
    is_feature_flow_child_run,
    resolve_goal_run_id,
)

RUNTIME_STATE_PATH = WORKFLOW_RUNS_DIR / ".cursor-runtime.json"
SDLC_CONVERSATION_ENV = "SDLC_CONVERSATION_ID"
GOAL_TRIGGER_RE = re.compile(r"(?:^|\s)/sdlc:(?:goal|e2e)\b", re.I)
EXPLICIT_GOAL_CMD_RE = re.compile(r"^/sdlc:(?:goal|e2e)\b", re.I)
ECOSYSTEM_CMD_RE = re.compile(r"/sdlc:ecosystem\b", re.I)
ECOSYSTEM_OPS_RE = re.compile(
    r"(criar\s+(projeto|repo|reposit[oó]rio)|novo\s+(projeto|repo|reposit[oó]rio|sibling)|"
    r"sibling\s+repo|instalar\s+sdlc|bootstrap.*ecosystem|ecosystem.*bootstrap|"
    r"create\s+(project|repo|repository)|new\s+sibling|install\s+sdlc)",
    re.I,
)
DECISION_RE = re.compile(r"(?:^|\s)--decision\s+(yes|no)\b", re.I)
YES_NO_RE = re.compile(r"(?:^|\s)/(?:sdlc:)?(yes|no)\b", re.I)
CLAIM_SESSION_RE = re.compile(r"(?:^|\s)--claim-session\b", re.I)
CONTINUE_RUN_RE = re.compile(r"(?:^|\s)--continue\b", re.I)
_SESSION_STATE_KEYS = frozenset(
    {
        "goal_active",
        "runner_engaged",
        "run_id",
        "intent",
        "dispatch_required",
        "last_dispatch",
        "delegate_emitted_at",
        "last_prescribed_command",
        "pending_shell",
        "awaiting_decision",
        "last_status",
        "stall_step_count",
        "parent_step_violations",
        "conversation_id",
    },
)
RUNNER_BIN = SDLC_ROOT / "bin" / "sdlc_workflow_run.py"
RESOLVE_BIN = SDLC_ROOT / "bin" / "sdlc_continuity_resolve.py"


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _migrate_legacy_runtime(data: dict[str, Any]) -> dict[str, Any]:
    if "sessions" in data:
        return data
    return {"sessions": {}, "by_generation": {}, "by_transcript": {}}


def _explicit_conversation_fields(event: dict[str, Any]) -> str | None:
    for key in ("conversation_id", "session_id"):
        value = event.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    env_value = os.environ.get(SDLC_CONVERSATION_ENV, "").strip()
    return env_value or None


def register_hook_event(event: dict[str, Any]) -> str | None:
    """
    Resolve Cursor conversation id for this hook invocation.

    Resolution order: event conversation_id/session_id → sessionStart env
    (SDLC_CONVERSATION_ID) → generation_id cache → transcript_path cache.
    Persists mappings when an explicit id is observed.
    """
    conversation_id = _explicit_conversation_fields(event)
    generation_id = event.get("generation_id")
    transcript = event.get("transcript_path") or event.get("agent_transcript_path")
    transcript_key = transcript.strip() if isinstance(transcript, str) and transcript.strip() else None

    root = _load_runtime_root()
    by_generation = root.setdefault("by_generation", {})
    by_transcript = root.setdefault("by_transcript", {})
    if not isinstance(by_generation, dict):
        by_generation = {}
        root["by_generation"] = by_generation
    if not isinstance(by_transcript, dict):
        by_transcript = {}
        root["by_transcript"] = by_transcript

    if not conversation_id and isinstance(generation_id, str) and generation_id:
        cached = by_generation.get(generation_id)
        if isinstance(cached, str) and cached:
            conversation_id = cached

    if not conversation_id and transcript_key:
        cached = by_transcript.get(transcript_key)
        if isinstance(cached, str) and cached:
            conversation_id = cached

    if conversation_id:
        if isinstance(generation_id, str) and generation_id:
            by_generation[generation_id] = conversation_id
        if transcript_key:
            by_transcript[transcript_key] = conversation_id
        _save_runtime_root(root)

    return conversation_id


def resolve_conversation_id(event: dict[str, Any]) -> str | None:
    return register_hook_event(event)


def evaluate_session_start(event: dict[str, Any]) -> dict[str, Any]:
    """sessionStart — bind SDLC_CONVERSATION_ID for all subsequent hooks in this session."""
    session_id = _explicit_conversation_fields(event)
    if not session_id:
        return {}
    register_hook_event(
        {
            "session_id": session_id,
            "conversation_id": session_id,
            "hook_event_name": "sessionStart",
        },
    )
    return {"env": {SDLC_CONVERSATION_ENV: session_id}}


def _load_runtime_root() -> dict[str, Any]:
    if not RUNTIME_STATE_PATH.is_file():
        return {"sessions": {}, "by_generation": {}, "by_transcript": {}}
    try:
        data = json.loads(RUNTIME_STATE_PATH.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return {"sessions": {}, "by_generation": {}, "by_transcript": {}}
        migrated = _migrate_legacy_runtime(data)
        migrated.setdefault("sessions", {})
        migrated.setdefault("by_generation", {})
        migrated.setdefault("by_transcript", {})
        return migrated
    except (json.JSONDecodeError, OSError):
        return {"sessions": {}, "by_generation": {}, "by_transcript": {}}


def _save_runtime_root(root: dict[str, Any]) -> None:
    RUNTIME_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    root["updated_at"] = _utc_now()
    RUNTIME_STATE_PATH.write_text(json.dumps(root, indent=2), encoding="utf-8")


def _get_session_state(conversation_id: str | None) -> dict[str, Any]:
    if not conversation_id:
        return {}
    root = _load_runtime_root()
    sessions = root.get("sessions")
    if not isinstance(sessions, dict):
        return {}
    raw = sessions.get(conversation_id)
    return dict(raw) if isinstance(raw, dict) else {}


def _save_session_state(conversation_id: str, state: dict[str, Any]) -> None:
    root = _load_runtime_root()
    sessions = root.setdefault("sessions", {})
    if state:
        state = dict(state)
        state["conversation_id"] = conversation_id
        state["updated_at"] = _utc_now()
        sessions[conversation_id] = state
    else:
        sessions.pop(conversation_id, None)
    _save_runtime_root(root)


def _clear_session_state(conversation_id: str) -> None:
    _save_session_state(conversation_id, {})


def _load_state(conversation_id: str | None = None) -> dict[str, Any]:
    return _get_session_state(conversation_id)


def _save_state(state: dict[str, Any], conversation_id: str | None = None) -> None:
    cid = conversation_id or str(state.get("conversation_id") or "")
    if not cid:
        raise ValueError("conversation_id required to save session state")
    _save_session_state(cid, state)


def _clear_goal_session(conversation_id: str | None = None) -> None:
    if conversation_id:
        _clear_session_state(conversation_id)
        return
    if RUNTIME_STATE_PATH.is_file():
        RUNTIME_STATE_PATH.unlink(missing_ok=True)


def _orchestrator_session_id(manifest: dict[str, Any] | None) -> str | None:
    if not manifest:
        return None
    try:
        from sdlc_workflow_manifest import orchestrator_session_id  # noqa: WPS433

        return orchestrator_session_id(manifest)
    except Exception:
        orch = manifest.get("orchestrator")
        if not isinstance(orch, dict):
            return None
        session_id = orch.get("session_id")
        return str(session_id) if isinstance(session_id, str) and session_id.strip() else None


def _bind_orchestrator_session(
    run_id: str,
    conversation_id: str,
    *,
    force: bool = False,
) -> tuple[bool, str | None]:
    from sdlc_workflow_manifest import bind_orchestrator_session  # noqa: WPS433

    return bind_orchestrator_session(run_id, conversation_id, force=force)


def _session_owns_run(conversation_id: str | None, run_id: str | None) -> bool:
    if not conversation_id or not run_id:
        return False
    manifest = _manifest_status(run_id)
    owner = _orchestrator_session_id(manifest)
    if owner:
        return owner == conversation_id
    session = _get_session_state(conversation_id)
    return session.get("run_id") == run_id


def _prompt_claims_session(prompt: str) -> bool:
    return bool(CLAIM_SESSION_RE.search(prompt) or CONTINUE_RUN_RE.search(prompt))


def _session_may_drive_hooks(conversation_id: str | None, state: dict[str, Any]) -> bool:
    if not conversation_id or not state.get("goal_active"):
        return False
    run_id = state.get("run_id")
    if not isinstance(run_id, str) or not run_id:
        return False
    return _session_owns_run(conversation_id, run_id)


def _first_substantive_line(prompt: str) -> str:
    for line in prompt.splitlines():
        stripped = line.strip()
        if stripped:
            return stripped
    return ""


def _prompt_authorizes_goal_activation(prompt: str) -> bool:
    """
    Detection (GOAL_TRIGGER_RE) may match pasted citations anywhere in the prompt.
    Activation requires an explicit command on the first substantive line only.
    """
    return bool(EXPLICIT_GOAL_CMD_RE.match(_first_substantive_line(prompt)))


def _extract_goal_intent(prompt: str) -> str:
    text = _first_substantive_line(prompt)
    text = re.sub(r"^/sdlc:(?:goal|e2e)\s*", "", text, flags=re.I).strip()
    return text or "goal invocation"


def _suppress_goal_propagation(state: dict[str, Any], conversation_id: str) -> None:
    """Clear hook state for one Cursor session only."""
    _ = state
    _clear_session_state(conversation_id)


def _ecosystem_enforce_enabled() -> bool:
    return os.environ.get("SDL_ECOSYSTEM_ENFORCE", "").lower() in ("1", "true", "yes")


def _evaluate_ecosystem_prompt_redirect(prompt: str) -> PromptGateResult | None:
    """NL ecosystem bootstrap → /sdlc:ecosystem redirect (ADR-039 Phase 2)."""
    if ECOSYSTEM_CMD_RE.search(prompt):
        return None
    if not ECOSYSTEM_OPS_RE.search(prompt):
        return None

    intent = prompt.strip()
    if _ecosystem_enforce_enabled():
        return PromptGateResult(
            continue_submit=False,
            user_message=(
                "SDLC_ECOSYSTEM_REQUIRED\n"
                "Ecosystem bootstrap must use /sdlc:ecosystem — not free-form chat or /sdlc:goal.\n"
                f"Re-submit: /sdlc:ecosystem {intent[:200]}"
            ),
            agent_note="",
        )

    return PromptGateResult(
        continue_submit=True,
        user_message="",
        agent_note=(
            "SDLC_ECOSYSTEM_REDIRECT\n"
            "Ecosystem topology work must use /sdlc:ecosystem (ADR-039), not goal-flow or ad-hoc scaffold.\n"
            f"Invoke exactly: /sdlc:ecosystem {intent[:240]}"
        ),
    )


def _run_cmd(args: list[str], *, cwd: Path | None = None) -> tuple[int, str, str]:
    proc = subprocess.run(
        [sys.executable, *args],
        cwd=str(cwd or REPO_ROOT),
        capture_output=True,
        text=True,
    )
    out = (proc.stdout or "") + (proc.stderr or "")
    return proc.returncode, proc.stdout or "", out


def _parse_run_id_from_runner(stdout: str, combined: str, fallback: str) -> str | None:
    for line in stdout.splitlines():
        if line.startswith("INIT run_id="):
            return line.split("=", 1)[1].split()[0]
    blob = _parse_json_blob(stdout) or _parse_json_blob(combined)
    if blob and isinstance(blob.get("run_id"), str):
        return str(blob["run_id"])
    if fallback and (WORKFLOW_RUNS_DIR / fallback / "manifest.yaml").is_file():
        return fallback
    return None


def _parse_json_blob(text: str) -> dict[str, Any] | None:
    text = text.strip()
    if not text:
        return None
    start = text.find("{")
    if start < 0:
        return None
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                try:
                    blob = json.loads(text[start : i + 1])
                    return blob if isinstance(blob, dict) else None
                except json.JSONDecodeError:
                    return None
    return None


def _manifest_status(run_id: str) -> dict[str, Any] | None:
    mf = WORKFLOW_RUNS_DIR / run_id / "manifest.yaml"
    if not mf.is_file():
        return None
    try:
        import yaml
    except ImportError:
        return None
    data = yaml.safe_load(mf.read_text(encoding="utf-8"))
    return data if isinstance(data, dict) else None


@dataclass
class PromptGateResult:
    continue_submit: bool
    user_message: str
    agent_note: str


def evaluate_prompt_submit(prompt: str, conversation_id: str | None = None) -> PromptGateResult:
    """beforeSubmitPrompt — init goal run or gate HITL yes/no."""
    state = _get_session_state(conversation_id)

    decision_match = DECISION_RE.search(prompt) or YES_NO_RE.search(prompt)
    if decision_match and state.get("awaiting_decision"):
        choice = decision_match.group(1).lower()
        pending = state.get("awaiting_decision") or {}
        if choice == "yes":
            cmd = pending.get("on_yes")
        else:
            cmd = pending.get("on_no")
        state.pop("awaiting_decision", None)
        state["pending_shell"] = cmd
        _save_state(state, conversation_id)
        return PromptGateResult(
            continue_submit=True,
            user_message="",
            agent_note=f"Decision recorded: {choice.upper()}. Execute exactly: {cmd}",
        )

    if not GOAL_TRIGGER_RE.search(prompt):
        if conversation_id and (state.get("goal_active") or state.get("runner_engaged")) and not decision_match:
            if _session_may_drive_hooks(conversation_id, state):
                _suppress_goal_propagation(state, conversation_id)
        eco_redirect = _evaluate_ecosystem_prompt_redirect(prompt)
        if eco_redirect is not None:
            return eco_redirect
        return PromptGateResult(continue_submit=True, user_message="", agent_note="")

    if not _prompt_authorizes_goal_activation(prompt):
        if conversation_id:
            _suppress_goal_propagation(state, conversation_id)
        return PromptGateResult(continue_submit=True, user_message="", agent_note="")

    if not conversation_id:
        return PromptGateResult(
            continue_submit=False,
            user_message=(
                "SDLC_GOAL_SESSION_UNRESOLVED\n"
                "Could not resolve conversation_id for this session.\n"
                "Ensure .cursor/hooks.json registers sdlc_runtime_guard.py on sessionStart "
                f"(sets {SDLC_CONVERSATION_ENV})."
            ),
            agent_note="",
        )

    intent = _extract_goal_intent(prompt)
    claim_session = _prompt_claims_session(prompt)
    _run_cmd([str(RESOLVE_BIN), "resolve", "--command", "/sdlc:goal", "--intent", intent, "--json"])

    slug = re.sub(r"[^a-z0-9]+", "-", intent.lower()).strip("-")[:40]
    slug = slug or "goal-run"
    run_id = state.get("run_id")
    active: str | None = None
    if ACTIVE_WORKFLOW_RUN_POINTER.is_file():
        active = ACTIVE_WORKFLOW_RUN_POINTER.read_text(encoding="utf-8").strip() or None
    goal_runs: list[tuple[str, dict[str, Any]]] = []
    if WORKFLOW_RUNS_DIR.is_dir():
        try:
            import yaml
        except ImportError:
            yaml = None  # type: ignore[assignment]
        if yaml is not None:
            for entry in WORKFLOW_RUNS_DIR.iterdir():
                mf_path = entry / "manifest.yaml"
                if not entry.is_dir() or not mf_path.is_file():
                    continue
                doc = yaml.safe_load(mf_path.read_text(encoding="utf-8"))
                if not isinstance(doc, dict):
                    continue
                wf = str((doc.get("metadata") or {}).get("workflow_id", ""))
                if wf == "goal-flow" and doc.get("status") in (
                    "in_progress",
                    "blocked",
                    "awaiting_human",
                    "pending",
                ):
                    goal_runs.append((entry.name, doc))
    resolved = resolve_goal_run_id(active, goal_runs)
    if resolved:
        run_id = resolved
    elif active and is_feature_flow_child_run(active):
        run_id = state.get("run_id")

    if run_id:
        bound, previous_owner = _bind_orchestrator_session(
            str(run_id),
            conversation_id,
            force=claim_session,
        )
        if not bound and previous_owner:
            return PromptGateResult(
                continue_submit=False,
                user_message=(
                    "SDLC_SESSION_OWNED\n"
                    f"run_id={run_id}\n"
                    f"owner_session={previous_owner}\n"
                    "Another Cursor session owns this run. "
                    "Open the owning session or invoke /sdlc:goal --claim-session to transfer ownership."
                ),
                agent_note="",
            )

    dispatch_blob: dict[str, Any] | None = None
    if not run_id:
        explicit_run_id = f"{slug}-{datetime.now(timezone.utc).strftime('%Y%m%d')}"
        code, stdout, combined = _run_cmd(
            [
                str(RUNNER_BIN),
                "run",
                "--workflow",
                "goal-flow",
                "--intent",
                intent,
                "--mode",
                "agent",
                "--run-id",
                explicit_run_id,
            ],
        )
        # exit 42 = AGENT_DISPATCH (success in agent mode), not failure
        if code not in (0, 42):
            return PromptGateResult(
                continue_submit=False,
                user_message=(
                    "SDLC_GOAL_INIT_FAILED\n"
                    f"exit={code}\n"
                    f"{combined[:800]}"
                ),
                agent_note="",
            )
        run_id = _parse_run_id_from_runner(stdout, combined, explicit_run_id)
        if not run_id:
            return PromptGateResult(
                continue_submit=False,
                user_message="SDLC_GOAL_INIT_FAILED\nCould not parse run_id from runner output.",
                agent_note="",
            )
        bound, previous_owner = _bind_orchestrator_session(
            str(run_id),
            conversation_id,
            force=True,
        )
        if not bound and previous_owner and previous_owner != conversation_id:
            return PromptGateResult(
                continue_submit=False,
                user_message=(
                    "SDLC_SESSION_OWNED\n"
                    f"run_id={run_id}\n"
                    f"owner_session={previous_owner}\n"
                    "Could not bind new run to this session."
                ),
                agent_note="",
            )
        dispatch_blob = _parse_json_blob(stdout) or _parse_json_blob(combined)

    runner_engaged = bool(
        dispatch_blob
        and dispatch_blob.get("action") == "AGENT_DISPATCH"
    )
    state = {
        "goal_active": True,
        "runner_engaged": runner_engaged,
        "run_id": run_id,
        "intent": intent,
        "conversation_id": conversation_id,
        "dispatch_required": dispatch_blob is None or dispatch_blob.get("action") != "AGENT_DISPATCH",
        "updated_at": _utc_now(),
    }
    if dispatch_blob and dispatch_blob.get("action") == "AGENT_DISPATCH":
        state["last_dispatch"] = dispatch_blob
    _save_state(state, conversation_id)

    agent_note = ""
    if dispatch_blob and dispatch_blob.get("action") == "AGENT_DISPATCH":
        node_id = dispatch_blob.get("node_id", "?")
        agent_note = (
            "SDLC_GOAL_STARTED\n"
            f"run_id={run_id}\n"
            f"AGENT_DISPATCH node={node_id}\n"
            f"objective={dispatch_blob.get('objective', '')}\n"
            f"submit_command={dispatch_blob.get('submit_command', '')}\n"
            "Execute the node objective, write cognitive JSON, then submit."
        )

    return PromptGateResult(continue_submit=True, user_message="", agent_note=agent_note)


@dataclass
class ToolGateResult:
    permission: str
    user_message: str
    agent_message: str


def _child_run_id_from_step_command(command: str) -> str | None:
    match = re.search(
        r"(?:sdlc|business)_workflow_run\.py\s+step\b.*?--run-id\s+(['\"]?)([^\s'\";&|]+)\1",
        command or "",
        re.I | re.S,
    )
    if not match:
        return None
    run_id = match.group(2)
    try:
        from sdlc_workflow_run_resolve import run_metadata  # noqa: WPS433

        workflow_id, status = run_metadata(run_id)
    except Exception:
        return None
    if workflow_id == "feature-flow" and status == "completed":
        return run_id
    return None


def _first_prescriptive_command(manifest: dict[str, Any] | None) -> str | None:
    if not manifest:
        return None
    continuity = manifest.get("continuity") if isinstance(manifest.get("continuity"), dict) else {}
    for act in continuity.get("required_actions") or []:
        if not isinstance(act, dict):
            continue
        if act.get("type") == "command" and isinstance(act.get("command"), str) and act["command"].strip():
            cmd = act["command"].strip()
            if _child_run_id_from_step_command(cmd):
                continue
            return cmd
    return None


def _next_runner_command(run_id: str) -> str:
    manifest = _manifest_status(run_id)
    if manifest and manifest.get("status") == "completed":
        return f"python3 .sdlc/bin/sdlc_workflow_run.py status --run-id {run_id}"
    prescribed = _first_prescriptive_command(manifest)
    if prescribed:
        return prescribed
    return f"python3 .sdlc/bin/sdlc_workflow_run.py step --run-id {run_id} --mode agent"


def evaluate_pre_tool_use(
    tool_name: str,
    tool_input: dict[str, Any],
    conversation_id: str | None = None,
) -> ToolGateResult | None:
    """preToolUse — block Write/StrReplace under target_root during active goal."""
    state = _get_session_state(conversation_id)
    if not _session_may_drive_hooks(conversation_id, state):
        return None

    if tool_name not in ("Write", "StrReplace", "EditNotebook", "Delete"):
        return None

    path = str(tool_input.get("path") or tool_input.get("file_path") or tool_input.get("target_notebook") or "")
    if not path:
        return None

    try:
        resolved = Path(path).resolve()
        target = workspace_target_root()
        in_target = resolved == target or target in resolved.parents
    except (OSError, ValueError):
        in_target = "app/" in path.replace("\\", "/")

    in_worktree = "/worktrees/" in path.replace("\\", "/")
    if not in_target and not in_worktree:
        return None

    if in_worktree:
        return None

    run_id = str(state.get("run_id", ""))
    cmd = _next_runner_command(run_id)
    return ToolGateResult(
        permission="deny",
        user_message="SDLC goal: orchestrator cannot edit target_root. Use feature-flow worktree.",
        agent_message=(
            "GOAL_RUNNER_AUTHORITY\n"
            f"run_id={run_id}\n"
            f"EXECUTE_SHELL_ONLY:\n{cmd}\n"
            "Then execute the node objective from AGENT_DISPATCH JSON. "
            "Then submit via sdlc_workflow_run.py submit. "
            "Do not ask the user conversational questions."
        ),
    )


def _extract_workflow_step_run_id(command: str) -> str | None:
    match = re.search(
        r"(?:sdlc|business)_workflow_run\.py\s+step\b.*?--run-id\s+(['\"]?)([^\s'\";&|]+)\1",
        command or "",
        re.I | re.S,
    )
    return match.group(2) if match else None


def evaluate_before_shell(command: str, conversation_id: str | None = None) -> ToolGateResult | None:
    """beforeShellExecution — during goal, prefer runner commands."""
    state = _get_session_state(conversation_id)
    if not _session_may_drive_hooks(conversation_id, state):
        return None

    cmd = command.strip()
    run_id = str(state.get("run_id", ""))
    if "sdlc_workflow_run.py step" in cmd or "business_workflow_run.py step" in cmd:
        step_run_id = _extract_workflow_step_run_id(cmd)
        prescribed = state.get("last_prescribed_command") or _first_prescriptive_command(_manifest_status(run_id))
        if (
            state.get("delegate_emitted_at")
            and prescribed
            and step_run_id == run_id
            and prescribed.strip() != cmd.strip()
        ):
            violations = int(state.get("parent_step_violations") or 0) + 1
            state["parent_step_violations"] = violations
            _save_state(state, conversation_id)
            hard_block = violations >= 3
            return ToolGateResult(
                permission="deny",
                user_message=(
                    "SDLC parent step blocked after RUN DELEGATE"
                    + (" — session limit reached" if hard_block else "")
                ),
                agent_message=(
                    "SDLC_GOAL_PARENT_STEP_VIOLATION\n"
                    f"violations={violations}\n"
                    f"Do NOT re-step parent run_id={run_id}.\n"
                    f"Execute prescribed child command:\n{prescribed}"
                ),
            )
    if "sdlc_workflow_run.py" in cmd or "sdlc_workflow_pr.py" in cmd:
        return None
    if "sdlc_goal_runtime" in cmd or "sdlc_protocol_guard" in cmd:
        return None

    if re.search(r"\b(npm run dev|astro dev)\b", cmd, re.I):
        return ToolGateResult(
            permission="deny",
            user_message="SDLC goal: dev server not until deploy node passes.",
            agent_message=f"Run workflow step first:\n{_next_runner_command(run_id)}",
        )
    return None


def evaluate_post_shell(
    command: str,
    output: str,
    exit_code: int,
    conversation_id: str | None = None,
) -> dict[str, Any]:
    """postToolUse — inject AGENT_DISPATCH / status into model context."""
    state = _get_session_state(conversation_id)
    result: dict[str, Any] = {}
    if not _session_may_drive_hooks(conversation_id, state):
        return result
    if "sdlc_workflow_run.py" not in command:
        return result

    blob = _parse_json_blob(output)
    if blob and blob.get("action") == "AGENT_DISPATCH":
        state["dispatch_required"] = False
        state["runner_engaged"] = True
        state["goal_active"] = True
        prev = state.get("last_dispatch") if isinstance(state.get("last_dispatch"), dict) else {}
        if prev.get("node_id") == blob.get("node_id") and prev.get("run_id") == blob.get("run_id"):
            state["stall_step_count"] = int(state.get("stall_step_count") or 0) + 1
        else:
            state["stall_step_count"] = 0
        state["last_dispatch"] = blob
        _save_state(state, conversation_id)
        result["additional_context"] = (
            "SDLC_AGENT_DISPATCH\n" + json.dumps(blob, indent=2)
        )
        return result

    if exit_code == 0 and "RUN_COMPLETE" in output:
        run_id = state.get("run_id") or ""
        child_match = re.search(
            r"(?:sdlc|business)_workflow_run\.py\s+step\b.*?--run-id\s+(['\"]?)([^\s'\";&|]+)\1",
            command or "",
            re.I | re.S,
        )
        if child_match:
            completed_child_id = child_match.group(2)
            try:
                from sdlc_workflow_run import reconcile_parent_after_child_complete  # noqa: WPS433

                parent_manifest = reconcile_parent_after_child_complete(completed_child_id)
                if parent_manifest and run_id and parent_manifest.get("metadata", {}).get("run_id") == run_id:
                    manifest = parent_manifest
            except Exception:
                manifest = _manifest_status(str(run_id)) if run_id else None
        else:
            manifest = _manifest_status(str(run_id)) if run_id else None
        continuity = (manifest or {}).get("continuity") or {}
        actions = continuity.get("required_actions") or []
        state["goal_active"] = manifest is None or manifest.get("status") != "completed"
        if manifest and manifest.get("status") == "completed":
            state["goal_active"] = False
        _save_state(state, conversation_id)
        if actions:
            prescribed = _first_prescriptive_command(manifest)
            result["additional_context"] = (
                "SDLC_RUN_COMPLETE\nrequired_actions:\n"
                + json.dumps(actions, indent=2)
                + (f"\nprescribed_command: {prescribed}" if prescribed else "")
            )
        return result

    status_blob = blob if blob and "continuity" in blob else None
    if status_blob:
        state["last_status"] = status_blob
        _save_state(state, conversation_id)
        continuity = status_blob.get("continuity") if isinstance(status_blob.get("continuity"), dict) else {}
        actions = continuity.get("required_actions") or []
        awaiting = continuity.get("awaiting")
        if exit_code == 1 and actions:
            prescribed = _first_prescriptive_command(status_blob)
            state["runner_engaged"] = True
            state["goal_active"] = True
            if prescribed:
                state["delegate_emitted_at"] = _utc_now()
                state["last_prescribed_command"] = prescribed
                state.pop("parent_step_violations", None)
            _save_state(state, conversation_id)
            result["additional_context"] = (
                "SDLC_STEP_DELEGATE\n"
                + json.dumps(
                    {
                        "run_id": status_blob.get("run_id"),
                        "status": status_blob.get("status"),
                        "next_node": status_blob.get("next_node"),
                        "required_actions": actions,
                        "prescribed_command": prescribed,
                    },
                    indent=2,
                )
                + "\nDo NOT re-step parent until child feature-flow runs complete."
            )
            return result
        if awaiting and awaiting != "none":
            result["additional_context"] = "SDLC_STATUS\n" + json.dumps(status_blob, indent=2)
        return result

    return result


@dataclass
class StopGateResult:
    followup_message: str | None


def evaluate_stop(
    status: str,
    loop_count: int,
    conversation_id: str | None = None,
) -> StopGateResult:
    """stop — auto-continue only in the session that owns the run."""
    _ = status
    state = _get_session_state(conversation_id)
    if not _session_may_drive_hooks(conversation_id, state):
        return StopGateResult(followup_message=None)

    if not state.get("runner_engaged"):
        if conversation_id:
            _suppress_goal_propagation(state, conversation_id)
        return StopGateResult(followup_message=None)

    if loop_count >= 5:
        if conversation_id:
            _clear_goal_session(conversation_id)
        return StopGateResult(followup_message=None)

    run_id = str(state.get("run_id", ""))
    manifest = _manifest_status(run_id) if run_id else None
    if manifest and manifest.get("status") == "completed":
        if conversation_id:
            _clear_goal_session(conversation_id)
        return StopGateResult(followup_message=None)

    if state.get("pending_shell"):
        cmd = str(state.pop("pending_shell"))
        _save_state(state, conversation_id)
        return StopGateResult(followup_message=cmd)

    dispatch = state.get("last_dispatch") if isinstance(state.get("last_dispatch"), dict) else {}
    node_id = str(dispatch.get("node_id") or "")
    submit_command = str(dispatch.get("submit_command") or "")
    if run_id and node_id and dispatch_is_stalled(run_id, node_id) and submit_command:
        repeat = int(state.get("stall_step_count") or 0) + 1
        state["stall_step_count"] = repeat
        _save_state(state, conversation_id)
        if repeat >= 2:
            return StopGateResult(
                followup_message=(
                    f"SDLC_GOAL_STALLED\n"
                    f"run_id={run_id}\n"
                    f"node={node_id} is running but cognitive output is missing.\n"
                    f"Do NOT run step again. Execute objective, write cognitive JSON, then:\n"
                    f"{submit_command}"
                ),
            )

    prescribed = _first_prescriptive_command(manifest)
    cmd = prescribed or _next_runner_command(run_id)
    state.pop("stall_step_count", None)
    _save_state(state, conversation_id)
    label = "SDLC_GOAL_DELEGATE" if prescribed else "SDLC_GOAL_CONTINUE"
    return StopGateResult(
        followup_message=(
            f"{label}\n"
            f"run_id={run_id}\n"
            f"Execute shell (no prose, no questions):\n{cmd}"
        ),
    )


def format_decision_request(
    *,
    question: str,
    on_yes_command: str,
    on_no_command: str,
    conversation_id: str | None = None,
) -> PromptGateResult:
    """Register binary decision — user must reply /yes or /no or --decision yes|no."""
    state = _get_session_state(conversation_id)
    state["awaiting_decision"] = {
        "question": question,
        "on_yes": on_yes_command,
        "on_no": on_no_command,
    }
    if conversation_id:
        _save_state(state, conversation_id)
    return PromptGateResult(
        continue_submit=False,
        user_message=(
            "SDLC_DECISION_REQUIRED\n"
            f"Q: {question}\n"
            "Reply with exactly one of: /yes | /no | --decision yes | --decision no\n"
            f"YES runs: {on_yes_command}\n"
            f"NO runs: {on_no_command}"
        ),
        agent_note="",
    )
