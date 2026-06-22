# `.sdlc/templates/` — Harness template registry

Scaffold and contract templates for specs, tickets, handoffs, integrations, and ADR-030 generic harness skeleton.

| Directory / file | Role | Trigger / entry-point | Key dependencies |
|---|---|---|---|
| [`harness/`](harness/) | Generic harness skeleton DSL, kernel bin manifest, bootstrap flow | `harness install --runtime cursor` (P4) | ADR-030, ADR-031 |
| [`domain-packs/`](domain-packs/) | Domain pack manifests (SDLC, energy-admin stub) | `harness specialize --pack` (P3) | `domain-pack.schema.json` |
| [`integrations/`](integrations/) | Integration provider templates for mutator | `/sdlc:init`, `/sdlc:config` | ADR-011 |
| [`spec.md`](spec.md) | Feature spec template | `/sdlc:spec` | spec-writer skill |
| [`handoff.md`](handoff.md) | Session handoff template | `/sdlc:handoff` | handoff skill |
| [`plane-ticket.md`](plane-ticket.md) | Work item ticket template | work-items providers | ADR-025 |

Cross-reference: `.sdlc/INDEX.md` [ADRS] ADR-011, ADR-030, ADR-031.
