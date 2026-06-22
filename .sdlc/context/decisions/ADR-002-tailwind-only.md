# ADR-002: Tailwind-Only Styling

## Status

ACCEPTED

## Context

Agent-generated UI must stay consistent and grepable. Raw CSS files fragment conventions and bypass design-token discipline enforced in architecture rules.

## Decision

> All styling uses Tailwind CSS utility classes. No raw CSS files except `src/styles/global.css`.

## Rationale

- Single styling vocabulary for agents and reviewers
- Tailwind purge keeps static bundle small
- Forbidden pattern in `.cursor/rules/architecture.mdc` prevents drift

## Implementation Notes

- `app/src/styles/global.css` — Tailwind directives only
- Components use `class` attributes; no inline `style=`

## Review

| Field | Value |
|---|---|
| Date | 2026-05-19 |
| Closed | 2026-06-05 (retroactive stub) |
