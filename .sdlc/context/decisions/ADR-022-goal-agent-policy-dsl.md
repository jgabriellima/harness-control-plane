# ADR-022: Goal agentPolicy in DSL and protocol guard on workflow-runs

Date: 2026-06-04
Status: ACCEPTED
Extends: ADR-020, ADR-021

## Context

Agents invoked `/sdlc:goal` as a free-form chat: implemented `app/` in the main workspace, skipped `sdlc_workflow_run.py step`/`submit`, and ended turns with conversational branches ("worktree + PR or review locally?"). ADR-021 added runner authority and worktree gates in Python, but:

1. `sdlc_protocol_guard.py` read legacy `.sdlc/runs/ACTIVE`, not `.sdlc/workflow-runs/ACTIVE`.
2. Completed or missing ACTIVE manifests allowed all `app/` edits (`allowed: true`).
3. `goal-flow.yaml` had no machine-readable `agentPolicy`; norms lived only in `.cursor/commands/sdlc-goal.md`, which models ignore under pressure.
4. `continuity.required_actions` stayed empty on non-HITL runs — nothing to execute instead of asking the operator.
5. `beforeSubmitPrompt` did not inject goal protocol.

## Decision

1. **`spec.agentPolicy` on `goal-flow.yaml`** — mandatory first commands, step loop, forbidden behaviors, `onCompleteRequiredActions` (handoff, status JSON). Validated via `workflow-dsl.schema.json`.

2. **Runner materialization** — `sdlc_workflow_run.py` copies `agentPolicy` into `AGENT_DISPATCH` and `status` JSON; `_sync_runner_required_actions()` writes `continuity.required_actions` for in-progress (`runner-step`) and completed runs (`onCompleteRequiredActions`).

3. **Protocol guard migration** — `sdlc_protocol_guard.py` uses `workflow-runs/ACTIVE` first; enforces `qa.worktree_gate` against main-workspace `target_root` edits; records violations on workflow manifest.

4. **Hook injection** — `beforeSubmitPrompt` calls `goal_invoke_prompt_context()` when prompt contains `/sdlc:goal` or `/sdlc:e2e`.

5. **Continuity resolver** — `/sdlc:goal` returns `proceed` with `mandatory_cli` and `forbidden_behaviors`, not open-ended chat.

6. **Session start** — hydrates `workflow-runs/ACTIVE` and prints `continuity.required_actions`.

7. **Cursor hooks (runtime reinforcement)** — `.cursor/hooks/sdlc_runtime_guard.py`:
   - `beforeSubmitPrompt`: auto `sdlc_workflow_run.py run` on `/sdlc:goal` (no chat menu)
   - `preToolUse`: deny `Write`/`StrReplace` on `target_root` with `agent_message` = next runner shell command
   - `postToolUse` (Shell): inject `additional_context` with `AGENT_DISPATCH` JSON (supported by Cursor; `beforeSubmitPrompt` is not)
   - `stop`: `followup_message` auto-continues `step` loop (`loop_limit: 5`)
   - Binary HITL: `/yes` | `/no` | `--decision yes|no` only

Reference: [Cursor Hooks docs](https://cursor.com/docs/hooks), [create-hook skill](.cursor/skills/create-hook/SKILL.md) event output contracts.

## Consequences

- Orchestrator edits to `app/` in main workspace are blocked when `worktree_gate` is true (default).
- Agents must read `status --json` and execute `required_actions` instead of asking preference questions.
- Template sync must ship updated `goal-flow.yaml`, `sdlc_protocol_guard.py`, and hooks.

## Amendments

**2026-06-06 — shell guard false positive (write-path):** `APP_WRITE_SHELL_PATTERNS[0]` was case-insensitive and matched `\bwrite\b` inside worktree path segments (e.g. `composer-write-path`), then probed main `workspace.target_root()` on `git add app/...` — blocking legitimate worktree commits. Fix: case-sensitive pattern for Cursor `Write`/`StrReplace` only. Learn: `.sdlc/context/learn/protocol-guard-write-path-regex-20260606.md`.

**2026-06-06 — shell guard path extraction:** `check_shell_command` no longer probes only `workspace.target_root()` on pattern match. It extracts command paths (`_extract_shell_probe_paths`, `_effective_cwd`) and delegates per-path policy to `check_file_edit` (registered worktrees honored). Tests: `test_protocol_guard_workflow.py` 14/14.

**2026-06-17 — session ownership (multi-session isolation):** `.sdlc/workflow-runs/.cursor-runtime.json` was global; any Cursor session's `stop` hook could auto-continue another session's goal run, and non-goal prompts in a foreign session could clear `goal_active`. Fix:

1. **`orchestrator.session_id`** on workflow manifest — `bind_orchestrator_session()` in `sdlc_workflow_manifest.py` records the owning Cursor `conversation_id`.
2. **Per-session hook state** — `.cursor-runtime.json` keyed by `sessions[<conversation_id>]`; legacy flat format dropped on load (no migration).
3. **Hook guards scoped** — `preToolUse`, `beforeShell`, `postToolUse`, `stop` auto-continue only when the current session owns the active run (`sdlc_goal_runtime.py` ownership checks).
4. **Transfer** — `/sdlc:goal --claim-session` or `--continue` rebinds `orchestrator.session_id` to the invoking session.
5. **`conversation_id` resolution** — `sessionStart` hook (`sdlc_runtime_guard.py` before `session-start.sh`) sets `SDLC_CONVERSATION_ID` env; fallback chain: event fields → env → `by_generation` cache → `by_transcript` cache.

Invariant: one active run → one `orchestrator.session_id`; parallel goal runs in parallel sessions are supported when each session owns its run. Tests: `test_goal_runtime.py` 17/17.

## Verification

```bash
python3 .sdlc/bin/sdlc_workflow_validate.py review
python3 -m pytest .sdlc/bin/tests/test_protocol_guard_workflow.py .sdlc/bin/tests/test_runner_authority.py -q
python3 .sdlc/bin/sdlc_continuity_resolve.py resolve --command /sdlc:goal --intent "smoke" --json
```
