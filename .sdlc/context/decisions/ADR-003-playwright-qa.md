# ADR-003: Playwright as Primary QA

## Status

ACCEPTED

## Context

SDLC demo requires deterministic browser verification of deploy surfaces. Unit tests are supplementary; E2E smoke is the merge gate for `app/`.

## Decision

> Playwright is the primary QA tool. E2E tests live in `{target_root}/e2e/` and run in CI (`e2e.yaml`) and workflow QA nodes.

## Rationale

- Real browser assertions catch layout and hydration failures unit tests miss
- Playwright traces feed `.sdlc/evidence/` manifest contract
- JAMBU-93 smoke suite validates Starlight docs site post-rebind

## Implementation Notes

- `app/e2e/smoke.spec.ts`
- `.github/workflows/e2e.yaml`
- `.sdlc/bin/sdlc_workflow_gate.py` — QA gate reads evidence manifests

## Review

| Field | Value |
|---|---|
| Date | 2026-05-19 |
| Closed | 2026-06-05 (retroactive stub) |
