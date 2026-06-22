# ADR-021: Runner Authority and Worktree Gates

## Status

Accepted — 2026-06-04

## Context

Agents executing `/sdlc:goal` bypassed `sdlc_workflow_run.py`: they wrote `cognitive/*.json` directly, called `submit` without a prior `step` exit 42, and implemented code in the main workspace without `register-ticket` or commits in an isolated worktree. `qa.worktree_gate: true` in `sdlc.yaml` was declarative only — no Python enforced it.

## Decision

1. **Runner authority (`sdlc_workflow_run.py`)**
   - `step --mode agent` on agent-dispatch nodes calls `node_start` before exit 42 so status is `running`.
   - `submit` rejects nodes that are not `running`, lack `started_at`, violate node order, or have cognitive `nodeId`/`runId` mismatch.
   - `submit` no longer calls `node_start` (duplicate start allowed bypass).

2. **Worktree gates (`sdlc_workflow_gate.py`)**
   - `worktree-registered.pass`: slice tickets have existing git worktree paths when `qa.worktree_gate` is true.
   - `worktree-committed.pass`: each slice worktree is clean and has >=1 commit ahead of main/master.
   - Wired in `goal-flow.yaml` at `plane-hierarchy` and `execution` postConditions.

3. **Contract repair**
   - `sdlc.yaml` registers `workflows.goal` and points `e2e-orchestration.definition` at `goal-flow.yaml` (doctor Group 7).

4. **PR creation node (2026-06-04 amendment)**
   - New `goal-flow` node `pr-creation` after `execution`: subprocess `sdlc_workflow_pr.py create`.
   - Gate `pr-registered.pass` on `pr-creation` and `integration`; `board-sync-ready` also requires `pr_url`.
   - Manual `gh pr create` without manifest registration fails the harness — use `register` or `create`.

## Consequences

- Hand-written cognitive artifacts without dispatch fail at `submit`.
- Goal flow cannot pass `execution` without committed worktree work.
- Agents must use `step` → 42 → work → `submit` for every cognitive node; orchestrator remains sole control plane (ADR-017, ADR-020).

## Verification

```bash
python3 -m unittest discover -s .sdlc/bin/tests -p 'test_runner_authority.py' -v
npm run doctor:structural   # from .sdlc — 0 failures on workflow definitions
```
