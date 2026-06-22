---
name: sdlc-config
description: >
  Generic integration configuration command. Handles adding, removing, or swapping
  any integration in the SDLC stack. Discovers all affected files, plans the migration,
  asks the user only for necessary inputs, applies changes, and runs sdlc-doctor to
  verify total alignment.
---

# /sdlc:config — Integration Configuration Manager

Modify any integration in the SDLC stack. Accepts natural language directives.

## Usage

```
/sdlc:config <directive>
```

**Directive examples:**
- `/sdlc:config mude do sentry para o posthog`
- `/sdlc:config swap sentry posthog`
- `/sdlc:config add datadog`
- `/sdlc:config remove sentry`
- `/sdlc:config replace vercel with railway`

**Delivery closure (ADR-028):** integration swaps do not change goal completion tier. For `delivery.default_closure` and `delivery.surfaces`, edit `.sdlc/sdlc.yaml` per [Delivery closure](../../docs/engineering/delivery-closure.md), then run:

```bash
python3 .sdlc/bin/sdlc_delivery.py explain
python3 .sdlc/bin/sdlc_delivery.py validate
```

---

## Execution Protocol

Follow ALL phases in order. Do not skip any phase.

**Pipeline engine (ADR-011 W3):** Deterministic materialization, `sdlc.yaml` updates, and credential manifest generation run through `.sdlc/pipeline/integration-mutator.ts`. Agent work remains: intent parsing, user questions, profile-aware patches (rules, app SDK, CI), build validation, and doctor gate.

---

## Phase 1: Parse Intent

Extract from the directive:
- `action`: one of `swap` | `add` | `remove`
- `source_integration`: integration being replaced or removed (if applicable)
- `target_integration`: integration being added or swapped to (if applicable)

If intent is ambiguous, ask ONE clarifying question before continuing.

---

## Phase 2: Plan — Pipeline dry-run + discovery

Build a mutation plan before touching files:

```bash
cd .sdlc

# swap
npx ts-node pipeline/integration-mutator.ts plan \
  --action swap --from {source} --to {target} --slots {slot_id} --source config-swap

# add
npx ts-node pipeline/integration-mutator.ts plan \
  --action add --provider {target} --slots {slot_id} --source config-add

# remove
npx ts-node pipeline/integration-mutator.ts plan \
  --action remove --provider {source} --source config-remove
```

The plan JSON (default: `.sdlc/pipeline/.last-plan.json`) contains:

| Field | Use |
|---|---|
| `discovery` | Files referencing source/target — agent patch inventory |
| `materialize` / `remove` | What the pipeline will copy or delete |
| `credential_manifest_preview` | Secret count after mutation |
| `agent_tasks` | Profile-aware patches the agent must still apply manually |

Present the plan summary and discovery inventory to the user before proceeding.

For providers missing from `.sdlc/templates/integrations/`, complete Phase 3 (research) and seed a catalog template before apply.

---

## Phase 3: Research — Fetch Target Integration Documentation

If `target_integration` is not already configured in `.sdlc/integrations/`:

1. Search the web for the target integration's official docs for this project's framework:
   - Query: `{target_integration} {framework} SDK setup {current_year}`
   - Fetch the official docs page
2. Extract:
   - SDK package name(s)
   - Required environment variables
   - Initialization pattern
   - Feature parity with source (e.g. error tracking, releases, alerts)
   - Gaps that need compensating decisions

Present research summary. Note any features of `source_integration` with no direct equivalent
in `target_integration` — these require explicit decisions.

---

## Phase 4: Question Phase — Collect Required Inputs

Ask the user ONLY for inputs that cannot be inferred from existing config or research.
Group all questions and ask at once (do not ask one at a time for config values).

Typical required inputs for a swap:
- Target integration credentials (API keys, DSN, tokens)
- Which features from source to preserve (e.g. error tracking, session replay, alerting)
- Alert/notification routing preferences (if source had alerts)
- Whether to keep source integration as secondary (dual-run) during transition

Do NOT ask for things already in `.env`, existing integration files, or GitHub Secrets.

---

## Phase 5: Apply pipeline + agent patches

### 5.1 Apply deterministic mutation

```bash
cd .sdlc
npx ts-node pipeline/integration-mutator.ts apply --plan-file .sdlc/pipeline/.last-plan.json
```

This step: copies catalog templates → `.sdlc/integrations/`, updates `sdlc.yaml.integrations` with `serves_slots`, updates `project.stack` for non-materialized choices, regenerates `.sdlc/credential-manifest.yaml`, removes integration dirs on `remove`/`swap`.

### 5.2 Agent patches (from plan `agent_tasks` and `discovery`)

Apply changes in this order:

#### Remove source integration app artifacts (if swap or remove)
- Delete source SDK config files under `{target_root}/`
- Remove source packages from `{target_root}/package.json`

#### Update app dependencies
```bash
cd {target_root}
npm remove {source-packages}
npm add {target-packages}
npm install --include=optional --no-audit --no-fund
```

#### Update app configuration
- Framework config: remove source integration, add target SDK
- Create any new component files required by target SDK

#### Update environment variables
- `{target_root}/.env`: remove source vars, add target vars with collected values
- Note which vars need to be added to GitHub Secrets (CI scope)

#### Update GitHub Actions workflows
- Remove source-specific jobs
- Add target-specific jobs if needed

#### Update agent rules and instructions
- `.cursor/rules/observability.mdc` (or slot-specific rules): rewrite for target SDK
- `.cursor/agents/deployer.md`, `incident-resolver.md`: update tool references
- `.cursor/commands/sdlc-deploy.md`, `sdlc-post-deployment.md`, `sdlc-incident.md`

#### Update memory files
- `.cursor/memories/architecture.md`: Stack table, Integration Points

#### Update SDLC index
- `.sdlc/INDEX.md`: integration status line if changed

---

## Phase 6: Credential collection

After apply, prompt for secrets listed in `.sdlc/credential-manifest.yaml` (generated by pipeline). Write values to layers per manifest `layer` field. Flip integration `status: active` in `sdlc.yaml` when required secrets are present.

---

## Phase 7: Build Validation

```bash
cd {target_root}
npx astro sync
npx tsc --noEmit
npm run build
```

All three commands must exit 0 before proceeding.

Fix any TypeScript or build errors before continuing to Phase 8.

---

## Phase 8: Run sdlc-doctor

```bash
cd .sdlc && npm run doctor:operational
```

Execute operational doctor (or full `/sdlc:doctor` protocol for comprehensive audit).

Expected outcome:
- Check Group 2.3 passes with new integration file
- Check Group 4 shows new secrets as present (local scope)
- No ❌ errors

For any remaining ⚠ warnings, determine if they are expected (e.g. CI secrets not yet
set in GitHub) and document them in the output.

---

## Phase 9: GitHub Secrets Update Guidance

For all secrets with `scope: ci` or `scope: both` in the new integration config, output
an actionable list:

```
GitHub Secrets to add/update at:
https://github.com/{org}/{repo}/settings/secrets/actions

Add:   {VAR_NAME}   — {description}
Remove: {OLD_VAR}   — no longer needed
```

---

## Phase 10: Output Summary

```
/sdlc:config Migration Report — {timestamp}
================================================

Action:  {action} {source} → {target}

Files modified:  {N}
Files deleted:   {N}
Files created:   {N}

Build:      {✅ PASS | ❌ FAIL}
sdlc-doctor: {✅ HEALTHY | ⚠ DEGRADED | ❌ CRITICAL}

Feature parity:
  ✅ {feature}: covered by {target equivalent}
  ⚠ {feature}: no direct equivalent — {compensating decision}

GitHub Secrets pending:
  {list of CI secrets that still need to be added in GitHub UI}

Next steps:
  1. {action required from user, e.g. "Add POSTHOG_KEY to GitHub Secrets"}
  2. {action required from user}
```

---

## Compensating Decisions Log

When a feature from `source_integration` has no direct equivalent in `target_integration`,
create an ADR entry:

```bash
cat >> .sdlc/context/decisions/ADR-XXX-{source}-to-{target}-gaps.md << 'EOF'
# ADR-XXX: {source} → {target} Feature Gap Decisions

Date: {date}
Status: ACCEPTED

## Context
Migration from {source} to {target} identified N feature gaps.

## Decisions

### {Feature Name}
- Source capability: {what source did}
- Target equivalent: {none | partial: description}
- Decision: {what we do instead}
- Trade-off: {what we lose}
EOF
```

Register in `.sdlc/INDEX.md` and `.cursor/memories/architecture.md`.
