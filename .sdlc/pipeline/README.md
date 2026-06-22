# `.sdlc/pipeline/` — Integration mutation engine (ADR-011 W3)

Deterministic pipeline shared by `/sdlc:init` (batch) and `/sdlc:config` (delta).

| File | Role | Trigger / entry-point | Key dependencies |
|---|---|---|---|
| `integration-mutator.ts` | CLI: plan, apply, manifest | `/sdlc:init` Phase D, `/sdlc:config` Phase 3–6 | `catalog.ts`, `catalog-patch.ts`, `credential-manifest.ts` |
| `catalog.ts` | Slot collapse, provider aliases, template copy | Materialize step | `.sdlc/templates/integrations/` |
| `catalog-patch.ts` | Slot-aware fragment merge after catalog copy | `integration-mutator.ts apply` | ADR-029 |
| `catalog-patch.test.ts` | Unit checks for orphan secrets / patch | `npx ts-node pipeline/catalog-patch.test.ts` | |
| `credential-manifest.ts` | Union `secrets_required` → manifest | Post materialization | `.sdlc/schemas/credential-manifest.schema.json` |
| `discovery.ts` | Grep inventory + agent task list | Plan phase | repo root, `.cursor/`, `.sdlc/`, `app/` |
| `types.ts` | Shared TypeScript contracts | imported by pipeline modules | ADR-011 schemas |

Cross-reference: `.sdlc/INDEX.md` [ADRS] ADR-011; `.cursor/commands/sdlc-init.md`; `.cursor/commands/sdlc-config.md`.

## CLI

```bash
cd .sdlc

# Init batch (confirmed init-selections.json — ADR-029)
npx ts-node pipeline/integration-mutator.ts plan \
  --action batch \
  --init-file pipeline/.init-selections.json \
  --source init

# Legacy slots-only JSON
npx ts-node pipeline/integration-mutator.ts plan \
  --action batch \
  --slots-file /path/to/slots.json \
  --source init

# Config delta
npx ts-node pipeline/integration-mutator.ts plan \
  --action swap --from sentry --to posthog --slots observability --source config-swap

# Apply plan
npx ts-node pipeline/integration-mutator.ts apply --plan-file .sdlc/pipeline/.last-plan.json

# Regenerate manifest only
npm run mutator:manifest
```

## Slot selections file (batch)

```json
{
  "work_items": "plane",
  "source_control": "github",
  "ci": "github-actions",
  "qa": "playwright",
  "observability": "posthog",
  "deploy": "vercel"
}
```

Non-materialized tokens (`playwright`, `none`) update `project.stack` only.
