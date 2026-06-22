# ADR-001: Use Astro SSG over Next.js

## Status

ACCEPTED — extended by ADR-013 (Starlight profile at `app/`)

## Context

The demo product surface requires content-first static delivery with island hydration for interactive sections. Next.js adds SSR/runtime complexity not required for the documentation site and marketing homepage.

## Decision

> Use Astro with static output (`output: 'static'`) as the primary framework for `workspace.target_root`.

## Rationale

- Astro content collections align with docs-first SDLC demo
- Starlight (ADR-013) builds on Astro 6 without a separate docs framework
- Static output matches Cloudflare Pages deploy (ADR-019) — no Node adapter required

## Consequences

### Positive
- Predictable build artifacts; no server runtime for default deploy path

### Negative
- SSR features (e.g. discontinued JAMBU-33 playground) require explicit adapter + ADR

## Implementation Notes

- `app/astro.config.mjs` — `output: 'static'`
- `.sdlc/sdlc.yaml` — `workspace.target_root: app`, `profile: starlight`

## Review

| Field | Value |
|---|---|
| Date | 2026-05-19 |
| Closed | 2026-06-05 (retroactive stub) |
