# ADR-011: Distributable SDLC — Two-Phase Install, Lifecycle Integration Slots, and Post-Init Config

Status: ACCEPTED  
Date: 2026-05-24  
Ticket: JAMBU-sdlc-distribution

## Context

The AI-Native SDLC must be distributable as a standalone product installable into any existing repository or empty directory, independent of application stack (Astro, React, Python, etc.). The current repository conflates three concerns:

1. **SDLC framework** — workflows, commands, agents, doctor, playbooks
2. **Runtime adapter** — Cursor (`.cursor/`), future Claude Code (`.claude/`)
3. **Demo application** — `app/` Astro blog used as proof, not as structural invariant

Current `/sdlc:init` performs monolithic Astro bootstrap: scaffolds `app/`, installs Sentry/Playwright, and assumes integrations (Plane, Vercel, PostHog) before the user declares intent. Integration YAML files ship pre-materialized under `.sdlc/integrations/`; `/sdlc:doctor` validates secrets for all of them regardless of user selection. SDLC scripts live in `scripts/` at repo root while doctor tooling lives in `.sdlc/doctor/` — split ownership.

The SDLC lifecycle is end-to-end: ticket management → spec → implement → QA → deploy → post-deploy → incident response. Each phase may bind to a different vendor. A distributable SDLC must ask **which integration serves each lifecycle slot**, materialize only selected integrations, derive required keys and validations from that selection, and collect secrets **after** declaration — never before.

`/sdlc:config` already handles integration swap post-init but shares no pipeline with init; both must converge on one integration mutation engine.

## Decision

### 1. Two-phase installation model

| Phase | Actor | Command | Output |
|---|---|---|---|
| **Install** | CLI (deterministic) | `ai-native-sdlc install [--runtime cursor\|claude]` | Generic `.sdlc/` + runtime adapter; zero active integrations; zero secrets; `sdlc.yaml.status = uninitialized` |
| **Specialize** | Agent (Cursor/Claude) | `/sdlc:init [intent]` | Project-bound SDLC: stack, lifecycle slots, active integrations, env files, `status = operational` |
| **Mutate** | Agent | `/sdlc:config <directive>` | Post-init add/remove/swap of integrations or stack components |

CLI install MUST NOT: modify application code, install app dependencies, prompt for secrets, or pre-materialize integration configs.

Agent `/sdlc:init` MUST NOT: assume `app/` as target root, scaffold a preset stack without user confirmation, or collect secrets before lifecycle slot selection is complete.

### 2. Workspace decoupling

`sdlc.yaml` gains a `workspace` block:

```yaml
workspace:
  target_root: "."          # path to application code — any language, any layout
  profile: auto             # detected or declared: react-vite, astro, python-fastapi, …
status: uninitialized       # uninitialized | operational
integrations: {}            # populated only after /sdlc:init slot selection
```

All SDLC scripts, CI templates, doctor checks, and rules resolve application paths via `workspace.target_root`. Hardcoded `app/` references in SDLC layer are forbidden for new code; existing references are migration debt tracked until baseline advance.

### 3. Lifecycle integration slots

The SDLC defines **canonical lifecycle slots**. During `/sdlc:init`, the agent walks each slot, presents supported options from the integration catalog, and records the user's choice. Slots without a selection are marked `none` and produce no integration config, no secrets, and no doctor validation.

| Slot ID | SDLC phase | Example providers (catalog) | Required for operational |
|---|---|---|---|
| `work_items` | Ticket/epic management | Plane, Linear, Jira, GitHub Issues | **Yes** — at least one |
| `source_control` | Repository, PRs, branch policy | GitHub, GitLab, Bitbucket | **Yes** — at least one |
| `ci` | Build, lint, test gates | GitHub Actions, GitLab CI, CircleCI | Recommended |
| `qa` | E2E / evidence capture | Playwright, Cypress, Maestro | Recommended |
| `observability` | Errors, analytics, replay | PostHog, Sentry, Datadog | Recommended |
| `deploy` | Staging/production release | Vercel, Railway, Fly.io, AWS | Recommended |
| `post_deploy` | Smoke, version audit, rollback gate | Same as deploy + browser-user | Optional |
| `incident` | Autonomous remediation pipeline | GitHub Issues + Cursor SDK, PagerDuty webhook | Optional |

Slot selection is conversational. User may supply intent in one utterance (`/sdlc:init react + supabase + Plane + Vercel + PostHog`) and the agent maps tokens to slots + stack profile before confirmation.

Init walks slots conversationally but **persists phase binding on integrations**, not in a separate `lifecycle_slots` block. Each materialized provider declares which phases it covers via `serves_slots`. One provider may serve multiple phases (e.g. `github` for `source_control` and `ci`).

```yaml
integrations:
  plane:
    config: .sdlc/integrations/plane/plane.yaml
    status: active
    serves_slots: [work_items]
  github:
    config: .sdlc/integrations/github/github.yaml
    status: active
    serves_slots: [source_control, ci]
  posthog:
    config: .sdlc/integrations/posthog/posthog.yaml
    status: active
    serves_slots: [observability]
  vercel:
    config: .sdlc/integrations/vercel/vercel.yaml
    status: active
    serves_slots: [deploy]
```

Non-materialized slot choices (e.g. `qa: playwright`) are recorded in `project.stack` only — no `.sdlc/integrations/` directory.

Doctor validates `serves_slots` deterministically: canonical slot ids, no duplicates, required slots (`work_items`, `source_control`) covered. Credential manifest derives `slot` annotations via reverse lookup on `serves_slots`.

Integrations not selected MUST NOT exist as directories under `.sdlc/integrations/` in the target project.

### 4. Integration catalog vs active integrations

The distributable package ships an **integration catalog** (templates + JSON Schema + `secrets_required` metadata) at `templates/integrations/{provider}/`. This catalog is read-only reference material inside the package — not copied wholesale to the project.

Materialization occurs when init slot walk selects a provider (merge by provider id before writing):

1. Collapse slot selections → one entry per materialized provider id (e.g. `ci: github-actions` + `source_control: github` → `github`)
2. Copy `templates/integrations/{provider}/` → `.sdlc/integrations/{provider}/`
3. Register in `sdlc.yaml.integrations` with `serves_slots: [<slot_ids>]`
4. Materialize slot-specific rules, workflow fragments, CI templates via shared pipeline
5. Append derived secrets to credential manifest; annotate each secret with slot(s) from `serves_slots` reverse lookup

### 5. Secret policy — collect only after slot selection

**Invariant:** No secret prompt, no `.env` write, and no doctor secret validation occurs before all lifecycle slots and stack profile are confirmed.

After confirmation, the runtime builds a **credential manifest** by unioning `secrets_required` from every active integration YAML:

```yaml
# .sdlc/credential-manifest.yaml (generated, gitignored values in .env)
secrets:
  - env_var: PLANE_API_KEY
    scope: local
    layer: sdlc              # .sdlc/.env
    integration: plane
    slot: work_items
  - env_var: PUBLIC_POSTHOG_KEY
    scope: both
    layer: app               # {target_root}/.env
    integration: posthog
    slot: observability
  - env_var: VERCEL_TOKEN
    scope: ci
    layer: ci                # gh secret set instructions only
    integration: vercel
    slot: deploy
```

Secret layers:

| Layer | File / target | Contents |
|---|---|---|
| `sdlc` | `.sdlc/.env` | Orchestration: Plane API, tokens for SDLC scripts |
| `app` | `{target_root}/.env` | Application runtime: PUBLIC_* keys, DB URLs, SDK keys |
| `ci` | GitHub/GitLab secrets | Deploy tokens, CI-only keys — instructions emitted, never committed |
| `runtime` | IDE/MCP config (`~/.cursor/mcp.json`) | MCP tokens — documented, not written by init unless user opts in |

User may defer non-blocking secrets (`required: false`) — integration status becomes `pending_credentials`; doctor warns, does not fail.

### 6. `/sdlc:init` modes and scope boundary

| Mode | Condition | Behavior |
|---|---|---|
| `bind` | `target_root` contains existing code | Detect stack, map slots, no scaffold |
| `compose` | Empty or minimal repo | User intent → minimal runnable skeleton in `target_root` + slot binding |
| `resume` | `status = uninitialized`, partial handoff | Continue from last completed init phase |

**Init owns:** SDLC binding, slot selection, integration materialization, credential manifest, minimal skeleton (compose only), memory/INDEX initialization, structural + operational doctor gate.

**Init does NOT own:** Feature implementation, business logic, full test suites, domain playbooks, or epic-level product work. Those enter via Plane tickets and `/sdlc:implement` after `status = operational`.

### 7. Shared integration pipeline (init batch = config delta)

`/sdlc:init` (integration phases) and `/sdlc:config` invoke the same pipeline:

```
parse intent → discover affected files → research (if unknown provider)
→ materialize integration yaml → update sdlc.yaml.integrations
→ patch rules / memories / workflows / CI (profile-aware)
→ extend credential manifest → collect new secrets
→ doctor --mode=operational
```

| Command | Pipeline invocation |
|---|---|
| `/sdlc:init` | Batch: all slots + stack profile in one run |
| `/sdlc:config add posthog` | Delta: single integration or stack component |
| `/sdlc:config remove vercel` | Delta: deactivate slot, remove config dir, prune secrets from manifest, revert CI/rules patches |
| `/sdlc:config swap sentry posthog` | Delta: remove + add atomically |

`/sdlc:config` is the **only** post-init mutation path for integrations and stack components. Direct edits to `sdlc.yaml.integrations` without config command are doctor violations.

### 8. Doctor modes

| Mode | When | Validates |
|---|---|---|
| `structural` | After CLI install; mid-init before secrets | Directories, commands, rules, workflows exist; integrations declared in yaml match disk |
| `operational` | End of `/sdlc:init`; after `/sdlc:config` | Above + secrets for `status: active` integrations only; CI secrets via `gh secret list` when available |

Doctor MUST NOT fail on secrets for integrations with `status: pending_credentials` or slots marked `none`.

CLI exposes `ai-native-sdlc doctor --mode=structural` for pre-agent verification.

### 9. Script and template ownership

SDLC runtime scripts live in `.sdlc/bin/` in the distributable package. Repo-root `scripts/` retains only repo-local conveniences (git hooks, demo reset).

Integration templates, CI templates, runtime adapters (`cursor/`, `claude/`), and playbooks (including `pb.compose.scaffold`) ship inside the package under `templates/`. Compose mode does **not** ship frozen profile directory templates — see §W5 amendment.

### 10. Runtime adapter selection at CLI install

`ai-native-sdlc install` detects installed agent runtimes and prompts (or accepts `--runtime` flag):

- **cursor** → materialize `.cursor/` from `templates/runtime-adapters/cursor/`
- **claude** → materialize `.claude/` from `templates/runtime-adapters/claude/` (future)

Only one primary runtime adapter per install. Multi-runtime coexistence is out of scope for v1.

## Rationale

- **Distributability** requires generic install with zero assumptions about app stack or vendor choices.
- **Lifecycle slots** mirror the actual SDLC pipeline the product sells — not a flat list of SaaS integrations. User chooses Plane vs Linear at the same semantic level as Vercel vs Railway.
- **Deferred secrets** prevent asking for `PLANE_API_KEY` when user selects Linear, and prevent stale doctor failures from demo integrations shipped by default.
- **Shared pipeline** eliminates init/config divergence — one mutation engine, two entry points.
- **Credential manifest** makes key requirements deterministic and auditable; agent prompts derive from manifest, not ad-hoc memory.

### Alternatives rejected

- **Pre-init `.env` setup** — contradicts opt-in integration model; causes doctor false failures.
- **Monolithic `/sdlc:init` only (no CLI)** — copying 200+ template files requires deterministic tooling; agent should not be the install mechanism.
- **Flat integration list without slots** — user cannot express "I use GitHub but not Plane"; slots enforce phase-level choice.
- **Init delivers full product features** — scope explosion; conflates SDLC bootstrap with feature delivery.
- **Keep all integrations materialized, disable in yaml** — doctor and secret surface remain polluted; disk clutter in target projects.

## Consequences

### Positive

- SDLC installable in any repo via one-link + `ai-native-sdlc install`
- Empty repo + natural language intent is first-class (`compose` mode)
- Secret surface proportional to user choices
- `/sdlc:config` becomes systematic post-init evolution path
- Clear separation: package (framework) vs `target_root` (application) vs runtime adapter (IDE)

### Negative / Trade-offs

- Migration effort: rewrite `/sdlc:init`, doctor modes, script paths, demo repo layout
- Integration catalog maintenance burden — each new provider needs template + slot mapping
- Init conversational flow is longer than one-shot Astro bootstrap — acceptable for correctness
- Compose mode relies on agent execution quality — mitigated by playbook procedure + doctor gates (no frozen profile templates)

### Neutral

- Demo app lives at `examples/astro-blog/` with `workspace.target_root: examples/astro-blog` — declarative binding, not a repo invariant
- Existing pre-materialized integrations in this repo are migration debt, not target state

## Implementation Notes

Vertical execution plan for agents implementing ADR-011:

### Entry points

| Trigger | Handler |
|---|---|
| `ai-native-sdlc install` | Package CLI → copy `templates/sdlc/` + runtime adapter → `sdlc.yaml` with `status: uninitialized`, `integrations: {}` |
| `/sdlc:init` | `.cursor/commands/sdlc-init.md` (rewrite) → slot walk → pipeline batch → credential collection → doctor operational |
| `/sdlc:config` | `.cursor/commands/sdlc-config.md` (extend) → pipeline delta → doctor operational |
| `ai-native-sdlc doctor --mode=structural` | `.sdlc/doctor/runtime-alignment.ts` (extend modes) |

### Data model changes (`sdlc.yaml`)

```yaml
workspace:
  target_root: string
  profile: string
status: uninitialized | operational
integrations:
  <provider_id>:
    config: path
    status: active | pending_credentials
    serves_slots: [slot_id, ...]
```

Phase binding lives in `integrations.<provider>.serves_slots`. Slot catalog for init conversation: `.sdlc/schemas/lifecycle-slots.schema.json` (not persisted as separate yaml block).

### Credential flow

1. Slot selection complete → build `.sdlc/credential-manifest.yaml` from union of active integration `secrets_required`
2. Agent presents manifest grouped by integration → user provides values
3. Write `.sdlc/.env` and `{target_root}/.env` from manifest layers
4. Emit CI secret instructions for `scope: ci` entries
5. Flip integration `status: active` when required secrets present; else `pending_credentials`

### File artifacts

| Artifact | Path |
|---|---|
| ADR | `.sdlc/context/decisions/ADR-011-distributable-sdlc-two-phase-init.md` |
| Integration catalog (package) | `templates/integrations/{provider}/` |
| Lifecycle slot schema | `.sdlc/schemas/lifecycle-slots.schema.json` |
| Credential manifest (generated) | `.sdlc/credential-manifest.yaml` |
| Init command (rewrite target) | `.cursor/commands/sdlc-init.md` |
| Config command (extend target) | `.cursor/commands/sdlc-config.md` |
| Shared pipeline (new) | `.sdlc/pipeline/integration-mutator.ts` |
| Doctor mode flags | `.sdlc/doctor/runtime-alignment.ts` |
| Compose playbook | `.sdlc/playbooks/domains/compose/compose-scaffold.pb.yaml` |
| Demo reference app | `examples/astro-blog/` (bound via `workspace.target_root`) |
| CLI package entry | `packages/ai-native-sdlc/bin/ai-native-sdlc` |

### W5 amendment (2026-05-24)

Compose mode does **not** ship deterministic profile directory templates in the npm package. The product is cognitive orchestration: agent runtime + playbooks + doctor gates. `pb.compose.scaffold` provides meta-cognitive classify → adapt → verify; the agent runs official install tooling. Reproducibility is gate-based (`npm run build`, `doctor:structural`), not byte-identical directory trees. This repo binds `workspace.target_root: examples/astro-blog` to demonstrate declarative materialization.

### Verification criteria

1. `ai-native-sdlc install` in empty temp dir → `.sdlc/` exists, `integrations: {}`, no `.env`, doctor structural passes
2. `/sdlc:init` with "React + Plane + GitHub + Vercel + PostHog" in empty dir → agent executes `pb.compose.scaffold` at `target_root`, five integration dirs via mutator, credential manifest lists only derived keys
3. `/sdlc:init` bind mode on existing Django repo → no scaffold, detected profile, user-selected slots only
4. Doctor operational with `pending_credentials` integration → warn, not fail
5. `/sdlc:config remove posthog` → integration dir removed, manifest pruned, observability rules reverted, doctor operational passes without PostHog secrets
6. `/sdlc:config add supabase` → new integration materialized, secrets prompted, manifest extended

### Sequencing (recommended implementation waves)

| Wave | Scope |
|---|---|
| W1 | ADR-011, `workspace` block, doctor modes, credential manifest schema |
| W2 | Rewrite `sdlc-init.md` + slot walk protocol; deactivate pre-shipped integrations in demo repo |
| W3 | `integration-mutator.ts` shared pipeline; extend `sdlc-config.md` |
| W4 | CLI package `ai-native-sdlc install`; script migration to `.sdlc/bin/` |
| W5 | Compose playbook (`pb.compose.scaffold`); `examples/astro-blog` extraction; **no** profile templates in npm package |

## Review

| Field | Value |
|---|---|
| Author | AI-Native SDLC |
| Date | 2026-05-24 |
| Reviewed by | — |
| Ticket | JAMBU-sdlc-distribution |
| Supersedes | Implicit Astro-monolithic bootstrap in `sdlc-init.md` and `bootstrap-flow.yaml` (behavioral, not ADR) |
| Related | ADR-009 (E2E orchestration), ADR-010 (playbooks) |
