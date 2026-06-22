# ADR-014: Consumer Baseline — Two-Layer Cognitive Versioning

## Status

ACCEPTED

Superseded by: (none)

---

## Context

Baseline today is an authoring-monorepo mechanism: agents advance cognitive layer state via `/sdlc:baseline`, create local git tags named `v0.N.0-sdlc`, and `scripts/reset.sh` restores app trees from separate app baseline tags. Consumers who run `ai-native-sdlc install` receive npm templates without a `baseline:` block in `sdlc.yaml`, without `reset.sh`, and without a mandated local tag contract. `/sdlc:baseline` in consumer projects assumes authoring-repo tag names that do not exist in their git history.

ADR-011 introduced distributable SDLC with two-phase init and noted "two baseline tags (app, sdlc)" at a high level but did not define:

1. Which baseline identifier comes from npm (upstream framework snapshot)
2. Which baseline identifier is project-local (downstream cognitive layer)
3. How consumer projects advance baseline independently of authoring-monorepo tags
4. Whether authoring-monorepo `v0.N.0-sdlc` tags are distributed or local-only

Run `consumer-baseline-20260527` (epic JAMBU-96) requires a schema and ADR before install bootstrap (JAMBU-98), reset CLI (JAMBU-99), and doctor/command integration (JAMBU-100).

---

## Decision

> We will adopt a three-field baseline schema in `sdlc.yaml` separating upstream npm semver from mandatory downstream local git tags, with optional app restore tags — identical schema for authoring monorepo and npm consumers; authoring `v0.N.0-sdlc` tags remain local downstream tags in that repo and are never distributed.

### Baseline layers

| Layer | Key | Scope | Mechanism | Required |
|---|---|---|---|---|
| **Upstream** | `baseline.sdlc_package_version` | Framework snapshot from `@jambu/ai-native-sdlc` npm package | Set at CLI `install` from package `version`; immutable until package upgrade | Yes (after install) |
| **Downstream** | `baseline.sdlc_baseline_tag` | Project cognitive layer (`.sdlc/`, `.cursor/rules/commands/skills`, doctor, workflows) | Local git tag; first tag at `/sdlc:init` completion; advanced via `/sdlc:baseline` | Yes (after init → `status: operational`) |
| **App** | `baseline.app_baseline_tag` | Application tree at `workspace.target_root` | Local git tag; optional at init or first baseline advance | No |

### Schema contract

All projects — authoring monorepo and npm consumers — MUST declare:

```yaml
baseline:
  sdlc_package_version: null  # semver string at install; null before install
  sdlc_baseline_tag: null     # local git tag; null until post-init bootstrap
  app_baseline_tag: null      # local git tag; optional
  last_sdlc_baseline_date: null
  sdlc_baseline_changes: []
```

### Lifecycle binding

| Phase | Actor | Baseline fields affected |
|---|---|---|
| **Install** | CLI `ai-native-sdlc install` | Sets `sdlc_package_version` from npm; leaves `sdlc_baseline_tag` null |
| **Init** | Agent `/sdlc:init` | On `status: operational`, runs baseline init → sets `sdlc_baseline_tag`; may set `app_baseline_tag` if app scaffold exists |
| **Advance** | Agent `/sdlc:baseline` | Increments local downstream tag; updates `last_sdlc_baseline_date`, `sdlc_baseline_changes` |
| **Reset** | `scripts/reset.sh` | Restores app from `app_baseline_tag`; clears session state; preserves cognitive layer (not restored from tag) |

### Tag naming

| Project type | Downstream tag pattern | Example |
|---|---|---|
| Consumer | `{project-slug}-sdlc-v{major}.{minor}.0` | `my-app-sdlc-v1.0.0` |
| Consumer app (optional) | `{project-slug}-app-v{major}.{minor}.0` | `my-app-app-v1.0.0` |
| Authoring monorepo | `v0.{N}.0-sdlc` (existing convention) | `v0.19.0-sdlc` |

Consumer downstream tags MUST NOT reference or depend on authoring-monorepo tag names. Authoring tags are **local downstream tags in the authoring repo only** — they are not copied, synced, or distributed to npm consumers.

### Authoring monorepo equivalence

The authoring monorepo uses the same `baseline:` schema. Its `v0.N.0-sdlc` values populate `baseline.sdlc_baseline_tag`. The monorepo additionally maintains `packages/` sync and package build as part of `/sdlc:baseline` (authoring path); consumers advance cognitive baseline without `packages/` sync.

---

## Rationale

### Why separate upstream and downstream

- **npm semver** captures which distributable template version was installed — deterministic, comparable across projects, set without git tags.
- **Local git tags** capture project-specific cognitive evolution — customized rules, integration slots, ADRs — that npm semver cannot represent.
- **Merging both into one tag** (authoring-only model) breaks consumers whose git history never contained `v0.N.0-sdlc`.

### Why mandatory downstream tag after init

Doctor, reset, and handoff flows need a verifiable restore point for structural classification. A null `sdlc_baseline_tag` on an operational project is an invalid state — baseline init is part of init completion (JAMBU-98).

### Why app baseline remains optional

Consumer Hello World and empty-directory installs may have no application tree at init. App baseline is set when `workspace.target_root` contains restorable application code.

### Alternatives rejected

| Alternative | Rejection |
|---|---|
| Distribute authoring `v0.N.0-sdlc` tags to consumers | Tags reference monorepo history; consumers have independent git trees |
| Single baseline tag for everything | Cannot restore app without overwriting cognitive layer; reset contract requires separation |
| semver-only baseline (no git tags) | No verifiable git object for doctor; no idempotent reset anchor |
| Skip baseline block in npm template | Consumers cannot participate in baseline lifecycle; doctor has no contract |

---

## Consequences

### Positive

- Consumers gain explicit cognitive versioning independent of authoring repo
- Install records upstream package version for upgrade diagnostics
- Doctor can validate tag existence with actionable failures (JAMBU-100)
- Reset contract is uniform across authoring and consumer projects
- ADR-011 two-baseline intent is fully specified

### Negative / Trade-offs

- Two tag namespaces to understand (upstream semver vs downstream git tag)
- Authoring and consumer `/sdlc:baseline` paths diverge (package sync vs local-only)
- `sdlc_baseline.py` CLI required for init/advance/verify (JAMBU-99)
- Existing operational consumers need migration on next install/init cycle

### Neutral

- Authoring tag naming (`v0.N.0-sdlc`) unchanged for dogfooding
- Does not automate npm upgrade migration of customized `.sdlc/` files

---

## Implementation Notes

### Files encoding this decision

| File | Change |
|---|---|
| `.sdlc/context/decisions/ADR-014-consumer-baseline.md` | This ADR |
| `packages/ai-native-sdlc/templates/sdlc/sdlc.yaml` | `baseline:` block with null defaults |
| `packages/ai-native-sdlc/scripts/sync-templates.sh` | Heredoc includes `baseline:` block |
| `.sdlc/INDEX.md` | `[ADRS]` row ADR-014; `[SPECS]` row JAMBU-97 |
| `.cursor/memories/architecture.md` | Key Architectural Decisions row |

### Deferred to follow-on tickets

| Ticket | Scope |
|---|---|
| JAMBU-98 | `install.ts` writes `sdlc_package_version`; `/sdlc:init` creates first downstream tag |
| JAMBU-99 | `sdlc_baseline.py`, consumer `scripts/reset.sh` template |
| JAMBU-100 | `/sdlc:baseline` dual model, doctor group 5 tag validation, distribution docs |

### Master spec reference

`.sdlc/runs/consumer-baseline-20260527/master-spec.md`

### Related ADRs

- ADR-011 — Distributable SDLC two-phase init; high-level two-baseline mention
- ADR-012 — Workspace rebind; structural changes classified before baseline advance

---

## Review

| Field | Value |
|---|---|
| Author | Implementer subagent (JAMBU-97) |
| Date | 2026-05-27 |
| Reviewed by | — |
| Ticket | JAMBU-97 (epic JAMBU-96) |
| Run | consumer-baseline-20260527 |
