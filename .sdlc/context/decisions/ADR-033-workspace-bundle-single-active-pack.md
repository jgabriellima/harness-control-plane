# ADR-032: Workspace Bundle — Single Active Pack Invariant

Status: ACCEPTED  
Date: 2026-06-12  
Amends: ADR-030 (pack model, composition, SDLC classification)  
Extends: ADR-030, ADR-031, ADR-011, ADR-014, ADR-024  
Ticket: (architecture — design session 2026-06-12)

## Context

ADR-030 established the generic harness skeleton and domain pack manifest (MS-1, MS-2). Its pack model section treated **SDLC as Domain Pack `#1`**, described **`harness specialize --pack`** as the activation path, and left room for **multi-pack composition** (`bound_packs[]`, pack execution contract jurisdiction across simultaneous overlays).

A follow-on architecture session (2026-06-12) invalidated the multi-pack analysis as over-engineered. Operational reality in consumer workspaces is simpler and stricter:

| Problem | Symptom |
|---|---|
| Multi-pack composition | No verified use case; routing tables, PEC jurisdiction, and merge ordering add complexity without production demand |
| SDLC-as-pack narrative | Consumer docs imply SDLC is "pack #1" in a registry — conflates **product distribution** with **user-authored pack mechanics** |
| `specialize --pack` semantics | "Specialize" reads as additive overlay; workspace state requires **singular activation** with explicit lifecycle gates |
| Hand-authored hooks | `.cursor/hooks.json` edited directly; drift from harness DSL and active pack identity |
| Storage vs execution | Worktree execution and persistent harness state not formally separated in MS contracts |

The Procedural Cognitive Runtime paradigm (ADR-030, ADR-031) remains correct. This ADR corrects **workspace bundle topology**, **artifact taxonomy**, and **pack lifecycle** without renaming the harness CLI surface established in ADR-031.

## Decision

> A workspace operating bundle comprises **Agent Runtime Adapter** (`.cursor/`) + **exactly ONE Active Specialized Harness** + **Kernel** (infrastructure, often embedded). Multi-pack simultaneous composition is **revoked**. SDLC is a **Product**, not a pack in the consumer registry.

### 1. Workspace operating bundle (normative)

```text
Agent Runtime Adapter     .cursor/          hooks projection, rules, commands, skills, agents
        ↑ bound by
Active Specialized Harness  .sdlc/ | .energy/ | …   ONE harness_dir, ONE dsl_file, ONE command namespace
        ↑ materialized from
Kernel                      @jambu/harness     .harness/, harness install --runtime cursor
        ↑ governs
workspace.target_root       app/, systems/, …
```

**Invariant:** At most one specialized harness is **active** per workspace. Installed pack artifacts may exist in catalog form without being active.

### 2. Three artifact kinds — do not conflate

| Kind | Package / path | Role | Pack registry | Consumer install |
|---|---|---|---|---|
| **Kernel** | `@jambu/harness`, `.harness/` | Generic infrastructure: runner, gates, trace, baseline, playbook engine, INDEX, handoffs | N/A — not a pack | `harness install --runtime cursor` |
| **Pack** | User-authored `*.domain-pack.yaml` artifact | Domain vocabulary: workflows, playbooks, commands, gates, learn; installable, activatable, exportable | `packs.installed[]` | `harness packs add <artifact>` then `harness activate <pack-id>` |
| **Product (SDLC)** | `@jambu/ai-native-sdlc` | Pre-composed bundle for AI-native SDLC demo/product | **NOT in pack registry** | `ai-native-sdlc install` (separate distribution contract) |

**Normative separations:**

- SDLC is **NOT packable**, **NOT unpackable**, and **MUST NOT** appear as "domain pack #1" in consumer-facing paths or generic harness documentation.
- Monorepo `.sdlc/` is **product development harness** for dogfooding `@jambu/ai-native-sdlc` — not a demonstration of generic pack registry mechanics.
- `.sdlc/templates/domain-packs/sdlc.domain-pack.yaml` remains an **authoring reference** for pack schema validation and `/harness:pack` crystallization tests; it is not the SDLC product install path.

### 3. Pack lifecycle (MS-9)

Harness DSL (`harness.yaml` or active specialized DSL) carries pack state:

```yaml
packs:
  installed:
    - id: energy-admin
      artifact: .harness/packs/energy-admin-1.0.0.domain-pack.yaml
      version: "1.0.0"
      installed_at: "2026-06-12T00:00:00Z"
  active:
    id: energy-admin          # singular — null when uninitialized
    activated_at: "2026-06-12T01:00:00Z"
    harness_dir: .energy/
    dsl_file: energy.yaml
```

| Command | Effect |
|---|---|
| `harness packs add <artifact>` | Register in `packs.installed[]` only — no harness_dir materialization, no runtime rebind |
| `harness activate <pack-id>` | Materialize `harness_dir`, merge pack overlays into active DSL, rebind agent runtime adapter, regenerate hooks; **FAIL** if prior active pack has `in_progress` workflow run |
| `harness deactivate` | Tear down active binding (future; requires no in_progress runs) |

**Deprecated narrative (ADR-030 §3):** `harness specialize --pack` — replaced by **`harness activate`**. The word "specialize" implied additive multi-overlay; activation is **exclusive replacement** of the active harness identity.

### 4. `/harness:pack` — pack crystallization (MS-10)

Slash command **`/harness:pack`** (equivalent CLI: `harness pack export`) crystallizes in-repo domain work into an exportable pack artifact.

**Input scope (domain artifacts under active harness):**

- Workflows (`.harness/workflows/` or active `harness_dir/workflows/`)
- Playbooks (`playbooks/`)
- Commands, skills, agents (under `{specialization_layer}/`)
- Gates (`gates/`)
- Learn artifacts (`learn/`)

**Export gates (all MUST pass before artifact write):**

| Gate | Check |
|---|---|
| Schema validation | Output validates against `.sdlc/schemas/domain-pack.schema.json` |
| Paradigm invariants MS-10 | No violation of `.sdlc/contracts/paradigm-invariants.yaml` |
| Doctor pass | `harness doctor --pack-export` (future subcommand) |
| Contamination check | No kernel script names in `provides.bin_domain`; no SDLC product paths leaked into generic pack when exporting from non-SDLC workspace |

Output: versioned `*.domain-pack.yaml` suitable for `harness packs add`.

### 5. Meta-structures (MS-5 through MS-10)

| MS | Name | Contract |
|---|---|---|
| MS-5 | Storage Contract | `storage.root`, layout templates, retention policies declared in harness DSL — persistent state anchor |
| MS-6 | Runtime Binding | `runtime-binding.yaml` stamp, `hooks.manifest.yaml` source; `harness bind` generates `.cursor/hooks.json` — not hand-authored |
| MS-7 | Workspace Execution | `workspace.worktrees` DSL; dual-root model: **worktree = execution**, **storage.root = persistence**; evidence always under `storage.root` |
| MS-8 | Single Active Pack Invariant | Replaces multi-pack composition; revokes `bound_packs[]`, PEC multi-pack jurisdiction, composition merge across simultaneous packs |
| MS-9 | Pack Registry | `packs.installed[]` vs `packs.active.id` in harness DSL; schema extension to `harness.yaml` / specialized DSL |
| MS-10 | Pack Authoring | `/harness:pack` crystallization protocol; extends paradigm invariants enforcement to export path |

MS-1 through MS-4 and MS-10 paradigm invariants from ADR-030 remain; MS-10 gains an export enforcement surface. MS-3 (lifecycle slots), MS-4 (bootstrap) unchanged in substance.

### 6. Hooks layer (MS-6 implementation)

```text
hooks.manifest.yaml     source of truth (kernel + active pack handlers)
        ↓ harness bind
.cursor/hooks.json      GENERATED projection for Cursor adapter
        ↓ dispatches
.cursor/hooks/*.sh      thin shims → .harness/bin/hook_handler.py (kernel)
                        → active pack bin handlers when declared
```

**Normative rules:**

- `.cursor/hooks.json` is a **generated projection**, not authoritative configuration. Hand-editing is forbidden in consumer workspaces; regeneration occurs on `harness activate` and `harness bind`.
- Dispatcher routes to **kernel handlers + active pack handlers only** — no multi-pack routing table.
- Hook logic lives in harness `bin/`; `.cursor/hooks/` contains adapter shims with stable paths for Cursor hook API.
- Trace/SSE observability remains **kernel responsibility** — packs emit events through kernel trace API, not parallel SSE servers.

### 7. ADR-030 amendments (explicit revocations)

| ADR-030 claim | ADR-032 disposition |
|---|---|
| SDLC is Domain Pack `#1` | **Revoked for consumer paths.** SDLC is Product (`@jambu/ai-native-sdlc`). Pack template is authoring reference only. |
| `harness specialize --pack` | **Deprecated.** Use `harness activate <pack-id>`. |
| Multi-pack composition (`bound_packs[]`, PEC jurisdiction) | **Revoked.** MS-8 single active pack invariant. |
| `composition.layers` merge across packs | **Single active pack overlay only.** Installed catalog does not contribute runtime behavior until activated. |

ADR-031 naming (`harness`, `.harness/`, `harness.yaml`, `@jambu/harness`) is **unchanged**.

## Consequences

**Positive**

- Workspace state is inspectable: one `packs.active.id`, one `harness_dir`, one command namespace.
- Product (SDLC) and pack mechanics decouple — generic harness docs stay domain-neutral.
- Hooks regeneration eliminates adapter drift after pack switches.
- Dual-root (MS-7) clarifies where evidence and workflow runs persist vs where code executes.

**Negative / migration**

- ADR-030 P3 scope shifts from `specialize` merge engine to `activate` lifecycle with in_progress workflow guard.
- `.sdlc/templates/domain-packs/sdlc.domain-pack.yaml` documentation must stop implying SDLC consumer install via pack registry.
- Existing hand-authored `.cursor/hooks.json` in dogfood repo migrates to generated form in P3.
- Multi-pack design artifacts (if any) must be deleted or marked superseded.

**Risk**

- Operators attempting simultaneous domain overlays must use **workspace split** (separate repos/worktrees), not multi-pack composition — document explicitly in harness doctor.

## Implementation Notes

Phased execution aligned with ADR-030 extraction; phase numbers continue from kernel foundation (P1). **P1 (kernel bin extraction) is prerequisite** — not repeated here.

### P2 — Identity paths and storage contract (MS-5, MS-7)

| Step | Entry | Output |
|---|---|---|
| P2.1 | `_harness_paths.py` reads `identity` + `packs.active` from DSL | All bin scripts resolve `harness_dir`, `storage.root`, `dsl_file` from active identity |
| P2.2 | Extend `harness.yaml` schema with `storage:` block | `storage.root`, evidence path template, handoff retention |
| P2.3 | Extend `workspace.worktrees` in DSL | Document dual-root: worktree path vs `storage.root`; evidence writes always under `storage.root` |
| P2.4 | Update `.sdlc/schemas/harness-identity.schema.json` if needed | `packs` registry fields (MS-9) |

**Verification:** `python3 .harness/bin/harness_paths.py resolve --json` returns consistent paths for uninitialized and SDLC dogfood layouts.

### P3 — Activate lifecycle and runtime binding (MS-6, MS-8, MS-9)

| Step | Entry | Output |
|---|---|---|
| P3.1 | `harness activate <pack-id>` CLI | Materialize harness_dir, merge pack overlays, set `packs.active`, fail on in_progress workflow |
| P3.2 | `hooks.manifest.yaml` + `harness bind` | Regenerate `.cursor/hooks.json` from kernel + active pack manifest |
| P3.3 | Replace `.cursor/hooks/` heavy logic with shims | Dispatch to `.harness/bin/hook_handler.py` |
| P3.4 | Deprecate `harness specialize --pack` | Print migration message → `harness activate` |
| P3.5 | Remove multi-pack composition fields from schemas/docs | Delete `bound_packs[]` references |

**Verification:**

```bash
harness packs add .sdlc/templates/domain-packs/energy-admin.domain-pack.yaml
harness activate energy-admin
test "$(python3 -c "import yaml; print(yaml.safe_load(open('.harness/harness.yaml'))['packs']['active']['id'])")" = "energy-admin"
harness bind --dry-run  # prints hooks.json diff
```

### P4 — Pack export and product install split (MS-10)

| Step | Entry | Output |
|---|---|---|
| P4.1 | `/harness:pack` command + `harness pack export` CLI | Crystallization pipeline with export gates |
| P4.2 | `harness doctor --pack-export` | MS-10 + contamination checks |
| P4.3 | npm install split documentation | `@jambu/harness` vs `@jambu/ai-native-sdlc` — separate distribution contracts |
| P4.4 | Update consumer docs | Remove "SDLC pack #1" from install paths; document Product vs Pack vs Kernel table |

**Verification:**

```bash
harness pack export --out /tmp/test-pack.domain-pack.yaml
python3 -c "import json, jsonschema, yaml; s=json.load(open('.sdlc/schemas/domain-pack.schema.json')); d=yaml.safe_load(open('/tmp/test-pack.domain-pack.yaml')); jsonschema.validate(d, s)"
harness doctor --pack-export /tmp/test-pack.domain-pack.yaml
```

### Artifacts (new or extended)

| File | Role |
|---|---|
| `.sdlc/schemas/harness-identity.schema.json` | MS-9 `packs.installed`, `packs.active` |
| `.sdlc/schemas/domain-pack.schema.json` | MS-2 unchanged structure; MS-10 export target |
| `.harness/contracts/runtime-binding.schema.json` | MS-6 stamp format (new) |
| `.harness/templates/hooks.manifest.yaml` | MS-6 source template (new) |
| `.cursor/commands/harness-pack.md` | `/harness:pack` slash command spec (new) |
| `.sdlc/context/decisions/ADR-032-workspace-bundle-single-active-pack.md` | This ADR |

## Verification

Schema and contract smoke tests (run from repo root):

```bash
python3 -c "import json; json.load(open('.sdlc/schemas/harness-identity.schema.json'))"
python3 -c "import json; json.load(open('.sdlc/schemas/domain-pack.schema.json'))"
python3 -c "import yaml; yaml.safe_load(open('.harness/harness.yaml'))"
python3 -c "import yaml; yaml.safe_load(open('.sdlc/contracts/paradigm-invariants.yaml'))"
grep -r 'bound_packs' .harness/ .sdlc/schemas/ .sdlc/templates/harness/ 2>/dev/null && exit 1 || true
grep -r 'specialize --pack' .harness/README.md .sdlc/templates/harness/README.md 2>/dev/null | grep -v DEPRECATED && exit 1 || true
```

Post-P3 integration (when implemented):

```bash
harness doctor
harness bind --check  # hooks.json matches hooks.manifest.yaml
python3 .harness/bin/harness_workflow_run.py status --json  # in_progress guard before activate switch
```

## Review

| Field | Value |
|---|---|
| Author | Cursor agent (Implementer / architecture session) |
| Date | 2026-06-12 |
| Amends | ADR-030 pack model, composition, SDLC-as-pack consumer narrative |
| Preserves | ADR-031 harness naming unchanged |
| Trigger | Operator-approved design session — single active pack, three artifact kinds |
| Implementation | P2–P4 deferred; P1 prerequisite unchanged |
