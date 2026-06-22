# Cursor hooks — SDLC runtime enforcement

Hooks exchange JSON on stdin/stdout per [Cursor Hooks](https://cursor.com/docs/hooks). This project runs **deterministic command hooks** before observability (`hook_handler.py`).

## Enforcement stack (goal-flow)

| Event | Script | Effect |
|-------|--------|--------|
| `beforeSubmitPrompt` | `sdlc_runtime_guard.py` | On `/sdlc:goal`, auto-inits `sdlc_workflow_run.py run` and binds `.sdlc/workflow-runs/.cursor-runtime.json` |
| `preToolUse` (Write/StrReplace) | `sdlc_runtime_guard.py` | **Deny** edits under `workspace.target_root` in orchestrator session; `agent_message` = next shell command |
| `beforeShellExecution` | `sdlc_runtime_guard.py` | Deny dev-server commands during goal; delegate to `sdlc_protocol_guard.py` |
| `postToolUse` (Shell) | `sdlc_runtime_guard.py` | Inject `additional_context` with `AGENT_DISPATCH` JSON from runner stdout |
| `stop` | `sdlc_runtime_guard.py` | `followup_message` = `step` or `SDLC_GOAL_STALLED` + `submit_command` when node running without cognitive output (`loop_limit: 5`) |
| `afterFileEdit` | `sdlc_runtime_guard.py` | Record protocol violations on workflow manifest |

## Cursor API constraints (do not violate)

- `beforeSubmitPrompt` supports only `continue` and `user_message` — **not** `additional_context` ([forum](https://forum.cursor.com/t/add-additional-context-to-beforesubmitprompt-hook-output/157231)).
- `sessionStart` and `postToolUse` support `additional_context` — use for dispatch injection.
- `preToolUse` / `beforeShellExecution` support `permission`, `user_message`, `agent_message`.
- Set `failClosed: true` on security hooks so crashes block the action.

## Binary decisions (yes/no)

When the runner requires operator choice, call `sdlc_goal_runtime.format_decision_request()`. The user must reply `/yes`, `/no`, or `--decision yes|no` — not free text.

## Configuration

Registry: `.cursor/hooks.json`  
Logic: `.sdlc/bin/sdlc_goal_runtime.py`, `.sdlc/bin/sdlc_protocol_guard.py`  
DSL policy: `.sdlc/workflows/goal-flow.yaml` → `spec.agentPolicy`

Disable blocking (audit only): `SDL_PROTOCOL_ENFORCE=false`
