# ADR-029: Init Questionnaire and Slot-Aware Integration Materialization

Status: ACCEPTED  
Date: 2026-06-08  
Extends: ADR-011, ADR-025, ADR-028  
Ticket: PROJ-3

## Context

`/sdlc:init` Phase C (slot walk) was specified in ADR-011 but executed inconsistently: agents inferred slots, and integration catalog templates copied authoring-repo secrets (e.g. `CURSOR_API_KEY`, Vercel, Plane) into every consumer GitHub integration. Incident agent runtime (Cursor SDK vs Claude vs human-in-loop) was never raised during setup.

## Decision

### 1. Normative init questionnaire

Machine-readable contract: `.sdlc/templates/init-questionnaire.yaml`  
Validation: `python3 .sdlc/bin/sdlc_init_validate.py --file .sdlc/pipeline/.init-selections.json`

Seven waves: workspace → delivery closure → mandatory slots → optional slots → incident sub-questionnaire → runtime confirm → confirmation gate.

**Skip invariant:** unset optional slot = `none`; no integration directory, no secrets, no doctor validation for that slot.

### 2. Init selections artifact

Before mutator `apply`, agent writes `.sdlc/pipeline/.init-selections.json` (schema: `.sdlc/schemas/init-selections.schema.json`) including:

- `workspace`, `delivery`, `slots`, optional `incident` block
- `confirmed_at` — required; mutator rejects unconfirmed selections

### 3. Slot-aware catalog materialization

Base GitHub template (`.sdlc/templates/integrations/github/`) ships **zero demo secrets**. Optional capabilities merge from `fragments/`:

| Fragment | When applied |
|---|---|
| `incident-cursor-sdk.yaml` | `slots.incident` = `github-issues-cursor-sdk` |
| `incident-claude.yaml` | `slots.incident` = `github-issues-claude` |
| `incident-human-hitl.yaml` | `slots.incident` = `github-issues-human-hitl` |

Engine: `.sdlc/pipeline/catalog-patch.ts` invoked from `integration-mutator.ts apply` after `copyCatalogToIntegration`.

### 4. Doctor orphan-secret gate

Operational doctor fails when `secrets_required` references env vars tied to inactive slots (e.g. `CURSOR_API_KEY` without `incident` serving `github-issues-cursor-sdk`).

### 5. Bootstrap workflow alignment

`bootstrap-flow.yaml` v2.0.0 removes Astro-specific dependency install nodes; nodes mirror `sdlc-init.md` phases (questionnaire → confirm → materialize → credentials → doctor).

## Consequences

- Distributable install never surfaces Cursor SDK unless user opts into incident + cursor-sdk
- Authoring repo demo integration unchanged under `.sdlc/integrations/github/` (dogfood)
- `/sdlc:config add` reuses catalog-patch when incident slot changes on existing github provider

## Verification

```bash
python3 .sdlc/bin/sdlc_init_validate.py --file .sdlc/pipeline/.slot-test-init.json
cd .sdlc && npx ts-node pipeline/catalog-patch.test.ts
cd .sdlc && npm run doctor:structural
```
