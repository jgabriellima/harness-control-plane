---
name: handoff
description: Use when a significant execution phase ends — after feature implementation, incident resolution, deployment, or QA run — and session context must be persisted to .sdlc/handoffs/ for the next session to resume from.
---

# Handoff Skill

## When to Use
Call this skill at the END of every significant execution:
- After completing a feature implementation
- After resolving an incident
- After a deployment
- After running QA
- After any session that produced artifacts or decisions

The `stop` hook will prompt you — but also call this explicitly when work is done.

## Storage Location
```
.sdlc/handoffs/
  LATEST.md                           ← always the most recent handoff (symlink or copy)
  {YYYY-MM-DD-HHMM}-{ticket}-{phase}.md  ← timestamped records
```

The `sessionStart` hook reads `LATEST.md` at the start of every session. This is how context persists across sessions without relying on conversation history.

## Execution Protocol

### Step 1 — Gather what happened

Collect:
- Plane ticket ID(s) worked on
- Phase completed (planning / implementation / review / qa / deploy / incident)
- Files changed (git diff --name-only HEAD)
- PR URL (if created)
- Evidence location (if QA ran)
- What is complete
- What is still in progress
- What is blocked
- What is next

### Step 2 — Write the handoff file

```bash
TIMESTAMP=$(date +%Y-%m-%d-%H%M)
TICKET_ID="${1:-unknown}"    # passed as argument or detected
PHASE="${2:-completed}"
FILE=".sdlc/handoffs/${TIMESTAMP}-${TICKET_ID}-${PHASE}.md"
```

Use this template:

```markdown
# Handoff — {ticket-id} — {phase} — {timestamp}

## Status
{COMPLETE | IN_PROGRESS | BLOCKED}

## Plane Ticket
- ID: {JAMBU-N}
- URL: https://app.plane.so/jambuai/projects/5341a48e-1c49-4165-950a-75d34a5e699d/issues/{plane-issue-id}/
- State: {Backlog | Todo | In Progress | Done}

## What Was Done
{Concise bullet list of completed work}

## Artifacts
- PR: {URL or "not yet created"}
- Evidence: {.sdlc/evidence/... or "none"}
- Spec: {.sdlc/specs/... or "none"}

## Files Changed
{git diff --name-only output}

## In Progress / Next
{What the next session should pick up}

## Blocked By
{Any blockers, or "none"}

## Context for Next Session
{Any critical context that would be lost without this note — architectural decisions made, gotchas discovered, approach chosen and why}

## E2E Run Manifest (mandatory when ACTIVE run exists)

If `.sdlc/runs/ACTIVE` points to a run, this section is **required**:

```markdown
## Goal Run Manifest
- run_id: {from .sdlc/workflow-runs/ACTIVE}
- workflow_id: goal-flow
- run_status: {manifest.status}
- next_node: {output of `sdlc_workflow_run.py status --json`}
- epic: {JAMBU-N or none}
- tickets: {registered ticket ids + pr_url + status}
- manifest_path: .sdlc/workflow-runs/{run_id}/manifest.yaml
- validate: {PASS | FAIL — output of `sdlc_workflow_manifest.py validate`}
```

**Hard rule:** Handoff is incomplete for `/sdlc:goal` sessions until `record-handoff` succeeds (Step 3b).

### Step 3 — Update LATEST.md

```bash
cp "$FILE" ".sdlc/handoffs/LATEST.md"
```

### Step 3b — Bind handoff to active goal run (mandatory for /sdlc:goal)

If `.sdlc/workflow-runs/ACTIVE` exists and is non-empty:

```bash
ACTIVE=$(cat .sdlc/workflow-runs/ACTIVE)
python3 .sdlc/bin/sdlc_workflow_run.py status --run-id "$ACTIVE"
python3 .sdlc/bin/sdlc_workflow_manifest.py validate --run-id "$ACTIVE"
```

Document `run_id`, `workflow_id` (`goal-flow`), `next_node`, and `continuity` in the handoff body. Do **not** call `sdlc_e2e_manifest.py` (removed ADR-020). Legacy `.sdlc/runs/ACTIVE` is read-only archive.

Node transitions use `sdlc_workflow_run.py step` / `submit` only — never manual manifest edits except recovery documented in handoff.

### Step 4 — Update Plane ticket state

If work is complete: move Plane ticket to "Done" state.
If work is in progress: move to "In Progress".

```bash
curl -s -X PATCH \
  -H "X-API-Key: $PLANE_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"state\": \"{state-id}\"}" \
  "https://api.plane.so/api/v1/workspaces/jambuai/projects/5341a48e-1c49-4165-950a-75d34a5e699d/issues/{issue-id}/"
```

### Step 5 — Update operational context memory

Append to `.cursor/memories/operational-context.md` under "Recent Deployments" or the relevant section:
```
Last handoff: {timestamp} | {ticket-id} | {phase} | {status}
```

## Output

After writing:
```
Handoff recorded: .sdlc/handoffs/{filename}
LATEST.md updated.
E2E manifest: record-handoff → RUN_ID={run_id} NEXT_STAGE={stage}  (if ACTIVE run)
Plane ticket {JAMBU-N} → {state}
```
