# ADR-026: Workflow failure transitions and gate-driven loops

Date: 2026-06-07
Status: ACCEPTED
Extends: ADR-016, ADR-020, ADR-022, ADR-023
Supersedes: none (closes declarative gap; does not change DSL schema)

## Problem statement

ADR-016 defines composite nodes as `preCondition? → function.invoke → postCondition.checks[]` with `control.onFailure` transitions. ADR-020 requires machine-readable `continuity.required_actions`. ADR-022 binds `/sdlc:goal` to a deterministic `stepLoop`. The schema enumerates nine `onFailure` values; seven workflows declare them.

The runner (`sdlc_workflow_run.py`) implements none of the failure-transition contract in agent mode:

| Declared contract | Runtime behavior |
|---|---|
| `control.onFailure: return_to_*` | Node → `failed`; run → `blocked`. No graph jump. |
| Gate `RETRY` | Same as `FAIL` in `cmd_step` (agent mode). Inner loop exists only in stub batch `run_workflow`. |
| `GateResult.passed` | Binary: only `PASS`. `RETRY`/`WAIT` are non-pass. |
| `required_actions` on gate FAIL | Generic `step --run-id {parent}` regardless of gate message or pending children. |
| Fan-out until `feature-flow-complete.pass` | Gate detects incomplete children; runner re-steps parent subprocess without prescribing child commands. |

Reconcile (`sdlc_workflow_reconcile.py`, ADR-023) detects parent/child drift — observability, not execution control. The system fails correctly but does not prescribe the next command, violating ADR-020 and forcing conversational branching (forbidden by ADR-022).

Internal inconsistency: `cmd_node_complete` sets `nodes.{id}.status: retry` on gate RETRY, but `cmd_step` immediately sets `manifest.status: blocked`.

## Decision

Implement a **failure transition plane** in `sdlc_workflow_run.py` that bridges gate outcomes, `control.onFailure`, and `continuity.required_actions`.

### 1. `_apply_on_failure` (Phase 1)

After any gate FAIL or non-HITL RETRY on a composite node, the runner MUST read `control.onFailure` and execute the mapped transition before updating run-level status.

| `onFailure` | Transition |
|---|---|
| `abort` | Run `blocked`; node `failed`; `required_actions` empty or handoff-only. |
| `return_to_planning` | `node-redo` from node `planning`; run `in_progress`; `required_actions` = step on `planning`. |
| `return_to_implementation` | `node-redo` from node `implementation`; same pattern. |
| `return_to_fix_implementation` | `node-redo` from node `fix-implementation` (incident-flow). |
| `return_to_context_hydration` | `node-redo` from node `context-hydration`. |
| `escalate_to_architect` | Node `awaiting_approval` with structured reason; run `awaiting_human`. |
| `trigger_rollback` | `node-redo` from rollback node (deployment-flow); run `in_progress`. |
| `warn_and_continue` | Log warning; treat gate as non-blocking; node `completed` with audit note. |
| `fix_and_retry` | Reset same node to `pending`; run stays `in_progress`; see Phase 2. |

`return_to_*` values map to node ids by stripping the `return_to_` prefix and normalizing hyphens (e.g. `return_to_fix_implementation` → `fix-implementation`). Unknown mapping → `abort`.

Default when `onFailure` omitted: `abort` (current behavior).

### 2. RETRY semantics in agent mode (Phase 2)

When a gate returns `RETRY` and `onFailure` is `fix_and_retry` or absent with gate id in the retry-allowed set (`structured-output.pass`, cognitive regeneration gates):

- Do NOT set `manifest.status: blocked`.
- Set `nodes.{id}.status: retry`.
- Populate `continuity.resume_hints` with gate message.
- Populate `required_actions` with re-dispatch command for the same node (agent/command → step exit 42 path; subprocess → step re-invoke).

When `onFailure: abort` and outcome RETRY, treat as FAIL (blocked).

### 3. Fan-out `required_actions` (Phase 3)

When `execution` (goal-flow) fails `feature-flow-complete.pass`:

- Run remains `in_progress` (not blocked) if any child is dispatchable.
- `continuity.required_actions` MUST list one `command` action per incomplete child: `step --run-id {child_run_id} --mode agent`.
- `continuity.resume_hints` MUST summarize `{complete}/{total}` children and gate message prefix.
- Parent `execution` node stays `retry` until gate PASS.

Reconcile CI (ADR-023) unchanged — guardrail only.

### 5. Agent-mode delegate return (2026-06-08)

`cmd_step` MUST NOT recurse on `TRANSITION` or `in_progress` gate outcomes. After `_apply_on_failure`, the runner emits `_status_payload` with `continuity.required_actions` and returns exit `1` (`RUN DELEGATE`). Hooks (`sdlc_goal_runtime._next_runner_command`, `evaluate_stop`, `evaluate_post_shell`) MUST execute the first prescribed `required_actions` command before defaulting to parent `step`.

Configurable safety limits (`sdlc.yaml` `runtime.workflow`, `goal-flow` `agentPolicy`):

| Key | Default | Purpose |
|---|---|---|
| `max_fanout_retries` / `maxFanoutRetries` | 12 | Block parent after repeated execution fan-out delegate without child completion |
| `max_step_depth` / `maxStepDepth` | 64 | Bound composite-node advance within one `step` invocation |
| `subprocess_timeout_seconds` / `subprocessTimeoutSeconds` | 300 | `subprocess.run` timeout in `sdlc_invoke.py` |

### 4. Non-goals

- Inner subprocess loop (`invoke.step: loop`) — Phase 4 (2026-06-07): `_invoke_uses_inner_loop` + inline retry in `_execute_composite_node`; bootstrap `doctor-validation` declares `step: loop`.
- Changing gate definitions or DSL schema enums.
- Replacing agent cognitive loops (exit 42 / submit) — orthogonal macro loop.
- Business harness parity in `business_workflow_run.py` — follow-up ticket after SDLC path proven.

## Rationale

**Alternative A — Remove `onFailure` from schema/workflows.** Rejected: seven workflows and ADR-016 already encode product intent; deletion is a spec regression.

**Alternative B — Document as aspirational.** Rejected: agents and operators read DSL as normative; silent no-ops produce false confidence and blocked runs without prescriptive recovery.

**Alternative C — Reconcile drives execution.** Rejected in ADR-023: reconcile is read-only integrity check, not a control plane.

**Alternative D — Implement transition plane in runner (chosen).** Minimal surface: one function + extended `_sync_runner_required_actions`. Reuses existing `node-redo`, HITL patterns from ADR-020, child run ids from ADR-023.

## Phased delivery

| Phase | Scope | Unblocks | Status |
|---|---|---|---|
| 1 | `_apply_on_failure` + `return_to_*` / `abort` / `warn_and_continue` | feature-flow review→implementation loop | **DONE** (2026-06-07) |
| 2 | RETRY without block in agent mode | cognitive regeneration gates | **DONE** (2026-06-07) |
| 3 | `feature-flow-complete` → child step commands | goal-flow execution stall | **DONE** (2026-06-07) |
| 4 | Optional inner loop subprocess | bootstrap doctor `fix_and_retry` automation | **DONE** (2026-06-07) |

Each phase ships with acceptance tests in `.sdlc/bin/tests/test_workflow_failure_transitions.py` (skipped until implemented, then enabled).

## Consequences

### Positive

- DSL and runtime align — agents trust `onFailure` declarations.
- `required_actions` become prescriptive on gate FAIL (ADR-020 complete).
- Goal-flow execution no longer requires conversational "which child next?" (ADR-022).
- Reconcile findings become actionable via emitted child commands.

### Negative / trade-offs

- `node-redo` side effects (downstream reset) must be documented per workflow.
- `warn_and_continue` weakens gate strictness — audit trail required in node cognitive output.
- Phase 1–3 increase runner complexity; needs dedicated test module.

### Neutral

- Stub batch mode retains existing RETRY loop; agent mode gains parity incrementally.

## Implementation notes

| Artifact | Change |
|---|---|
| `.sdlc/bin/sdlc_workflow_run.py` | `_apply_on_failure`, hook in `_execute_composite_node` / `cmd_step` / `cmd_submit`; extend `_sync_runner_required_actions` |
| `.sdlc/bin/sdlc_workflow_manifest.py` | Optional: `resolve_on_failure_target(on_failure: str) -> str \| None` |
| `.sdlc/bin/sdlc_workflow_gate.py` | Export incomplete child list in `GateResult.metrics` for Phase 3 (may already exist) |
| `.sdlc/bin/tests/test_workflow_failure_transitions.py` | Acceptance tests per phase |
| `.sdlc/schemas/workflow-dsl.schema.json` | No change — enum already normative |

## Verification

```bash
# After Phase 1–3 implementation:
python3 -m pytest .sdlc/bin/tests/test_workflow_failure_transitions.py -q
python3 -m pytest .sdlc/bin/tests/test_workflow_continuity.py .sdlc/bin/tests/test_sdlc_workflow_run.py -q
python3 .sdlc/bin/sdlc_workflow_validate.py review
python3 .sdlc/bin/sdlc_workflow_reconcile.py check
```

Acceptance criteria (see test module):

1. `review` node FAIL + `onFailure: return_to_implementation` → `implementation` pending, `required_actions` step implementation.
2. Gate RETRY + `fix_and_retry` → run `in_progress`, same node `retry`, no `blocked`.
3. `feature-flow-complete` FAIL with 2 incomplete children → 2 child step commands in `required_actions`.

## References

- ADR-016 — composite node + `control.onFailure`
- ADR-020 — `continuity.required_actions`
- ADR-022 — goal agentPolicy stepLoop
- ADR-023 — feature-flow child binding + reconcile guardrail
- `.sdlc/workflows/feature-flow.yaml` — `return_to_planning`, `return_to_implementation`
- `.sdlc/bin/tests/test_workflow_failure_transitions.py` — acceptance test scaffold

## Review

| Field | Value |
|---|---|
| Author | agent session |
| Date | 2026-06-07 |
| Reviewed by | pending |
| Ticket | TBD |
