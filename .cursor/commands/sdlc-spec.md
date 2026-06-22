---
name: sdlc:spec
description: Transform raw feature intent into an executable spec document, create a Plane ticket, and open an isolated git worktree. Entry point for all new feature work before any code is written.
---

# /sdlc:spec — Spec + Plane Ticket + Worktree

Transform raw feature intent into an executable spec, create a Plane ticket, and open a worktree. This is the entry point for all new feature work.

## Usage

```
/sdlc:spec <intent or description>
```

Examples:
```
/sdlc:spec Update blog homepage title, description and author metadata
/sdlc:spec Users need to filter posts by tag
/sdlc:spec The about page is missing — create it with team info
```

## Execution Protocol

You are creating the complete pre-implementation setup. Follow all steps in order.

---

### Step 0 — Continuity resolve (mandatory)

Before creating a duplicate spec or ticket:

```bash
python3 .sdlc/bin/sdlc_continuity_resolve.py resolve --command /sdlc:spec --intent "<intent>" --json
```

| `action` | Agent behavior |
|----------|----------------|
| `proceed` | Continue with spec creation |
| `ask` | Present `run_id` and options; require `--continue`, `--redo-node`, or `--new-run` |
| `resume` | Run `cli` from JSON — do not start a parallel spec |
| `redo_node` | Run `node-redo` CLI then re-enter workflow |
| `new_run` | Only if operator explicitly chose `--new-run` |

---

### Step 1 — Consult INDEX

Read `.sdlc/INDEX.md` first. Check:
- Is there an existing spec for this intent?
- Is there an active Plane ticket already covering this?
- Are there relevant ADRs that constrain the approach?

If a duplicate exists, surface it and ask whether to extend the existing ticket or create a new one.

---

### Step 2 — Invoke spec-writer skill

Read `.cursor/skills/spec-writer/SKILL.md` and execute it fully.

Produce the spec document at `.sdlc/specs/{draft-id}-{feature-kebab}.md`.

---

### Step 3 — Invoke plane-ticket skill

Read `.cursor/skills/plane-ticket/SKILL.md` and create the Plane ticket.

The `PLANE_API_KEY` environment variable must be set.

Map spec sections to Plane fields per the ticket template in `.sdlc/templates/plane-ticket.md`.

After creation, record the returned `sequence_id` as `JAMBU-N` and `id` as the UUID.

Update the spec file: replace `{draft-id}` with `JAMBU-N`.

---

### Step 4 — Register in INDEX

Add to `.sdlc/INDEX.md`:
- Under "Active Work Items": add row with JAMBU-N, title, state=Todo, spec link
- Under "Specs": add row with spec file link

---

### Step 5 — Invoke worktree skill

Read `.cursor/skills/worktree/SKILL.md` and create the worktree:

```bash
TICKET="JAMBU-{N}"
DESC="{feature-kebab}"
git worktree add "../worktrees/${TICKET}-${DESC}" -b "feat/${TICKET}-${DESC}"
```

Add the worktree to INDEX under "Active Worktrees".

---

### Step 6 — Confirm ticket remains in Todo

Do NOT move the ticket to "In Progress" here. The ticket stays in Todo until `/sdlc:implement` is invoked. A worktree existing does not mean implementation has started — it means the environment is ready. Moving to In Progress before any code is written produces a false signal in Plane.

---

### Step 6 — Memory Consolidation

After the spec and ticket are created, update memory files where applicable:

| Condition | File to update |
|---|---|
| Always | `.cursor/memories/operational-context.md` — add the new ticket to "Active Features In Progress" with ticket ID, branch name, and spec path |
| Spec reveals a new domain constraint or content rule not previously recorded | `.cursor/memories/business-rules.md` — append the constraint to the relevant section |
| Spec decision requires an ADR | `.cursor/memories/architecture.md` — note the pending decision; create the ADR stub at `.sdlc/context/decisions/ADR-{NNN}.md` |

---

### Step 7 — Output

```
✅ Spec created
   File:   .sdlc/specs/JAMBU-{N}-{feature}.md

✅ Plane ticket created
   ID:     JAMBU-{N}
   URL:    https://app.plane.so/jambuai/projects/.../issues/{uuid}/
   State:  In Progress

✅ Worktree created
   Path:   ../worktrees/JAMBU-{N}-{feature}/
   Branch: feat/JAMBU-{N}-{feature}

✅ INDEX updated

Next: /sdlc:implement JAMBU-{N}
```
