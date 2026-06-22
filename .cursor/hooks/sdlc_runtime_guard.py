#!/usr/bin/env python3
"""
Cursor runtime guard — goal-flow enforcement (ADR-022).

Reads hook JSON from stdin; writes hook JSON to stdout.
Registered BEFORE hook_handler.py in hooks.json.

Cursor hook output contracts (see https://cursor.com/docs/hooks):
- beforeSubmitPrompt: continue, user_message (NOT additional_context)
- preToolUse: permission, user_message, agent_message
- beforeShellExecution: permission, user_message, agent_message
- postToolUse: additional_context
- stop: followup_message
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
BIN = REPO_ROOT / ".sdlc" / "bin"
if str(BIN) not in sys.path:
    sys.path.insert(0, str(BIN))

import sdlc_goal_runtime as gr  # noqa: E402
import sdlc_protocol_guard as pg  # noqa: E402


def _read_event() -> dict:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def _emit(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload))
    sys.stdout.flush()


def handle_before_submit_prompt(event: dict) -> dict:
    prompt = event.get("prompt", "")
    result = gr.evaluate_prompt_submit(prompt)
    if not result.continue_submit:
        return {"continue": False, "user_message": result.user_message}
    out: dict = {"continue": True}
    if result.agent_note:
        out["user_message"] = result.agent_note
    return out


def handle_pre_tool_use(event: dict) -> dict:
    tool_name = str(event.get("tool_name", ""))
    tool_input = event.get("tool_input") if isinstance(event.get("tool_input"), dict) else {}
    goal = gr.evaluate_pre_tool_use(tool_name, tool_input)
    if goal is not None:
        return {
            "permission": goal.permission,
            "user_message": goal.user_message,
            "agent_message": goal.agent_message,
        }
    return {"permission": "allow"}


def handle_before_shell(event: dict) -> dict:
    cmd = event.get("command", "")
    goal = gr.evaluate_before_shell(cmd)
    if goal is not None:
        return {
            "permission": goal.permission,
            "user_message": goal.user_message,
            "agent_message": goal.agent_message,
        }
    guard = pg.check_shell_command(cmd, event.get("cwd", ""))
    if not guard.get("allowed", True):
        return {
            "permission": "deny",
            "user_message": guard.get("message", "SDLC protocol violation"),
            "agent_message": guard.get("message", "SDLC protocol violation"),
        }
    return {"permission": "allow"}


def handle_post_tool_use(event: dict) -> dict:
    if event.get("tool_name") != "Shell":
        return {}
    tool_input = event.get("tool_input") if isinstance(event.get("tool_input"), dict) else {}
    command = str(tool_input.get("command", ""))
    output = str(event.get("tool_output", ""))
    exit_code = 0
    try:
        parsed = json.loads(output)
        if isinstance(parsed, dict) and "exitCode" in parsed:
            exit_code = int(parsed.get("exitCode", 0))
            output = str(parsed.get("stdout", "")) + str(parsed.get("stderr", ""))
    except (json.JSONDecodeError, TypeError, ValueError):
        pass
    ctx = gr.evaluate_post_shell(command, output, exit_code)
    return ctx if ctx else {}


def handle_after_file_edit(event: dict) -> dict:
    fp = event.get("file_path", "")
    guard = pg.check_file_edit(fp)
    if guard.get("record_violation") and guard.get("run_id"):
        pg.record_protocol_violation(str(guard["run_id"]), str(guard.get("message", "")))
    return {}


def handle_stop(event: dict) -> dict:
    status = str(event.get("status", "completed"))
    loop_count = int(event.get("loop_count", 0))
    result = gr.evaluate_stop(status, loop_count)
    if result.followup_message:
        return {"followup_message": result.followup_message}
    return {}


HANDLERS = {
    "beforeSubmitPrompt": handle_before_submit_prompt,
    "preToolUse": handle_pre_tool_use,
    "beforeShellExecution": handle_before_shell,
    "postToolUse": handle_post_tool_use,
    "afterFileEdit": handle_after_file_edit,
    "stop": handle_stop,
}


def main() -> int:
    event = _read_event()
    name = str(event.get("hook_event_name", ""))
    handler = HANDLERS.get(name)
    if handler is None:
        _emit({"continue": True} if name == "beforeSubmitPrompt" else {})
        return 0
    try:
        _emit(handler(event))
    except Exception as exc:
        if name in ("preToolUse", "beforeShellExecution"):
            _emit(
                {
                    "permission": "deny",
                    "user_message": f"SDLC runtime guard error: {exc}",
                    "agent_message": f"SDLC runtime guard error: {exc}",
                },
            )
            return 0
        _emit({"continue": True} if name == "beforeSubmitPrompt" else {})
    return 0


if __name__ == "__main__":
    sys.exit(main())
