# Spec Document Template

## Metadata

| Field | Value |
|---|---|
| Spec ID | SPEC-NNN |
| Plane Ticket | JAMBU-N |
| Author | — |
| Status | DRAFT \| APPROVED \| SUPERSEDED |
| Created | YYYY-MM-DD |
| Last Updated | YYYY-MM-DD |

---

## Problem Statement

One paragraph. What is wrong or missing? What observable behavior is incorrect or absent?
Be falsifiable: describe what a failing system does vs. what a correct system must do.

---

## Scope

### In Scope
- Explicit list of what this spec covers

### Out of Scope
- Explicit list of what is excluded and why

---

## Constraints

List the architectural rules, ADRs, external contracts, or performance requirements
that this implementation must satisfy. Reference specific files or ADR IDs.

---

## Acceptance Criteria

Use Given / When / Then format. Each criterion must be independently verifiable by
a Playwright test or a deterministic assertion.

```
Given [initial state]
When [action or event]
Then [observable, measurable outcome]
```

---

## Data Model

Describe any new types, interfaces, schema changes, or content structure changes
required. Use TypeScript interface syntax where applicable.

---

## Implementation Plan

Ordered list of concrete steps. Each step must name the file(s) affected and the
specific change. No vague verbs ("update the component") — name the entry point,
transformation, and output.

1. Step one — `src/path/to/file.ts` — what changes and why
2. Step two — ...

---

## Observability

What Sentry instrumentation is required? Name the specific spans, error captures,
or performance marks that must be added.

---

## Verification

How is correctness confirmed after implementation? Name the specific Playwright test
file, test title, and assertion that must pass. List the evidence artifacts that must
be captured in `.sdlc/evidence/`.

---

## Residual Risks

What could still fail after implementation? Be specific about failure modes, edge
cases, and external dependencies that are not under this spec's control.
