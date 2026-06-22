# ADR-041: SDLC Product Scope Separation — Docs Channel and Cognitive Trace Observer

**Status:** ACCEPTED  
**Date:** 2026-06-20  
**Amends:** ADR-013 (Starlight profile host), ADR-034 (repository topology §5 workspace table, § migration M5+)  
**Extends:** ADR-011, ADR-032, ADR-035, ADR-037, ADR-039  
**Cross-references:** ADR-039 (business) Control plane install model — `@jambu/control-plane` in `jambu/harness-control-plane`  
**Ticket:** (architecture — product scope separation session 2026-06-20)

---

## Problem statement

`jambu/ai-native-sdlc` colocates three separable concerns with independent release cycles, audiences, and CI surfaces. Treating the repository as "the SDLC product" is factually wrong today:

| Concern | Current path | Actual role | Violation |
|---|---|---|---|
| **SDLC harness + distributable CLI** | `.sdlc/`, `packages/ai-native-sdlc/` | Product: workflows, gates, playbooks, `ai-native-sdlc install` | Correct owner — should be the **only** scope |
| **Public docs + landing** | `app/` (Starlight) | Channel: `ai-native-sdlc.org` — install guides, goal-flow docs, dogfood narrative | Channel surface embedded in Product repo |
| **Session cognitive trace observer** | `packages/ai-native-sdlc/trace-ui/`, `trace-server.ts`, `trace-model.ts` | Platform UI: HTTP `:9473`, reads `.sdlc/trace/events.jsonl`, SSE to browser during Cursor sessions | Observability product bundled inside npm install artifact |

### Symptoms

| Symptom | Location | Impact |
|---|---|---|
| Product identity conflation | `.sdlc/sdlc.yaml` → `project.name: ai-native-sdlc-docs` while repo is named SDLC product | Agents and operators infer docs site IS the product |
| npm bundle bloat | `packages/ai-native-sdlc/package.json` → `files: [trace-ui/dist]` + `build:trace-ui` copies ~10k assets into `templates/sdlc/trace-ui/` | Every SDLC install ships a full React observability app unrelated to workflow execution |
| Deploy CI on wrong repo | `.github/workflows/deploy.yaml` → `working-directory: app`, Cloudflare Pages | Product repo CI gates tied to Starlight build, not harness doctor |
| Playbook path coupling | `pb.docs.product-shell-design`, `pb.sdlc.cognitive-trace-bridge` | Domain playbooks reference `packages/.../trace-ui/` and `app/src/styles/observability-tokens.css` inside SDLC repo |
| Duplicate observability story | trace-ui (session JSONL, `:9473`) vs `@jambu/control-plane` (workflow traces, workspace console) | No normative boundary; future merges blocked by colocation |
| ADR-037 content split without repo split | Harness docs → `capabilityharness.dev`; SDLC docs stay in same repo as harness | Content migration planned; **repository** boundary never decided |

ADR-034 M1–M5 extracted kernel, business-workflow, and deleted `examples/`. **`app/` and trace-ui were explicitly left in `ai-native-sdlc`** as transitional dogfood (ADR-034 § "Stays in ai-native-sdlc"). That transitional state is now technical debt — not intentional architecture.

---

## Decision

> **`jambu/ai-native-sdlc` MUST contain only the SDLC Product harness (`.sdlc/`), runtime adapter (`.cursor/`), and distributable npm package (`packages/ai-native-sdlc/`).** Public documentation (`ai-native-sdlc.org`) and the cognitive trace observer (`:9473`) MUST live in **sibling ecosystem repositories** with independent semver, CI, and deploy pipelines.

### 1. Normative repository topology (amends ADR-034)

```text
jambu/
├── ai-native-sdlc/                    # Product — SDLC harness ONLY
│   ├── .sdlc/                         # active specialized harness (dogfood)
│   ├── .cursor/                       # runtime adapter
│   ├── packages/ai-native-sdlc/     # @jambu/ai-native-sdlc — CLI + templates (NO trace-ui)
│   └── output/                        # deliverables root (ADR-039)
│
├── ai-native-sdlc-docs/               # Channel — ai-native-sdlc.org
│   ├── app/                           # Starlight SSG (migrated from ai-native-sdlc/app/)
│   ├── .sdlc/                         # repo lifecycle harness (optional tooling)
│   └── .github/workflows/             # Cloudflare Pages deploy (migrated)
│
├── ai-native-sdlc-observer/                     # Platform — session cognitive trace
│   ├── packages/
│   │   ├── trace-ui/                  # @jambu/sdlc-trace-ui — React/Vite UI
│   │   └── trace-server/              # @jambu/sdlc-trace-server — HTTP + SSE + trace model
│   └── .github/workflows/             # build + publish observer packages
│
└── harness-control-plane/             # Product — @jambu/control-plane (EXISTING, ADR-039)
    └── ...                            # workspace operating console — NOT a substitute for trace-ui
```

**Forbidden after migration completes:**

- `app/` directory in `jambu/ai-native-sdlc`
- `packages/ai-native-sdlc/trace-ui/` or embedded `templates/sdlc/trace-ui/dist/` in SDLC npm tarball
- Cloudflare Pages deploy workflows targeting `ai-native-sdlc/app/`
- Playbooks that mutate `ai-native-sdlc/app/` as SDLC product subject

### 2. Layer assignment (ecosystem registry)

| Repository | Layer | npm package | Public surface | Git remote (target) |
|---|---|---|---|---|
| `ai-native-sdlc` | Product | `@jambu/ai-native-sdlc` | none (CLI + harness) | `jambu-ai/ai-native-sdlc` |
| `ai-native-sdlc-docs` | Channel | (private workspace) | `ai-native-sdlc.org` | `jgabriellima/ai-native-sdlc-docs` |
| `ai-native-sdlc-observer` | Platform | `@jambu/sdlc-trace-ui`, `@jambu/sdlc-trace-server` | local `:9473` during sessions | `jgabriellima/ai-native-sdlc-observer` |
| `harness-control-plane` | Product | `@jambu/control-plane` | Tauri + SSR API | `jgabriellima/harness-control-plane` |

Update `jambu/docs/ecosystem/repository-map.md` when M6 creates repos.

### 3. trace-ui vs control plane — normative boundary

These are **complementary surfaces**, not duplicates. ADR-041 does **not** merge them.

| Dimension | `@jambu/sdlc-trace-*` (ai-native-sdlc-observer) | `@jambu/control-plane` (harness-control-plane) |
|---|---|---|
| **Trigger** | Cursor `sessionStart` hook → `sdlc_trace_ensure.py` | Operator opens control plane / Tauri app |
| **Data source** | `.sdlc/trace/events.jsonl` (live session spans) | Harness storage: workflow manifests, `tracesDir/*.yaml`, workspace binding |
| **Transport** | Local HTTP `:9473`, SSE `/api/events/stream` | SSR API + workspace-scoped routes |
| **Audience** | Agent session co-pilot (developer at keyboard) | Workspace operator (projects, chat, artifacts, scheduling) |
| **Lifecycle** | Ephemeral per IDE session | Persistent install, multi-workspace |
| **Domain coupling** | SDLC trace schema (`TraceSpan`, subagent registry) | Domain-neutral via `resolveHarnessBinding()` |

**Phase C (optional, separate ADR):** Converge shared components (design tokens, run pipeline viz) via npm dependency — not repo merge — unless a future ADR explicitly retires session-local trace-ui.

### 4. Workspace binding after separation

#### `jambu/ai-native-sdlc` (Product — harness-only subject)

```yaml
workspace:
  target_root: .
  profile: product-harness
```

| Key | Value |
|---|---|
| `workspace.target_root` | `.` (repo root — no web app subject) |
| `workspace.profile` | `product-harness` (new label: harness dogfood, no Starlight CI templates) |
| Active harness | `.sdlc/sdlc.yaml` |
| Deploy surface | none — release via npm `@jambu/ai-native-sdlc` + harness baseline tags |

**Amends ADR-013:** Starlight profile no longer applies to `ai-native-sdlc`. ADR-013 remains valid for **any** repo whose `target_root` hosts Starlight — ownership moves to `ai-native-sdlc-docs`.

#### `jambu/ai-native-sdlc-docs` (Channel)

```yaml
workspace:
  target_root: app
  profile: starlight
project:
  name: ai-native-sdlc-docs
  stack:
    observability: none
```

Inherits ADR-013, ADR-019 (Cloudflare Pages), ADR-035 row for `ai-native-sdlc.org`. Content scope per ADR-037: **SDLC Product documentation only** — kernel content links to `capabilityharness.dev`.

#### `jambu/ai-native-sdlc-observer` (Platform)

```yaml
workspace:
  target_root: packages/trace-ui
  profile: vite-spa
```

Observer repo MAY dogfood `.sdlc/` for its own release lifecycle but MUST NOT ship SDLC workflow templates.

### 5. Install and runtime contract changes

#### SDLC package (`@jambu/ai-native-sdlc`) — slim distribution

**Remove from npm `files`:**

- `trace-ui/dist`
- `templates/sdlc/trace-ui/**`

**Remove scripts:**

- `build:trace-ui` from default `npm run build` (tsc-only for product package)

**Retain in SDLC repo (thin delegation):**

- `.sdlc/bin/sdlc_trace_ensure.py` — spawns observer, not embeds UI
- `ai-native-sdlc trace` subcommand — **delegates** to `@jambu/sdlc-trace-server` (peer or optional dependency)

#### Observer install resolution (normative precedence)

`sdlc_trace_ensure.py` and `trace-server` resolve UI static root in order:

1. `{workspace}/.sdlc/trace-ui/dist` — materialized by explicit `ai-native-sdlc-observer install` (optional)
2. `@jambu/sdlc-trace-server` package `node_modules` path (npm install)
3. `file:` sibling link during ecosystem dev (`../ai-native-sdlc-observer/packages/trace-server`)

**Failure mode:** If observer packages not installed, session-start hook logs actionable message — SDLC workflows MUST NOT fail. Trace dashboard is optional observability, not a gate.

#### SDLC install questionnaire (extends ADR-029)

Add optional slot:

```yaml
integrations:
  ai-native-sdlc-observer:
    status: active | skipped
    serves_slots: [session_trace]
    install: npm install @jambu/sdlc-trace-server@^1.0.0
```

Default for new consumers: `active` (recommended). Authoring repo during M7 transition: `file:../ai-native-sdlc-observer/packages/trace-server`.

### 6. CI and deploy migration

| Workflow | Current host | Destination |
|---|---|---|
| `.github/workflows/deploy.yaml` | `ai-native-sdlc/app/` | `ai-native-sdlc-docs/.github/workflows/deploy.yaml` |
| `.github/workflows/e2e.yaml` (Starlight smoke) | `ai-native-sdlc/app/e2e/` | `ai-native-sdlc-docs/app/e2e/` |
| `.github/workflows/validate.yaml` (app typecheck) | split | docs repo: app build; SDLC repo: `packages/ai-native-sdlc` tsc + `python3 .sdlc/bin/sdlc_doctor.py` |
| `.github/workflows/release.yaml` | combined | SDLC repo: npm `@jambu/ai-native-sdlc`; observer repo: `@jambu/sdlc-trace-*` |

SDLC repo CI MUST NOT require Starlight build after M6 completes.

### 7. Playbook and template updates

| Playbook | Change |
|---|---|
| `pb.docs.product-shell-design` | `extract-trace-ui-tokens` reads `ai-native-sdlc-observer/packages/trace-ui/tailwind.config.js` |
| `pb.docs.starlight-shell-engineering` | Target repo `ai-native-sdlc-docs/app/` |
| `pb.sdlc.cognitive-trace-bridge` | Observer repo owns UI components; SDLC playbook references npm package API |
| `pb.docs.architecture-artistry` | Content paths under docs repo `app/src/content/docs/` |

Sync script `packages/ai-native-sdlc/scripts/sync-templates.sh` MUST stop copying trace-ui dist into SDLC templates in M7.

### 8. Cross-repo dependency edges

```text
@jambu/harness
  ↑
  ├── @jambu/ai-native-sdlc          (Product — workflows, install)
  └── @jambu/sdlc-trace-server       (reads harness trace paths — no harness fork)

@jambu/sdlc-trace-server
  ↑ serves static
  └── @jambu/sdlc-trace-ui

@jambu/ai-native-sdlc
  ↑ optional peer at install
  └── @jambu/sdlc-trace-server

ai-native-sdlc-docs
  ↑ content links only (no npm dependency)
  └── ai-native-sdlc.org → documents @jambu/ai-native-sdlc install

harness-control-plane
  ↑ independent (ADR-039 binding)
  └── reads workspace harness traces — no dependency on ai-native-sdlc-observer
```

---

## Migration phases

Gate: M6 MUST NOT start until ADR-041 is ACCEPTED and INDEX + ecosystem `repository-map.md` updated.

| Phase | Scope | Entry | Verification |
|---|---|---|---|
| **M6** | Create `jambu/ai-native-sdlc-docs`; `git subtree split` or `git mv` of `app/`, related `.github/workflows/deploy.yaml`, `e2e` job paths; scaffold `.sdlc/sdlc.yaml` with `target_root: app`, `profile: starlight` | New repo init | `cd ai-native-sdlc-docs/app && npm run build`; Cloudflare Pages staging PASS |
| **M6b** | Rebind `ai-native-sdlc`: remove `app/`; set `target_root: .`, `profile: product-harness`; run `sdlc_workspace_rebind.py` | After M6 deploy green | `python3 .sdlc/bin/sdlc_doctor.py` PASS; no `app/` directory |
| **M7** | Create `jambu/ai-native-sdlc-observer`; move `trace-ui/`, `trace-server.ts`, `trace-model.ts`, `trace-workspace-context.ts`, `trace.ts` CLI surface; publish `@jambu/sdlc-trace-server@1.0.0` | Observer repo init | `npm run build` in observer; `ai-native-sdlc trace --no-open` serves UI from npm path |
| **M7b** | Slim `@jambu/ai-native-sdlc` package; update `sdlc_trace_ensure.py` delegation; remove `templates/sdlc/trace-ui/` from distributable | M7 packages publish | `npm pack` tarball excludes trace-ui; install smoke PASS |
| **M8** | Playbook path rewrites; ecosystem docs; remove transitional symlinks; baseline tag `v0.32.0-sdlc` | M6b + M7b complete | grep confirms no `trace-ui` under `packages/ai-native-sdlc`; docs deploy from docs repo only |

**Transitional allowance (M6–M7 only):** `ai-native-sdlc` MAY retain a `README.md` pointer to docs repo URL. MUST NOT retain functional `app/` tree.

**Do not start M7 before M6b** — avoids simultaneous rebind of target_root and npm package surgery.

---

## Consequences

### Positive

- Product repo scope matches ADR-032 Product definition: closed SDLC bundle without channel or platform leakage
- SDLC npm install size drops materially (no prebuilt Vite dist in every template sync)
- Docs release cycle decouples from harness baseline tags
- Observer semver independent of SDLC workflow breaking changes
- Clear answer to "where is monitoring?": session → `ai-native-sdlc-observer`; workspace ops → `harness-control-plane`
- ADR-037 content migration can proceed in docs repo without touching SDLC harness

### Negative / migration cost

- Two new git remotes, INDEX entries, and ecosystem hydration updates
- `sdlc_workspace_rebind.py` must learn `profile: product-harness` (doctor, CI template selection)
- Starlight dogfood moves out of SDLC authoring workspace — agents editing docs open `ai-native-sdlc-docs` workspace
- Short-term dual-path: playbooks reference old paths until M8
- Consumers on pinned `@jambu/ai-native-sdlc` versions retain bundled trace-ui until they upgrade post-M7b

### Risks

| Risk | Mitigation |
|---|---|
| Session-start silently breaks if observer not installed | `sdlc_trace_ensure.py` degrades gracefully; document in install output |
| Token drift between trace-ui and docs site | Shared `@jambu/design-tokens` package (future) or playbook gate comparing tailwind configs |
| Premature merge with control plane | Explicit boundary table (§3); Phase C requires separate ADR |
| CI regression during split | M6 deploy green before M6b rebind; keep worktrees pool (ADR-038) |

---

## Verification

### Post-M6 (docs repo)

```bash
test -d ~/workspaces/jambu/ai-native-sdlc-docs/app
test -f ~/workspaces/jambu/ai-native-sdlc-docs/app/astro.config.mjs
cd ~/workspaces/jambu/ai-native-sdlc-docs/app && npm run build
```

### Post-M6b (SDLC repo slim)

```bash
test ! -d ~/workspaces/jambu/ai-native-sdlc/app
grep -q 'target_root: \\.' ~/workspaces/jambu/ai-native-sdlc/.sdlc/sdlc.yaml
grep -q 'profile: product-harness' ~/workspaces/jambu/ai-native-sdlc/.sdlc/sdlc.yaml
python3 ~/workspaces/jambu/ai-native-sdlc/.sdlc/bin/sdlc_doctor.py
```

### Post-M7b (observer extracted)

```bash
test ! -d ~/workspaces/jambu/ai-native-sdlc/packages/ai-native-sdlc/trace-ui
test -d ~/workspaces/jambu/ai-native-sdlc-observer/packages/trace-ui
cd ~/workspaces/jambu/ai-native-sdlc/packages/ai-native-sdlc && npm pack --dry-run 2>&1 | grep -qv trace-ui
curl -sf http://127.0.0.1:9473/ >/dev/null   # after ai-native-sdlc trace --no-open
```

### Post-M8 (ecosystem gates)

```bash
# Ecosystem layout (extends ADR-034 verification)
test ! -d ~/workspaces/jambu/ai-native-sdlc/app
test -d ~/workspaces/jambu/ai-native-sdlc-docs/.git
test -d ~/workspaces/jambu/ai-native-sdlc-observer/.git
grep -r 'packages/ai-native-sdlc/trace-ui' ~/workspaces/jambu/ai-native-sdlc/.sdlc/playbooks/domains/ \
  && exit 1 || true
```

---

## Artifacts by destination

| Current path (`ai-native-sdlc`) | Destination |
|---|---|
| `app/**` | `ai-native-sdlc-docs/app/**` |
| `app/e2e/**` | `ai-native-sdlc-docs/app/e2e/**` |
| `.github/workflows/deploy.yaml` (Pages) | `ai-native-sdlc-docs/.github/workflows/deploy.yaml` |
| E2E/validate jobs scoped to `app/` | docs repo workflows |
| `packages/ai-native-sdlc/trace-ui/**` | `ai-native-sdlc-observer/packages/trace-ui/**` |
| `packages/ai-native-sdlc/src/trace-server.ts` | `ai-native-sdlc-observer/packages/trace-server/src/` |
| `packages/ai-native-sdlc/src/trace-model.ts` | `ai-native-sdlc-observer/packages/trace-server/src/` |
| `packages/ai-native-sdlc/src/trace-workspace-context.ts` | `ai-native-sdlc-observer/packages/trace-server/src/` |
| `packages/ai-native-sdlc/src/trace.ts` | `ai-native-sdlc-observer/packages/trace-server/src/cli.ts` |
| `packages/ai-native-sdlc/templates/sdlc/trace-ui/**` | **deleted** — replaced by npm `@jambu/sdlc-trace-ui` |
| `app/src/styles/observability-tokens.css` | `ai-native-sdlc-docs/app/src/styles/` (docs branding) |

| Stays in `ai-native-sdlc` | Role |
|---|---|
| `.sdlc/**` | SDLC product harness |
| `.cursor/**` | Runtime adapter |
| `packages/ai-native-sdlc/` (minus trace) | `@jambu/ai-native-sdlc` CLI + SDLC templates |
| `.sdlc/bin/sdlc_trace_ensure.py` | Session hook — delegates to observer package |
| `output/` | User deliverables (ADR-039) |

---

## Review

| Field | Value |
|---|---|
| Decision driver | Repository scope must match ADR-032 Product vs Channel vs Platform layers |
| Alternatives rejected | (1) Keep colocation for dogfood convenience — rejected: violates ADR-034 subproduct invariant; (2) Merge trace-ui into harness-control-plane immediately — rejected: different data contracts and lifecycles (§3); (3) Move docs to `jambu/harness` — rejected: ADR-037 assigns SDLC product docs to `ai-native-sdlc.org`, not harness repo |
| Owner | SDLC product (`ai-native-sdlc` repo) — execution via goal-flow tickets M6–M8 |
| Status transition | ACCEPTED on authoring — M6+ execution tracked in Plane/local work items |
