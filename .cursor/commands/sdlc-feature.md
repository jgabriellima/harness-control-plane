---
name: sdlc:feature
description: Shorthand entry point for starting a new feature cycle. Discovers or creates a Plane ticket, clarifies scope if needed, then delegates to /sdlc:implement. Use when intent is known but no ticket exists yet.
---

# /sdlc:feature — Feature Cycle Entry Point

Shorthand entry point for starting a feature. Handles the full pre-implementation setup:
discovers or creates a Plane ticket, asks clarifying questions, then hands off to
`/sdlc:implement`.

## Usage

```
/sdlc:feature [JAMBU-N | natural language description | nothing]
```

Examples:
```
/sdlc:feature                                          # discover from board
/sdlc:feature JAMBU-12                                 # use specific ticket
/sdlc:feature create a blog listing page with filters  # create new ticket from description
```

## Execution Protocol

---

### Step 0 — Use Superpowers

Before doing anything else, check whether any applicable skill should be invoked.
This is mandatory. Read `.cursor/skills/` and assess whether `spec-writer`, `plane-ticket`,
or `worktree` skills apply to the current request.

---

### Step 1 — Resolve the Ticket

**Case A: No argument provided**

Query the Plane board for open items:
```bash
# Fetch Todo + In Progress items from Plane
curl -s -H "X-API-Key: $PLANE_API_KEY" \
  "https://api.plane.so/api/v1/workspaces/jambuai/projects/5341a48e-1c49-4165-950a-75d34a5e699d/issues/?state=todo&per_page=20" \
  | jq '.results[] | {id: .sequence_id, title: .name, priority: .priority}'
```

Present the list to the user. Ask:
> "Which ticket should we work on? Or describe a new feature and I'll create a ticket."

Do NOT proceed without a ticket selection or feature description. Use the `stop` and ask
a clarifying question if needed.

**Case B: JAMBU-N provided**

Fetch the ticket:
```bash
curl -s -H "X-API-Key: $PLANE_API_KEY" \
  "https://api.plane.so/api/v1/workspaces/jambuai/projects/5341a48e-1c49-4165-950a-75d34a5e699d/issues/?sequence_id=N"
```

Read the full ticket including Technical Notes and Acceptance Criteria.
Surface any ambiguity to the user before proceeding.

**Case C: Natural language description provided**

Invoke `/sdlc:spec <description>` — this creates the spec, Plane ticket, and worktree.
After `/sdlc:spec` completes, continue with Step 2 using the created ticket.

---

### Step 2 — Clarify Before Implementation

Before writing a single line of code, verify:

1. Acceptance criteria are unambiguous and testable
2. Scope is bounded (name what is NOT included)
3. UI/UX behavior is specified (if frontend)
4. Data model changes are explicit (if any)

Ask the user directly about any of the above that is unclear or missing. Do NOT infer.
Use superpowers brainstorming skill if the scope or design needs exploration.

This step must produce a written confirmation of scope before moving to implementation.

---

### Step 3 — Enforce Worktree

Before any code change, verify or create the worktree for this ticket.

```bash
TICKET="JAMBU-{N}"
DESC="{feature-kebab}"
WORKTREE_PATH="/home/administrator/workspaces/jambu/worktrees/${TICKET}-${DESC}"

# Check if worktree already exists
if git worktree list | grep -q "$WORKTREE_PATH"; then
  echo "Worktree already exists at $WORKTREE_PATH"
else
  git worktree add "$WORKTREE_PATH" -b "feat/${TICKET}-${DESC}"
  echo "Created worktree at $WORKTREE_PATH on branch feat/${TICKET}-${DESC}"
fi
```

ALL subsequent file changes MUST be made inside the worktree, not in main.
Update INDEX.md "Active Worktrees" table with the worktree entry.

---

### Step 4 — Hand Off to /sdlc:implement

Invoke `/sdlc:implement JAMBU-{N}` with the resolved ticket ID.
The implement-feature command takes over from here.
