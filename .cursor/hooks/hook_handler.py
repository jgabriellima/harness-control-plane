#!/usr/bin/env python3
"""
Cursor → LangSmith Hook Handler (project-local)

Traces Cursor AI agent activity to LangSmith. Each message turn becomes its
own trace, threaded by conversation via metadata. Before/after hook pairs
(shell, MCP) are merged into single runs using a FIFO stack on disk.

Fail-open: errors never block Cursor.

Env loading strategy:
  1. Resolve project root from __file__ (.cursor/hooks/hook_handler.py → ../../)
  2. Fall back to os.getcwd()
  3. Try python-dotenv; if unavailable, parse the .env manually so credentials
     are always available regardless of the Python environment.

Required env vars (in .env or shell):
  TRACE_TO_LANGSMITH=true
  LANGCHAIN_API_KEY=lsv2_pt_...
Optional:
  LANGCHAIN_PROJECT=cursor-agent   (defaults to "cursor-agent")
"""
from __future__ import annotations

import json
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

# Local SDLC trace collector (fail-open)
_SDLC_BIN = Path(__file__).resolve().parent.parent.parent / ".sdlc" / "bin"
if _SDLC_BIN.is_dir() and str(_SDLC_BIN) not in sys.path:
    sys.path.insert(0, str(_SDLC_BIN))
try:
    import sdlc_trace_collector as _trace_collector
except ImportError:
    _trace_collector = None  # type: ignore[assignment]

VERSION = "0.5.0"
PERMISSIVE = {"continue": True, "permission": "allow"}
STATE_DIR = Path.home() / ".cursor" / "langsmith-state"

# ---------------------------------------------------------------------------
# Stdin helpers
# ---------------------------------------------------------------------------

def _read_stdin() -> dict:
    try:
        raw = sys.stdin.read()
        return json.loads(raw) if raw.strip() else {}
    except (json.JSONDecodeError, OSError):
        return {}

def _drain_stdin():
    try:
        sys.stdin.read()
    except OSError:
        pass

# ---------------------------------------------------------------------------
# Env loading — anchored to project root, with manual-parse fallback
# ---------------------------------------------------------------------------

def _parse_env_file(path: Path) -> dict[str, str]:
    """Minimal .env parser: handles KEY=VALUE, quoted values, and comments."""
    result: dict[str, str] = {}
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip()
            if (val.startswith('"') and val.endswith('"')) or \
               (val.startswith("'") and val.endswith("'")):
                val = val[1:-1]
            result[key] = val
    except OSError:
        pass
    return result

def _load_env():
    """
    Load .env into os.environ from two candidate locations (project root
    relative to this script, then cwd). Tries python-dotenv first; falls back
    to the manual parser so the hook works even in bare Python environments.
    """
    # Resolve candidate paths
    script_root = Path(__file__).resolve().parent.parent.parent  # ../../ from .cursor/hooks/
    cwd_root = Path(os.getcwd())

    candidates: list[Path] = []
    for root in [script_root, cwd_root]:
        p = root / ".env"
        if p.is_file() and p not in candidates:
            candidates.append(p)

    if not candidates:
        return

    # Try python-dotenv (respects override=False so shell vars take precedence)
    try:
        from dotenv import load_dotenv
        for env_path in candidates:
            load_dotenv(env_path, override=False)
        return
    except ImportError:
        pass

    # Manual fallback — only set if not already in environment
    for env_path in candidates:
        for key, val in _parse_env_file(env_path).items():
            if key not in os.environ:
                os.environ[key] = val

# ---------------------------------------------------------------------------
# State persistence (disk-based, cross-process)
# ---------------------------------------------------------------------------

def _sanitize(s: str) -> str:
    return re.sub(r"[^\w\-.]", "_", s)

def _state_path(namespace: str, key: str, ext: str = "state") -> Path:
    return STATE_DIR / f"{_sanitize(namespace)}_{_sanitize(key)}.{ext}"

def _save_state(namespace: str, key: str, value: str):
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    _state_path(namespace, key).write_text(value)

def _load_state(namespace: str, key: str) -> str | None:
    p = _state_path(namespace, key)
    return p.read_text() or None if p.exists() else None

def _push_state(namespace: str, key: str, value: str):
    p = _state_path(namespace, key, "stack")
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    stack: list[str] = []
    if p.exists():
        try:
            stack = json.loads(p.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    stack.append(value)
    p.write_text(json.dumps(stack))

def _pop_state(namespace: str, key: str) -> str | None:
    p = _state_path(namespace, key, "stack")
    if not p.exists():
        return None
    try:
        stack = json.loads(p.read_text())
    except (json.JSONDecodeError, OSError):
        return None
    if not stack:
        p.unlink(missing_ok=True)
        return None
    value = stack.pop(0)
    if stack:
        p.write_text(json.dumps(stack))
    else:
        p.unlink(missing_ok=True)
    return value

def _cleanup_turn(gen_id: str):
    if not STATE_DIR.exists():
        return
    prefix = _sanitize(gen_id) + "_"
    for p in STATE_DIR.iterdir():
        if p.name.startswith(prefix):
            p.unlink(missing_ok=True)

# ---------------------------------------------------------------------------
# LangSmith client
# ---------------------------------------------------------------------------

_client = None

def _get_client():
    global _client
    if _client is None:
        from langsmith import Client
        _client = Client()
    return _client

def _api_call(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except Exception as e:
        if "409" in str(e) or "Conflict" in str(e):
            return None
        raise

def _flush():
    if _client is None:
        return
    try:
        if hasattr(_client, "flush"):
            _client.flush()
        elif hasattr(_client, "tracing_queue") and _client.tracing_queue:
            _client.tracing_queue.join()
    except Exception:
        pass

# ---------------------------------------------------------------------------
# Trace helpers
# ---------------------------------------------------------------------------

def _project() -> str:
    return os.environ.get("LANGCHAIN_PROJECT", "cursor-agent")

def _thread_meta(event: dict) -> dict:
    return {"conversation_id": event.get("conversation_id", "")}

def _tags(event: dict, extra: list[str] | None = None) -> list[str]:
    hook = event.get("hook_event_name", "")
    tags = ["cursor", "tab" if "Tab" in hook else "agent"]
    if model := event.get("model"):
        tags.append(model.replace(".", "-").lower())
    if extra:
        tags.extend(extra)
    return tags

def _ensure_root(event: dict, *, name: str = "Cursor Agent",
                 inputs: dict | None = None) -> str:
    gen_id = event.get("generation_id", "unknown")
    if existing := _load_state(gen_id, "root"):
        return existing

    root_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"cursor-langsmith:turn:{gen_id}"))
    _api_call(
        _get_client().create_run,
        name=name, inputs=inputs or {}, run_type="chain",
        id=root_id, project_name=_project(), tags=_tags(event),
        extra={"metadata": {
            **_thread_meta(event),
            "generation_id": gen_id,
            "cursor_version": event.get("cursor_version", ""),
            "model": event.get("model", ""),
            "workspace_roots": event.get("workspace_roots", []),
            "hook_handler_version": VERSION,
            "user_email": event.get("user_email", ""),
        }},
        start_time=datetime.now(timezone.utc),
    )
    _save_state(gen_id, "root", root_id)
    return root_id

def _child(event: dict, *, name: str, run_type: str = "chain",
           inputs: dict | None = None, outputs: dict | None = None,
           extra_tags: list[str] | None = None,
           extra_meta: dict | None = None) -> str:
    root_id = _ensure_root(event)
    child_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    meta: dict[str, Any] = {**_thread_meta(event), "hook_event_name": event.get("hook_event_name", "")}
    if extra_meta:
        meta.update(extra_meta)
    _api_call(
        _get_client().create_run,
        name=name, inputs=inputs or {}, run_type=run_type,
        id=child_id, parent_run_id=root_id, project_name=_project(),
        tags=_tags(event, extra_tags), extra={"metadata": meta},
        start_time=now, end_time=now, outputs=outputs,
    )
    return child_id

def _open_child(event: dict, *, name: str, inputs: dict | None = None,
                extra_tags: list[str] | None = None, state_key: str) -> str:
    root_id = _ensure_root(event)
    child_id = str(uuid.uuid4())
    gen_id = event.get("generation_id", "unknown")
    _api_call(
        _get_client().create_run,
        name=name, inputs=inputs or {}, run_type="tool",
        id=child_id, parent_run_id=root_id, project_name=_project(),
        tags=_tags(event, extra_tags),
        extra={"metadata": {**_thread_meta(event), "hook_event_name": event.get("hook_event_name", "")}},
        start_time=datetime.now(timezone.utc),
    )
    _push_state(gen_id, state_key, child_id)
    return child_id

def _close_child(event: dict, *, state_key: str,
                 outputs: dict | None = None, error: str | None = None):
    gen_id = event.get("generation_id", "unknown")
    child_id = _pop_state(gen_id, state_key)
    if not child_id:
        return
    kw: dict[str, Any] = {"end_time": datetime.now(timezone.utc)}
    if outputs:
        kw["outputs"] = outputs
    if error:
        kw["error"] = error
    _api_call(_get_client().update_run, run_id=child_id, **kw)

def _update_root(event: dict, **kw):
    gen_id = event.get("generation_id", "unknown")
    root_id = _load_state(gen_id, "root") or _ensure_root(event)
    if "end" in kw:
        kw.pop("end")
        kw["end_time"] = datetime.now(timezone.utc)
    if kw:
        _api_call(_get_client().update_run, run_id=root_id, **kw)

# ---------------------------------------------------------------------------
# Event handlers
# ---------------------------------------------------------------------------

def _on_before_submit_prompt(e: dict) -> dict:
    prompt = e.get("prompt", "")
    attachments = e.get("attachments", [])
    _ensure_root(e, name="Cursor",
                 inputs={"prompt": prompt, "attachments": attachments})
    _child(e, name="User Prompt", run_type="llm", inputs={
        "prompt": prompt, "model": e.get("model", ""),
        "attachment_count": len(attachments),
        "attachments": [{"type": a.get("type"), "filePath": a.get("filePath")} for a in attachments],
    })
    return {"continue": True}

def _on_after_agent_response(e: dict) -> dict:
    text = e.get("text", "")
    _save_state(e.get("generation_id", "unknown"), "last_response", text)
    _child(e, name="Agent Response", run_type="llm",
           inputs={"model": e.get("model", "")}, outputs={"text": text})
    return {}

def _on_after_agent_thought(e: dict) -> dict:
    _child(e, name="Agent Thinking", run_type="chain",
           outputs={"thought": e.get("text", "")}, extra_tags=["thinking"],
           extra_meta={"duration_ms": e.get("duration_ms")} if e.get("duration_ms") else None)
    return {}

def _on_before_shell(e: dict) -> dict:
    cmd = e.get("command", "")
    guard_result = _protocol_guard_shell(cmd, e.get("cwd", ""))
    if guard_result is not None:
        return guard_result
    _open_child(e, name=f"Shell: {cmd[:60]}",
                inputs={"command": cmd, "cwd": e.get("cwd", "")},
                extra_tags=["shell"], state_key="shell")
    return {"permission": "allow"}

def _on_after_shell(e: dict) -> dict:
    cmd, output, dur = e.get("command", ""), e.get("output", ""), e.get("duration")
    errs = _has_errors(output)
    _close_child(e, state_key="shell",
                 outputs={"output": output, "has_errors": errs, "duration_ms": dur},
                 error=f"Shell error in: {cmd[:60]}" if errs else None)
    return {}

def _on_before_mcp(e: dict) -> dict:
    tool = e.get("tool_name", "unknown")
    _open_child(e, name=f"MCP: {tool}",
                inputs={"tool_name": tool, "tool_input": e.get("tool_input", {}),
                        "server_url": e.get("url", ""), "server_command": e.get("command", "")},
                extra_tags=["mcp", f"mcp-{tool}"],
                state_key=f"mcp_{_sanitize(tool)}")
    return {"permission": "allow"}

def _on_after_mcp(e: dict) -> dict:
    tool = e.get("tool_name", "unknown")
    _close_child(e, state_key=f"mcp_{_sanitize(tool)}",
                 outputs={"result": e.get("result_json", {}), "duration_ms": e.get("duration")})
    return {}

def _on_before_read(e: dict) -> dict:
    fp = e.get("file_path", "")
    _child(e, name=f"Read: {_filename(fp)}", run_type="tool",
           inputs={"file_path": fp}, extra_tags=["file-ops"])
    return {"permission": "allow"}

def _on_after_edit(e: dict) -> dict:
    fp = e.get("file_path", "")
    _protocol_guard_record_edit(fp)
    stats = _edit_stats(e.get("edits", []))
    _child(e, name=f"Edit: {_filename(fp)}", run_type="tool",
           inputs={"file_path": fp}, outputs=stats, extra_tags=["file-ops"])
    return {}

def _on_before_tab_read(e: dict) -> dict:
    fp = e.get("file_path", "")
    _child(e, name=f"Tab Read: {_filename(fp)}", run_type="tool",
           inputs={"file_path": fp, "source": "tab"}, extra_tags=["file-ops"])
    return {"permission": "allow"}

def _on_after_tab_edit(e: dict) -> dict:
    fp = e.get("file_path", "")
    stats = _edit_stats(e.get("edits", []))
    _child(e, name=f"Tab Edit: {_filename(fp)}", run_type="tool",
           inputs={"file_path": fp, "source": "tab"}, outputs=stats, extra_tags=["file-ops"])
    return {}

def _on_stop(e: dict) -> dict:
    status = e.get("status", "completed")
    loops = e.get("loop_count", 0)

    gen_id = e.get("generation_id", "unknown")
    last_response = _load_state(gen_id, "last_response")
    outputs = {"response": last_response} if last_response else None

    _update_root(e, end=True, outputs=outputs,
                 error=f"Agent stopped: {status}" if status == "error" else None,
                 tags=_tags(e, [f"status-{status}"]))

    comp = {"completed": 1.0, "aborted": 0.5, "error": 0.0}.get(status, 0.5)
    root_id = _load_state(gen_id, "root")
    if root_id:
        _api_call(_get_client().create_feedback, run_id=root_id,
                  key="completion", score=comp, comment=f"{status}, {loops} loops")

    _cleanup_turn(gen_id)
    return {}

def _on_subagent_start(e: dict) -> dict:
    return PERMISSIVE


def _on_subagent_stop(e: dict) -> dict:
    return PERMISSIVE


# ---------------------------------------------------------------------------

def _edit_stats(edits: list[dict]) -> dict:
    added = removed = 0
    for e in edits or []:
        old = e.get("old_string") or e.get("old_line") or ""
        new = e.get("new_string") or e.get("new_line") or ""
        removed += len(old.splitlines()) if old else 0
        added += len(new.splitlines()) if new else 0
    return {"lines_added": added, "lines_removed": removed, "edit_count": len(edits or [])}

def _has_errors(output: str) -> bool:
    if not output:
        return False
    low = output.lower()
    return any(re.search(p, low) for p in [r"\berror\b", r"\bfailed\b", r"\bexception\b"])

def _filename(path: str | None) -> str:
    return path.rstrip("/").split("/")[-1] if path else "unknown"

_protocol_guard = None

def _get_protocol_guard():
    global _protocol_guard
    if _protocol_guard is None:
        try:
            import sdlc_protocol_guard as pg
            _protocol_guard = pg
        except ImportError:
            _protocol_guard = False
    return _protocol_guard if _protocol_guard is not False else None


def _protocol_guard_record_edit(file_path: str) -> None:
    pg = _get_protocol_guard()
    if pg is None:
        return
    try:
        result = pg.check_file_edit(file_path)
        if result.get("record_violation") and result.get("run_id"):
            pg.record_protocol_violation(str(result["run_id"]), str(result.get("message", "protocol violation")))
    except Exception:
        pass


def _protocol_guard_file_edit(file_path: str) -> dict | None:
    pg = _get_protocol_guard()
    if pg is None:
        return None
    try:
        result = pg.check_file_edit(file_path)
        if result.get("record_violation") and result.get("run_id"):
            pg.record_protocol_violation(str(result["run_id"]), str(result.get("message", "protocol violation")))
        if not result.get("allowed", True):
            msg = result.get("message", "SDLC protocol violation (ADR-009)")
            return {
                "permission": "deny",
                "user_message": msg,
                "agent_message": msg,
            }
    except Exception:
        pass
    return None


def _protocol_guard_shell(command: str, cwd: str) -> dict | None:
    pg = _get_protocol_guard()
    if pg is None:
        return None
    try:
        result = pg.check_shell_command(command, cwd)
        if result.get("record_violation") and result.get("run_id"):
            pg.record_protocol_violation(str(result["run_id"]), str(result.get("message", "protocol violation")))
        if not result.get("allowed", True):
            msg = result.get("message", "SDLC protocol violation (ADR-009)")
            return {
                "permission": "deny",
                "user_message": msg,
                "agent_message": msg,
            }
    except Exception:
        pass
    return None

# ---------------------------------------------------------------------------
# Handler dispatch
# ---------------------------------------------------------------------------

HANDLERS: dict[str, Callable[[dict], dict]] = {
    "beforeSubmitPrompt":   _on_before_submit_prompt,
    "afterAgentResponse":   _on_after_agent_response,
    "afterAgentThought":    _on_after_agent_thought,
    "beforeShellExecution": _on_before_shell,
    "afterShellExecution":  _on_after_shell,
    "beforeMCPExecution":   _on_before_mcp,
    "afterMCPExecution":    _on_after_mcp,
    "beforeReadFile":       _on_before_read,
    "afterFileEdit":        _on_after_edit,
    "stop":                 _on_stop,
    "beforeTabFileRead":    _on_before_tab_read,
    "afterTabFileEdit":     _on_after_tab_edit,
    "subagentStart":        _on_subagent_start,
    "subagentStop":         _on_subagent_stop,
}

def _trace_local(event: dict) -> None:
    if _trace_collector is None:
        return
    try:
        _trace_collector.process(event)
    except Exception:
        pass


def _langsmith_enabled() -> bool:
    if os.environ.get("TRACE_TO_LANGSMITH", "").lower() != "true":
        return False
    api_key = (
        os.environ.get("LANGCHAIN_API_KEY")
        or os.environ.get("LANGSMITH_API_KEY")
        or os.environ.get("CC_LANGSMITH_API_KEY")
    )
    if api_key:
        return True
    try:
        from langsmith import Client
        Client()
        return True
    except Exception:
        return False


def main():
    # Load .env before checking any env vars
    _load_env()

    try:
        event = _read_stdin()
        if not event:
            print(json.dumps(PERMISSIVE))
            return

        # Always collect local trace (independent of LangSmith)
        _trace_local(event)

        if not _langsmith_enabled():
            print(json.dumps(PERMISSIVE))
            return

        handler = HANDLERS.get(event.get("hook_event_name", ""))
        result = handler(event) if handler else PERMISSIVE
        _flush()
        print(json.dumps(result))
    except Exception:
        print(json.dumps(PERMISSIVE))

if __name__ == "__main__":
    main()
