# ADR-009: E2E Orchestration Composes Workflows — Never Reimplements Them

Status: ACCEPTED  
Date: 2026-05-22

## Context

`/sdlc:e2e` was introduced as a macro-orchestrator but execution bypassed the existing agent and workflow stack:

- `.cursor/agents/` (planner, implementer, reviewer, qa, deployer)
- `.sdlc/workflows/feature-flow.yaml` (via `/sdlc:implement`)
- `.sdlc/workflows/e2e-flow.yaml` (via `/run:e2e`)
- `.sdlc/workflows/deployment-flow.yaml` (via `/sdlc:deploy`)

The orchestrator implemented feature code in the main session, consolidated six Plane tickets into one worktree, and marked manifest stages complete without dispatching subagents or running `feature-flow` success criteria.

Plane hierarchy (epic + child tickets) exists precisely to enable **parallel, distributed execution** — one ticket → one worktree → one `/sdlc:implement` pipeline → one agent session. Monolithic orchestrator execution defeats this.

## Decision

1. **`/sdlc:e2e` is a composer, not an implementer.** It owns run manifest, wave ordering, Plane hierarchy, and stage gates. It does NOT own feature code, QA evidence, or review.

2. **Every vertical slice executes via `/sdlc:implement`** inside its worktree, dispatched as a subagent (`Task` tool, `subagent_type=Implementer` or dedicated agent session). The Implementer subagent runs the full `feature-flow.yaml` chain: planner → implementer → reviewer → qa → pr.

3. **Orchestrator forbidden actions** (hard gate, no `--force` except incident hotfix):
   - Write or edit files under `app/` in the main workspace
   - Mark `execution` stage complete without all wave tickets passing `feature-flow` gates
   - Mark ticket `done` without subagent completion record
   - Consolidate multiple Plane tickets into one worktree (one ticket = one worktree = one PR)

4. **Composition map** (single source in `.sdlc/workflows/README.md`):

   | sdlc:e2e stage | Delegates to | Agent |
   |---|---|---|
   | decomposition | `/sdlc:plan` on epic scope | planner |
   | plane-hierarchy | `/sdlc:spec` per slice | spec-writer |
   | execution (per ticket) | `/sdlc:implement` | planner→implementer→reviewer→qa |
   | deploy | `/sdlc:deploy` | deployer |
   | post-deploy | `/sdlc:post-deployment` | deployer |
   | board-sync | plane-closure from feature-flow | none |

5. **Deterministic gates** (`.sdlc/bin/sdlc_gate_check.py`) require per-ticket:
   - `subagent_dispatched: true`
   - `feature_flow_complete: true` (all feature-flow success_criteria)
   - Existing QA/visual/evidence/PR/review_url gates

6. **Human review handoff** occurs only when primary ticket(s) in wave pass all gates; orchestrator posts Plane comment and stops — never before.

## Consequences

- Reddit clone run `reddit-clone-20260522` execution is **invalid** under this ADR — must be re-run via subagent dispatch per ticket or re-scoped to single ticket epic.
- `sdlc-e2e.md` and `e2e-orchestration-flow.yaml` updated to reference composition explicitly.
- Future distributed execution: Plane ticket assignment → Cursor Cloud Agent / SDK session per ticket, same protocol.

## Alternatives rejected

- **Monolithic orchestrator implementation** — faster locally but breaks agent contracts, QA gates, and parallel scaling.
- **Merge all slices into one PR** — violates one-ticket-one-worktree invariant and review granularity.
