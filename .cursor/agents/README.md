# .cursor/agents/ — Agent Protocol Index

This directory defines the operational contracts for each specialized agent in the SDLC pipeline. Each file describes entry conditions, responsibilities, tool constraints, and handoff protocol for one lifecycle phase.

Cross-reference: [`.sdlc/INDEX.md`](../.sdlc/INDEX.md) | [`.sdlc/workflows/README.md`](../.sdlc/workflows/README.md) | ADR-009, ADR-020

---

## Orchestrator vs Subagent Boundary

| Layer | Role | Writes `app/`? | Dispatches Task? |
|---|---|---|---|
| `/sdlc:goal` orchestrator | Manifest, waves, Plane hierarchy, merge order | **Never** | **Yes** — per ticket |
| `/sdlc:implement` subagent | Full feature-flow for one ticket | Yes — in worktree only | Yes — planner/reviewer/qa chain |
| Individual agents | Single stage within feature-flow | Per agent contract | No |

**Execution stage dispatch pattern:**

```
Orchestrator → Task(Implementer) × N tickets
  └── Implementer → /sdlc:implement → feature-flow.yaml
        ├── planner.md
        ├── implementer.md
        ├── reviewer.md
        ├── qa.md (+ qa-recording skill)
        └── PR + plane-closure
```

Plane child ticket = one dispatch unit. Enables parallel local subagents or distributed Cursor Cloud sessions with identical protocol.

---

## File Inventory

| File | Role | Trigger / Entry Point | Key Dependencies |
|---|---|---|---|
| [`deployer.md`](deployer.md) | Release engineer — executes staged deployments, validates smoke tests, rolls back on failure | `/sdlc:deploy` after QA passes | Cloudflare Pages, GitHub Actions deploy.yaml |
| [`implementer.md`](implementer.md) | Architecture-aware code generator — writes production TypeScript/Astro code aligned to project rules and active Plane ticket spec | `/sdlc:implement` after spec is approved | Plane ticket spec, worktree, architecture.mdc |
| [`incident-resolver.md`](incident-resolver.md) | Production incident first-responder — triages GitHub issues, reproduces failures, applies targeted fixes in hotfix worktree, writes postmortem | `/sdlc:incident` | GitHub issues, hotfix worktree, incidents.md |
| [`planner.md`](planner.md) | Requirement analyst and technical architect — decomposes feature requests into vertical, implementable execution plans | `/sdlc:plan` or `/sdlc:implement` (planning stage) | Plane API, architecture.mdc, ADR history |
| [`qa.md`](qa.md) | Browser-native quality validator — validates features via real browser flows, captures screenshots and traces, produces pass/fail manifest | `/sdlc:implement` (QA stage) or `/run:e2e` | Playwright, cursor-ide-browser MCP, `.sdlc/evidence/` |
| [`reviewer.md`](reviewer.md) | Architectural gate and quality validator — inspects changed files against project rules, TypeScript strict mode, Tailwind constraints, ADR history | `/sdlc:implement` (review stage) | architecture.mdc, frontend-rules.mdc, ADR files |
| [`spec-writer.md`](spec-writer.md) | Intent interpreter and specification author — converts raw feature requests into structured spec documents, Plane tickets, and isolated git worktrees | `/sdlc:spec` | Plane API, worktree skill, `.sdlc/templates/` |
