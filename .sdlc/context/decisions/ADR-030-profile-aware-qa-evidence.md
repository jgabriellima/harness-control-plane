# ADR-030: Profile-Aware QA Evidence and Local Validation

**Status:** ACCEPTED  
**Date:** 2026-06-08  
**Ticket:** harness parity (post PROJ-1 gateway finding)

## Context

The SDLC harness inherited QA gates from the Astro/blog demo (`visual-evidence.pass`, `shell-tier-checklist.pass`, `playwright-report.pass`). Headless slices (API, library, CLI) were still forced through browser gates when tickets omitted `qa_surface`. QA agents satisfied gates with placeholder PNGs while real validation was pytest.

## Terminology (do not conflate)

| Field | Scope | Role |
|---|---|---|
| `workspace.profile` | `.sdlc/sdlc.yaml` | Stack label for init/compose/CI hints (`starlight`, `python-fastapi`, `react-vite`) — **never** selects QA gates |
| `ticket.qa_surface` | work item / manifest ticket | Evidence mode: `browser` \| `headless` — **normative** for gates and validate-local |
| `ticket.validation_checks` | work item | Command list for headless validate-local and QA evidence |

There is no `python-library` profile class and no `{language}-library` profile taxonomy. One headless surface covers all non-UI stacks.

Three layers were misaligned:

1. `feature-flow.yaml` — fixed web gates on the `qa` node
2. `sdlc_workflow_gate.py` — `visual-evidence` checked file presence only
3. `sdlc_workflow_validate_local.py` — always ran `npm run build` + `tsc`

## Decision

Introduce **ticket-scoped** `qa_surface` on the work item (spec-flow / plane-ticket):

| Ticket `qa_surface` | Meaning | Gates active | validate-local |
|---|---|---|---|
| `browser` | UI slice | visual-evidence, shell-tier, playwright | manifest fixed checks (npm build + tsc) |
| `headless` | API / library / CLI slice | library-evidence | `ticket.validation_checks` |

`.sdlc/config/profile-qa.manifest.yaml` defines only the two modes and gate deferral. Harness resolves active ticket from workflow manifest at gate evaluation and QA execution.

**Not on workspace. Not inferred from language or repo files.** Monorepo: API ticket `headless`, UI ticket `browser`.

Missing `qa_surface` on ticket → gates FAIL (no silent default forcing PNG placeholders).

## Consequences

- Positive: evidence contract travels with the work item through spec → manifest → QA
- Positive: monorepo solved per ticket without repo-level switch
- Positive: no language tables or filesystem inference
- Migration: tickets gain `qa_surface` + `validation_checks` at spec-flow; register-ticket hydrates from work-items store
- **Creation-path enforcement:** `local_ticket_state.py create`, `register-ticket`, and spec-flow gate `ticket-qa-contract.pass` hard-fail when the contract is incomplete — not only at QA runtime

## Files

- `.sdlc/config/profile-qa.manifest.yaml`
- `.sdlc/bin/sdlc_profile.py` (generic interpreter only)
- `.sdlc/bin/sdlc_workflow_gate.py` — `library-evidence` adapter; profile deferral on web gates
- `.sdlc/bin/sdlc_workflow_validate_local.py` — profile dispatcher
- `.sdlc/gates/library-evidence.pass.yaml`
- `.sdlc/workflows/feature-flow.yaml` — adds `library-evidence.pass` on qa node
- `.cursor/agents/qa.md` — profile branching protocol
