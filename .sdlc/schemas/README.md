# `.sdlc/schemas/` — JSON Schema registry for harness configuration artifacts

Machine-readable contracts for distributable harness kernel and domain pack data models.

| File | Role | Trigger / entry-point | Key dependencies |
|---|---|---|---|
| `harness-identity.schema.json` | MS-1 identity block — harness_dir, cli_prefix, namespaces | `harness install`; bin path resolver (P2) | ADR-030, ADR-031 |
| `harness-storage.schema.json` | MS-5 storage block — root, layout, templates, policies | `harness.yaml` / active DSL; `_harness_paths.py` (P2) | ADR-032 |
| `runtime-binding.schema.json` | MS-6 runtime-binding.yaml stamp — kernel, active pack, resolved storage | `harness bind`; `harness activate` (P3) | ADR-032 |
| `harness-pack-registry.schema.json` | MS-9 packs.installed[] and packs.active block | `harness packs add`; `harness activate` (P3) | ADR-032 |
| `domain-pack.schema.json` | MS-2 domain specialization manifest | `harness activate` (P3); `/harness:pack` export | ADR-030, ADR-032 |
| `lifecycle-slots.template.schema.json` | Extensible slot catalog template for domain packs | Domain pack authoring | ADR-030 MS-3 |
| `lifecycle-slots.schema.json` | SDLC slot IDs for `/sdlc:init` — **SDLC domain pack scope** | Init slot walk | ADR-011 |
| `integrations-index.schema.json` | Provider-keyed integrations with `serves_slots` phase binding | `/sdlc:init`, `/sdlc:config`, doctor group 0 | ADR-011 |
| `credential-manifest.schema.json` | Generated secret manifest (names only, no values) | Post init credential collection | Integration `secrets_required` |
| `workflow-dsl.schema.json` | Workflow stage graph contract | `sdlc_workflow_validate.py` | ADR-016 |
| `gate-dsl.schema.json` | Gate definition contract | Gate runner | ADR-012 |
| `cognitive-output.schema.json` | Agent stage output contract | Workflow postConditions | ADR-016 |
| `workflow-state.schema.json` | Run state contract | Workflow manifest | ADR-017 |
| `workflow-continuity.schema.json` | Continuity resolution contract | `sdlc_continuity_resolve.py` | ADR-020 |

Cross-reference: `.sdlc/INDEX.md` [ADRS] ADR-011, ADR-030, ADR-031, ADR-032; `.sdlc/contracts/paradigm-invariants.yaml`.
