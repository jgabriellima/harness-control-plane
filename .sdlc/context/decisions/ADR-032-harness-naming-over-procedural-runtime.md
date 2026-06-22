# ADR-031: Harness Naming — Artifact and CLI Over Procedural-Runtime

Status: ACCEPTED  
Date: 2026-06-10  
Amends: ADR-030  
Extends: ADR-011, ADR-024

## Context

ADR-030 introduced the **Procedural Cognitive Runtime Skeleton (PCRS)** with CLI surface `procedural-runtime install`, directory `.runtime/`, DSL `runtime.yaml`, and package `@jambu/procedural-runtime`.

That naming conflates three distinct layers already documented in `docs/engineering/runtime-layer.md`:

| Layer | Role |
|---|---|
| **Procedural Cognitive Runtime Architecture** | Paradigm / thesis — how governed cognitive orchestration works |
| **Harness** | Operational infrastructure — workflows, gates, playbooks, trace, baseline |
| **Agent runtime** | Cursor, Claude — provides the LLM loop; selected via `--runtime` |

The DSL block `runtime.engine: cursor` already means **agent runtime adapter binding**. Calling the installable skeleton `procedural-runtime` collides with that block and inverts the hierarchy: the skeleton is a **harness specialized over the agent runtime**, not a second runtime.

## Decision

> Rename the generic skeleton artifact, CLI, and identity contract from **procedural-runtime** to **harness**. Preserve **Procedural Cognitive Runtime Architecture** as the paradigm name in documentation and ADRs.

### Naming stack (normative)

```text
Paradigma     Procedural Cognitive Runtime Architecture   docs, tese, ADRs
Artefacto     harness                                     CLI, .harness/, harness.yaml
Domínio       sdlc | energy-admin | business              *.domain-pack.yaml
Agent RT      cursor | claude                             runtime.engine in DSL
Subject       workspace.target_root                       app/, systems/, …
```

### CLI surface

```bash
harness install --runtime cursor
harness specialize --pack sdlc
harness doctor
harness baseline advance
```

`--runtime` selects the **agent runtime adapter** (Cursor binding) — not a "procedural runtime variant".

### Identity contract (MS-1 amendment)

| Field | ADR-030 (superseded) | ADR-031 (current) |
|---|---|---|
| Skeleton `id` | `procedural-runtime` | `harness` |
| `harness_dir` | `.runtime/` | `.harness/` |
| `dsl_file` | `runtime.yaml` | `harness.yaml` |
| `cli_prefix` | `runtime` | `harness` |
| Lifecycle namespace | `/runtime:` | `/harness:` |
| npm kernel package | `@jambu/procedural-runtime` | `@jambu/harness` |
| Baseline fields | `runtime_baseline_*` | `harness_baseline_*` |
| Schema file | `runtime-identity.schema.json` | `harness-identity.schema.json` |
| Templates dir | `templates/runtime/` | `templates/harness/` |
| Bootstrap workflow | `runtime-bootstrap-flow.yaml` | `harness-bootstrap-flow.yaml` |

SDLC domain pack overlay unchanged: `.sdlc/`, `sdlc.yaml`, `/sdlc:*`, `@jambu/ai-native-sdlc`.

### What does NOT change

- Paradigm invariants (MS-10) — still Procedural Cognitive Runtime properties
- Domain pack manifest schema structure (MS-2)
- `runtime:` block in DSL — still agent adapter binding (`engine`, `specialization_layer`, `hooks`)
- SDLC dogfood paths until P4 extraction

## Rationale

**Harness** matches existing docs ("runtime harness", "The harness is the architecture"). **Procedural-runtime** as package name implied the harness *is* the runtime, contradicting the adapter model and `--runtime cursor` flag semantics.

**Procedural Cognitive Runtime** remains the correct name for the *paradigm* — externalized expertise, deterministic gates, vertical composition. Removing it would weaken positioning; renaming only the installable artifact fixes the collision.

## Consequences

- ADR-030 terminology updated; artifacts renamed in same commit tranche
- `@jambu/harness` replaces `@jambu/procedural-runtime` in all contracts
- P1 extraction target: `packages/harness/` not `packages/procedural-runtime/`

## Artifacts updated

| File |
|---|
| `.sdlc/schemas/harness-identity.schema.json` (replaces `runtime-identity.schema.json`) |
| `.sdlc/templates/harness/` (replaces `templates/runtime/`) |
| `.sdlc/schemas/domain-pack.schema.json` |
| `.sdlc/templates/domain-packs/*.domain-pack.yaml` |
| `.sdlc/context/decisions/ADR-030-procedural-cognitive-runtime-skeleton.md` |

## Review

| Field | Value |
|---|---|
| Author | Cursor agent |
| Date | 2026-06-10 |
| Trigger | Operator agreement on harness vs procedural-runtime naming |
