# `.sdlc/templates/integrations/` — Integration catalog (read-only templates)

Provider templates copied to `.sdlc/integrations/{provider}/` during init or `/sdlc:config add`. Each template MUST include `gate_contract` (ADR-013). Authoring procedure: playbook `pb.sdlc.integration-authoring`.

| Provider | Template | Serves slots (typical) |
|---|---|---|
| `local-work-items` | `local-work-items/local-work-items.yaml` | `work_items` (init default when slot unset, ADR-025) |
| `plane` | `plane/plane.yaml` | `work_items` |
| `github` | `github/github.yaml` + `fragments/` | `source_control`, `ci`, optional `incident` (ADR-029) |
| `posthog` | `posthog/posthog.yaml` | `observability` |
| `vercel` | `vercel/vercel.yaml` | `deploy` |
| `cloudflare-pages` | `cloudflare-pages/cloudflare-pages.yaml` | `deploy` |

| Authoring | Template |
|---|---|
| Gate contract skeleton | `_gate-contract.template.yaml` |

Validate before materialize: `python3 .sdlc/bin/sdlc_gate_runner.py validate-contract --config <path>`

Cross-reference: `.sdlc/pipeline/catalog.ts`; ADR-011 section 4; ADR-013
