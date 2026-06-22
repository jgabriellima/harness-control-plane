# ADR-033: Repository Topology — Harness as Paradigm Owner

Status: ACCEPTED  
Date: 2026-06-13  
Amends: ADR-030 (physical kernel colocation in `ai-native-sdlc`)  
Extends: ADR-030, ADR-031, ADR-032, ADR-011  
Ticket: (architecture — repository topology session 2026-06-13)

## Context

ADR-030 through ADR-032 established the **Procedural Cognitive Runtime** paradigm, the generic harness kernel (`@jambu/harness`), domain pack mechanics, and the workspace operating bundle (Runtime Adapter + Active Specialized Harness + Kernel). Artifact taxonomy is normative: **Kernel**, **Pack**, **Product** (ADR-032).

Physical layout did not follow logical ownership:

| Problem | Symptom |
|---|---|
| Kernel colocated in SDLC product repo | `.harness/` lives at `ai-native-sdlc/.harness/` — consumers infer SDLC owns the paradigm |
| Second product nested inside first | `business-workflows/` is a separate git remote (`business-workflow`) embedded in `ai-native-sdlc/` for sync convenience |
| Schema split-brain | Kernel JSON Schemas (`harness-identity`, `domain-pack`, `harness-storage`, …) reside under `ai-native-sdlc/.sdlc/schemas/` |
| P1 blocked on wrong host | Kernel `bin/` extraction (ADR-030 P1) would land in the SDLC monorepo, coupling every kernel release to SDLC CI |
| Paradigm ADRs in product tree | ADR-030/031/032 live under `ai-native-sdlc/.sdlc/context/decisions/` — paradigm reads as SDLC property |

ADR-032 correctly states that `@jambu/harness` and `@jambu/ai-native-sdlc` are **separate distribution contracts**. The repository topology must match that separation. **The harness kernel is the paradigm owner; all other repositories are subproducts** that depend on it — they do not define it.

### Transitional state (this ADR acceptance date)

```text
jambu/ai-native-sdlc/          # current workspace — contains transitional kernel copy
  .harness/                    # TO MIGRATE → jambu/harness/
  .sdlc/                       # STAYS — SDLC product harness (dogfood)
  business-workflows/          # TO EXTRACT → jambu/business-workflow/
  examples/                    # TO DELETE — archived, not CI
  app/                         # STAYS — SDLC product subject (docs site)
  packages/ai-native-sdlc/     # STAYS — SDLC npm distribution
```

## Decision

> **The `jambu/harness` repository is the sole owner of the Procedural Cognitive Runtime paradigm, kernel source, kernel schemas, and published domain packs.** All other `jambu/*` repositories are **subproducts** — closed Products or domain workspaces that **depend on** `@jambu/harness` and MUST NOT colocate kernel source or paradigm ADRs.

### 1. Normative repository topology

```text
jambu/
├── harness/                    # @jambu/harness — PARADIGM OWNER (kernel only)
│   ├── .harness/               # live dev skeleton + install template root
│   ├── packages/harness/       # npm distribution
│   ├── schemas/                # kernel JSON Schemas (MS-1, MS-2, MS-5, MS-9, …)
│   ├── contracts/              # paradigm-invariants.yaml (MS-10)
│   ├── context/decisions/      # paradigm + kernel ADRs (ADR-030+)
│   ├── packs/                  # published *.domain-pack.yaml artifacts (not repos)
│   └── bin/                    # harness_* kernel scripts (ADR-030 P1)
│
├── ai-native-sdlc/             # @jambu/ai-native-sdlc — SUBPRODUCT (SDLC)
│   ├── .sdlc/                  # product harness (dogfood)
│   ├── .cursor/                # runtime adapter (Cursor IDE)
│   ├── app/                    # subject: Starlight docs site
│   └── packages/ai-native-sdlc/
│
├── business-workflow/          # SUBPRODUCT (business control plane)
│   ├── .sdlc/                  # repo lifecycle (SDLC product as tooling)
│   ├── app/.business/          # domain harness (business.jambu/v1)
│   └── app/                    # subject + @cursor/sdk runtime
│
└── <product>/                  # future SUBPRODUCTS — sibling repos only
    OR activate pack from harness/packs/ — no nested products
```

**Invariant:** No subproduct repository contains a canonical `.harness/` tree, kernel `bin/` source, or paradigm ADR authoring surface. Subproducts may vendor a **installed** `.harness/` via `harness install` or npm dependency — not maintain kernel source.

### 2. Ownership matrix

| Asset | Owner repo | Subproduct access |
|---|---|---|
| Paradigm name + invariants | `harness/` | Read-only pin by version |
| Paradigm + kernel ADRs | `harness/context/decisions/` | Link / republication in product docs |
| Kernel JSON Schemas | `harness/schemas/` | Validate against published `$id`; no fork |
| Kernel `bin/` scripts | `harness/bin/` | Invoke via install; domain scripts via pack `bin_domain` |
| `*.domain-pack.yaml` (published) | `harness/packs/` | `harness packs add` from URL or path |
| SDLC workflows, gates, playbooks | `ai-native-sdlc/.sdlc/` | Product-internal |
| Business workflows, gates | `business-workflow/app/.business/` | Product-internal |
| Product npm packages | respective subproduct `packages/` | Independent semver |
| Engineering docs site | `ai-native-sdlc/app/` | Republication of paradigm docs; not ownership |

### 3. Subproduct taxonomy — Pack vs Product repo

ADR-032 artifact kinds apply at **distribution** layer. At **repository** layer:

| Subproduct kind | Repository criterion | Install path | Example |
|---|---|---|---|
| **Product** | Own `target_root` (app), own release cycle, own runtime adapter variant, materialized integrations | Closed product CLI (`ai-native-sdlc install`, `business-workflow install`) | `ai-native-sdlc`, `business-workflow` |
| **Pack** | Workflows + playbooks + gates + commands only; no standalone app; no custom SDK runtime | `harness packs add` + `harness activate` | `energy-admin.domain-pack.yaml` in `harness/packs/` |
| **Product (future)** | Same as Product row — sibling repo under `jambu/` | Own install contract | `energy-workflow/` if it ships app + SDK |

**Normative rule:** Do not create a sibling repo per domain by default. Create a **Product repo** only when the domain ships an application, custom runtime binding, or independent Plane/GitHub project. Otherwise publish a **Pack** artifact from `harness/packs/`.

**Forbidden:** Nested subproduct repos inside another subproduct (e.g. `ai-native-sdlc/business-workflows/`). Cross-repo sync via `sed` is a bootstrap workaround, not architecture.

### 4. Dependency contract (subproduct → kernel)

Every subproduct declares kernel dependency explicitly:

```yaml
# In product install manifest or specialized DSL metadata
kernel:
  package: "@jambu/harness"
  min_version: "0.1.0"
  install: harness install --runtime cursor   # or embedded in product install CLI
```

Subproducts MUST NOT:

- Fork kernel schemas into product trees as source of truth
- List kernel script names in product `bin/` without `domain-pack.spec.provides.bin_domain`
- Document product install as `harness activate sdlc` in consumer paths (ADR-032 preserved)
- Claim paradigm ownership in README, package name, or agent hydration

Subproducts MAY:

- Dogfood unreleased kernel via `file:` / workspace link during development
- Republic paradigm ADRs in docs site with version pin and link to `harness/` repo
- Use SDLC product harness (`.sdlc/`) as **repo tooling** without being the SDLC Product itself (see `business-workflow`)

### 5. Workspace operating bundle per repository

Each sibling repo opens **one** Cursor (or SDK) workspace with **one** active specialized harness:

| Workspace root | Active harness | Kernel | Runtime | Subject |
|---|---|---|---|---|
| `jambu/harness/` | `.harness/` (uninitialized) | in-repo source | Cursor IDE | `.` (kernel dev) |
| `jambu/ai-native-sdlc/` | `.sdlc/` | `@jambu/harness` dependency | Cursor IDE | `app/` |
| `jambu/business-workflow/` | `.sdlc/` + `app/.business/` | `@jambu/harness` dependency | `@cursor/sdk` in-process | `app/` |

MS-8 single active pack invariant applies **per workspace**, not across repos.

### 6. ADR-030 amendments (physical layout)

| ADR-030 claim | ADR-033 disposition |
|---|---|
| `.harness/` at `ai-native-sdlc` repo root is canonical | **Revoked.** Canonical kernel root is `jambu/harness/`. Colocation in `ai-native-sdlc` is transitional until migration M1 completes. |
| `.sdlc/templates/harness/` mirrors `.harness/` for npm | **Moved.** Mirror lives in `harness/packages/harness/templates/`. SDLC package no longer hosts kernel template source. |
| Kernel schemas under `.sdlc/schemas/` | **Moved.** Authoritative copies in `harness/schemas/`. Subproducts consume by version pin. |
| P1 extract kernel bin into `ai-native-sdlc/.harness/bin/` | **Superseded.** P1 executes in `jambu/harness/` only. |

ADR-031 naming and ADR-032 bundle model are **unchanged**.

## Consequences

### Positive

- Paradigm ownership is unambiguous: one repo, one npm package, one hydration entry for kernel agents
- Subproduct releases decouple from kernel CI
- `business-workflow` extraction removes dual-remote confusion
- P1–P4 implementation targets the correct repository on first execution
- New domains choose Pack vs Product repo with explicit criteria — no default copy-paste monorepo

### Negative / migration

- One-time move of `.harness/`, kernel schemas, paradigm ADRs, and P1 bin extraction
- Cross-repo integration smoke required (harness `@next` + subproduct dogfood)
- `ai-native-sdlc` INDEX, README, and agent hydration must stop listing `.harness/` as in-repo canonical
- `scripts/sync-business-workflows-sdlc.sh` must target `../business-workflow` after extraction
- `examples/` removal and reference cleanup in README, INDEX, CI

### Risk

- Premature repo split before `packages/harness/` publishes — mitigate with `file:` link and migration phase gates below
- ADR sprawl if product-specific ADRs stay in `harness/` — **product ADRs remain in subproduct repos**; only paradigm + kernel ADRs live in `harness/`

## Implementation Notes

### Migration phases

| Phase | Scope | Entry | Verification |
|---|---|---|---|
| **M0** | ADR-033 accepted; no file moves | This ADR | INDEX + architecture memory updated |
| **M1** | Create `jambu/harness` repo; move `.harness/`, kernel schemas, paradigm ADRs (030–033), `paradigm-invariants.yaml` | `git subtree split` or manual mv | `harness doctor` smoke; schemas validate |
| **M2** | P1 kernel `bin/` extract **in harness repo only** | `kernel-bin.manifest.yaml` | `pytest harness/bin/tests/` |
| **M3** | Publish `@jambu/harness@0.1.0`; remove `.harness/` from `ai-native-sdlc` | `packages/harness/` | `ai-native-sdlc` depends on `@jambu/harness` |
| **M4** | Extract `business-workflows/` → `jambu/business-workflow` sibling | existing `.git` remote | cross-repo sync script passes |
| **M5** | Delete `examples/`; README + INDEX topology rewrite | `examples/README.md` archived status | no CI references to `examples/` |

**Gate:** Do not start M2 in `ai-native-sdlc` if M1 is incomplete.

### Artifacts by destination (post-M1)

| Current path (`ai-native-sdlc`) | Destination (`harness`) |
|---|---|
| `.harness/**` | repo root `.harness/**` |
| `.sdlc/schemas/harness-*.schema.json` | `schemas/` |
| `.sdlc/schemas/domain-pack.schema.json` | `schemas/` |
| `.sdlc/schemas/runtime-binding.schema.json` | `schemas/` |
| `.sdlc/contracts/paradigm-invariants.yaml` | `contracts/` |
| `.sdlc/context/decisions/ADR-030..033` | `context/decisions/` |
| `.sdlc/templates/harness/**` | `packages/harness/templates/` |

| Stays in `ai-native-sdlc` | Role |
|---|---|
| `.sdlc/**` (minus moved schemas/ADRs) | SDLC product harness |
| `.cursor/**` | SDLC workspace runtime adapter |
| `app/**` | SDLC subject |
| `packages/ai-native-sdlc/**` | SDLC distribution |
| `docs/**` | SDLC + republication of paradigm engineering |

### Product ADR boundary

ADRs that describe **SDLC-specific** behavior (goal-flow, delivery closure, Starlight profile, Plane slots) remain in `ai-native-sdlc/.sdlc/context/decisions/`. After M1, copies in `harness/` are **not** maintained — subproducts link to their own ADR sets. Paradigm ADRs (generic kernel, pack, bundle topology) live only in `harness/`.

## Verification

Pre-migration (transitional — run in `ai-native-sdlc` today):

```bash
test -d .harness && test -f .harness/harness.yaml
python3 -c "import json; json.load(open('.sdlc/schemas/harness-identity.schema.json'))"
```

Post-M1 (run in `jambu/harness`):

```bash
test ! -d ../ai-native-sdlc/.harness || echo "WARN: transitional .harness/ still in SDLC repo"
python3 -c "import yaml; yaml.safe_load(open('.harness/harness.yaml'))"
python3 -c "import json; json.load(open('schemas/harness-identity.schema.json'))"
```

Post-M3:

```bash
# ai-native-sdlc must not contain kernel source
! test -d .harness
grep -q '@jambu/harness' packages/ai-native-sdlc/package.json
```

Post-M4:

```bash
test -d ../business-workflow/.git
! test -d business-workflows
```

## Review

| Field | Value |
|---|---|
| Author | Cursor agent (architecture session) |
| Date | 2026-06-13 |
| Amends | ADR-030 physical kernel colocation |
| Extends | ADR-032 subproduct model to repository layer |
| Preserves | ADR-031 naming; ADR-032 Kernel / Pack / Product taxonomy |
| Trigger | Operator-approved topology — harness owns paradigm; subproducts are siblings |
| Implementation | M0–M5 phased; M1+ deferred to harness repo creation |
