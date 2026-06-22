# /sdlc:baseline

**Trigger**: User invokes `/sdlc:baseline` or asks to "advance the SDLC baseline",
"bake structural changes into the baseline", or "update the SDLC foundation".

**Purpose**: Capture cognitive-layer evolutionary changes since the last `sdlc_baseline_tag`
into the baseline system so they survive a project reset. Creates a new SDLC baseline tag
and updates `scripts/reset.sh` memory templates.

---

## Baseline Model (ADR-014)

Baseline applies to the **cognitive orchestration layer** — what defines agent behavior,
rules, commands, and SDLC contracts. It survives `scripts/reset.sh`.

| Layer | Key | Scope |
|---|---|---|
| Upstream | `baseline.sdlc_package_version` | npm semver at install — not a git tag |
| Downstream | `baseline.sdlc_baseline_tag` | Cognitive SDLC infrastructure — local git tag |
| App (optional) | `baseline.app_baseline_tag` | `{target_root}/` restore point — local git tag |

### Consumer path (npm-installed projects)

Detect: `packages/ai-native-sdlc/` does **not** exist at repo root.

| Property | Value |
|---|---|
| Tag pattern | `{project-slug}-sdlc-v{major}.{minor}.0` (e.g. `my-app-sdlc-v1.0.0`) |
| First tag | `/sdlc:baseline` → `python3 .sdlc/bin/sdlc_baseline.py init` (after init completes — **not** during `/sdlc:init`, ADR-029) |
| Advance | `python3 .sdlc/bin/sdlc_baseline.py advance` — no `packages/` sync |
| Upstream | `baseline.sdlc_package_version` set at CLI install; immutable until npm upgrade |

Consumer projects do **not** reference authoring-monorepo tags (`v0.N.0-sdlc`). Those tags
exist only in the authoring repo's git history.

### Authoring path (this monorepo)

Detect: `packages/ai-native-sdlc/` exists.

| Property | Value |
|---|---|
| Tag pattern | `v0.{N}.0-sdlc` (e.g. `v0.19.0-sdlc`) |
| Package sync | **Required** before advance — `sync-templates.sh` + `npm run build` |
| Scope | `packages/**` included in structural commit — distributable build artifact (ADR-011) |

Authoring `v0.N.0-sdlc` tags are **local downstream tags in this repo** — never distributed
to npm consumers.

---

## Hard Constraints (non-negotiable)

1. **Zero feature code enters the baseline.** Nothing from `{target_root}/src/`, no feature-specific
   dependencies, no feature ADRs, no feature E2E tests.

2. **The app baseline tag is NOT changed.** `APP_BASELINE_TAG` and `app_baseline_tag` are only
   modified when a human explicitly decides to change the Hello World demo state.
   `/sdlc:baseline` only advances `SDLC_BASELINE_TAG`.

3. **Authoring repo: sync package before baseline advance.** When `packages/ai-native-sdlc/`
   exists, run `sync-templates.sh` then `npm run build` so distributable templates match
   the cognitive layer being tagged. Commit `packages/**` changes in the same baseline commit.

4. **The command is idempotent.** Running it twice with no structural changes produces no diff
   and no new tag.

---

## Classification Rules

### STRUCTURAL (include in `sdlc_baseline_tag`)

| Path Pattern | Rationale |
|---|---|
| `.cursor/rules/*.mdc` | Agent behavioral invariants |
| `.cursor/commands/*.md` | Agent command definitions |
| `.cursor/skills/{name}/SKILL.md` | Agent skill definitions |
| `.cursor/agents/*.md` | Agent definitions |
| `.cursor/hooks.json` | Cursor hook registry |
| `.cursor/hooks/*.{sh,py}` | Cursor hook scripts |
| `.cursor/memories/*.md` | Memory template structure (not session content) |
| `.github/workflows/*.yaml` | CI pipeline patterns and invariants |
| `scripts/hooks/*` | Git hooks |
| `scripts/*.sh` | Project scripts (reset.sh, install-hooks.sh) |
| `.sdlc/bin/**` | SDLC runtime scripts (ADR-011) |
| `.sdlc/context/decisions/ADR-*.md` | ADRs that document SDLC patterns |
| `.sdlc/INDEX.md` | Navigation index — structural sections only |
| `.sdlc/sdlc.yaml` | Operational contract |
| `.sdlc/templates/**` | Document and integration templates |
| `.sdlc/workflows/*.yaml` | SDLC workflow definitions |
| `.sdlc/integrations/*/*.yaml` | Integration configs |
| `.sdlc/doctor/*.ts` | SDLC doctor runtime checks |
| `.sdlc/pipeline/**` | Integration mutator pipeline |
| `.sdlc/playbooks/**` | Domain playbook catalog and schemas |
| `.sdlc/schemas/**` | JSON schemas for SDLC contracts |
| `.sdlc/gates/**` | Deterministic gate definitions (`.pass.yaml`) |
| `packages/**` | **Authoring monorepo only** — distributable build artifact (ADR-011) |
| `examples/README.md` | Reference app index (ADR-011) |
| `{target_root}/package.json` | ONLY `scripts.prepare` and `scripts.gates:*` entries |
| `README.md` | Project-level documentation |

**Package exclusions** (never tracked): `packages/**/node_modules/**`, `**/*.tsbuildinfo`,
`packages/**/templates/sdlc/pipeline/.last-plan.json`

### FEATURE (never include in baseline)

| Path Pattern | Rationale |
|---|---|
| `{target_root}/src/**` | Feature code — restored from `APP_BASELINE_TAG` on reset |
| `{target_root}/e2e/**` | Feature E2E tests |
| `{target_root}/CHANGELOG.md` | Feature release history |
| `{target_root}/astro.config.mjs` | Feature-specific Astro config |
| `.sdlc/specs/**` | Feature specifications |
| `.sdlc/handoffs/**` | Session history — cleared on reset |
| `.sdlc/evidence/**` | QA evidence — cleared on reset |
| `.sdlc/runs/**` | E2E run manifests — session state |
| `.sdlc/trace/**` | Local trace sessions — runtime state (schema.md is synced to package via sync-templates) |
| `.cursor/memories/operational-context.md` | Session sprint state |
| `{target_root}/package.json` dependencies | Feature deps |

### AMBIGUOUS — apply judgment

ADRs in `.sdlc/context/decisions/`:
- SDLC pattern (gate, CI, workflow, distribution) → STRUCTURAL
- Feature choice (SSR mode, DB, adapter) → FEATURE

---

## Execution Protocol

Detect path first:

```bash
if [ -d packages/ai-native-sdlc ]; then echo "PATH: authoring"; else echo "PATH: consumer"; fi
python3 .sdlc/bin/sdlc_baseline.py status
```

### Step 1 — Read current baseline state

```bash
SDLC_TAG=$(grep 'sdlc_baseline_tag:' .sdlc/sdlc.yaml | awk -F'"' '{print $2}')
echo "Current SDLC baseline: $SDLC_TAG"

echo "=== Committed since $SDLC_TAG ==="
git diff "$SDLC_TAG"..HEAD --name-only

echo "=== Uncommitted (working tree) ==="
git status --short
```

If `SDLC_TAG` is empty and `status: operational`, run init before advance:

```bash
python3 .sdlc/bin/sdlc_baseline.py init --reason "post-init bootstrap"
```

### Step 2 — Classify changes

Classify every file from both lists into STRUCTURAL vs FEATURE.
Print both lists for verification.

Or use the CLI classifier:

```bash
python3 .sdlc/bin/sdlc_baseline.py advance --dry-run
```

### Step 3 — Authoring only: sync distributable package

**Consumer path: skip this step entirely.** No `packages/` directory; no sync-templates.

**Authoring path:** when `packages/ai-native-sdlc/` exists:

```bash
bash packages/ai-native-sdlc/scripts/sync-templates.sh
cd packages/ai-native-sdlc && npm run build
```

Re-classify `packages/**` after sync.

### Step 4 — Update reset.sh memory templates

Update embedded memory templates (ADRs, gates, rules → architecture.md template).
Update `SDLC_BASELINE_TAG` constant when tag advances.
The CLI `advance` command updates this constant automatically when present.

### Step 5 — Update INDEX.md

Register new structural files. Do NOT register feature artifacts.

### Step 6 — Advance baseline (preferred: CLI)

Both paths use `sdlc_baseline.py advance` after manual template edits (Steps 4–5):

```bash
python3 .sdlc/bin/sdlc_baseline.py advance --reason "describe structural changes"
```

The CLI commits structural files, creates the next tag, and updates `sdlc.yaml`:

| Path | Next tag example |
|---|---|
| Consumer | `{slug}-sdlc-v1.{N+1}.0` |
| Authoring | `v0.{N+1}.0-sdlc` |

Manual fallback (authoring only) when CLI cannot run:

```yaml
baseline:
  sdlc_baseline_tag: "v0.{N+1}.0-sdlc"
  last_sdlc_baseline_date: "{YYYY-MM-DD}"
  sdlc_baseline_changes:
    - "..."
```

```bash
git add scripts/reset.sh .sdlc/sdlc.yaml .sdlc/INDEX.md \
  .cursor/ .sdlc/bin/ .sdlc/context/decisions/ .sdlc/doctor/ \
  .sdlc/pipeline/ .sdlc/playbooks/ .sdlc/schemas/ .sdlc/templates/ \
  .sdlc/workflows/ .github/workflows/ scripts/ packages/ README.md

git commit -m "chore(sdlc): advance SDLC baseline to v0.{N+1}.0-sdlc"
git tag "v0.{N+1}.0-sdlc"
```

Consumer manual fallback — omit `packages/` from `git add`:

```bash
git tag "{slug}-sdlc-v1.{N+1}.0"
```

### Step 7 — Verify

```bash
python3 .sdlc/bin/sdlc_baseline.py verify
git describe --tags HEAD
# /sdlc:doctor
```

---

## When to Run

Run when cognitive SDLC infrastructure evolves: rules, hooks, ADRs, CI gates, commands,
agents, `.sdlc/bin/`, playbooks, doctor checks.

In the authoring monorepo, also run when `@jambu/ai-native-sdlc` CLI or templates change —
after sync + build, as part of the same SDLC baseline advance.

Do NOT run after every feature cycle.
