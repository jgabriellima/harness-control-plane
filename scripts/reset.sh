#!/usr/bin/env bash
# =============================================================================
# scripts/reset.sh — Project Reset to Clean Demo State
# =============================================================================
#
# Resets the project to a reproducible baseline for SDLC flow validation:
#   - Blog application: restored to git tag v0.1.0-baseline (not hardcoded)
#   - Memory files: cleared of all work history, reset to initial state
#   - INDEX.md: active work, worktrees, specs, handoffs tables emptied
#   - Evidence directory: cleared
#   - Handoffs: LATEST.md reset to bootstrap state
#   - Git worktrees: all removed except main
#
# The app source of truth is the git tag. To update the baseline, create
# a new tag and update BASELINE_TAG in this script.
#
# IDEMPOTENT — safe to run multiple times.
# Does NOT remove the SDLC infrastructure (rules, commands, skills, agents).
# Does NOT remove the git repository or commit history.
#
# Usage:
#   ./scripts/reset.sh            # Reset project state only
#   ./scripts/reset.sh --commit   # Reset + create a git commit on main
#
# =============================================================================

set -euo pipefail

ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"

# Resolve application root from declarative workspace.target_root (ADR-011)
APP_REL="$(python3 -c "import sys; sys.path.insert(0, '$ROOT/.sdlc/bin'); from _sdlc_paths import workspace_target_rel; print(workspace_target_rel())")"
APP="$ROOT/$APP_REL"
if [[ "$APP_REL" == "." ]]; then APP="$ROOT"; fi

# Load .env from target_root if present
if [[ -f "$APP/.env" ]]; then
  set -o allexport
  # shellcheck source=/dev/null
  source "$APP/.env"
  set +o allexport
fi
SDLC="$ROOT/.sdlc"
CURSOR="$ROOT/.cursor"
SCRIPTS="$ROOT/scripts"

# ── Baseline Tags ─────────────────────────────────────────────────────────────
# APP_BASELINE_TAG     — controls what {target_root}/src/ is restored to (Hello World state)
#                        update ONLY when a new clean Hello World baseline is tagged.
# SDLC_BASELINE_TAG    — marks the SDLC cognitive infrastructure version baked into this script.
#                        updated by /sdlc:baseline when structural changes are captured.
#                        Does NOT affect {target_root}/src/ restoration.
APP_BASELINE_TAG="v0.1.2-baseline"
SDLC_BASELINE_TAG="v0.32.0-sdlc"

BASELINE_TAG="$APP_BASELINE_TAG"  # alias used by restore step below

COMMIT=false
KEEP_RUNS=false
for arg in "$@"; do
  [[ "$arg" == "--commit" ]] && COMMIT=true
  [[ "$arg" == "--keep-runs" ]] && KEEP_RUNS=true
done

# ── Branch guard ──────────────────────────────────────────────────────────────
CURRENT_BRANCH=$(git -C "$ROOT" rev-parse --abbrev-ref HEAD)
if [[ "$CURRENT_BRANCH" != "main" ]]; then
  echo "ERROR: reset must be run from the 'main' branch."
  echo "       Current branch: $CURRENT_BRANCH"
  echo "       Switch with: git checkout main"
  exit 1
fi

# ── Confirmation prompt ───────────────────────────────────────────────────────
echo ""
echo "==> PROJECT RESET"
echo ""
echo "    This will:"
echo "      - Cancel all Plane issues"
echo "      - Remove all git worktrees"
echo "      - Restore $APP_REL/src/ to $BASELINE_TAG"
echo "      - Clear evidence, handoffs, and memory files"
echo ""
echo "    Branch: main"
echo "    Baseline tag: $BASELINE_TAG"
echo ""
read -r -p "    Type 'reset' to confirm: " CONFIRM
if [[ "$CONFIRM" != "reset" ]]; then
  echo "Aborted."
  exit 0
fi

echo ""
echo "==> Resetting project at $ROOT"
echo ""

# ── 1. Remove active git worktrees ────────────────────────────────────────────
echo "[0/7] Resetting Plane project state..."

PLANE_WORKSPACE="jambuai"
PLANE_PROJECT="5341a48e-1c49-4165-950a-75d34a5e699d"
PLANE_API="https://api.plane.so/api/v1"
PLANE_CANCELLED_STATE="c4393832-7c30-482f-ae86-026774aa9dbc"

if [ -z "${PLANE_API_KEY:-}" ]; then
  echo "      WARNING: PLANE_API_KEY not set — skipping Plane reset."
  echo "      Set it via: export PLANE_API_KEY=<your-key>"
  echo "      Then re-run: ./scripts/reset.sh"
else
  # List all issues
  ISSUES=$(curl -s \
    -H "X-API-Key: $PLANE_API_KEY" \
    "$PLANE_API/workspaces/$PLANE_WORKSPACE/projects/$PLANE_PROJECT/issues/?per_page=100" \
    | python3 -c "import sys,json; data=json.load(sys.stdin); [print(r['id']) for r in data.get('results', [])]" 2>/dev/null || echo "")

  if [ -z "$ISSUES" ]; then
    echo "      No issues found or API error."
  else
    COUNT=0
    while IFS= read -r ISSUE_ID; do
      [ -z "$ISSUE_ID" ] && continue
      HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH \
        -H "X-API-Key: $PLANE_API_KEY" \
        -H "Content-Type: application/json" \
        "$PLANE_API/workspaces/$PLANE_WORKSPACE/projects/$PLANE_PROJECT/issues/$ISSUE_ID/" \
        -d "{\"state\": \"$PLANE_CANCELLED_STATE\"}")
      COUNT=$((COUNT + 1))
      echo "      Cancelled issue $ISSUE_ID (HTTP $HTTP_STATUS)"
    done <<< "$ISSUES"
    echo "      Done: $COUNT issue(s) cancelled."
  fi
fi

echo ""

echo "[1/7] Removing active worktrees..."

WORKTREES=$(git -C "$ROOT" worktree list --porcelain | grep "^worktree " | awk '{print $2}' | grep -v "^$ROOT$" || true)

if [ -n "$WORKTREES" ]; then
  while IFS= read -r wt; do
    echo "      Removing worktree: $wt"
    git -C "$ROOT" worktree remove --force "$wt" 2>/dev/null || rm -rf "$wt"
    # Delete the branch if it still exists
    BRANCH=$(git -C "$ROOT" worktree list --porcelain | grep -A2 "^worktree $wt" | grep "^branch" | awk '{print $2}' | sed 's|refs/heads/||' || true)
    [ -n "$BRANCH" ] && git -C "$ROOT" branch -D "$BRANCH" 2>/dev/null || true
  done <<< "$WORKTREES"
else
  echo "      No active worktrees to remove."
fi

# Prune stale worktree references
git -C "$ROOT" worktree prune

echo ""

# ── 2. Reset app to Hello World ───────────────────────────────────────────────
echo "[2/7] Resetting app to Hello World from tag $BASELINE_TAG..."

# Baseline tag may predate ADR-011 workspace.target_root migration (app/ → examples/*).
BASELINE_SRC="$APP_REL/src"
LEGACY_SRC="app/src"

tag_has_path() {
  git -C "$ROOT" ls-tree "$BASELINE_TAG" "$1" 2>/dev/null | grep -q .
}

if ! tag_has_path "$BASELINE_SRC"; then
  if tag_has_path "$LEGACY_SRC"; then
    echo "      Tag has legacy path $LEGACY_SRC — mapping to $APP_REL/src"
    BASELINE_SRC="$LEGACY_SRC"
  else
    echo "ERROR: baseline tag $BASELINE_TAG has neither $APP_REL/src/ nor $LEGACY_SRC"
    exit 1
  fi
fi

git -C "$ROOT" checkout "$BASELINE_TAG" -- "$BASELINE_SRC"

# When baseline lives under legacy app/, copy into workspace.target_root/src/
if [[ "$BASELINE_SRC" != "$APP_REL/src" ]]; then
  mkdir -p "$APP/src"
  rsync -a --delete "$ROOT/$BASELINE_SRC/" "$APP/src/"
  echo "      Synced $BASELINE_SRC → $APP_REL/src/"
  # Drop legacy checkout — app/ is not part of ADR-011 layout
  git -C "$ROOT" reset HEAD -- "$BASELINE_SRC" 2>/dev/null || true
  git -C "$ROOT" checkout HEAD -- "$BASELINE_SRC" 2>/dev/null || true
  rm -rf "$ROOT/$BASELINE_SRC"
fi

# Remove target_root/src files added after the baseline tag
while IFS= read -r tracked_file; do
  baseline_path="$tracked_file"
  if [[ "$BASELINE_SRC" != "$APP_REL/src" && "$tracked_file" == "$APP_REL/src/"* ]]; then
    baseline_path="${BASELINE_SRC}/${tracked_file#"$APP_REL/src/"}"
  fi
  if ! tag_has_path "$baseline_path"; then
    git -C "$ROOT" rm --cached "$tracked_file" 2>/dev/null || true
    rm -f "$ROOT/$tracked_file"
    echo "      Removed post-baseline file: $tracked_file"
  fi
done < <(git -C "$ROOT" ls-files "$APP_REL/src/")

echo "      Done: $APP_REL/src/ restored to $BASELINE_TAG."
echo ""

# ── 3. Clear evidence directory ───────────────────────────────────────────────
echo "[3/7] Clearing evidence directory..."

if [ -d "$SDLC/evidence" ]; then
  find "$SDLC/evidence" -mindepth 1 -maxdepth 1 ! -name ".gitkeep" -exec rm -rf {} + 2>/dev/null || true
  echo "      Evidence directory cleared."
else
  mkdir -p "$SDLC/evidence"
  echo "      Evidence directory created (was missing)."
fi

touch "$SDLC/evidence/.gitkeep"
echo ""

# ── 4. Reset handoffs ─────────────────────────────────────────────────────────
echo "[4/7] Resetting handoffs..."

RESET_DATE=$(date +%Y-%m-%d)

# LATEST.md may be a symlink from prior sessions — replace with a regular file.
rm -f "$SDLC/handoffs/LATEST.md"

cat > "$SDLC/handoffs/LATEST.md" << HANDOFF
# Handoff — RESET — $RESET_DATE

## Status
CLEAN RESET — No prior session work. Project is at baseline.

## What Was Done
- Project reset to clean demo state via scripts/reset.sh
- App reduced to Hello World
- All previous work history cleared from memory files
- Evidence directory cleared
- Git worktrees removed

## Context for Next Session
If binding a different application, set \`workspace.target_root\` in \`.sdlc/sdlc.yaml\`, then run \`/sdlc:init\` (bind mode).
Run \`/sdlc:doctor\` to verify system state.
Run \`/sdlc:spec\` or \`/sdlc:e2e\` to begin a new feature cycle.
HANDOFF

# Archive the timestamped reset handoff as well
cp "$SDLC/handoffs/LATEST.md" "$SDLC/handoffs/${RESET_DATE}-0000-RESET-baseline.md"

# Remove old session handoffs (keep the new reset one and LATEST)
find "$SDLC/handoffs" -name "*.md" \
  ! -name "LATEST.md" \
  ! -name "${RESET_DATE}-0000-RESET-baseline.md" \
  -delete 2>/dev/null || true

echo "      Handoffs reset to baseline."
echo ""

# ── 5. Reset memory files ─────────────────────────────────────────────────────
echo "[5/7] Resetting memory files..."

cat > "$CURSOR/memories/architecture.md" << 'MEM'
---
description: Persistent architectural state — stack constraints, directory structure, dependency inventory, and ADR index. Update when dependencies change, structural decisions are made, or ADRs are created.
---

# Architecture Memory

Last updated: —
Status: RESET — app feature history cleared; structural SDLC knowledge preserved below.

## Update Protocol

Write to this file when:
- A new npm dependency is added → add row to Stack table
- A structural directory change is made → update Directory Structure
- An ADR is decided → add row to Key Architectural Decisions
- A significant refactor occurs

Do not let this file drift from reality. It is a primary context source for all agents.

---

## Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Astro | ^6.x |
| Styling | Tailwind CSS | ^4.x |
| Language | TypeScript | strict mode |
| Observability | posthog-js | ^1.x |
| Testing | Playwright | ^1.60.x |
| SDLC CLI | @jambu/ai-native-sdlc | packages/ai-native-sdlc |

(add rows here as new dependencies are introduced by features)

## Directory Structure

```
{target_root}/   # workspace.target_root from .sdlc/sdlc.yaml (demo: examples/astro-blog)
  src/           — restored to Hello World on reset; populated by features
  e2e/           — Playwright E2E tests
  public/        — static assets
.sdlc/           — SDLC orchestration (declarative, materialized)
  work-items/    — local filesystem board when provider=local-work-items (ADR-025, ADR-039)
output/          — user deliverables root — run bundles, ticket evidence index (ADR-039)
packages/        — distributable npm packages (@jambu/ai-native-sdlc)
examples/        — reference apps bound via workspace.target_root
```

## Key Architectural Decisions

| ID | Decision | Date |
|---|---|---|
| ADR-006 | Deterministic lockfile sync gate — three enforcement layers (pre-commit, pre-push, Cursor rule) | 2026-05-20 |
| ADR-008 | Sentry → PostHog migration — observability platform swap; feature gap decisions for source maps, release tracking, and incident pipeline | 2026-05-21 |
| ADR-009 | E2E orchestration composes workflows — `/sdlc:e2e` dispatches subagents via `/sdlc:implement`; one ticket = one worktree = one feature-flow | 2026-05-22 |
| ADR-010 | Playbooks as domain procedural units — `.sdlc/playbooks/`; lazy catalog in PLAYBOOKS.md; `/sdlc:learn` F0–F3 register only; F4 compose opt-in via `--wire`; hydration scope in INDEX `[HYDRATION_SCOPE]` | 2026-05-23 |
| ADR-011 | Distributable SDLC two-phase init — `workspace.target_root`; npm `@jambu/ai-native-sdlc`; integration mutator; compose playbook; two baseline tags (app, sdlc) — packages/ is authoring-repo build artifact only | 2026-05-24 |
| ADR-012 | Deterministic gate matrix and workspace rebind — `gates:` in sdlc.yaml; stage-complete enforcement; deploy-stage protocol allowlist; `/sdlc:discovery`; mark-done rejects stub handoff | 2026-05-25 |
| ADR-013 | Starlight documentation profile — `profile: starlight` binds Astro 6 + Starlight SSG at `workspace.target_root`; workspace rebind via `sdlc_workspace_rebind.py`; slot-driven integration gate contracts via `sdlc_gate_runner.py` | 2026-05-26 |
| ADR-039 | User deliverables root `output/` — dual-root contract (harness `.sdlc/` vs user-facing deliverables); local-work-items active provider in authoring repo; Plane disabled | 2026-06-20 |

(add rows here as new ADRs are decided)

## Directory Index Mandate

Every agent-navigable directory MUST contain a `README.md` functioning as a navigation index.
Required directories and their index files:

| Directory | Index File | Purpose |
|---|---|---|
| `.github/` | `.github/README.md` | GitHub Actions workflow registry |
| `.cursor/commands/` | `.cursor/commands/README.md` | Slash command registry |
| `.cursor/agents/` | `.cursor/agents/README.md` | Agent protocol index |
| `.cursor/rules/` | `.cursor/rules/README.md` | Cursor rule registry |
| `.cursor/skills/` | `.cursor/skills/README.md` | Project skill registry |
| `scripts/` | `scripts/README.md` | Script registry |

Each README must contain: (1) one-sentence purpose, (2) file inventory table with role/trigger/dependencies, (3) cross-reference to `.sdlc/INDEX.md`.
When a new file is added to any indexed directory, update the README in the same commit.
Enforced by `/sdlc:doctor` Group 6 checks. See `.cursor/rules/architecture.mdc` Directory Index Mandate.

## Dependency Gate Contract

**This contract is structural SDLC knowledge. It survives every project reset.**

Any modification to `{target_root}/package.json` MUST execute the following sequence before
any `git commit`, `git push`, or PR creation:

```bash
cd "$APP" && npm install --include=optional --no-audit --no-fund
git add "$APP_REL/package-lock.json"
```

`--include=optional` covers `optionalDependencies` but NOT optional peer deps.
Any package that has optional peer deps with platform-conditional resolution
(e.g. packages using `@napi-rs/wasm-runtime`, native Node addons) MUST be
declared explicitly in `devDependencies` to guarantee lock file completeness
across macOS (dev) and ubuntu-latest (CI).

Before running `tsc --noEmit` or `astro check` on a clean checkout, always run
`npx astro sync` first — `.astro/types.d.ts` is gitignored and must be generated
for `astro:content` and `import.meta.env` type declarations to exist.

Enforcement layers (all three must remain active):
- `scripts/hooks/pre-commit` — detects staged package.json, runs install, auto-stages lock file
- `scripts/hooks/pre-push` — structural integrity check, <3s
- `.cursor/rules/dependency-gates.mdc` — agent-level invariant

Hook registration (run once per clone and per new worktree):
```bash
bash scripts/install-hooks.sh
```
`npm run prepare` calls this automatically.

## QA Evidence Policy

**This contract is structural SDLC knowledge. It survives every project reset.**

Evidence artifacts (screenshots, videos, manifests) produced during QA are NEVER committed to git.
They are generated in `.sdlc/evidence/{TICKET}/` **inside the active feature worktree**, then uploaded
to Plane as attachments and summarized in a comment after PR merge (Step 6.5 of `/sdlc:implement`).

Contract (see `sdlc.yaml qa.*` and `plane.yaml evidence_attachment`):
- Path: `.sdlc/evidence/{TICKET}/` within the worktree — not the main workspace
- Worktree gate: QA agents MUST verify CWD is not the main workspace before generating evidence
- Git exclusion: `.gitignore` excludes all PNG, WebM, JSON, and manifest.md under `.sdlc/evidence/`
- Upload: 3-step presigned URL flow via Plane `/work-items/{uuid}/attachments/` (NOT `/issue-attachments/`)
- Post-merge only: upload and Plane comment happen in `plane-closure` stage after PR merge
- MIME allowlist: image/png, image/jpeg, image/gif, video/webm, video/mp4, application/pdf, text/plain
- Size limit: 5 MB per attachment (Plane cloud)

Enforcement layers:
- `.cursor/agents/qa.md` — Phase 0 worktree context gate
- `.cursor/skills/qa-recording/SKILL.md` — Step 0 worktree gate + ticket-based evidence paths
- `.cursor/commands/sdlc-implement.md` — Step 6.5 Plane ticket closure (Done state, comment, upload)
- `.cursor/commands/sdlc-reflect.md` — evidence location and post-merge verification checks
- `.sdlc/workflows/sdlc:feature-flow.yaml` — `plane-closure` stage on PR merge

## Deviations and Non-Standard Patterns

(document here any patterns that deviate from the defaults assumed by sdlc:doctor or the architecture rules)

## Integration Points

| Integration | Status | Config Location |
|---|---|---|
| Plane | active | `.sdlc/integrations/plane/plane.yaml` |
| GitHub | active | `.sdlc/integrations/github/github.yaml` |
| PostHog | active | `.sdlc/integrations/posthog/posthog.yaml` |
| Sentry | inactive (replaced by PostHog — see ADR-008) | `.sdlc/integrations/sentry/sentry.yaml` |
| Vercel | active | `.sdlc/integrations/vercel/vercel.yaml` |

Each integration file owns its `secrets_required:` block — canonical source for
local env var requirements and CI secret contracts. `/sdlc:doctor` Check Group 4
reads these files and validates credential presence across local and CI scopes.

## Agent Infrastructure

| Agent | File | Invoked By | Role |
|---|---|---|---|
| planner | `.cursor/agents/planner.md` | /sdlc:implement | Decomposes spec into implementation plan |
| implementer | `.cursor/agents/implementer.md` | /sdlc:implement | Writes production code from plan |
| reviewer | `.cursor/agents/reviewer.md` | /sdlc:implement | Gates code against architecture rules |
| qa | `.cursor/agents/qa.md` | /sdlc:implement, /run:e2e | E2E validation and evidence collection |
| deployer | `.cursor/agents/deployer.md` | /sdlc:deploy | Staged deployment: build → staging → production with smoke validation at each gate |
| incident-resolver | `.cursor/agents/incident-resolver.md` | /sdlc:incident, incident-response.yaml | Autonomous incident triage via PostHog API, reproduction test, fix, and PR creation |
| spec-writer | `.cursor/agents/spec-writer.md` | /sdlc:spec | Converts feature requests into structured spec documents |

**Deployer protocol (structural — survives reset):**
The /sdlc:deploy command invokes the Deployer agent through a gated 7-stage pipeline:
build-validation → version-bump → staging-deploy → staging-validation → production-deploy → post-deploy-validation → release-finalization.
/sdlc:post-deployment is non-optional after production deploy. It owns: version audit, browser recording at 3 resolutions, Playwright smoke with video, PostHog error rate check, evidence manifest, and operator-gated rollback/incident escalation.
Rollback: vercel rollback --yes — only executes after operator consent via /sdlc:post-deployment Step 8.

**Incident Response CI pattern (structural — survives reset):**
.github/workflows/incident-response.yaml is triggered by: (1) issue comment /sdlc:incident on issues labeled incident, (2) PostHog webhook → repository_dispatch, (3) manual workflow_dispatch.
Requires CURSOR_API_KEY CI secret. Requires POSTHOG_PERSONAL_API_KEY CI secret for error query (not the public project key).
Creates Plane ticket, runs incident-resolver agent, writes regression test, applies fix, opens PR.
Fix branch naming: fix/POSTHOG-{id}-incident or fix/issue-{N}-incident.

## Performance Budget

| Metric | Target | Last Measured |
|---|---|---|
| — | — | — |
MEM

echo "      architecture.md reset."

cat > "$CURSOR/memories/business-rules.md" << 'MEM'
---
description: Domain constraints, content rules, and product invariants discovered during development. Update when new business logic, editorial rules, or content constraints are identified.
---

# Business Rules

Last updated: —
Status: EMPTY — populate as domain constraints are discovered

## Update Protocol

Write to this file when:
- A new content rule or editorial policy is established
- A user persona is confirmed or refined
- A non-negotiable requirement is added or changed
- An operational constraint is measured and set

---

## Product Purpose

(what this project is and why it exists — one paragraph max)

## Content Rules

(publication standards, voice, taxonomy — populate as policies are decided)

## User Personas

| Persona | Goal | Key Need |
|---|---|---|
| — | — | — |

## Non-Negotiable Requirements

(requirements that cannot be negotiated away — each must have a rationale)

## Operational Constraints

| Constraint | Value | How Measured |
|---|---|---|
| — | — | — |

## Integration Policy

| Integration | Criticality | Fallback |
|---|---|---|
| — | — | — |
MEM

echo "      business-rules.md reset."

cat > "$CURSOR/memories/incidents.md" << 'MEM'
---
description: Chronological log of all production incidents — severity, status, and resolution. Update when an incident is opened, escalated, or resolved.
---

# Incident Log

Last updated: —
Status: EMPTY — no incidents recorded

## Active Incidents

None.

## Incident History

| Date | ID | Severity | Error | Status | PR |
|---|---|---|---|---|---|
| — | — | — | — | — | — |

## Recurring Patterns

None identified.

## Post-Mortem Index

None.

---

## How to Use This Log

### Severity Levels

- **P1**: > 5% error rate or data loss risk — stop current work, fix immediately
- **P2**: > 1% error rate or revenue-path degradation — fix within 8 hours
- **P3**: < 1% error rate, cosmetic or edge-case — fix within current sprint

### Status Values

- `TRIAGING` — incident identified, investigation in progress
- `REPRODUCING` — reproduction test being written
- `IN_FIX` — fix being implemented
- `IN_REVIEW` — fix PR open
- `RESOLVED` — fix merged and deployed
- `CLOSED` — post-mortem complete

### Adding an Incident

When an incident is detected, add a row immediately:
```
| {YYYY-MM-DD} | SENTRY-{id} | P{1|2|3} | {error type: short description} | TRIAGING | — |
```

Then invoke `/sdlc:incident SENTRY-{id}` to begin the resolution pipeline.

For P1 and P2, create a full record at `.sdlc/incidents/{timestamp}-{issue-id}.md` and link it in the row.
MEM

echo "      incidents.md reset."

cat > "$CURSOR/memories/operational-context.md" << 'MEM'
---
description: Current sprint state, active features, recent deployments, and blocked items. Update when sprint objectives change, feature phases transition, or deployments are executed.
---

# Operational Context

Last updated: —
Status: EMPTY — populate at sprint start

## Update Protocol

Write to this file when:
- Sprint state changes (start, end, objective completed)
- A feature moves to a new phase (in progress, review, complete)
- A deployment is executed
- A blocked item is added or unblocked

---

## Current Sprint

(sprint name, goal, start date, end date)

## Sprint Objectives

| Objective | Status |
|---|---|
| — | — |

## Active Features In Progress

| Feature | Ticket | Phase | Worktree |
|---|---|---|---|
| — | — | — | — |

## Recent Handoffs

| Timestamp | Ticket | Phase | Status |
|---|---|---|---|
| — | — | — | — |

## Blocked Items

(list items that cannot proceed and why)

## Recent Deployments

| Version | Environment | Date | Status |
|---|---|---|---|
| — | — | — | — |

## SDLC Health

Last doctor run: —
Doctor status: —
MEM

echo "      operational-context.md reset."
echo ""

# ── 6. Clear orchestration artifacts + reset INDEX active sections ────────────
echo "[6/7] Clearing runs/specs/trace and resetting INDEX active sections..."

# E2E run manifests (keep README + _archive; optional --keep-runs for dev)
if [ -d "$SDLC/runs" ]; then
  if [ "$KEEP_RUNS" = true ]; then
    echo "      E2E runs preserved (--keep-runs)."
  else
    find "$SDLC/runs" -mindepth 1 -maxdepth 1 \
      ! -name "README.md" ! -name "_archive" -exec rm -rf {} + 2>/dev/null || true
    rm -f "$SDLC/runs/ACTIVE"
    echo "      E2E runs cleared (README + _archive preserved)."
  fi
fi

# Feature specs from prior cycles (untracked + tracked session artifacts)
if [ -d "$SDLC/specs" ]; then
  find "$SDLC/specs" -maxdepth 1 -name "*.md" ! -name "README.md" -delete 2>/dev/null || true
  echo "      Specs directory cleared."
fi

# Cognitive trace runtime state (schema + server config preserved)
if [ -d "$SDLC/trace" ]; then
  rm -f "$SDLC/trace/events.jsonl" "$SDLC/trace/trace-server.log" \
    "$SDLC/trace/trace-server.pid" "$SDLC/trace/dashboard.url" 2>/dev/null || true
  if [ -d "$SDLC/trace/state" ]; then
    find "$SDLC/trace/state" -mindepth 1 -delete 2>/dev/null || true
  fi
  echo "      Trace runtime state cleared."
fi

python3 - << 'PYEOF'
import re, pathlib

idx = pathlib.Path(".sdlc/INDEX.md")
content = idx.read_text()

def clear_bracket_block(content: str, tag: str, empty_line: str) -> str:
    pattern = rf"(\[{tag}\]\n).*?(\n\[/{tag}\])"
    replacement = rf"\1{empty_line}\2"
    return re.sub(pattern, replacement, content, flags=re.DOTALL)

# Bracket notation (current INDEX format)
for tag, empty in [
    ("ACTIVE_WORK", "status=RESET note=clean_baseline\n"),
    ("ACTIVE_WORKTREES", "none\n"),
    ("SPECS", "none\n"),
]:
    content = clear_bracket_block(content, tag, empty)

import datetime
reset_date = datetime.date.today().isoformat()
content = clear_bracket_block(
    content,
    "HANDOFFS",
    f"RESET date={reset_date} phase=reset status=CLEAN file=handoffs/LATEST.md\n",
)

# Legacy markdown tables (backward compatibility)
table_resets = [
    (r"(## Active Work Items \(Plane\)\n\n\| Ticket.*?\n\|[-|]+\n).*?(\n---)", r"\1| — | — | — | — | — |\n\2"),
    (r"(## Active Worktrees\n\n\| Ticket.*?\n\|[-|]+\n).*?(\n---)", r"\1| — | — | — | — |\n\2"),
    (r"(## Specs\n\n\| ID.*?\n\|[-|]+\n).*?(\n---)", r"\1| — | — | — | — |\n\2"),
    (r"(## Handoffs\n\n\| Date.*?\n\|[-|]+\n).*?(\n---)", r"\1| RESET | — | reset | CLEAN | [handoff](handoffs/LATEST.md) |\n\2"),
    (r"(## QA Evidence\n\n\| Date.*?\n\|[-|]+\n).*?(\n---)", r"\1| — | — | — | — |\n\2"),
]
for pattern, repl in table_resets:
    content = re.sub(pattern, repl, content, flags=re.DOTALL)

idx.write_text(content)
print("      INDEX.md active sections reset.")
PYEOF

echo ""

# ── 7. Verify build ───────────────────────────────────────────────────────────
echo "[7/7] Verifying app builds cleanly..."

cd "$APP"
if PATH="/home/administrator/.nvm/versions/node/v24.13.0/bin:$PATH" npm run build > /tmp/sdlc-reset-build.log 2>&1; then
  echo "      Build: OK"
else
  echo "      Build: FAILED — see /tmp/sdlc-reset-build.log"
  cat /tmp/sdlc-reset-build.log | tail -20
  echo ""
  echo "WARNING: Build failed after reset. Check the output above."
fi

cd "$ROOT"

# ── Optional commit ───────────────────────────────────────────────────────────
if [ "$COMMIT" = true ]; then
  echo ""
  echo "[+] Creating reset commit on main..."
  git -C "$ROOT" add -A
  git -C "$ROOT" commit -m "chore: reset project to clean demo baseline" \
    -m "- App reduced to Hello World page" \
    -m "- Sample blog posts removed" \
    -m "- Memory files cleared of session history" \
    -m "- Evidence directory cleared" \
    -m "- INDEX.md active tables emptied" \
    -m "- Worktrees removed"
  echo "      Committed: $(git -C "$ROOT" log --oneline -1)"
fi

echo ""
echo "==> Reset complete."
echo ""
echo "    Next steps:"
echo "    1. Verify: cd $APP_REL && npm run preview (build already ran)"
echo "    2. If binding a different app: set workspace.target_root in .sdlc/sdlc.yaml"
echo "    3. Run /sdlc:init (bind mode) to detect stack and refresh memories"
echo "    4. Run /sdlc:doctor to verify system state"
echo "    5. Run /sdlc:spec or /sdlc:e2e to begin a new cycle"
echo ""
