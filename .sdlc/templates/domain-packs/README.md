# `.sdlc/templates/domain-packs/` — Domain pack manifests (ADR-030 MS-2)

Validated overlays that specialize the generic harness skeleton with domain vocabulary.

| File | Role | Trigger / entry-point | Key dependencies |
|---|---|---|---|
| [`sdlc.domain-pack.yaml`](sdlc.domain-pack.yaml) | Reference pack #1 — software delivery | `ai-native-sdlc install` (legacy combined) | `domain-pack.schema.json` |
| [`energy-admin.domain-pack.yaml`](energy-admin.domain-pack.yaml) | Reference stub #2 — administrative/regulatory procedures | `harness specialize --pack energy-admin` (future) | `lifecycle-slots.template.schema.json` |

Cross-reference: [`.sdlc/INDEX.md`](../../INDEX.md) [ADRS] ADR-030, ADR-031; [paradigm invariants](../contracts/paradigm-invariants.yaml).
