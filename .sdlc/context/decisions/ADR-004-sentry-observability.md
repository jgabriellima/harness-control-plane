# ADR-004: Sentry for All Observability

## Status

SUPERSEDED by ADR-008 (Sentry → PostHog migration)

## Context

Original stack mandate required Sentry for runtime errors and performance. Product observability slot later migrated per ADR-008 gap analysis.

## Decision

> ~~All runtime errors and performance monitoring route through Sentry SDK.~~ **Superseded** — observability slot removed; PostHog migration decisions in ADR-008.

## Implementation Notes

- Historical: `@sentry/astro` references removed from active `app/`
- `.sdlc/sdlc.yaml` — `observability slot=none status=REMOVED provider=posthog removed=2026-05-31`

## Review

| Field | Value |
|---|---|
| Date | 2026-05-19 |
| Superseded | 2026-05-21 (ADR-008) |
| Closed stub | 2026-06-05 |
