# ADR-036: Capability Harness Documentation Topology

Status: ACCEPTED  
Date: 2026-06-15  
Extends: ADR-031, ADR-033, ADR-034  
Amends: ADR-034 (site count and docs audience split)  
Ticket: (architecture — docs topology session 2026-06-15)

## Context

ADR-034 assigned three public web surfaces. Engineering documentation currently ships entirely from `ai-native-sdlc/app/` at `ai-native-sdlc.org`. After ADR-033, **paradigm and kernel ownership moved to `jambu/harness`**, but the public docs corpus still reads as if the SDLC product repo owns generic harness architecture — operational layer, composition stack, runtime binding, materialization, context economics, and PCR thesis pages live under `ai-native-sdlc/docs/engineering/` and publish to `ai-native-sdlc.org`.

That conflation is wrong:

| Content kind | Owner repo | Wrong host today |
|---|---|---|
| Capability Harness spec, kernel, packs, `.harness/` | `jambu/harness` | `ai-native-sdlc.org` |
| SDLC Product (`@jambu/ai-native-sdlc`), goal-flow, delivery closure | `jambu/ai-native-sdlc` | mixed into same site |

The operator designates a **fourth public docs surface**:

```text
capabilityharness.dev/spec     — Capability Harness Specification (normative)
ch install --runtime cursor    — short CLI alias (coexists with harness)
```

**Public brand:** **Capability Harness** (docs domain). **Paradigm name** (thesis, ADRs): Procedural Cognitive Runtime Architecture — unchanged per ADR-031.

**Rejected:** Adding `platform-topology.md` to `ai-native-sdlc.org` — runtime platform framing belongs in ADR-035; it is not a docs-site deliverable.

## Decision

> **`capabilityharness.dev` is the canonical public documentation host for the Capability Harness (`@jambu/harness`, `.harness/`).** Source lives in `jambu/harness`. `ai-native-sdlc.org` retains **SDLC Product** documentation only, with links to Capability Harness docs for kernel concerns.

### 1. Public docs site matrix (amends ADR-034)

| Domain | Audience | Source repo | `target_root` | Role |
|---|---|---|---|---|
| **`capabilityharness.dev`** | Harness adopters, pack authors, kernel contributors | `jambu/harness` | `app/` (Starlight, to scaffold) | Spec, CLI, kernel, packs, paradigm engineering |
| `ai-native-sdlc.org` | SDLC product users, reference-impl adopters | `jambu/ai-native-sdlc` | `app/` | Product install, goal-flow, SDLC workflows, dogfood story |
| `jambu.ai` | Company / product marketing | `jambu/jambu-ai-homepage` | `.` | Brand, Agent Kernel narrative — links out to docs |
| `joaogabriellima.com` | Personal | `jambu/joao-personal-website` | `app/` | Independent |

**Invariant:** Generic harness content MUST NOT remain canonical on `ai-native-sdlc.org` after migration completes. SDLC site MAY republicate short summaries with links to `capabilityharness.dev`.

### 2. Where the spec lives

| Artifact | Authoritative path (repo) | Public URL |
|---|---|---|
| **Capability Harness Specification** | `jambu/harness/spec/` | `https://capabilityharness.dev/spec` |
| Kernel JSON Schemas | `jambu/harness/schemas/` | `https://capabilityharness.dev/schemas/proc/{name}` (target; see §5) |
| Paradigm + kernel ADRs | `jambu/harness/context/decisions/` | Republication in docs site `/decisions/` |
| Paradigm invariants | `jambu/harness/contracts/paradigm-invariants.yaml` | Linked from `/spec` |
| Engineering guides (migrated) | `jambu/harness/docs/engineering/` | `https://capabilityharness.dev/docs/engineering/...` |

**Authoring contract:** Same pattern as SDLC — markdown under `harness/docs/`, publish to Starlight under `harness/app/src/content/docs/`. Spec is **not** buried inside Starlight-only content; `spec/` is the normative source tree for the specification document(s), with `/spec` route generated from it.

### 3. CLI naming — `harness` and `ch` (extends ADR-031)

Both commands invoke the same kernel CLI:

```bash
harness install --runtime cursor   # primary — npm bin, scripts, CI
ch install --runtime cursor        # short alias — interactive / power-user
ch doctor
ch activate --pack energy-admin
```

| Surface | Name | Rationale |
|---|---|---|
| npm package | `@jambu/harness` | Stable package identity |
| Primary bin | `harness` | Explicit; avoids collision in generic `PATH` search |
| Short alias bin | `ch` | **C**apability **H**arness; ergonomic daily use |
| Directory | `.harness/` | Unchanged |
| Docs brand | Capability Harness | Public docs domain alignment |

**Normative:** `@jambu/harness` package.json MUST declare both `harness` and `ch` bin entries pointing to the same entrypoint. Documentation MAY lead with `ch` on `capabilityharness.dev` and `harness` in npm install instructions — both valid.

**Not renamed:** `@jambu/harness` npm name, `harness.yaml`, `/harness:*` command namespace in specialized products — `ch` is CLI alias only, not a second package or DSL prefix.

### 4. Content migration — SDLC docs → Capability Harness docs

Migrate from `ai-native-sdlc/docs/engineering/` to `harness/docs/engineering/` (then publish on `capabilityharness.dev`):

| Document | Disposition |
|---|---|
| `architecture.md` | **Move** — PCR thesis + harness decomposition (generic) |
| `operational-layer.md` | **Split** — kernel/pack/bundle → harness; SDLC `.sdlc/` dogfood → ai-native-sdlc |
| `composition-stack.md` | **Move** |
| `runtime-layer.md` | **Move** — adapter binding contract (generic) |
| `materialization.md` | **Split** — `harness install` / doctor → harness; SDLC init slots → ai-native-sdlc |
| `context-economics.md` | **Move** |
| `workflow-vs-runtime.md` | **Move** |
| `playbooks.md` | **Split** — playbook engine → harness; SDLC catalog paths → ai-native-sdlc |
| `gates.md` | **Split** — gate DSL kernel → harness; SDLC gate matrix → ai-native-sdlc |
| `cognitive-layer.md` | **Move** |
| `distribution.md` | **Split** — `@jambu/harness` / `ch install` → harness; `@jambu/ai-native-sdlc` → ai-native-sdlc |
| `observability.md` | **Split** — trace kernel → harness; SDLC trace UI → ai-native-sdlc |
| `integrations.md` | **Split** — lifecycle slots template → harness; SDLC materialized slots → ai-native-sdlc |
| `references-public.md` | **Move** (or duplicate index with link) |

**Stays on `ai-native-sdlc.org`:**

| Document | Reason |
|---|---|
| `how-it-works.md` | SDLC product entry — rewrite to link harness docs |
| `workflows.md` | SDLC workflow DSL (`goal-flow`, `feature-flow`) |
| `lifecycle.md` | SDLC product lifecycle |
| `delivery-closure.md` | ADR-028 product concern |
| Product-specific ADR index | SDLC repo ADRs only |

### 5. Schema `$id` namespace (amends ADR-034 §3)

| Namespace | Purpose | Target resolution host |
|---|---|---|
| `https://capabilityharness.dev/schemas/proc/` | Kernel / proc schemas | **Primary** after migration |
| `https://jambu.ai/schemas/proc/` | Legacy `$id` in shipped schemas | **Transitional** — HTTP redirect or alias to capabilityharness.dev |
| `https://jambu.ai/schemas/sdlc/` | SDLC product harness schemas | Unchanged — owned by `ai-native-sdlc` |

Harness repo schemas update `$id` on migration tranche; validators accept both during transition.

### 6. Cross-linking contract (extends ADR-034 §5)

| From | To | Required |
|---|---|---|
| `ai-native-sdlc.org` kernel sections (until migrated) | `capabilityharness.dev` | Yes — replace inline duplication with links |
| `ai-native-sdlc.org` install docs | `capabilityharness.dev/spec` | Recommended — "built on Capability Harness" |
| `jambu.ai` docs CTA | `capabilityharness.dev` + `ai-native-sdlc.org` | Harness first for kernel story; SDLC for reference impl |
| `capabilityharness.dev` | `ai-native-sdlc.org` | SDLC as reference Product implementation |
| `capabilityharness.dev/spec` | `jambu.ai/schemas/...` or `/schemas/proc/` | Schema resolution links |

### 7. Repo layout (target — `jambu/harness`)

```text
jambu/harness/
├── spec/                      # Capability Harness Specification (normative markdown)
├── docs/engineering/          # authoring corpus (migrated from ai-native-sdlc)
├── app/                       # Starlight site → capabilityharness.dev (to scaffold)
│   └── src/content/docs/
├── schemas/                   # authoritative JSON Schema files
├── context/decisions/         # paradigm ADRs (030–033, 036, …)
├── packages/harness/          # @jambu/harness — bins: harness + ch
└── .harness/                  # dogfood kernel dev
```

Deploy slot: Cloudflare Pages project `capability-harness-docs` (name TBD), same wrangler pattern as ADR-019.

### 8. Updated ecosystem snapshot

```text
Public surfaces:
  capabilityharness.dev  ← harness kernel docs + /spec     (ADR-036)
  ai-native-sdlc.org     ← SDLC product docs                 (ADR-034, narrowed)
  jambu.ai               ← marketing                         (ADR-034)
  joaogabriellima.com    ← personal                          (ADR-034)

Runtime (not public HTML):
  agent-runtime-gateway  ← platform API                      (ADR-035)
```

## Consequences

### Positive

- Docs ownership matches ADR-033 repo ownership
- `ch` gives ergonomic CLI without renaming npm package or `.harness/`
- SDLC site stops overclaiming paradigm ownership
- Spec has a stable URL independent of product releases

### Negative / migration

- Starlight scaffold required in `harness` repo (new `app/`)
- Large content move + redirect plan from `ai-native-sdlc.org` URLs
- Schema `$id` migration touches all kernel schema consumers
- Fourth CF Pages project + DNS for `capabilityharness.dev`
- `ch` bin must ship in next `@jambu/harness` publish

### Out of scope

- Executing content migration (separate epic / worktree in `harness`)
- gateway docs (ADR-035 — lives in gateway repo when needed)
- platform-topology page on any site

## Implementation Notes

### Phase D0 — ADR acceptance (this document)

INDEX + architecture memory updated; no file moves.

### Phase D1 — Harness docs scaffold

1. Create `harness/spec/README.md` (spec outline)
2. Scaffold `harness/app/` Starlight (profile `starlight`, mirror ADR-013 pattern)
3. Add `ch` bin to `packages/harness/package.json`
4. CF Pages project + DNS for `capabilityharness.dev`

### Phase D2 — Content migration

1. Move/split documents per §4 table
2. Rewrite `ai-native-sdlc/docs/engineering/how-it-works.md` as product entry
3. Strip migrated pages from `ai-native-sdlc/app/` or replace with stub + canonical link
4. Update `jambu-ai-homepage` doc links: `capabilityharness.dev` + `ai-native-sdlc.org`

### Phase D3 — Schema `$id`

1. Update `harness/schemas/*.schema.json` `$id` to `capabilityharness.dev`
2. Publish static schema mirror at `/schemas/proc/`
3. Redirect legacy `jambu.ai/schemas/proc/*` if DNS serves both

## Verification

Post-D1:

```bash
test -d ../harness/spec
grep -q '"ch"' ../harness/packages/harness/package.json
grep -q 'capabilityharness.dev' .sdlc/INDEX.md
```

Post-D2:

```bash
# Generic harness page canonical on harness docs, not SDLC
! grep -l 'MS-8 single active pack' app/src/content/docs/engineering/operational-layer.md 2>/dev/null || \
  grep -q 'capabilityharness.dev' app/src/content/docs/engineering/operational-layer.md
```

## Review

| Field | Value |
|---|---|
| Author | Cursor agent (architecture session) |
| Date | 2026-06-15 |
| Amends | ADR-034 site matrix (four docs/marketing surfaces) |
| Extends | ADR-031 (CLI alias), ADR-033 (harness owns docs source) |
| Trigger | Operator — capabilityharness.dev + spec placement + SDLC docs migration |
