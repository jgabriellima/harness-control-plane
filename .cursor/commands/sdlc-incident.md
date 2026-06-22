---
name: sdlc:incident
description: Resolve a production incident end-to-end — triage from GitHub issue or description, reproduce in a hotfix worktree, apply fix, validate with smoke tests, open PR, and record postmortem. Invokes the Incident Resolver agent.
---

# /sdlc:incident — Incident Resolution Pipeline

Resolve a production incident end-to-end: triage → reproduce → fix → validate → PR.

## Usage

```
/sdlc:incident <github-issue-url | description>
```

Examples:
```
/sdlc:incident https://github.com/jgabriellima/ai-native-sdlc/issues/99
/sdlc:incident "TypeError in Starlight page build — slug undefined in docs route"
```

## Execution Protocol

Invoke the Incident Resolver agent. Follow this pipeline exactly.

Observability slot is **`none`** — do not require PostHog MCP, API keys, or error-tracking URLs.

---

### Step 1 — Incident Ingestion

If GitHub issue URL provided:
- Fetch via `gh issue view`
- Extract: description, reproduction steps, labels, comments

If plain description:
- Use description as starting point; root cause unconfirmed until reproduced

---

### Step 2 — Triage

Assign severity from impact:
- P1: production down or critical path broken for all users
- P2: major feature degraded
- P3: minor defect or cosmetic issue

Record in `.cursor/memories/incidents.md` (open).

---

### Step 3 — Hotfix worktree

Per `.cursor/skills/worktree/SKILL.md` — branch `fix/issue-<N>-incident` or `fix/<short-desc>-incident`.

---

### Step 4 — Reproduce and fix

Failing test first, then minimal fix. Build must pass:
```bash
cd app && npx astro sync && npx tsc --noEmit && npm run build
```

---

### Step 5 — PR and closure

Open PR. Update incident line in `incidents.md` to resolved. Close or comment on GitHub issue with PR link.
