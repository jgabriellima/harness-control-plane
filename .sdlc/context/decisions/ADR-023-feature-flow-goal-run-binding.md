# ADR-023: Feature-flow child runs must not drive goal continuity

Date: 2026-06-04
Status: ACCEPTED
Extends: ADR-020, ADR-021, ADR-022

## Problem statement

Observed failures in production goal sessions:

1. **ACTIVE pointer conflation** — `.sdlc/workflow-runs/ACTIVE` often points at `{goal-run}-ff-{ticket}` (feature-flow). `/sdlc:goal` continuity and `sdlc_goal_runtime` bound `goal_active` to that child run and emitted `step` on feature-flow, not goal-flow.

2. **Infinite step loop** — `context-hydration` (or any cognitive node) marked `running` without `submit`. Each `step` re-dispatches exit 42 on the same node. Hooks injected `SDLC_GOAL_CONTINUE` with `step` only — never `submit`.

3. **Execution node without parent run id** — `goal-flow.yaml` `execution` subprocess omitted `--workflow-run-id {run_id}`. Dispatch used ACTIVE (often a child run) → "no tickets in workflow manifest".

4. **feature-flow-complete.pass bypass** — Gate passed when `feature_flow_complete: true` with empty `feature_flow_stages` and no verification of child manifest `status: completed`. Parent goal marked execution PASS while child `ff-jambu-*` remained at `context-hydration`.

5. **Inline subprocess FAIL not blocking** — `execution` cognitive JSON could carry `gateOutcome: FAIL` while manifest node showed `gate_outcome: PASS` if postCondition gates were weak or bypassed.

## Decision

1. **`sdlc_workflow_run_resolve.py`** — `resolve_goal_run_id()`, `dispatch_is_stalled()`, `feature_flow_run_id()`, parent parse from feature-flow intent.

2. **Continuity + goal runtime** — `/sdlc:goal` never uses a feature-flow ACTIVE run as control plane; resolves parent goal-flow or newest in-progress goal.

3. **Hook stall detection** — After repeated AGENT_DISPATCH for the same node without cognitive file, `stop` emits `SDLC_GOAL_STALLED` with `submit_command`, not another `step`.

4. **goal-flow execution args** — Add `--workflow-run-id` / `{run_id}` to `sdlc_e2e_execution.py dispatch`.

5. **Dispatch links tickets** — `child_run_id` on parent ticket; `feature_flow_complete` reset false on dispatch.

6. **Gate hardening** — `check_feature_flow_complete` requires child manifest `status: completed` when `child_run_id` or derived ff path exists.

7. **Runner** — `_execute_composite_node` fails immediately when subprocess cognitive `structured.gateOutcome == FAIL`.

## Reconcile CI gate

`sdlc_workflow_reconcile.py check` scans all goal-flow manifests for:

- `orphan_child_run` — parent claims done, child not `completed`/`failed`
- `false_feature_flow_complete` — ticket flag true while child incomplete
- `child_dispatch_stall` — warn: running node without cognitive output

Legacy exceptions: `.sdlc/workflow-runs/reconcile-suppressions.yaml` (time-boxed `until` date).

Wired in `.github/workflows/validate.yaml` job `sdlc-workflow-contract`.

## Verification

```bash
python3 -m pytest .sdlc/bin/tests/test_workflow_run_resolve.py .sdlc/bin/tests/test_workflow_reconcile.py .sdlc/bin/tests/test_goal_runtime.py .sdlc/bin/tests/test_continuity_resolve.py .sdlc/bin/tests/test_runner_authority.py -q
python3 .sdlc/bin/sdlc_workflow_validate.py review
python3 .sdlc/bin/sdlc_workflow_reconcile.py check
```

## Consequences

- Execution node postCondition FAILs after dispatch until each child feature-flow completes (correct).
- Legacy tickets with `feature_flow_complete: true` but open child runs will fail gate until child completed or ticket reconciled.
- Operators must run feature-flow via `/sdlc:implement` or child `step`/`submit`, not `/sdlc:goal step` on `-ff-` runs.
