# ADR-034: Public Web Topology — Three Sites, Three Repos

Status: ACCEPTED  
Date: 2026-06-15  
Extends: ADR-013, ADR-019, ADR-033  
Related: ADR-035 (platform layer), ADR-036 (capabilityharness.dev docs — splits audience from this ADR)

## Context

ADR-033 established repository ownership for the harness paradigm and SDLC subproduct. It left `app/` as the engineering docs subject (`ai-native-sdlc.org`) but did not normatively assign company marketing (`jambu.ai`) or personal creator surfaces.

Three distinct audiences exist:

| Audience | Intent | Must not conflate with |
|---|---|---|
| Engineering practitioners | PCR thesis, install, ADRs, harness docs | Product marketing copy |
| Company / product buyers | Agent Kernel, Jambu AI brand, pip install | Deep SDLC engineering corpus |
| Personal creator | Portfolio, blog, independent voice | Jambu product ownership |

Current state (2026-06-15):

| Domain | Role | Source repo / path | Deploy today | DNS today |
|---|---|---|---|---|
| **`capabilityharness.dev`** | Capability Harness docs + `/spec` | `jambu/harness/` (`spec/`, `app/` Starlight — ADR-036) | Not wired | Not specified |
| `ai-native-sdlc.org` | **SDLC Product** engineering docs (post-migration: product-only) | `jambu/ai-native-sdlc/app/` (Starlight, ADR-013) | Cloudflare Pages `ai-native-sdlc-docs.pages.dev` via GitHub Actions (ADR-019) | `.org` parked on Hostinger — custom domain not serving |
| `jambu.ai` | Company / product marketing | `jambu/jambu-ai-homepage/` (Astro SSG, Agent Kernel hero, © Jambu AI) — **no git remote yet** | Not wired | Not specified |
| `joaogabriellima.com` | Personal portfolio + blog | `jambu/joao-personal-website/app/` (React/Vite SPA) | Separate; no Jambu CI slot | Not specified |

Additional split-brain: kernel JSON Schema `$id` values use `https://jambu.ai/schemas/proc/...` while authoritative schema files live in `jambu/harness/schemas/`. The marketing site and schema namespace are logically related (Jambu org identity) but must not be conflated with physical hosting.

## Decision

> **Public web presence is three independent deploy surfaces bound to three sibling repositories.** Engineering docs stay in `ai-native-sdlc`. Company marketing is owned by `jambu-ai-homepage` (designated official `jambu.ai` repo). Personal site is owned by `joao-personal-website` outside Jambu product harness scope.

### 1. Site matrix (normative)

| Domain | Repository | `target_root` | Profile | Cloudflare Pages project | CI owner |
|---|---|---|---|---|---|
| `ai-native-sdlc.org` | `jambu/ai-native-sdlc` | `app/` | `starlight` | `ai-native-sdlc-docs` | `ai-native-sdlc/.github/workflows/deploy.yaml` |
| `jambu.ai` | `jambu/jambu-ai-homepage` | `.` (repo root) | `astro` + `.sdlc/` operational (2026-06-16) | `jambu-ai` (to create) | `jambu-ai-homepage/.github/workflows/deploy.yaml` (to create) |
| `joaogabriellima.com` | `jambu/joao-personal-website` | `app/` | `react-vite` + `.sdlc/` operational (2026-06-16) | operator choice | personal repo CI or manual deploy |

**Invariant:** No single repository serves two primary custom domains. No nested marketing site inside `ai-native-sdlc`.

### 2. Official `jambu.ai` repository

**Designate `jambu/jambu-ai-homepage` as the canonical `jambu.ai` source.** Do not create a parallel marketing repo.

**Amendment 2026-06-16:** Directory renamed from `ak-homepage/` → `jambu-ai-homepage/`. SDLC installed (`status: operational`). Git initialized locally; GitHub remote `jambu-ai/jambu-ai-homepage` pending push.

Rationale:

- Existing Astro SSG build matches static marketing requirements (no SSR).
- Content already targets Agent Kernel / Jambu AI (`pip install ak-agent`, footer © Jambu AI).
- A new repo would duplicate scaffold work without audience benefit.

Required follow-up (implementation, not blocking ADR acceptance):

1. Initialize git in `jambu-ai-homepage/`; create GitHub repo `jambu-ai/jambu-ai-homepage` (or `jambu-ai/jambu-ai-homepage`).
2. Upgrade Astro 4 → 6 when deploy CI is added (align with docs site toolchain).
3. Wire placeholder doc links (`href="#"`) to `https://ai-native-sdlc.org` paths per cross-link contract below.

**Rejected:** New empty `jambu-ai-homepage` repo — adds migration cost with no content gain.

### 3. Schema `$id` namespace vs site hosting

| Concern | Contract |
|---|---|
| **Canonical `$id` prefix (proc / kernel)** | `https://jambu.ai/schemas/proc/` — stable logical namespace for harness kernel schemas |
| **Canonical `$id` prefix (sdlc product)** | `https://jambu.ai/schemas/sdlc/` — SDLC harness schemas in `ai-native-sdlc/.sdlc/schemas/` |
| **Source of truth (files)** | Kernel: `jambu/harness/schemas/`. SDLC product: `ai-native-sdlc/.sdlc/schemas/` |
| **Public HTTP resolution** | `GET https://jambu.ai/schemas/proc/{name}` serves published schema JSON — via static mirror on `jambu.ai` deploy (e.g. `public/schemas/proc/` copied from harness release) or Cloudflare redirect to tagged GitHub raw URL |
| **Marketing homepage** | `https://jambu.ai/` — unrelated URL path to schema resolution except shared domain |

**Normative rule:** `$id` URLs identify artifacts; they do not imply the marketing Astro app embeds schema source. Namespace uses `jambu.ai` because Jambu AI is the organizational publisher, not because schemas are authored in the homepage repo.

### 4. DNS and deploy slots

#### `ai-native-sdlc.org` (engineering)

| Item | Value |
|---|---|
| Registrar / DNS | Transfer or point NS to Cloudflare (ADR-019) — remove Hostinger parked page |
| Pages project | `ai-native-sdlc-docs` |
| Production URL (interim) | `https://ai-native-sdlc-docs.pages.dev` |
| Production URL (target) | `https://ai-native-sdlc.org` |
| Build root | `app/` |
| Secrets | `CLOUDFLARE_*`, `ASTRO_SITE=https://ai-native-sdlc.org` |
| Integration slot | `ai-native-sdlc/.sdlc/integrations/cloudflare-pages/` |

#### `jambu.ai` (marketing)

| Item | Value |
|---|---|
| DNS | Cloudflare — same account as docs site recommended |
| Pages project | `jambu-ai` (new) |
| Production URL | `https://jambu.ai` |
| Build root | `.` (repo root — `jambu-ai-homepage` has no `app/` subfolder) |
| Build command | `npm ci && npm run build` |
| Output | `dist/` |
| Secrets | Separate GitHub repo secrets; `ASTRO_SITE=https://jambu.ai` |
| SDLC integration | **None in ai-native-sdlc** — marketing repo owns its own deploy workflow |

#### `joaogabriellima.com` (personal)

| Item | Value |
|---|---|
| Ownership | Personal — not a Jambu subproduct per ADR-033 |
| Source | `joao-personal-website/app/` |
| Deploy | Operator-managed; document in personal repo README only |
| Jambu cross-links | Optional outbound links; no inbound requirement from product sites |

### 5. Cross-linking contract

| From | To | Link type | Required |
|---|---|---|---|
| `jambu.ai` nav / hero CTA | `https://ai-native-sdlc.org` | Engineering documentation | Yes — replace `#` placeholders in `jambu-ai-homepage` |
| `jambu.ai` footer | GitHub org repos | Product source | Recommended |
| `ai-native-sdlc.org` Starlight config | `https://jambu.ai` | Company home | Optional — `social` or footer link |
| `ai-native-sdlc.org` content | `jambu.ai` | Inline product mentions | Only when contextually relevant |
| `joaogabriellima.com` | Jambu properties | Personal discretion | Never required by Jambu ADRs |
| Schema consumers | `https://jambu.ai/schemas/proc/*` | Machine-readable `$id` resolution | Required once schema mirror is live |

**Forbidden:** Merging engineering docs into `jambu-ai-homepage`. Serving Starlight from `jambu.ai/docs` as primary docs surface — docs canonical host remains `ai-native-sdlc.org`.

### 6. Relationship to ADR-033 repo topology

```text
jambu/
├── harness/                 paradigm owner — schemas published to jambu.ai/schemas/proc/
├── agent-runtime-gateway/   platform library — ADR-035 (NOT a web surface)
├── ai-native-sdlc/
│   └── app/                 → ai-native-sdlc.org
├── jambu-ai-homepage/             → jambu.ai  (THIS ADR)
├── joao-personal-website/   → joaogabriellima.com (personal, out of product ADR scope)
├── business-workflow/       M4 pending — gateway consumer, not public marketing site
└── examples/                M5 pending — not public deploy
```

Web topology (this ADR) is **orthogonal** to ADR-033 M4/M5 migration phases and to ADR-035 platform/runtime layer.

## Consequences

### Positive

- Audience boundaries are explicit — agents stop inferring one site serves all purposes
- `jambu-ai-homepage` assignment removes repo ambiguity blocking marketing deploy
- Schema `$id` namespace decoupled from homepage HTML — validators keep stable URIs
- Cloudflare Pages pattern reused across docs + marketing with separate projects

### Negative / deferred work

- DNS cutover for `ai-native-sdlc.org` still pending (Hostinger → Cloudflare)
- `jambu-ai-homepage` needs git init, GitHub repo, CI workflow, Astro upgrade
- Schema HTTP mirror on `jambu.ai/schemas/` needs harness release hook or copy step
- Personal site deploy remains operator-owned

### Out of scope (explicit)

- ADR-033 **M4** (`business-workflows/` extract) — user decision gate
- ADR-033 **M5** (`examples/` delete) — user decision gate
- Harness paradigm ADRs in `hambu/harness/context/decisions/` — web topology is product/ops ADR in `ai-native-sdlc`

## Implementation Notes

### Phase W1 — Docs domain (existing repo)

1. Point `ai-native-sdlc.org` DNS to Cloudflare Pages production branch
2. Verify `ASTRO_SITE` and post-deploy smoke against custom domain
3. Update operational-context deployment URL when DNS live

### Phase W2 — Marketing site (`jambu-ai-homepage`)

1. `git init`; push to `jambu-ai/jambu-ai-homepage`
2. Create Cloudflare Pages project `jambu-ai`
3. Add `.github/workflows/deploy.yaml` (mirror ADR-019 wrangler pattern; `working-directory: .`)
4. Fix cross-links to `ai-native-sdlc.org`
5. Optional: copy harness schemas to `public/schemas/proc/` on release tag

### Phase W3 — Personal site

1. Document deploy target in `joao-personal-website/README.md`
2. No changes required in `ai-native-sdlc` repo

## Verification

Post-W1 (`ai-native-sdlc`):

```bash
curl -sI https://ai-native-sdlc.org | head -1   # expect HTTP/2 200
grep -q "ai-native-sdlc.org" app/astro.config.mjs
```

Post-W2 (`jambu-ai-homepage`):

```bash
test -d ../jambu-ai-homepage/.git
curl -sI https://jambu.ai | head -1             # expect HTTP/2 200
grep -r 'ai-native-sdlc.org' ../jambu-ai-homepage/src/  # doc links wired
```

Schema mirror (when implemented):

```bash
curl -sI https://jambu.ai/schemas/proc/harness-identity.schema.json | head -1
```

## Review

| Field | Value |
|---|---|
| Author | Cursor agent (architecture session) |
| Date | 2026-06-15 |
| Extends | ADR-013 (docs profile), ADR-019 (CF Pages), ADR-033 (repo siblings) |
| Trigger | Handoff 2026-06-15-1818 — topology Q&A after ADR-033 M3 |
| User gate preserved | M4/M5 not executed — await explicit approval |
