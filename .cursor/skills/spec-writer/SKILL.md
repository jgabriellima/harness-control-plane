---
name: spec-writer
description: Use when receiving any raw feature intent before implementation begins. Triggered by /sdlc:spec. Converts user intent into a structured spec document, work_items ticket (via DSL-resolved skill), and isolated worktree before any code is touched.
---

# Spec Writer Skill

## When to Use
Call this skill when receiving any feature intent before implementation begins.
Triggered by `/sdlc:spec <intent>`.

This skill converts raw user intent into a structured spec, registers it in the INDEX, and creates a work_items ticket — before any code is written.

## The Pipeline

```
User Intent (raw)
    ↓
spec-writer skill (this file)
    ↓
.sdlc/specs/{JAMBU-N}-{feature}.md
    ↓
INDEX registration
    ↓
work-items-ticket skill → ticket created (provider from DSL runtime.ticket_skill_ref)
    ↓
worktree skill → git worktree created
    ↓
/sdlc:implement (with ticket + spec as context)
```

## Step 1 — Receive Intent

The user provides intent in any form:
- "Add a search bar to the blog"
- "Users can't find old posts — need pagination"
- "JAMBU-5: implement tag filtering"

Read the intent. Do NOT ask clarifying questions unless the intent is contradictory or technically impossible. Make reasonable assumptions explicit in the spec.

## Step 2 — Hydrate Context First

Before writing the spec, read:
1. `.sdlc/INDEX.md` — check if similar spec exists
2. `.cursor/memories/architecture.md` — constraints and patterns
3. `.cursor/memories/business-rules.md` — product rules
4. `.sdlc/context/decisions/` — relevant ADRs
5. Latest handoff at `.sdlc/handoffs/LATEST.md` — what's currently in progress

## Step 3 — Generate Spec Document

Create `.sdlc/specs/{tentative-id}-{feature-kebab}.md`:

```markdown
# Spec: {Feature Title}
ID: JAMBU-{N} (assigned after Plane ticket creation)
Status: DRAFT
Created: {date}
Author: AI-Native SDLC

---

## Intent
{The user's original intent, quoted or paraphrased}

## Objective
{What this feature does for the user, in 1-2 sentences. User-centric.}

## Problem Statement
{What problem does this solve? Why now? What happens without it?}

## Proposed Solution
{High-level description of the approach. Not implementation details yet.}

## Scope

### In Scope
- {specific thing this spec covers}

### Out of Scope
- {explicit non-goals — prevents scope creep}

## User Stories

### Primary
As a {persona}, I want to {action} so that {outcome}.

### Secondary (if any)
As a {persona}, I want to {action} so that {outcome}.

## Acceptance Criteria

Each criterion maps directly to a Plane ticket AC and to a Playwright test scenario.

| ID | Given | When | Then |
|---|---|---|---|
| AC-1 | {state} | {user action} | {verifiable outcome} |
| AC-2 | ... | ... | ... |

## Technical Specification

### Affected Files
- {file path} — {nature of change}

### New Files
- {file path} — {purpose}

### TypeScript Interfaces
```typescript
// Define new data shapes
```

### Architecture Notes
{Constraints from .cursor/rules/architecture.mdc that apply here}

## QA Evidence Mode (required — ADR-029)

Before ticket creation, the spec **must** declare how QA evidence will be collected. This is not optional and is enforced at `local_ticket_state.py create`, `register-ticket`, and the spec-flow `ticket-qa-contract.pass` gate.

Choose exactly one mode with engineering rationale:

| Mode | When to use | Ticket fields |
|---|---|---|
| `browser` | UI slice — pages, components, visual regressions | `qa_surface: browser` |
| `headless` | API, library, CLI, or any non-browser slice | `qa_surface: headless` + `validation_checks` |

Headless `validation_checks` example (include in spec and ticket):

```yaml
qa_surface: headless
validation_checks:
  - name: pytest
    cmd: [python3, -m, pytest, -q]
```

Browser tickets defer library-evidence at QA; headless tickets defer visual-evidence. Do **not** infer mode from `workspace.profile` or repo language.

### Browser QA checklist (when qa_surface=browser)

| Check | Required | Tool |
|---|---|---|
| E2E test | Yes | Playwright |
| Accessibility | Yes | axe-playwright |
| Recording (3 resolutions) | Yes | qa-recording skill |
| Performance regression | Yes | Lighthouse |

## Open Questions
- {question} — assumed: {assumption made}

## Dependencies
- Plane: {related tickets}
- ADR: {if architectural decision needed}
```

## Step 4 — Create Work Items Ticket

Invoke the `work-items-ticket` skill with the spec content. That skill resolves `runtime.ticket_skill_ref` from the active work_items integration YAML — do not call `plane-ticket` or `local-ticket` directly.

Map spec sections to ticket fields per the resolved provider skill. After creation, update the spec file with the real ticket id (`{id_prefix}-N` from DSL `connection.id_prefix`).

## Step 5 — Register in INDEX

Add to `.sdlc/INDEX.md`:
- Under "Specs": link to the spec file
- Under "Active Work Items": link to the work_items ticket

## Step 6 — Create Worktree

Invoke the `worktree` skill to create the isolated development environment.

## Step 7 — Output

```
Spec created:    .sdlc/specs/JAMBU-{N}-{feature}.md
Work item:       {PREFIX}-{N} (provider from source_of_truth.work_items)
Worktree:        ../worktrees/JAMBU-{N}-{feature}/
Branch:          feat/JAMBU-{N}-{feature}

Next step: /sdlc:implement JAMBU-{N}
```
