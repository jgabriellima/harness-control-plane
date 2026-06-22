# ADR-025: Local work-items provider (zero-credential default)

**Status:** ACCEPTED  
**Date:** 2026-06-05  
**Extends:** ADR-011, ADR-020, JAMBU-94

## Problem statement

The `work_items` lifecycle slot is mandatory (ticket registration before implementation), but the integration catalog only materialized external providers (Plane, Linear, Jira, GitHub Issues). Consumers without API credentials could not complete the SDLC loop. `work_items_sync.py` raised `RuntimeError` for any non-Plane provider.

## Decision

Introduce `local-work-items` as a first-class `work_items` provider:

1. **Filesystem mirror** — tickets live under `.sdlc/work-items/tickets/{TICKET-ID}.yaml`; board projection at `.sdlc/work-items/INDEX.md`.
2. **Harness-first** — workflow run manifest remains source of truth; local files mirror manifest state and harness index fields (ADR-020).
3. **Zero credentials** — `secrets_required: []`; doctor skips credential validation for this provider.
4. **Init default** — when no external work-items provider is selected during `/sdlc:init`, materialize `local-work-items` automatically (slot is never `none`).
5. **ID prefix** — configurable via `connection.id_prefix` in `local-work-items.yaml` (default `PROJ`); ticket ids use `{prefix}-{N}` convention.
6. **Adapter** — `local_ticket_state.py` implements the same sync surface as `plane_ticket_state.py`; `work_items_sync.py` delegates by `source_of_truth.work_items`.

## Contract

| Artifact | Role |
|---|---|
| `.sdlc/integrations/local-work-items/local-work-items.yaml` | Provider config: `manifest_sync`, `states`, `storage` |
| `.sdlc/work-items/tickets/*.yaml` | Canonical local ticket records |
| `.sdlc/work-items/INDEX.md` | Regenerated board (status columns) |
| `.sdlc/bin/local_ticket_state.py` | Filesystem adapter |
| `runtime.ticket_skill_ref` in integration YAML | DSL binding — workflows invoke `work-items-ticket` skill, which delegates here |
| `.cursor/skills/local-ticket/SKILL.md` | Provider-specific ticket skill for local-work-items |

Manifest ticket `uuid` field stores the local ticket UUID (same contract as Plane issue UUID).

## Consequences

- `sdlc_workflow_manifest.py register-ticket` auto-provisions local ticket + UUID when provider is `local-work-items` and `--uuid` is omitted.
- Workflows MUST invoke `work-items-ticket` (vendor-neutral); provider skills are referenced only via `runtime.ticket_skill_ref` in integration YAML.
- `runtime.board_surface` is an abstract id (`provider_api`, `provider_filesystem_mirror`) — UI layers (trace-ui) resolve via `work_items_board_surface()` and provider adapter; **forbidden** to hardcode `.sdlc/work-items/` in UI code.
- Evidence upload for local provider: copy paths into ticket `evidence` list (no S3); `work_items_evidence_uploaded` set by gate scripts as today.
- Authoring repo (Plane) does not materialize `local-work-items` — capability is validated via tests and distributable templates only.

## Verification

```bash
pytest .sdlc/bin/tests/test_local_work_items_sync.py -q
python3 .sdlc/bin/work_items_sync.py sync --help
```

## References

- JAMBU-94 work-items DSL bindings
- ADR-011 section 3 (lifecycle slots)
- ADR-020 section 6 (harness-first work_items index)
