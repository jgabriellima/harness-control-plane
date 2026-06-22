# ADR-018: Two-Path Execution and Mandatory Preflight

Date: 2026-05-31
Status: ACCEPTED
Supersedes: operational gaps in ADR-017 Phase 3

## Context

ADR-017 declared `sdlc_workflow_run.py` the sole execution plane, but runs still advanced via `sdlc_e2e_manifest.py` (`stage-complete`), producing divergent truth. Gate `ci-target-aligned.pass` invoked full `doctor:structural` (including MCP checks) at `deploy`, while `workspace-rebind` was `skipped` with `gate_outcome: PASS` — invalid skip semantics.

GitHub `validate.yaml` matrix-built `examples/astro-blog`, a pre-DSL demo target, causing unrelated CI failures on `main` after merges to `app/`.

## Decision

### Two paths only

| Path | Authority | Scope |
|---|---|---|
| SDLC workflow runner | `sdlc_workflow_run.py` + `.sdlc/workflow-runs/{run_id}/manifest.yaml` | Agent-orchestrated E2E: gates, tickets, evidence, handoff |
| GitHub CI on `main` | `.github/workflows/*` | Build, lint, deploy Vercel — orthogonal to runner state |

`sdlc_e2e_manifest.py` is **read-only archive** for migrated runs. It MUST NOT advance workflow nodes. `/sdlc:e2e` MUST NOT call `stage-complete`, `update-ticket`, or `record-handoff` on `.sdlc/runs/`.

### Mandatory preflight

New composite node `preflight` (after `hydrate`, before `classify`) runs:

- `gates/doctor-pass.pass` — full structural doctor (MCP, hooks, integrations) **before** implementation spend
- `gates/ci-target-aligned.pass` — integration `gate_contract` only (CI `working-directory: {target_root}`), **not** full doctor

### Gate adapter correctness

| Gate | Adapter behavior |
|---|---|
| `doctor-pass` | `npm run doctor:structural` |
| `ci-target-aligned` | `run_gate_invariant(..., "ci-target-aligned", target_root)` |
| `deploy-recorded` | Cognitive or `manifest.deployment.ci_run_url` — no doctor |
| `feature-flow-complete` | `manifest.tickets` on workflow-run manifest only |
| `board-sync-ready` | All slice tickets `status: done` in workflow manifest |

### Skip semantics

- `control.skipInModes` enforced by runner: node → `status: skipped`, `gate_outcome: SKIP`
- **`skipped` with `gate_outcome: PASS` is invalid** — runner resets to `pending` on next step

### CI scope

- `validate.yaml` and PR `e2e.yaml` validate **`app/` only** (`workspace.target_root` from `.sdlc/sdlc.yaml`)
- `examples/astro-blog` is archived demo — excluded from required CI matrices

## Consequences

- Active runs gain `preflight` node via DSL sync on resume
- Required MCPs from `runtime.mcps` (e.g. playwright, github) fail at preflight, not deploy
- `product-shell-20260530` deploy node uses `deploy-recorded.pass`, not `ci-target-aligned`

## Verification

```bash
python3 .sdlc/bin/sdlc_workflow_validate.py review
python3 .sdlc/bin/tests/test_workflow_gate_adapters.py
python3 .sdlc/bin/sdlc_workflow_run.py status --run-id <run-id>
```
