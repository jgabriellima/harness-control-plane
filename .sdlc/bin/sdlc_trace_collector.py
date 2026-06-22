#!/usr/bin/env python3
"""Local trace collector for AI-Native SDLC observability.

Appends structured span events to `.sdlc/trace/events.jsonl`. Consumed by
`sdlc_trace_server.py` and `ai-native-sdlc trace` for real-time dashboard.

Hook data inventory (Cursor → hook_handler stdin):
  Common: hook_event_name, generation_id, conversation_id, cursor_version,
          model, workspace_roots, user_email
  beforeSubmitPrompt: prompt, attachments[]
  afterAgentResponse: text
  afterAgentThought: text, duration_ms
  beforeShellExecution / afterShellExecution: command, cwd, output, duration
  beforeMCPExecution / afterMCPExecution: tool_name, tool_input, result_json,
                                        url, command, duration
  beforeReadFile / afterFileEdit: file_path, edits[]
  beforeTabFileRead / afterTabFileEdit: file_path, edits[], source=tab
  stop: status, loop_count

Fail-open: never raises to caller.
"""
from __future__ import annotations

import json
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

VERSION = "1.1.0"
SCHEMA_RUNTIME = 1
SCHEMA_COGNITIVE = 2

try:
    from _sdlc_paths import REPO_ROOT, SDLC_ROOT
except ImportError:
    SDLC_ROOT = Path(__file__).resolve().parent.parent
    REPO_ROOT = SDLC_ROOT.parent

TRACE_DIR = SDLC_ROOT / "trace"
EVENTS_FILE = TRACE_DIR / "events.jsonl"
STATE_DIR = TRACE_DIR / "state"
ACTIVE_POINTER = SDLC_ROOT / "runs" / "ACTIVE"
REGISTRY_FILE = STATE_DIR / "subagent_registry.json"

TICKET_RE = re.compile(r"JAMBU-\d+")
BRANCH_TICKET_RE = re.compile(r"feat/JAMBU-\d+")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sanitize(s: str) -> str:
    return re.sub(r"[^\w\-.]", "_", s)


def _estimate_tokens(text: str | None) -> int:
    if not text:
        return 0
    return max(1, len(text) // 4)


def _filename(path: str | None) -> str:
    return path.rstrip("/").split("/")[-1] if path else "unknown"


def _has_errors(output: str) -> bool:
    if not output:
        return False
    low = output.lower()
    return any(re.search(p, low) for p in [r"\berror\b", r"\bfailed\b", r"\bexception\b"])


def _edit_stats(edits: list[dict]) -> dict[str, int]:
    added = removed = 0
    for e in edits or []:
        old = e.get("old_string") or e.get("old_line") or ""
        new = e.get("new_string") or e.get("new_line") or ""
        removed += len(old.splitlines()) if old else 0
        added += len(new.splitlines()) if new else 0
    return {"lines_added": added, "lines_removed": removed, "edit_count": len(edits or [])}


def _enabled() -> bool:
    val = os.environ.get("TRACE_LOCAL", "true").lower()
    return val not in ("0", "false", "no", "off")


def _ensure_dirs() -> None:
    TRACE_DIR.mkdir(parents=True, exist_ok=True)
    STATE_DIR.mkdir(parents=True, exist_ok=True)


def _append_event(record: dict[str, Any]) -> None:
    _ensure_dirs()
    line = json.dumps(record, ensure_ascii=False, default=str)
    with EVENTS_FILE.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def _active_run_id() -> str | None:
    try:
        if ACTIVE_POINTER.is_file():
            run_id = ACTIVE_POINTER.read_text(encoding="utf-8").strip()
            return run_id or None
    except OSError:
        pass
    return None


def _run_context_metadata() -> dict[str, Any]:
    run_id = _active_run_id()
    meta: dict[str, Any] = {"active_run_pointer": str(ACTIVE_POINTER)}
    if run_id:
        meta["run_id"] = run_id
    return meta


def _load_registry() -> dict[str, Any]:
    if not REGISTRY_FILE.is_file():
        return {}
    try:
        data = json.loads(REGISTRY_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def _save_registry(registry: dict[str, Any]) -> None:
    _ensure_dirs()
    REGISTRY_FILE.write_text(json.dumps(registry, indent=2, ensure_ascii=False), encoding="utf-8")


def _parse_ticket_id(task: str | None, git_branch: str | None) -> str | None:
    if task:
        match = TICKET_RE.search(task)
        if match:
            return match.group(0)
    if git_branch:
        match = BRANCH_TICKET_RE.search(git_branch)
        if match:
            segment = match.group(0).split("/")[-1]
            ticket_match = TICKET_RE.search(segment)
            if ticket_match:
                return ticket_match.group(0)
    return None


def _registry_context(conversation_id: str | None) -> dict[str, Any]:
    if not conversation_id:
        return {}
    registry = _load_registry()
    for entry in registry.values():
        if not isinstance(entry, dict):
            continue
        if entry.get("status") != "processing":
            continue
        if entry.get("subagent_conversation_id") == conversation_id:
            ctx: dict[str, Any] = {"subagent_id": entry.get("subagent_id")}
            if ticket_id := entry.get("ticket_id"):
                ctx["ticket_id"] = ticket_id
            return ctx
        if entry.get("parent_conversation_id") == conversation_id:
            ctx = {"subagent_id": entry.get("subagent_id")}
            if ticket_id := entry.get("ticket_id"):
                ctx["ticket_id"] = ticket_id
            return ctx
    return {}


def emit_workflow_event(
    name: str,
    status: str,
    metadata: dict[str, Any] | None = None,
    outputs: dict[str, Any] | None = None,
    *,
    parent_id: str | None = None,
    thread_id: str | None = None,
    duration_ms: int | None = None,
    inputs: dict[str, Any] | None = None,
) -> str:
    """Append a cognitive workflow span to events.jsonl (schema_version 2)."""
    if not _enabled():
        return ""

    run_id = (metadata or {}).get("run_id") or _active_run_id()
    tid = thread_id or (f"run:{run_id}" if run_id else "run:unknown")
    span_id = str(uuid.uuid4())
    meta = {**_run_context_metadata(), **(metadata or {})}
    if run_id and "run_id" not in meta:
        meta["run_id"] = run_id

    rec: dict[str, Any] = {
        "schema_version": SCHEMA_COGNITIVE,
        "collector_version": VERSION,
        "event_kind": "cognitive",
        "id": span_id,
        "thread_id": tid,
        "turn_id": tid,
        "parent_id": parent_id,
        "name": name,
        "type": "workflow",
        "status": status,
        "hook_event_name": "manifest",
        "model": "",
        "tags": ["cognitive", "workflow", "sdlc"],
        "start_time": _now_iso(),
        "end_time": _now_iso() if status in ("completed", "error") else None,
        "duration_ms": duration_ms,
        "tokens": 0,
        "inputs": inputs or {},
        "outputs": outputs or {},
        "logs": [],
        "metadata": meta,
    }
    _append_event(rec)
    return span_id


def _run_manifest_cli(args: list[str]) -> bool:
    """Legacy sdlc_e2e_manifest.py removed (ADR-020). Trace binding uses direct YAML only."""
    _ = args
    return False


def _bind_orchestrator_session(conversation_id: str) -> None:
    run_id = _active_run_id()
    if not run_id or not conversation_id:
        return
    manifest_path = SDLC_ROOT / "runs" / run_id / "manifest.yaml"
    if not manifest_path.is_file():
        return
    try:
        import yaml

        manifest = yaml.safe_load(manifest_path.read_text(encoding="utf-8"))
        if not isinstance(manifest, dict):
            return
        orch = manifest.setdefault("orchestrator", {})
        if orch.get("session_id"):
            return
        _run_manifest_cli(["update-orchestrator-session", "--session-id", conversation_id])
    except Exception:
        pass


def _bind_subagent_conversation(event: dict) -> None:
    conversation_id = event.get("conversation_id")
    if not conversation_id:
        return
    registry = _load_registry()
    now = datetime.now(timezone.utc)
    changed = False
    for entry in registry.values():
        if not isinstance(entry, dict) or entry.get("status") != "processing":
            continue
        if entry.get("subagent_conversation_id"):
            continue
        parent = entry.get("parent_conversation_id")
        if conversation_id == parent:
            continue
        started_raw = entry.get("started_at")
        if started_raw:
            try:
                started = datetime.fromisoformat(str(started_raw).replace("Z", "+00:00"))
                if (now - started).total_seconds() > 120:
                    continue
            except ValueError:
                pass
        entry["subagent_conversation_id"] = conversation_id
        ticket_id = entry.get("ticket_id")
        run_id = entry.get("run_id")
        if ticket_id and run_id:
            manifest_path = SDLC_ROOT / "runs" / str(run_id) / "manifest.yaml"
            try:
                import yaml

                if manifest_path.is_file():
                    manifest = yaml.safe_load(manifest_path.read_text(encoding="utf-8"))
                    if isinstance(manifest, dict):
                        ticket = manifest.get("tickets", {}).get(ticket_id)
                        if isinstance(ticket, dict):
                            ticket["subagent_session_id"] = conversation_id
                            manifest["updated_at"] = _now_iso()
                            manifest_path.write_text(
                                yaml.dump(manifest, default_flow_style=False, sort_keys=False),
                                encoding="utf-8",
                            )
            except Exception:
                pass
        emit_workflow_event(
            "Subagent thread bound",
            "completed",
            {
                "run_id": entry.get("run_id"),
                "ticket_id": ticket_id,
                "subagent_id": entry.get("subagent_id"),
                "subagent_conversation_id": conversation_id,
            },
            thread_id=f"run:{entry.get('run_id')}" if entry.get("run_id") else None,
        )
        changed = True
        break
    if changed:
        _save_registry(registry)


def _save_state(key: str, value: str) -> None:
    _ensure_dirs()
    (STATE_DIR / f"{_sanitize(key)}.state").write_text(value, encoding="utf-8")


def _load_state(key: str) -> str | None:
    p = STATE_DIR / f"{_sanitize(key)}.state"
    return p.read_text(encoding="utf-8") if p.is_file() else None


def _push_stack(key: str, value: str) -> None:
    p = STATE_DIR / f"{_sanitize(key)}.stack"
    stack: list[str] = []
    if p.is_file():
        try:
            stack = json.loads(p.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass
    stack.append(value)
    p.write_text(json.dumps(stack), encoding="utf-8")


def _pop_stack(key: str) -> str | None:
    p = STATE_DIR / f"{_sanitize(key)}.stack"
    if not p.is_file():
        return None
    try:
        stack = json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    if not stack:
        p.unlink(missing_ok=True)
        return None
    value = stack.pop(0)
    if stack:
        p.write_text(json.dumps(stack), encoding="utf-8")
    else:
        p.unlink(missing_ok=True)
    return value


def _base_record(event: dict, *, span_id: str, name: str, span_type: str,
                 status: str, parent_id: str | None = None) -> dict[str, Any]:
    gen_id = event.get("generation_id", "unknown")
    conv_id = event.get("conversation_id", gen_id)
    meta = {
        "cursor_version": event.get("cursor_version", ""),
        "workspace_roots": event.get("workspace_roots", []),
        "user_email": event.get("user_email", ""),
        "repo_root": str(REPO_ROOT),
        **_run_context_metadata(),
        **_registry_context(conv_id),
    }
    return {
        "schema_version": SCHEMA_RUNTIME,
        "collector_version": VERSION,
        "id": span_id,
        "thread_id": conv_id,
        "turn_id": gen_id,
        "parent_id": parent_id,
        "name": name,
        "type": span_type,
        "status": status,
        "hook_event_name": event.get("hook_event_name", ""),
        "model": event.get("model", ""),
        "tags": _tags(event),
        "start_time": _now_iso(),
        "end_time": None,
        "duration_ms": None,
        "tokens": 0,
        "inputs": {},
        "outputs": {},
        "logs": [],
        "metadata": meta,
    }


def _tags(event: dict) -> list[str]:
    hook = event.get("hook_event_name", "")
    tags = ["cursor", "tab" if "Tab" in hook else "agent"]
    if model := event.get("model"):
        tags.append(model.replace(".", "-").lower())
    return tags


def _root_id(event: dict) -> str:
    gen_id = event.get("generation_id", "unknown")
    existing = _load_state(f"{gen_id}_root")
    if existing:
        return existing
    span_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"sdlc-trace:turn:{gen_id}"))
    _save_state(f"{gen_id}_root", span_id)
    rec = _base_record(event, span_id=span_id, name="Cursor Agent",
                       span_type="agent", status="processing", parent_id=None)
    rec["inputs"] = {"turn_id": gen_id}
    _append_event(rec)
    return span_id


def _emit_child(event: dict, *, name: str, span_type: str, status: str = "completed",
                inputs: dict | None = None, outputs: dict | None = None,
                duration_ms: int | None = None, error: str | None = None,
                logs: list[str] | None = None) -> str:
    parent = _root_id(event)
    span_id = str(uuid.uuid4())
    rec = _base_record(event, span_id=span_id, name=name, span_type=span_type,
                       status="error" if error else status, parent_id=parent)
    rec["end_time"] = _now_iso()
    if duration_ms is not None:
        rec["duration_ms"] = duration_ms
    if inputs:
        rec["inputs"] = inputs
    if outputs:
        rec["outputs"] = outputs
    if error:
        rec["outputs"] = {**(outputs or {}), "error": error}
        rec["status"] = "error"
    if logs:
        rec["logs"] = logs
    text_blob = json.dumps({**(inputs or {}), **(outputs or {})}, default=str)
    rec["tokens"] = _estimate_tokens(text_blob)
    _append_event(rec)
    return span_id


def _open_span(event: dict, *, name: str, span_type: str, state_key: str,
               inputs: dict | None = None, extra_tags: list[str] | None = None) -> str:
    parent = _root_id(event)
    span_id = str(uuid.uuid4())
    gen_id = event.get("generation_id", "unknown")
    rec = _base_record(event, span_id=span_id, name=name, span_type=span_type,
                       status="processing", parent_id=parent)
    if inputs:
        rec["inputs"] = inputs
    if extra_tags:
        rec["tags"] = rec["tags"] + extra_tags
    _append_event(rec)
    _push_stack(f"{gen_id}_{state_key}", span_id)
    return span_id


def _close_span(event: dict, *, state_key: str, outputs: dict | None = None,
                duration_ms: int | None = None, error: str | None = None,
                logs: list[str] | None = None) -> None:
    gen_id = event.get("generation_id", "unknown")
    span_id = _pop_stack(f"{gen_id}_{state_key}")
    if not span_id:
        return
    rec: dict[str, Any] = {
        "schema_version": SCHEMA_RUNTIME,
        "collector_version": VERSION,
        "id": span_id,
        "event_kind": "span_update",
        "status": "error" if error else "completed",
        "end_time": _now_iso(),
        "duration_ms": duration_ms,
        "outputs": outputs or {},
        "logs": logs or [],
    }
    if error:
        rec["outputs"]["error"] = error
    text_blob = json.dumps(rec.get("outputs", {}), default=str)
    rec["tokens"] = _estimate_tokens(text_blob)
    _append_event(rec)


def _update_root(event: dict, *, status: str, outputs: dict | None = None,
                 error: str | None = None) -> None:
    gen_id = event.get("generation_id", "unknown")
    span_id = _load_state(f"{gen_id}_root")
    if not span_id:
        span_id = _root_id(event)
    rec: dict[str, Any] = {
        "schema_version": SCHEMA_RUNTIME,
        "collector_version": VERSION,
        "id": span_id,
        "event_kind": "span_update",
        "status": "error" if error else status,
        "end_time": _now_iso(),
    }
    if outputs:
        rec["outputs"] = outputs
    if error:
        rec["outputs"] = {**(outputs or {}), "error": error}
    _append_event(rec)


def _cleanup_turn(gen_id: str) -> None:
    if not STATE_DIR.is_dir():
        return
    prefix = _sanitize(gen_id)
    for p in STATE_DIR.iterdir():
        if prefix in p.name:
            p.unlink(missing_ok=True)


def _handle_subagent_start(event: dict) -> None:
    subagent_id = event.get("subagent_id", "")
    if not subagent_id:
        return

    run_id = _active_run_id()
    ticket_id = _parse_ticket_id(event.get("task"), event.get("git_branch"))
    wave_id = None
    if ticket_id and run_id:
        try:
            import yaml

            manifest_path = SDLC_ROOT / "runs" / run_id / "manifest.yaml"
            if manifest_path.is_file():
                manifest = yaml.safe_load(manifest_path.read_text(encoding="utf-8"))
                ticket = (manifest or {}).get("tickets", {}).get(ticket_id, {})
                wave_id = ticket.get("wave")
        except Exception:
            pass

    registry = _load_registry()
    registry[subagent_id] = {
        "subagent_id": subagent_id,
        "subagent_type": event.get("subagent_type"),
        "task": event.get("task"),
        "parent_conversation_id": event.get("parent_conversation_id"),
        "tool_call_id": event.get("tool_call_id"),
        "git_branch": event.get("git_branch"),
        "is_parallel_worker": event.get("is_parallel_worker", False),
        "subagent_model": event.get("subagent_model"),
        "ticket_id": ticket_id,
        "wave_id": wave_id,
        "run_id": run_id,
        "started_at": _now_iso(),
        "status": "processing",
        "subagent_conversation_id": None,
    }
    _save_registry(registry)

    if ticket_id:
        _run_manifest_cli([
            "register-subagent-dispatch",
            "--ticket", ticket_id,
            "--session-id", subagent_id,
            "--agent", str(event.get("subagent_type") or "implementer"),
        ])

    emit_workflow_event(
        f"Subagent Start: {event.get('subagent_type', 'unknown')}",
        "processing",
        {
            "run_id": run_id,
            "ticket_id": ticket_id,
            "subagent_id": subagent_id,
            "wave_id": wave_id,
            "subagent_type": event.get("subagent_type"),
            "parent_conversation_id": event.get("parent_conversation_id"),
        },
        inputs={"task": event.get("task"), "git_branch": event.get("git_branch")},
        thread_id=f"run:{run_id}" if run_id else None,
    )

    emit_workflow_event(
        "Dispatch ticket",
        "completed",
        {
            "run_id": run_id,
            "ticket_id": ticket_id,
            "subagent_id": subagent_id,
            "wave_id": wave_id,
        },
        thread_id=f"run:{run_id}" if run_id else None,
    )


def _find_open_registry_entry(event: dict) -> tuple[str, dict[str, Any]] | None:
    registry = _load_registry()
    task = event.get("task")
    subagent_type = event.get("subagent_type")
    parent_conv = event.get("conversation_id") or event.get("parent_conversation_id")
    tool_call_id = event.get("tool_call_id")

    candidates: list[tuple[str, dict[str, Any]]] = []
    for sid, entry in registry.items():
        if not isinstance(entry, dict) or entry.get("status") != "processing":
            continue
        if task and entry.get("task") == task:
            candidates.append((sid, entry))
        elif subagent_type and entry.get("subagent_type") == subagent_type:
            if parent_conv and entry.get("parent_conversation_id") == parent_conv:
                candidates.append((sid, entry))

    if tool_call_id:
        for sid, entry in candidates:
            if entry.get("tool_call_id") == tool_call_id:
                return sid, entry

    return candidates[0] if candidates else None


def _handle_subagent_stop(event: dict) -> None:
    match = _find_open_registry_entry(event)
    if not match:
        return
    subagent_id, entry = match
    status_raw = event.get("status", "completed")
    mapped = {"completed": "completed", "error": "error", "aborted": "completed"}.get(
        status_raw, "completed"
    )

    registry = _load_registry()
    entry = registry.get(subagent_id, entry)
    entry["status"] = mapped
    entry["closed_at"] = _now_iso()
    entry["summary"] = event.get("summary")
    entry["agent_transcript_path"] = event.get("agent_transcript_path")
    registry[subagent_id] = entry
    _save_registry(registry)

    run_id = entry.get("run_id")
    emit_workflow_event(
        f"Subagent Stop: {entry.get('subagent_type', 'unknown')}",
        mapped,
        {
            "run_id": run_id,
            "ticket_id": entry.get("ticket_id"),
            "subagent_id": subagent_id,
            "wave_id": entry.get("wave_id"),
        },
        outputs={
            "summary": event.get("summary"),
            "duration_ms": event.get("duration_ms"),
            "modified_files": event.get("modified_files", []),
            "agent_transcript_path": event.get("agent_transcript_path"),
            "status": status_raw,
        },
        duration_ms=event.get("duration_ms"),
        thread_id=f"run:{run_id}" if run_id else None,
    )


def process(event: dict) -> None:
    """Transform a raw Cursor hook event into local trace spans."""
    if not _enabled() or not event:
        return

    hook = event.get("hook_event_name", "")

    try:
        if hook not in ("subagentStart", "subagentStop"):
            _bind_subagent_conversation(event)

        if hook == "beforeSubmitPrompt":
            conv_id = event.get("conversation_id")
            if conv_id:
                _bind_orchestrator_session(conv_id)

        if hook == "subagentStart":
            _handle_subagent_start(event)
            return

        if hook == "subagentStop":
            _handle_subagent_stop(event)
            return

        if hook == "beforeSubmitPrompt":
            prompt = event.get("prompt", "")
            attachments = event.get("attachments", [])
            _root_id(event)
            _emit_child(event, name="User Prompt", span_type="llm",
                        inputs={"prompt": prompt, "model": event.get("model", ""),
                                "attachment_count": len(attachments),
                                "attachments": [{"type": a.get("type"),
                                                 "filePath": a.get("filePath")}
                                                for a in attachments]})

        elif hook == "afterAgentResponse":
            text = event.get("text", "")
            _save_state(f"{event.get('generation_id', 'unknown')}_last_response", text)
            _emit_child(event, name="Agent Response", span_type="llm",
                        inputs={"model": event.get("model", "")},
                        outputs={"text": text},
                        logs=[f"Response length: {len(text)} chars"])

        elif hook == "afterAgentThought":
            thought = event.get("text", "")
            dur = event.get("duration_ms")
            _emit_child(event, name="Agent Thinking", span_type="chain",
                        outputs={"thought": thought},
                        duration_ms=dur,
                        logs=[thought[:200] + "..." if len(thought) > 200 else thought])

        elif hook == "beforeShellExecution":
            cmd = event.get("command", "")
            _open_span(event, name=f"Shell: {cmd[:60]}", span_type="tool",
                       state_key="shell",
                       inputs={"command": cmd, "cwd": event.get("cwd", "")},
                       extra_tags=["shell"])

        elif hook == "afterShellExecution":
            cmd = event.get("command", "")
            output = event.get("output", "")
            dur = event.get("duration")
            errs = _has_errors(output)
            logs = output.splitlines()[-20:] if output else []
            _close_span(event, state_key="shell",
                        outputs={"output": output, "has_errors": errs,
                                 "duration_ms": dur},
                        duration_ms=dur,
                        error=f"Shell error in: {cmd[:60]}" if errs else None,
                        logs=logs)

        elif hook == "beforeMCPExecution":
            tool = event.get("tool_name", "unknown")
            _open_span(event, name=f"MCP: {tool}", span_type="tool",
                       state_key=f"mcp_{_sanitize(tool)}",
                       inputs={"tool_name": tool,
                               "tool_input": event.get("tool_input", {}),
                               "server_url": event.get("url", ""),
                               "server_command": event.get("command", "")},
                       extra_tags=["mcp", f"mcp-{tool}"])

        elif hook == "afterMCPExecution":
            tool = event.get("tool_name", "unknown")
            _close_span(event, state_key=f"mcp_{_sanitize(tool)}",
                        outputs={"result": event.get("result_json", {}),
                                 "duration_ms": event.get("duration")},
                        duration_ms=event.get("duration"))

        elif hook == "beforeReadFile":
            fp = event.get("file_path", "")
            _emit_child(event, name=f"Read: {_filename(fp)}", span_type="tool",
                        inputs={"file_path": fp})

        elif hook == "afterFileEdit":
            fp = event.get("file_path", "")
            stats = _edit_stats(event.get("edits", []))
            _emit_child(event, name=f"Edit: {_filename(fp)}", span_type="tool",
                        inputs={"file_path": fp}, outputs=stats)

        elif hook == "beforeTabFileRead":
            fp = event.get("file_path", "")
            _emit_child(event, name=f"Tab Read: {_filename(fp)}", span_type="tool",
                        inputs={"file_path": fp, "source": "tab"})

        elif hook == "afterTabFileEdit":
            fp = event.get("file_path", "")
            stats = _edit_stats(event.get("edits", []))
            _emit_child(event, name=f"Tab Edit: {_filename(fp)}", span_type="tool",
                        inputs={"file_path": fp, "source": "tab"}, outputs=stats)

        elif hook == "stop":
            status = event.get("status", "completed")
            gen_id = event.get("generation_id", "unknown")
            last = _load_state(f"{gen_id}_last_response")
            outputs = {"response": last, "loop_count": event.get("loop_count", 0)} if last else {
                "loop_count": event.get("loop_count", 0)}
            mapped = {"completed": "completed", "error": "error", "aborted": "completed"}.get(
                status, "completed")
            _update_root(event, status=mapped, outputs=outputs,
                         error=f"Agent stopped: {status}" if status == "error" else None)
            _cleanup_turn(gen_id)

    except Exception:
        pass


def main() -> None:
    """CLI: process one event from stdin (for testing)."""
    try:
        raw = sys.stdin.read()
        event = json.loads(raw) if raw.strip() else {}
        process(event)
    except (json.JSONDecodeError, OSError):
        pass


if __name__ == "__main__":
    main()
