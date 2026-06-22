---
name: sdlc-reflect
description: Audit all artifacts produced by the current development cycle — verify spec, evidence, Plane ticket state, GitHub PR, and memory files all reflect reality. Mandatory final step before handoff.
---

# /sdlc:reflect — Pipeline Artifact Audit

Inspect all artifacts produced by the current development cycle. Verify that every expected output exists, is correctly formed, and that all system state (Plane, GitHub, memory files, INDEX) reflects reality. Called as the mandatory final step of `/sdlc:implement` before handoff.

## Usage

```
/sdlc:reflect <JAMBU-N>
```

---

## What This Command Does

It does not trust sub-step self-reports. It reads the actual state of every artifact and compares it against what the pipeline requires. It finds gaps the pipeline missed. It fixes trivial gaps automatically. It blocks handoff if critical gaps remain.

---

## Execution Protocol

### Step 1 — Identify the ticket in scope

Read `.cursor/memories/operational-context.md` to confirm the active ticket. If `<JAMBU-N>` is provided, use that. Load the spec at `.sdlc/specs/{JAMBU-N}-*.md`.

---

### Step 2 — Run the artifact audit

Check every item in this table. For each row: verify the artifact exists and is correct. Mark status PASS, FAIL, or WARN.

| Category | Artifact | Pass Condition |
|---|---|---|
| Spec | `.sdlc/specs/{JAMBU-N}-*.md` | File exists, ID field shows JAMBU-N (not "draft"), Status is not "DRAFT" if PR is open |
| Plane ticket | JAMBU-N on Plane | State = "In Review" if PR is open; State = "Done" if PR merged; State = "In Progress" if no PR yet |
| Git | Worktree branch | Branch `feat/{JAMBU-N}-*` exists in `git worktree list`, **evidence dir exists inside that worktree path** |
| GitHub | PR | PR is OPEN, title contains JAMBU-N, risk label attached |
| Evidence | Worktree context | `.sdlc/evidence/{JAMBU-N}/` exists **inside the active worktree path** (not in main workspace) |
| Evidence | `.sdlc/evidence/{JAMBU-N}/manifest.md` | File exists inside worktree evidence dir |
| Evidence | Screenshots | At least 1 `.png` file in worktree's `.sdlc/evidence/{JAMBU-N}/` |
| Evidence | Videos | At least 1 `.webm` file in worktree's `.sdlc/evidence/{JAMBU-N}/` |
| Evidence | Not committed to git | `git -C {worktree} status --porcelain .sdlc/evidence/` returns nothing (gitignore working) |
| Evidence | INDEX registration | `.sdlc/INDEX.md` QA Evidence table has a row for JAMBU-N |
| Post-merge | Plane ticket state | If PR merged: state = "Done" (UUID `6225a1fd-225e-4ed7-a975-ca32a0d576c3`) |
| Post-merge | Plane comment | If PR merged: at least 1 comment on ticket with PR URL (verify via Plane API GET comments) |
| Post-merge | Evidence uploaded | If PR merged and `sdlc.yaml qa.evidence_upload_to_plane=true`: GET attachments returns N > 0 |
| Code | `CHANGELOG.md` | File exists in `{target_root}/`, has an `[Unreleased]` section with content |
| Code | TypeScript | `cd app && npx tsc --noEmit` exits 0 |
| Code | Build | `cd app && npm run build` exits 0 (run only if tsc passes) |
| Memory | `operational-context.md` | Feature row shows JAMBU-N with current phase (In Review if PR open, Done if merged) |
| Memory | `architecture.md` | Any new dependencies added during this feature are recorded in the Stack table |
| INDEX | Active Work Items | Row for JAMBU-N exists with correct state |
| INDEX | Active Worktrees | Row for JAMBU-N exists (remove after merge and worktree cleanup) |

**How to check evidence worktree context:**
```bash
TICKET="JAMBU-N"
WORKTREE_PATH=$(git worktree list | grep "${TICKET}" | awk '{print $1}')
EVIDENCE_PATH="${WORKTREE_PATH}/.sdlc/evidence/${TICKET}"

if [ -d "$EVIDENCE_PATH" ]; then
  PNG_COUNT=$(find "$EVIDENCE_PATH" -name "*.png" | wc -l)
  WEBM_COUNT=$(find "$EVIDENCE_PATH" -name "*.webm" | wc -l)
  echo "Evidence in worktree: $PNG_COUNT PNGs, $WEBM_COUNT WebMs"
else
  echo "FAIL: Evidence directory not found in worktree at $EVIDENCE_PATH"
  # Also check if it was accidentally created in main workspace
  MAIN_EVIDENCE="/home/administrator/workspaces/jambu/ai-blog/.sdlc/evidence/${TICKET}"
  [ -d "$MAIN_EVIDENCE" ] && echo "WARNING: Evidence found in main workspace instead — this is the root cause"
fi
```

---

### Step 3 — Auto-fix trivial gaps

For any FAIL that can be corrected without human input, fix it immediately and re-mark as PASS:

| Gap | Auto-fix |
|---|---|
| Plane ticket in wrong state (In Progress instead of In Review) | PATCH ticket state via API |
| Plane ticket not moved to Done after merge | PATCH ticket state to Done via API |
| INDEX row has wrong state label | Update the cell in INDEX.md |
| `operational-context.md` phase is stale | Update the phase field |
| Evidence row missing from INDEX | Add row to INDEX QA Evidence table |
| Spec status still "DRAFT" after PR open | Update status field to "In Review" |
| Plane comment not posted after merge | POST comment with PR URL and QA summary |
| Evidence in main workspace instead of worktree | Document as WARNING — cannot auto-fix, requires manual move to correct worktree path |

Do NOT auto-fix: missing screenshots/videos, failing tsc, failing build, missing PR, evidence in wrong location (worktree vs main), evidence not uploaded when upload_to_plane=true.

---

### Step 4 — Output audit report

Print the full audit table with PASS/FAIL/WARN/AUTO-FIXED status for every row:

```
/sdlc:reflect — JAMBU-N

Artifact Audit
==============

PASS   Spec file exists with correct ID
PASS   Plane ticket: In Review
PASS   Worktree branch clean
PASS   PR #N open with risk label
PASS   Evidence in worktree at /home/administrator/workspaces/jambu/worktrees/JAMBU-N-desc/.sdlc/evidence/JAMBU-N/
PASS   Evidence manifest exists in worktree
FAIL   Screenshots: 0 .png files found in worktree evidence dir
FAIL   Videos: 0 .webm files found in worktree evidence dir
FAIL   Post-merge: Plane ticket still "In Review" — not moved to Done
FAIL   Post-merge: 0 comments on Plane ticket (PR link not posted)
FAIL   Post-merge: 0 attachments on Plane ticket (evidence not uploaded)
PASS   CHANGELOG.md [Unreleased] section present
PASS   tsc --noEmit: 0 errors
WARN   build not re-verified (tsc passed, skipping to save time)
PASS   operational-context.md phase correct
PASS   architecture.md Stack table updated
PASS   INDEX Active Work Items correct
AUTO-FIXED  INDEX QA Evidence row added

Overall: FAIL (2 blocking gaps — screenshots and video recordings missing)

Remediation required before handoff:
1. Run qa-recording skill for JAMBU-N: .cursor/skills/qa-recording/SKILL.md
2. Verify .png and .webm files exist in .sdlc/evidence/JAMBU-N/
3. Re-run /sdlc:reflect JAMBU-N
```

---

### Step 5 — Gate on FAIL

If any FAIL item is in the "Evidence / Screenshots" or "Evidence / Videos" rows, or TypeScript fails, or build fails:

- Do NOT write the handoff
- Do NOT mark the pipeline complete
- Return the specific remediation steps to the caller
- The pipeline must loop back to fix the gaps before proceeding

If all rows are PASS or AUTO-FIXED or WARN:

- Write the session handoff (invoke `.cursor/skills/handoff/SKILL.md`)
- Mark pipeline complete

---

## Integration

This command is called as the final step of `/sdlc:implement` Step 8. It is also callable standalone at any point during a session to check SDLC health for a specific ticket.

The `session-stop` hook also calls a lightweight version of this check — if a ticket is In Progress or In Review and no reflection has been run this session, it warns before closing.
