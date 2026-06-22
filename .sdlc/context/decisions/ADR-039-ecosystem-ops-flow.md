# ADR-039: Ecosystem Operational Flow

## Status

ACCEPTED — 2026-06-18

## Context

Operators bootstrap sibling repositories under `~/workspaces/jambu/` using natural-language chat at the ecosystem workspace root. The SDLC install CLI (`ai-native-sdlc install`) correctly materializes only harness artifacts (`.sdlc/`, `.cursor/`, `scripts/`) with `status: uninitialized` and `profile: auto`.

Without a dedicated operational workflow, agents improvise: they infer application stacks (e.g. Node.js for `*-whatsapp`), set `status: operational`, and write `package.json` / `src/` before `/sdlc:init` — violations of ADR-011 two-phase init.

`/sdlc:goal` is the wrong control plane for this work. `goal-flow` delegates to `feature-flow` for vertical product delivery (tickets, worktrees, PRs). Ecosystem topology operations may touch zero application code.

Precedents in the operational family:

| Flow | Trigger | Scope |
|---|---|---|
| `bootstrap-flow` | `/sdlc:init` | Single-repo harness specialization |
| `engspec-flow` | `/sdlc:engspec` | Docs/ADR/spec artifacts |
| `incident-flow` | `/sdlc:incident` | Hotfix remediation |

None covers multi-repo sibling bootstrap from the SDLC product repo.

## Decision

> We will add `ecosystem-ops-flow` triggered by `/sdlc:ecosystem` as the normative operational control plane for Jambu ecosystem topology tasks executed from `ai-native-sdlc/`.

The flow:

1. Classifies intent into `run_mode` (`sibling-repo-bootstrap`, `sdlc-sync`, `register-only`)
2. Declares an explicit path allowlist on the workflow manifest
3. Permits SDLC CLI install and ecosystem doc updates only in `sibling-repo-bootstrap` mode
4. Forbids application scaffold (`package.json`, `src/**`, `tsconfig.*`) unless child repo `/sdlc:init` completes with `confirmed_at`
5. Verifies session diff against allowlist via `scope-verify` gate before delivery

Intent-gate routing (NL → `/sdlc:ecosystem`) is specified in this ADR as Phase 2 — extends `sdlc_goal_runtime.evaluate_prompt_submit` — not part of the initial workflow DSL landing.

## Rationale

**Alternatives considered:**

| Alternative | Rejected because |
|---|---|
| Extend `/sdlc:goal` with ecosystem mode | Pollutes delivery orchestrator; violates `implementationDelegate: feature-flow` semantics |
| Ecosystem-only `.cursor/commands/` without runner | Rules without enforcement — reproduces the original failure mode |
| `qa.worktree_gate` as default | Blocks post-operational edits; does not classify ingress intent or allowlist bootstrap paths |
| Manual agent discipline | Already failed in production (tce-whatsapp session) |

**Why `ai-native-sdlc` owns the workflow:** SDLC product ships `sdlc_workflow_run.py`, gate framework, and distributable templates. Ecosystem workspace root (`jambu/`) has orientation adapter only (no `.sdlc/` harness per ADR-033 deferred meta-repo).

## Consequences

### Positive

- Operational tasks gain manifest, gates, and resumable runs
- Sibling-repo bootstrap has falsifiable scope contract
- Clear separation: delivery (`goal-flow`) vs operations (`ecosystem-ops-flow`) vs specialization (`bootstrap-flow`)

### Negative / Trade-offs

- Operator must open `ai-native-sdlc/` (or worktree) to run `/sdlc:ecosystem` — not from `jambu/` root cwd
- Phase 2 intent gate requires hook changes in `sdlc_goal_runtime.py`
- Each new ops mode needs allowlist maintenance in skill capsule

### Neutral

- New workflow registered in `sdlc.yaml`, INDEX, commands README
- Template sync to `packages/ai-native-sdlc/templates/` on next baseline

## Implementation Notes

| Artifact | Path |
|---|---|
| Workflow DSL | `.sdlc/workflows/ecosystem-ops-flow.yaml` |
| Command | `.cursor/commands/sdlc-ecosystem.md` |
| Context capsule | `.cursor/skills/ecosystem-ops/SKILL.md` |
| Engineering spec | `.sdlc/specs/ecosystem-ops-flow.md` |
| Run manifest template | `.sdlc/templates/ecosystem-ops-run-manifest.yaml` |
| Scope gate | `.sdlc/gates/ecosystem-scope.pass.yaml` |

## Review

| Field | Value |
|---|---|
| Author | SDLC session |
| Date | 2026-06-18 |
| Reviewed by | pending |
| Ticket | SDLC-39 |
