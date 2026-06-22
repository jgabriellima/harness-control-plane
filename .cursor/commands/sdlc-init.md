---
name: sdlc-init
description: >
  Specialize a generic SDLC install into a project-bound runtime — lifecycle slot
  selection, integration materialization, credential manifest, and operational doctor gate.
  Requires prior CLI install (ai-native-sdlc install) or existing .sdlc/ skeleton.
---

# /sdlc:init — SDLC Project Specialization (ADR-011)

Transform a generic SDLC install into an operational, project-bound runtime. This command **does not** install the SDLC framework — that is `ai-native-sdlc install`. Init binds stack profile, lifecycle integration slots, materializes selected integrations, collects secrets, and sets `status: operational`.

## When to use

| Condition | Action |
|---|---|
| `sdlc.yaml.status = uninitialized` | Full init — slot walk through credential collection |
| User provides intent inline | Parse tokens, map to slots + profile, confirm before materialization |
| Partial handoff exists | Resume mode — continue from last completed phase |
| `status = operational` | Ask: re-specialize (destructive) or run `/sdlc:config` for deltas |

## Preconditions

1. `.sdlc/` exists (from CLI install or this repo's demo layout)
2. Node.js ≥ 22 for doctor and materializers
3. **No secrets collected before Phase D confirmation** — invariant per ADR-011

## Init modes

| Mode | Condition | Behavior |
|---|---|---|
| `bind` | `workspace.target_root` contains existing application code | Detect stack profile; map slots; **no scaffold** |
| `compose` | Empty repo or no app at `target_root` | User intent → minimal runnable skeleton in `target_root` + slot binding |
| `resume` | `status = uninitialized`, handoff records partial init | Skip completed phases listed in handoff |

Detect mode automatically. Confirm with user if ambiguous.

---

## Phase A — Audit and mode detection

1. Read `.sdlc/sdlc.yaml`: `status`, `workspace`, `integrations`
2. Resolve `workspace.target_root` (default `.` if unset during migration)
3. Determine init mode (`bind` | `compose` | `resume`)
4. Run structural doctor — **no secret validation**:

```bash
cd .sdlc && npm run doctor:structural
```

Record all failures as init tasks. Warnings (e.g. orphan `sentry/` migration debt) are informational.

5. If `.sdlc/` missing entirely → instruct user to run `npx @jambu/ai-native-sdlc install --runtime cursor` first

---

## Phase B — Stack profile

**Bind mode:** inspect `target_root` for manifest files (`package.json`, `pyproject.toml`, `Cargo.toml`, etc.) and set `workspace.profile` (e.g. `astro`, `react-vite`, `python-fastapi`).

**Compose mode:** parse user intent for stack tokens (`react`, `astro`, `supabase`, `fastapi`, …). Provision compose playbook `pb.compose.scaffold` — meta-cognitive procedure instructs the agent what to install and where. **No profile file templates in the npm package.** Research gate for unknown stacks (ADR-010 pattern).

Write to `sdlc.yaml`:

```yaml
workspace:
  target_root: "<path>"
  profile: "<detected-or-declared>"
```

**QA evidence mode is NOT on workspace.** It is declared per ticket at `/sdlc:spec` (`qa_surface: browser|headless` + `validation_checks` on the work item). The harness reads the active ticket at execution time (ADR-029).

Do **not** install app dependencies or scaffold until slot selection is confirmed (compose may defer skeleton to Phase D).

---

## Phase C — Init questionnaire (ADR-029)

**Normative contract:** `.sdlc/templates/init-questionnaire.yaml`  
**Output artifact:** `.sdlc/pipeline/.init-selections.json` (schema: `.sdlc/schemas/init-selections.schema.json`)

Walk seven waves in order. **Skip = `none` or framework default** — no integration, no secrets, no doctor validation for that slot.

| Wave | Required | Skip default |
|---|---|---|
| 0 workspace | yes | `target_root: .`, mode auto-detect |
| 1 delivery closure | yes | `local-validated`, remote surfaces off |
| 2 mandatory slots | yes | `work_items: local-work-items` |
| 3 optional slots (ci, qa, observability, deploy, post_deploy) | no | each slot `none` |
| 4 incident | no | `none` — **no Cursor SDK, no CI incident workflow** |
| 5 runtime confirm | yes | from `install --runtime` |
| 6 confirmation gate | yes | write `confirmed_at` — blocks Phase D without it |

### Incident sub-questionnaire (wave 4)

Ask only if user opts in to autonomous incident pipeline:

| Question | Options | Notes |
|---|---|---|
| Provider token | `github-issues-human-hitl`, `github-issues-cursor-sdk`, `github-issues-claude`, `pagerduty-webhook` | human-hitl = IDE `/sdlc:incident` only |
| Agent runtime | `human-in-loop`, `cursor-sdk`, `claude-code`, `opencode` | Independent of IDE runtime |
| Trigger | issue label / webhook / dispatch | |
| Execution | `ci`, `local-dispatch`, `cloud-agent` | |
| Auto-merge | boolean | default false |

**Invariant:** `CURSOR_API_KEY` materializes **only** when `slots.incident = github-issues-cursor-sdk`. Same for `ANTHROPIC_API_KEY` + claude.

Validate before Phase D:

```bash
python3 .sdlc/bin/sdlc_init_validate.py --file .sdlc/pipeline/.init-selections.json
```

**Natural language shortcut:** `/sdlc:init python library local tickets github ci pytest` → map to slots + profile, still require confirmation gate.

Legacy slot table (schema: `.sdlc/schemas/lifecycle-slots.schema.json`):

| Slot ID | SDLC phase | Required for operational |
|---|---|---|
| `work_items` | Ticket/epic management | **Yes** |
| `source_control` | Repository, PRs | **Yes** (or explicit local-only) |
| `ci` | Build, lint, test | Recommended |
| `qa` | E2E / evidence | Recommended |
| `observability` | Errors, analytics | Recommended |
| `deploy` | Release | When closure > local |
| `post_deploy` | Smoke, rollback | When closure = production |
| `incident` | Autonomous remediation | Optional — explicit opt-in |

---

## Phase D — Integration materialization (batch pipeline)

Invoke the shared integration mutation pipeline (same engine as `/sdlc:config`):

```
parse intent → discover affected files → research (if unknown provider)
→ materialize integration yaml → update sdlc.yaml.integrations (with serves_slots)
→ patch rules / memories / workflows / CI (profile-aware)
→ extend credential manifest → [Phase E] collect secrets
→ doctor --mode=operational
```

Implementation:

```bash
cd .sdlc
python3 bin/sdlc_init_validate.py --file pipeline/.init-selections.json
npx ts-node pipeline/integration-mutator.ts plan \
  --action batch \
  --init-file pipeline/.init-selections.json \
  --source init
npx ts-node pipeline/integration-mutator.ts apply \
  --plan-file pipeline/.last-plan.json
```

Slot-aware patch (`catalog-patch.ts`) merges GitHub fragments only for opted-in incident tokens. Base GitHub template has **no demo secrets**.

Init selections JSON example: `.sdlc/pipeline/.slot-test-init.json`. Agent still applies profile-aware patches from plan `agent_tasks` before Phase E credentials.

Collapse slot walk into provider entries (once per materialized vendor):

1. Merge selections by provider id (`source_control: github` + `ci: github-actions` → one `github` entry)
2. Copy `templates/integrations/{provider}/` → `.sdlc/integrations/{provider}/`
3. Register in `sdlc.yaml.integrations` with `serves_slots`:

```yaml
integrations:
  plane:
    config: .sdlc/integrations/plane/plane.yaml
    status: pending_credentials
    serves_slots: [work_items]
  github:
    config: .sdlc/integrations/github/github.yaml
    status: pending_credentials
    serves_slots: [source_control, ci]
  posthog:
    config: .sdlc/integrations/posthog/posthog.yaml
    status: pending_credentials
    serves_slots: [observability]
```

Phase binding lives in `serves_slots`. Doctor validates coverage from this block.

4. Patch runtime rules, CI templates, memories — profile-aware
5. Skip materialization for non-vendor slots (e.g. `qa: playwright` → `project.stack.testing`)

**Compose mode only:** after integrations declared, provision and execute `pb.compose.scaffold`:

```bash
python3 .sdlc/bin/sdlc_playbook.py provision --ids pb.compose.scaffold
```

Agent follows playbook `meta_cognition` + `procedure` — runs official tooling at `workspace.target_root`, adapts to context, validates with build + `doctor:structural`. Reference demo (not template source): `examples/astro-blog/`.

---

## Phase E — Credential collection (after slot confirmation only)

**Invariant:** No `.env` write and no secret prompts before Phase C confirmation completes.

1. Build `.sdlc/credential-manifest.yaml` by unioning `secrets_required` from every active integration YAML. Schema: `.sdlc/schemas/credential-manifest.schema.json`

2. Present manifest grouped by integration → user provides values

3. Write secrets to layers:

| Layer | Target | Contents |
|---|---|---|
| `sdlc` | `.sdlc/.env` | Plane API, orchestration tokens |
| `app` | `{target_root}/.env` | PUBLIC_* keys, DB URLs, SDK keys |
| `ci` | instructions only | `gh secret set` commands — never commit |
| `runtime` | documented | MCP tokens in `~/.cursor/mcp.json` — user opts in |

4. Flip integration `status: active` when required secrets present; else `pending_credentials` (doctor warns, does not fail)

5. Create `{target_root}/.env.example` from manifest app-layer entries

---

## Phase F — Memory and INDEX initialization

- `.cursor/memories/architecture.md` — stack table, `workspace.target_root`, ADR index
- `.cursor/memories/operational-context.md` — Sprint 0 / init complete
- `.cursor/memories/business-rules.md` — product rules if known
- `.cursor/memories/incidents.md` — empty log
- Register new docs in `.sdlc/INDEX.md`

---

## Phase G — Operational doctor gate

```bash
cd .sdlc && npm run doctor:operational
```

| Result | Action |
|---|---|
| All pass | Set `sdlc.yaml.status: operational`, proceed to Phase H |
| Fail on `active` integration secrets | Return to Phase E |
| Warn on `pending_credentials` | Acceptable — document deferred secrets |
| Structural fail | Fix before marking operational |

Mid-init checkpoint (after Phase D, before Phase E): `doctor:structural` must pass.

---

## Phase H — Completion report

```
SDLC Specialization Complete

Mode:          bind | compose | resume
Profile:       <workspace.profile>
Target root:   <workspace.target_root>
Status:        operational
Slots:         work_items=plane, source_control=github, …
Integrations:  <active count> active, <pending> pending_credentials
Doctor:        operational — <pass/warn/fail counts>

Next: Create Plane epic via /sdlc:spec or /sdlc:feature — init does NOT deliver feature work.
```

Run `/sdlc:handoff` recording phases completed, slots selected, and any `pending_credentials`.

---

## Scope boundary (hard limits)

**Init owns:** SDLC binding, slot selection, integration materialization, credential manifest, minimal skeleton (compose only), memory/INDEX init, doctor gate.

**Init does NOT own:** Feature implementation, business logic, full test suites, domain playbooks, epic-level product work. Those enter via Plane tickets and `/sdlc:implement` after `status = operational`.

---

## Related

- ADR-029: `.sdlc/context/decisions/ADR-029-init-questionnaire-slot-aware-materialization.md`
- ADR-011: `.sdlc/context/decisions/ADR-011-distributable-sdlc-two-phase-init.md`
- `/sdlc:config` — post-init add/remove/swap (delta pipeline)
- `/sdlc:doctor --mode=structural|operational`
- CLI install: `npx @jambu/ai-native-sdlc install --runtime cursor` (W4)
