# ADR-013: Starlight Documentation Profile at `app/`

## Status

ACCEPTED

Superseded by: (none)

---

## Context

The AI-Native SDLC authoring monorepo uses `workspace.target_root: app` with `profile: astro` to bind the LLM Playground (JAMBU-33) — an Astro SSR application with PostHog, Vercel adapter, and Playwright E2E. That binding was appropriate for a runtime demo but is not the long-term product surface for the project.

Run `docs-site-engineering-20260526` (epic JAMBU-86) delivers the public engineering documentation site at `https://ai-native-sdlc.org`. Requirements:

1. **Product identity:** The docs site IS the primary public face of the project — Procedural Cognitive Runtime Architecture thesis, install commands, engineering guides.
2. **Stack fit:** Static site generation aligns with content-first publishing; no server state, no API routes, no SQLite.
3. **Visual standard:** Lucode Starlight theme provides shadcn/ui documentation aesthetics per discovery-report fidelity target.
4. **Workspace decoupling (ADR-011):** `app/` is convention, not invariant — but for this repo the convention resolves to the docs product after migration.
5. **Rebind protocol (ADR-012):** Profile changes MUST flow through `sdlc_workspace_rebind.py` with doctor gate `workspace:ci-target-aligned`, not scattered path edits.

The LLM Playground relocates to `examples/llm-playground/` (JAMBU-88) with its own `astro` SSR profile as a reference example. A new canonical profile label is required so doctor, CI templates, and `architecture.md` memory describe the docs stack accurately.

Existing profiles in use: `astro` (SSR blog/playground), `auto` (init detection). Neither captures Starlight SSG documentation sites.

---

## Decision

> We will introduce `profile: starlight` as the canonical workspace profile when `workspace.target_root` hosts an Astro Starlight static documentation site, and bind `app/` to this profile after the Starlight scaffold and content migration complete (JAMBU-92).

### Profile contract

| Key | Value |
|---|---|
| `workspace.profile` | `starlight` |
| `workspace.target_root` | `app` (this repo; other repos may use any path) |
| Framework | Astro 6 + `@astrojs/starlight` |
| Theme | `lucode-starlight` |
| Output | `output: 'static'` (SSG) — no SSR adapter |
| Primary test gate | Playwright smoke in `{target_root}/e2e/` |
| Runtime observability | None at application layer (static content) |

### Sequencing

1. JAMBU-88 — free `app/` (playground → examples)
2. JAMBU-89 — scaffold Starlight in `app/` while profile remains `astro` (interim CI misalignment expected)
3. JAMBU-90, JAMBU-91 — content and assets
4. JAMBU-92 — rebind to `profile: starlight`, accept this ADR, generate `rebind-report.md`
5. JAMBU-93 — E2E smoke against rebound workspace

ADR status transitions **PROPOSED → ACCEPTED** in JAMBU-92 when rebind completes and doctor PASS.

---

## Rationale

### Why Starlight at `app/`

- **URL and brand alignment:** Production domain `ai-native-sdlc.org` serves documentation, not an LLM demo. Keeping the docs site at `workspace.target_root` ensures CI, Vercel, and deploy gates target the product users visit.
- **ADR-011 demonstration:** The repo must prove that `target_root` binds any stack — here, a documentation product replaces an SSR app without changing SDLC orchestration layout.
- **Operational simplicity:** SSG docs eliminate SSR adapter maintenance, SQLite, and runtime observability SDKs that the playground required.

### Why a named `starlight` profile (not `astro`)

- **Doctor and CI semantics:** `profile: astro` currently implies SSR-capable app patterns (Vercel adapter, optional PostHog, `@astrojs/vercel` in dependency gate checks). Starlight SSG has different build output, deploy artifact path, and zero runtime secrets.
- **Rebind idempotence:** ADR-012 rebind script keys off profile string to patch workflow templates. A distinct label prevents silent misclassification when init/doctor inspects workspace type.
- **Compose mode (ADR-011 W5):** Profile labels are agent-declared, not npm-shipped templates. `starlight` documents intent for future `/sdlc:init` bind/compose flows without requiring frozen scaffold directories in the package.

### Alternatives rejected

| Alternative | Rejection |
|---|---|
| Keep `profile: astro` for Starlight site | Conflates SSR playground semantics with SSG docs; doctor memory lies about output mode |
| Move docs to `docs-app/` separate from `app/` | Unnecessary path churn; user decision locks docs to `app/`; rebind already handles target changes |
| Use `profile: auto` | Loses deterministic CI template selection; rebind script defaults to `astro` |
| SSR Starlight with `@astrojs/node` | Violates stack constraints without ADR; no server state requirement for static docs |

---

## Consequences

### Positive

- CI, Vercel, and doctor gates describe the actual product stack
- Clear separation: `app/` = public docs (`starlight`), `examples/llm-playground/` = SSR demo (`astro`)
- Rebind sub-workflow (ADR-012) has explicit profile target for gate matrix
- Master spec and wave plan can reference stable profile semantics

### Negative / Trade-offs

- Interim CI failure window between JAMBU-88 and JAMBU-92 while profile lags filesystem reality
- `sdlc_workspace_rebind.py` may lack starlight-specific template patches — manual deltas in rebind-report
- New profile requires `architecture.md` memory update and INDEX registration at acceptance
- Examples directory grows; agents must not confuse `examples/llm-playground` with `target_root`

### Neutral

- Does not change distributable package install behavior — npm consumers still run `/sdlc:init` with their own profile
- Does not publish `docs/engineering/references/` — content boundary unchanged

---

## Implementation Notes

### Files encoding this decision

| File | Change (JAMBU-92) |
|---|---|
| `.sdlc/sdlc.yaml` | `workspace.profile: starlight` |
| `.sdlc/context/decisions/ADR-013-starlight-docs-profile.md` | Status → ACCEPTED |
| `.sdlc/INDEX.md` | `[ADRS]` row for ADR-013 |
| `.cursor/memories/architecture.md` | Stack table + Key Architectural Decisions row |
| `.github/workflows/*.yaml` | `working-directory: app` |
| `.sdlc/integrations/vercel/vercel.yaml` | `root_directory: app` |
| `.sdlc/runs/docs-site-engineering-20260526/rebind-report.md` | Generated + manual patches |

### Rebind command

```bash
python3 .sdlc/bin/sdlc_workspace_rebind.py \
  --target app \
  --profile starlight \
  --run-id docs-site-engineering-20260526
```

### Master spec reference

Data model, route map, dependency list: `.sdlc/runs/docs-site-engineering-20260526/master-spec.md`

### Related ADRs

- ADR-011 — `workspace.target_root` decoupling; `app/` is not structural invariant
- ADR-012 — workspace rebind sub-workflow and gate matrix
- ADR-005 — SSR mode (superseded for `app/` by this ADR when ACCEPTED; playground SSR remains valid at `examples/llm-playground/`)

---

## Review

| Field | Value |
|---|---|
| Author | Planner subagent (architecture stage) |
| Date | 2026-05-26 |
| Reviewed by | Implementer (JAMBU-92 rebind) |
| Ticket | JAMBU-86 (epic), JAMBU-92 (rebind + acceptance) |
| Run | docs-site-engineering-20260526 |
