---
name: sdlc:handoff
description: Record what was accomplished this session into .sdlc/handoffs/ so the next session resumes with full context. Updates LATEST.md, Plane ticket state, and operational-context memory.
---

# /sdlc:handoff — Session Handoff Recording

Record what was done this session so the next session starts with full context.

## Usage

```
/sdlc:handoff [--ticket JAMBU-N] [--phase implementation|qa|deploy|incident]
```

Called:
- Explicitly by the developer at end of a session
- Automatically by the `stop` hook prompt (see `.cursor/hooks.json`)
- By `/sdlc:implement`, `/sdlc:deploy`, `/sdlc:incident` on completion

## Execution Protocol

Invoke the `handoff` skill. Read `.cursor/skills/handoff/SKILL.md` and execute it fully.

### Quick Reference

1. Collect: ticket ID, phase, changed files, PR URL, evidence path, what's done, what's next
2. If ACTIVE E2E run exists: run `$MANIFEST status` + `$MANIFEST resume` first — handoff must reflect manifest truth
3. Write: `.sdlc/handoffs/{YYYY-MM-DD-HHMM}-{JAMBU-N}-{phase}.md` (include **E2E Run Manifest** section when ACTIVE run exists)
4. Copy to: `.sdlc/handoffs/LATEST.md`
5. **E2E bind:** `$MANIFEST record-handoff --handoff "$FILE" --run-id "$(cat .sdlc/runs/ACTIVE)"` when ACTIVE run exists
6. Update Plane ticket state if work is complete
7. Append to `.cursor/memories/operational-context.md`

### Where Handoffs Are Stored

```
.sdlc/handoffs/
  LATEST.md                                    ← always current (overwritten)
  2026-05-19-2200-JAMBU-1-implementation.md   ← timestamped archive
  2026-05-20-1000-JAMBU-1-qa.md
  ...
```

### Where the sessionStart Hook Reads From

```
.cursor/hooks/session-start.sh
```

This script reads `LATEST.md` at the start of every session. That's how context persists across sessions without relying on conversation history.

### Handoff → Context Hydration Chain

```
/sdlc:handoff writes → .sdlc/handoffs/LATEST.md
                          ↓
sessionStart hook reads → injects as additional_context
                          ↓
Next session starts with full awareness of last execution
```
