---
name: local-ticket
description: Use when creating or updating a local filesystem work item (local-work-items provider). Enforces the same ticket contract as plane-ticket but writes YAML under .sdlc/work-items/tickets/. Required before implementation when source_of_truth.work_items is local-work-items.
---

# Local Ticket Skill

Use when `source_of_truth.work_items: local-work-items` (ADR-025). Same engineering contract as Plane tickets; storage is filesystem, not API.

Reference template: `.sdlc/templates/plane-ticket.md` (sections and acceptance criteria format are identical).

## When to use

- New feature or fix before implementation
- Spec generated → create local ticket from spec
- PR opened → sync manifest status `ready_for_review`
- PR merged → sync manifest status `done`

Check provider:

```bash
python3 -c "from pathlib import Path; import sys; sys.path.insert(0, '.sdlc/bin'); from sdlc_dsl_bindings import work_items_provider; print(work_items_provider(Path('.'))[0])"
```

If output is `plane`, use `plane-ticket` skill instead.

## Ticket ID

Read `connection.id_prefix` from `.sdlc/integrations/local-work-items/local-work-items.yaml` (default `PROJ`). Use `{prefix}-{N}` e.g. `PROJ-12`.

## Create ticket

Write description as markdown (not HTML). Then:

```bash
python3 .sdlc/bin/local_ticket_state.py create \
  --ticket PROJ-12 \
  --title "Imperative verb phrase" \
  --state todo \
  --qa-surface browser \
  --description .sdlc/specs/PROJ-12-feature.md
```

Headless example:

```bash
python3 .sdlc/bin/local_ticket_state.py create \
  --ticket PROJ-13 \
  --title "Library API slice" \
  --qa-surface headless \
  --validation-checks-json '[{"name":"pytest","cmd":["python3","-m","pytest","-q"]}]'
```

**Creation fails (exit 1)** when `--qa-surface` is omitted or headless is chosen without valid `validation_checks`.

Record the returned `uuid` for manifest registration:

```bash
python3 .sdlc/bin/sdlc_workflow_manifest.py register-ticket \
  --run-id <run_id> \
  --ticket PROJ-12 \
  --uuid <uuid> \
  --qa-surface browser
```

Headless registration:

```bash
python3 .sdlc/bin/sdlc_workflow_manifest.py register-ticket \
  --run-id <run_id> \
  --ticket PROJ-13 \
  --qa-surface headless \
  --validation-checks-json '[{"name":"pytest","cmd":["python3","-m","pytest","-q"]}]'
```

**register-ticket exits 1** when `qa_surface` is missing and the work-item store does not hydrate a valid contract.

When `--uuid` is omitted and provider is `local-work-items`, `register-ticket` auto-provisions the local ticket.

## Update state

Prefer manifest-driven sync (harness-first):

```bash
python3 .sdlc/bin/sdlc_workflow_manifest.py update-ticket \
  --run-id <run_id> --ticket PROJ-12 --field status --value ready_for_review
python3 .sdlc/bin/work_items_sync.py sync --ticket PROJ-12
```

Board projection: `.sdlc/work-items/INDEX.md` (regenerated on each sync).

## Register in INDEX

After creation, append one line to `.sdlc/INDEX.md` ACTIVE_WORK section:

```
PROJ-12 ticket=local spec=.sdlc/specs/PROJ-12-feature.md status=todo
```

## QA evidence fields (required on every ticket — ADR-029)

```yaml
qa_surface: browser   # or headless — API/library/CLI slices
validation_checks:    # required when headless
  - name: pytest
    cmd: [python3, -m, pytest, -q]
```

Harness reads these from the ticket at feature-flow QA — not from `sdlc.yaml` workspace.

## Formatting standard

- No emojis
- Technical Notes IS the vertical implementation plan
- Acceptance criteria as Given/When/Then invariants
- End-to-end path from entry point to observable output
