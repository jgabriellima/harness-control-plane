---
name: sdlc:plan
description: Standalone feature planning — decomposes requirements into a vertical execution plan via the Planner agent. Use before implementation when no full /sdlc:implement pipeline is needed.
---

# /sdlc:plan — Feature Planning

Produce a vertical execution plan from raw feature intent. Does not write code, create PRs, or modify the repository unless the plan explicitly requires an ADR draft.

## Usage

```
/sdlc:plan <feature description or Plane ticket ID>
```

Examples:

```
/sdlc:plan Add search functionality to the blog post list
/sdlc:plan JAMBU-42
```

## Execution Protocol

You are operating as the **Planner** agent (`.cursor/agents/planner.md`). Follow that protocol exactly.

### Step 0 — Worktree awareness

If the intent references a Plane ticket, verify a worktree exists or will be created during `/sdlc:spec`. Planning does not require a worktree, but the plan output MUST name the expected worktree path.

### Step 1 — Context hydration

Run the hydration sequence from `/sdlc:hydrate` (scoped sections only per INDEX `[HYDRATION_SCOPE]`).

### Step 2 — Requirement refinement

Clarify ambiguous requirements. Ask only what blocks plan accuracy.

### Step 3 — Architecture and ADR scan

Read `.cursor/memories/architecture.md` and relevant files under `.sdlc/context/decisions/`. Do not contradict accepted ADRs.

### Step 4 — Plan output

Emit the plan using the output format defined in `.cursor/agents/planner.md`:

- Objective
- Affected files and new files
- TypeScript interfaces (when applicable)
- Atomic implementation tasks
- E2E test scenarios (Given/When/Then)
- Observability points (only when `project.stack.observability` is active; currently `none`)
- ADR required? (YES with draft | NO)
- Risk assessment and complexity estimate

### Step 5 — Plane alignment (when ticket ID present)

If a Plane ticket ID is in scope, note which plan sections map to Technical Notes fields for `/sdlc:spec` or ticket update.

## Constraints

- Do not implement code in this command.
- Do not skip architecture memory or ADR review.
- Plans touching observability MUST include instrumentation points only when an observability integration is active (see `.cursor/rules/observability.mdc`).
- Plans for new pages MUST include accessibility requirements.

## When to use instead of /sdlc:implement

| Situation | Command |
|---|---|
| Need plan only, no code yet | `/sdlc:plan` |
| Approved spec + ticket + full pipeline | `/sdlc:implement` |
| Goal-flow decomposition stage | `/sdlc:plan` (referenced by `goal-flow.yaml` decomposition node) |
