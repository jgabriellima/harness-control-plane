---
name: sdlc:implement
description: Execute the full feature implementation lifecycle — plan, implement, review, QA, and PR — from an approved Plane ticket and spec. Requires a worktree to be active.
---

# /sdlc:implement — Feature Implementation Pipeline

Execute a full feature implementation lifecycle: plan → implement → review → QA → PR.

## Usage

```
/sdlc:implement <feature description or Plane ticket ID>
```

Example:
```
/sdlc:implement Add search functionality to the blog post list
/sdlc:implement BLOG-42
```

## Execution Protocol

You are operating as an orchestrator. You will invoke the planner, implementer, reviewer, and QA agents in sequence. Do not skip agents.

---

### Step 0 — Continuity resolve (mandatory)

Before creating a duplicate implementation run or worktree:

```bash
python3 .sdlc/bin/sdlc_continuity_resolve.py resolve --command /sdlc:implement --intent "<ticket or feature>" --json
```

| `action` | Agent behavior |
|----------|----------------|
| `proceed` | Continue with worktree + implementation |
| `ask` | Present `run_id` and options; require `--continue`, `--redo-node`, or `--new-run` |
| `resume` | Run `cli` from JSON — do not start parallel feature-flow |
| `redo_node` | Run `node-redo` CLI then re-enter workflow |
| `new_run` | Only if operator explicitly chose `--new-run` |

---

### Step 1 — Enforce Worktree Branch

This is a hard prerequisite. ALL code changes MUST happen inside a git worktree, never on `main`.

```bash
TICKET="JAMBU-{N}"   # replace with actual ticket ID
DESC="{feature-kebab}"
WORKTREE_PATH="/home/administrator/workspaces/jambu/worktrees/${TICKET}-${DESC}"

# Verify or create worktree
if git worktree list | grep -q "$WORKTREE_PATH"; then
  echo "Worktree active: $WORKTREE_PATH"
else
  git worktree add "$WORKTREE_PATH" -b "feat/${TICKET}-${DESC}"
  echo "Created worktree: $WORKTREE_PATH"
fi

# All subsequent work runs inside the worktree
cd "$WORKTREE_PATH"
```

If a worktree cannot be created (e.g. no Plane ticket exists), STOP and invoke `/sdlc:feature` first.
Do not implement anything without a worktree on a named branch.

---

### Step 0.5 — Move Plane Ticket to In Progress

Implementation is starting. Move the Plane ticket from Todo to In Progress NOW — before any code is written. This is the correct transition point.

```bash
PLANE_API_KEY="${PLANE_API_KEY}"
curl -s -X PATCH \
  -H "X-API-Key: $PLANE_API_KEY" \
  -H "Content-Type: application/json" \
  "https://api.plane.so/api/v1/workspaces/jambuai/projects/5341a48e-1c49-4165-950a-75d34a5e699d/issues/{issue-uuid}/" \
  -d '{"state": "08fe0d8a-88a6-4f73-a375-6059b21bb6b0"}'
```

Also update `.sdlc/INDEX.md` and `.cursor/memories/operational-context.md` to reflect "In Progress".

---

### Step 1 — Hydrate Context

Before planning, read:
1. `.cursor/memories/architecture.md`
2. `.cursor/memories/operational-context.md`
3. `.sdlc/sdlc.yaml` (current operational state)
4. `.sdlc/context/decisions/` (relevant ADRs)

If a Plane ticket ID was provided, fetch the ticket via the Plane integration to get full requirements.

---

### Step 2 — Planning (Planner Agent)

Invoke the Planner agent. Provide:
- Feature description
- Current architecture context
- Active constraints from `business-rules.md`

Planner output MUST include:
- Affected files list
- Component decomposition
- TypeScript interfaces
- E2E test scenarios (written BEFORE implementation)
- ADR if architectural decisions are involved

Do NOT proceed to implementation without a complete plan.

---

### Step 3 — Implementation (Implementer Agent)

Invoke the Implementer agent with the plan output.

Implementation MUST:
- Follow all rules in `.cursor/rules/`
- Add observability instrumentation only when `project.stack.observability` is active
- Use TypeScript strict types throughout
- Not introduce any `any` types
- Update `CHANGELOG.md` with the change

---

### Step 4 — Review (Reviewer Agent)

Invoke the Reviewer agent on all changed files.

Reviewer MUST check:
- Architecture rule compliance (`.cursor/rules/architecture.mdc`)
- Astro pattern compliance (`.cursor/rules/astro-patterns.mdc`)
- Frontend quality (`.cursor/rules/frontend-rules.mdc`)
- Observability coverage (`.cursor/rules/observability.mdc`)
- No forbidden patterns

If the Reviewer raises blockers, return to Step 3.

---

### Step 5 — QA (QA Agent)

Invoke the QA agent to run full browser validation.

**GATE: QA must run from the feature worktree.** Before invoking the QA agent, verify:
```bash
CURRENT_DIR=$(pwd)
MAIN_WORKTREE=$(git worktree list | head -1 | awk '{print $1}')
[ "$CURRENT_DIR" != "$MAIN_WORKTREE" ] || { echo "GATE FAIL: Must run QA from worktree"; exit 1; }
```

QA MUST:
1. Start the dev server from the worktree: `cd app && npm run dev`
2. Navigate to affected pages using the browser tool
3. Validate the feature works as specified
4. Run accessibility checks (axe-core or Playwright accessibility scanner)
5. Validate responsiveness at 375px, 768px, 1280px viewports
6. **Invoke the `qa-recording` skill** (`.cursor/skills/qa-recording/SKILL.md`) — MANDATORY. Produces video recordings at all three viewports and captures screenshots. Without this, QA cannot PASS.
7. Run E2E tests: `cd app && npx playwright test`
8. Store all evidence in `.sdlc/evidence/{TICKET}/` **within the worktree** — must include `.png` screenshots and `.webm` video files and `manifest.md`

**Evidence storage contract:**
- Evidence is NEVER committed to git (`.gitignore` excludes all PNG, WebM, and manifest from `.sdlc/evidence/`)
- Evidence is uploaded to Plane as attachments in Step 6.5 (post-merge)
- Evidence path must be `.sdlc/evidence/{TICKET}/` inside the active worktree

**QA cannot declare PASS without `.png` and `.webm` files in `.sdlc/evidence/{TICKET}/` inside the worktree.**

If QA fails, create a defect record and return to Step 3.

---

### Step 6 — PR Creation and Risk Decision

Before creating the PR, assess the change risk:

**Risk Classification:**

| Criteria | Low | Medium | High |
|---|---|---|---|
| Files changed | ≤ 5 | 6–15 | > 15 |
| Touches infra/config | No | Partial | Yes |
| New dependencies | No | 1–2 | 3+ |
| Breaking schema/API change | No | Backward-compat | Breaking |
| E2E coverage of change | Full | Partial | None/New |

Score the change. If any "High" criterion is true → HIGH. If 2+ "Medium" → MEDIUM. Otherwise → LOW.

**Mandatory after PR creation (all risk levels):**

Move Plane ticket to **In Review** immediately after `gh pr create` succeeds — before merge decision:

```bash
python3 .sdlc/bin/work_items_sync.py transition \
  --ticket JAMBU-{N} \
  --run-id {run_id} \
  --manifest-status ready_for_review
```

Also update spec status to `In Review` and `.cursor/memories/operational-context.md`.

**Action by Risk Level:**

**LOW risk:**
1. Create PR with `gh pr create`
2. **Move Plane ticket to In Review** (command above)
3. Verify all CI checks pass (or wait for them)
4. Merge automatically: `gh pr merge --squash --delete-branch`
5. Trigger deployment: `/sdlc:deploy --env production`

**MEDIUM or HIGH risk:**
1. Create PR with `gh pr create`
2. **Move Plane ticket to In Review** (command above)
3. Add risk classification label to PR via API: `gh api repos/{owner}/{repo}/issues/{pr-number}/labels --method POST -f 'labels[]=risk:high'`
4. Post a risk summary comment on the PR listing the specific risk factors
5. STOP — do not merge. Leave for human review.

**PR creation template (all risk levels):**

```bash
gh pr create \
  --title "feat(JAMBU-{N}): {feature description}" \
  --body "$(cat <<'EOF'
## Summary
{one paragraph describing what changed and why}

## Ticket
[JAMBU-{N}](https://app.plane.so/jambuai/projects/.../issues/{uuid}/)

## Risk Level
{LOW | MEDIUM | HIGH} — {reason}

## Acceptance Criteria Verified
- [ ] {criterion 1}
- [ ] {criterion 2}

## E2E Evidence
Evidence: `.sdlc/evidence/JAMBU-{N}-e2e-{timestamp}/`
Videos: {N} recordings across desktop, mobile, tablet viewports

## Test Results
{N} tests passed, 0 failed

EOF
)"
```

---

### Step 6.5 — Plane Ticket Closure (post-merge gate)

This step executes after the PR is merged. For LOW risk (auto-merged), execute immediately after merge confirmation. For MEDIUM/HIGH risk, execute after the human merges the PR.

**This step is MANDATORY. The pipeline is not complete until the Plane ticket is closed and evidence is uploaded.**

#### 6.5.1 — Move ticket to Done

```bash
TARGET_ROOT=$(python3 -c "import sys; sys.path.insert(0, '.sdlc/bin'); from _sdlc_paths import workspace_target_root; print(workspace_target_root())")
source "$TARGET_ROOT/.env"
curl -s -X PATCH \
  -H "X-API-Key: $PLANE_API_KEY" \
  -H "Content-Type: application/json" \
  "https://api.plane.so/api/v1/workspaces/jambuai/projects/5341a48e-1c49-4165-950a-75d34a5e699d/issues/{issue-uuid}/" \
  -d '{"state": "6225a1fd-225e-4ed7-a975-ca32a0d576c3"}'
```

#### 6.5.2 — Post QA summary comment

Post a comment containing: PR URL, merge date, QA verdict, test counts, viewport coverage, and the full content of `.sdlc/evidence/{TICKET}/manifest.md`.

```bash
TARGET_ROOT=$(python3 -c "import sys; sys.path.insert(0, '.sdlc/bin'); from _sdlc_paths import workspace_target_root; print(workspace_target_root())")
source "$TARGET_ROOT/.env"
curl -s -X POST \
  -H "X-API-Key: $PLANE_API_KEY" \
  -H "Content-Type: application/json" \
  "https://api.plane.so/api/v1/workspaces/jambuai/projects/5341a48e-1c49-4165-950a-75d34a5e699d/issues/{issue-uuid}/comments/" \
  -d '{"comment_html": "<h2>Implementation Complete</h2><p><strong>PR:</strong> <a href=\"{PR_URL}\">{PR_TITLE}</a> — merged {DATE}</p><h2>QA Verdict: PASS</h2>..."}'
```

#### 6.5.3 — Upload evidence to Plane (if sdlc.yaml qa.evidence_upload_to_plane is true)

Check `sdlc.yaml qa.evidence_upload_to_plane`. If `true` (default), execute the 3-step presigned URL upload for all PNG and WebM files in `.sdlc/evidence/{TICKET}/`.

Upload function (repeat for each file):
```bash
TARGET_ROOT=$(python3 -c "import sys; sys.path.insert(0, '.sdlc/bin'); from _sdlc_paths import workspace_target_root; print(workspace_target_root())")
source "$TARGET_ROOT/.env"
ISSUE_ID="{issue-uuid}"
EVIDENCE_DIR=".sdlc/evidence/{TICKET}"

upload_to_plane() {
  local filepath="$1" mime="$2"
  local filename=$(basename "$filepath")
  local size=$(stat -c%s "$filepath")

  # Step 1: Get presigned credentials
  CREDS=$(curl -s -X POST \
    -H "X-API-Key: $PLANE_API_KEY" \
    -H "Content-Type: application/json" \
    "https://api.plane.so/api/v1/workspaces/jambuai/projects/5341a48e-1c49-4165-950a-75d34a5e699d/work-items/${ISSUE_ID}/attachments/" \
    -d "{\"name\": \"${filename}\", \"type\": \"${mime}\", \"size\": ${size}}")

  ASSET_ID=$(echo "$CREDS" | python3 -c "import json,sys; print(json.load(sys.stdin)['asset_id'])")
  S3_URL=$(echo "$CREDS" | python3 -c "import json,sys; print(json.load(sys.stdin)['upload_data']['url'])")
  FIELDS=$(echo "$CREDS" | python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin)['upload_data']['fields']))")

  # Step 2: Upload to S3
  curl -s -o /dev/null -w "%{http_code}" -X POST "$S3_URL" \
    -F "Content-Type=${mime}" \
    -F "key=$(echo $FIELDS | python3 -c "import json,sys; print(json.load(sys.stdin)['key'])")" \
    -F "x-amz-algorithm=AWS4-HMAC-SHA256" \
    -F "x-amz-credential=$(echo $FIELDS | python3 -c "import json,sys; print(json.load(sys.stdin)['x-amz-credential'])")" \
    -F "x-amz-date=$(echo $FIELDS | python3 -c "import json,sys; print(json.load(sys.stdin)['x-amz-date'])")" \
    -F "policy=$(echo $FIELDS | python3 -c "import json,sys; print(json.load(sys.stdin)['policy'])")" \
    -F "x-amz-signature=$(echo $FIELDS | python3 -c "import json,sys; print(json.load(sys.stdin)['x-amz-signature'])")" \
    -F "file=@${filepath};type=${mime}"
  # Expected: 204

  # Step 3: Complete
  curl -s -X PATCH \
    -H "X-API-Key: $PLANE_API_KEY" -H "Content-Type: application/json" \
    "https://api.plane.so/api/v1/workspaces/jambuai/projects/5341a48e-1c49-4165-950a-75d34a5e699d/work-items/${ISSUE_ID}/attachments/${ASSET_ID}/" \
    -d '{"is_uploaded": true}' > /dev/null

  echo "Uploaded: $filename"
}

for f in "$EVIDENCE_DIR"/*.png; do upload_to_plane "$f" "image/png"; done
for f in "$EVIDENCE_DIR"/*.webm; do upload_to_plane "$f" "video/webm"; done
```

If `evidence_upload_to_plane` is false, skip 6.5.3 and note in the Plane comment that evidence is available locally.

---

### Step 7 — Memory Consolidation

Update memory files based on what changed this session. Only update files where the condition is true. Do not rewrite unchanged sections — append or modify only the affected content.

| Condition | File to update |
|---|---|
| New npm dependency added, stack changed, new component type introduced, structural directory added | `.cursor/memories/architecture.md` — add to Stack table or update the Directory Structure / Integration Points section |
| An ADR was created or decided | `.cursor/memories/architecture.md` — add row to "Key Architectural Decisions" table; also create the ADR file at `.sdlc/context/decisions/ADR-{NNN}.md` using the template |
| A domain constraint, content rule, or editorial policy was discovered or codified | `.cursor/memories/business-rules.md` — append to the relevant section |
| Feature moved to In Review / Complete | `.cursor/memories/operational-context.md` — update feature phase, PR URL, QA evidence location, date |

---

### Step 8 — Self-Reflection (mandatory gate before handoff)

Run `/sdlc:reflect <JAMBU-N>`. Read `.cursor/commands/sdlc-reflect.md` and execute the full audit.

This step is NOT optional. Do not write the handoff and do not declare the pipeline complete until `/sdlc:reflect` returns an overall PASS or AUTO-FIXED result with no blocking FAILs.

If reflection finds gaps: fix them, then re-run `/sdlc:reflect` until clean. Only then call `/sdlc:handoff`.
