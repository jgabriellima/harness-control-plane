# ADR-030: Generic Harness Skeleton — Kernel Boundary and Domain Pack Contract

Status: ACCEPTED  
Date: 2026-06-10  
Amended by: ADR-031 (harness naming), ADR-032 (single active pack; pack activation supersedes additive specialize; SDLC reclassified as Product), ADR-033 (kernel repo ownership — `jambu/harness` replaces colocation in `ai-native-sdlc`)  
Extends: ADR-011, ADR-014, ADR-024  
Ticket: (architecture — pre-implementation)

## Context

The repository documents a **Procedural Cognitive Runtime Architecture**: a paradigm for governed long-horizon cognitive execution through workflows, gates, playbooks, skills, commands, agents, hooks, handoffs, trace, and baseline versioning.

That paradigm materializes as a **harness** — operational infrastructure specialized over an **agent runtime adapter** (Cursor, Claude). ADR-031 clarifies naming: the installable skeleton is `harness`, not `procedural-runtime`; the paradigm name stays Procedural Cognitive Runtime Architecture.

ADR-011 introduced a two-phase model (CLI install → agent init). The npm template approximates an uninitialized skeleton but ships **SDLC-specialized**, not domain-neutral:

| Leak | Example |
|---|---|
| Directory naming | `.sdlc/`, `sdlc.yaml`, `sdlc_*` scripts hardcoded in `_sdlc_paths.py` |
| API branding | `apiVersion: sdlc.jambu/v1` on all workflow resources |
| Bootstrap flow | `bootstrap-flow.yaml` installs Sentry, Playwright, Astro in `target_root` |
| Lifecycle catalog | `lifecycle-slots.schema.json` enumerates SDLC slots only |
| Constraints | `worktrees_mandatory`, `no_direct_commits_to_main` in generic template |
| bin/ mix | ~20 kernel scripts co-located with ~23 SDLC-domain scripts |
| Domain mirroring | `sync-business-workflows-sdlc.sh` uses `sed sdlc_* → business_*` |

The cognitive orchestration paradigm is proven. The **kernel vs domain pack** separation is not.

## Decision

> We adopt the **Generic Harness Skeleton** as the domain-neutral harness base installed before specialization, and the **Domain Pack Manifest** as the validated contract for overlaying domain vocabulary onto that skeleton. **SDLC** (`@jambu/ai-native-sdlc`) is a **closed Product** with its own permanent distribution path — not a consumer-facing pack slot (ADR-032). The harness kernel is not defined by SDLC.

### 1. Four-layer model (normative)

```text
Paradigm             Procedural Cognitive Runtime Architecture
    ↓ materializes as
Generic Harness      runner, gates, playbook engine, trace, baseline, INDEX, handoffs
    ↓ specializes via Domain Pack
Domain Pack          workflows, slots, playbooks, domain gates, agents, constraints
    ↓ binds to Agent Runtime (--runtime cursor)
    ↓ governs
workspace.target_root
```

### 2. Harness Identity Contract (MS-1)

Schema: `.sdlc/schemas/harness-identity.schema.json` (ADR-031)

| Field | Skeleton default | SDLC pack overlay |
|---|---|---|
| `id` | `harness` | `sdlc` |
| `harness_dir` | `.harness/` | `.sdlc/` (compatibility) |
| `dsl_file` | `harness.yaml` | `sdlc.yaml` |
| `cli_prefix` | `harness` | `sdlc` |
| `command_namespace.lifecycle` | `/harness:` | `/sdlc:` |
| `command_namespace.capabilities` | `/run:` | `/run:` |
| `api_version` | `proc.jambu/v1` | `sdlc.jambu/v1` |

The DSL block `runtime.engine` remains the **agent runtime adapter** — distinct from harness identity.

### 3. Domain Pack Manifest (MS-2)

Validated against `.sdlc/schemas/domain-pack.schema.json`. Reference: `.sdlc/templates/domain-packs/sdlc.domain-pack.yaml`

```bash
harness install --runtime cursor
harness packs add <artifact>
harness activate <pack-id>
```

`@jambu/ai-native-sdlc` is a **permanent, closed product distribution** — a pre-composed bundle installed via `ai-native-sdlc install --runtime cursor`. Consumers do not assemble SDLC from `harness install` + pack activation. `@jambu/harness` is the separate generic kernel for pack-based workspaces. Both packages coexist indefinitely; neither supersedes the other. See ADR-032.

### 4. Paradigm Invariants (MS-10)

`.sdlc/contracts/paradigm-invariants.yaml` — Procedural Cognitive Runtime properties no domain pack may violate.

### 5. Kernel script boundary

Kernel manifest: `.harness/bin/kernel-bin.manifest.yaml` — lists kernel scripts only.

Domain bin scripts are declared exclusively in domain pack `provides.bin_domain` (see `.sdlc/templates/domain-packs/sdlc.domain-pack.yaml`). The generic harness manifest MUST NOT enumerate domain-specific script names.

### 6. Generic bootstrap flow (MS-4)

Template: `.sdlc/templates/harness/workflows/harness-bootstrap-flow.yaml`

SDLC `bootstrap-flow.yaml` remains until `@jambu/harness` extraction.

### 7–13. (MS-3 through MS-9)

Unchanged in substance from original ADR-030 — lifecycle slots as domain extension, constraint profiles, doctor taxonomy, source_of_truth, composition registry, merge protocol, SDLC reclassification.

See ADR-031 for naming amendments. SDLC reclassification summary:

| Before | After |
|---|---|
| `.sdlc/` is the product | `.sdlc/` is SDLC product harness dir (monorepo dogfood) |
| `@jambu/ai-native-sdlc` is the runtime | `@jambu/ai-native-sdlc` is closed Product — permanent install path, not harness + pack |
| business-workflows sed sync | domain pack on harness kernel (future) |

No behavioral change until P1–P5 implementation.

## Implementation Notes

### Artifacts

| File | Role |
|---|---|
| `.sdlc/schemas/harness-identity.schema.json` | MS-1 |
| `.sdlc/schemas/domain-pack.schema.json` | MS-2 |
| `.sdlc/contracts/paradigm-invariants.yaml` | MS-10 |
| `.harness/harness.yaml` | Skeleton DSL |
| `.harness/` (repo root) | Live zeroed generic skeleton |
| `.sdlc/templates/harness/` | npm sync mirror of `.harness/` |
| `.sdlc/templates/harness/kernel-bin.manifest.yaml` | Kernel inventory |
| `.sdlc/templates/harness/workflows/harness-bootstrap-flow.yaml` | Generic bootstrap |
| `.sdlc/templates/domain-packs/sdlc.domain-pack.yaml` | Authoring reference (not SDLC product install path; see ADR-032) |
| `.sdlc/context/decisions/ADR-031-harness-naming-over-procedural-runtime.md` | Naming amendment |

### Deferred tickets

| Phase | Scope |
|---|---|
| P1 | `packages/harness/` extract kernel bin + templates |
| P2 | `_sdlc_paths.py` → identity-aware `_harness_paths.py` |
| P3 | `harness specialize` CLI + merge engine |
| P4 | Product vs kernel npm docs — `@jambu/ai-native-sdlc` closed product; `@jambu/harness` generic kernel (ADR-032) |
| P5 | business-workflows as domain pack #2 |

## Verification

```bash
python3 -c "import json; json.load(open('.sdlc/schemas/harness-identity.schema.json'))"
python3 -c "import json; json.load(open('.sdlc/schemas/domain-pack.schema.json'))"
python3 -c "import yaml; yaml.safe_load(open('.sdlc/templates/harness/harness.yaml'))"
python3 -c "import yaml; yaml.safe_load(open('.sdlc/templates/domain-packs/sdlc.domain-pack.yaml'))"
```

## Review

| Field | Value |
|---|---|
| Author | Cursor agent |
| Date | 2026-06-10 |
| Amended | ADR-031 same date |
