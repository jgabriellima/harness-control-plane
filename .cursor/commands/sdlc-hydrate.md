---
name: sdlc:hydrate
description: Inject full operational context into the current session — reads INDEX, LATEST handoff, sdlc.yaml, architecture memory, operational memory, and ADR history. Run before any complex task in a fresh session.
---

# /sdlc:hydrate — Runtime Context Hydration

Inject full operational context into the current session before complex tasks.

## When to use

Run this at the START of any complex session involving:
- Feature implementation
- Incident resolution
- Architecture decisions
- Sprint planning

This prevents: architectural drift, rediscovery, fragmented reasoning, inconsistent decisions.

## Execution Protocol

**Hydration scope (mandatory):** Read `.sdlc/INDEX.md` section `[HYDRATION_SCOPE]` first.

Do **NOT** load during hydration:
- `.sdlc/playbooks/domains/**` (playbook bodies)
- `.sdlc/playbooks/.research/**` (learn audit trail)
- Full `PLAYBOOKS.md` catalog

Playbook awareness without contamination:

```bash
python3 .sdlc/bin/sdlc_playbook.py catalog --summary
```

Load playbook procedure only when: workflow `playbooks_when` matches, ticket declares `domain_tags`, or user invokes `provision`/`resolve`.

---

### Step 1 — Load Architecture Context

Read `.cursor/memories/architecture.md` completely. Extract and internalize:
- Stack versions
- Structural invariants
- Forbidden patterns
- Key architectural decisions

---

### Step 2 — Load Operational Context

Read `.cursor/memories/operational-context.md`. Extract:
- Current sprint goal
- Active features in progress
- Blocked items
- Recent deployments
- Next milestones

---

### Step 3 — Load Business Rules

Read `.cursor/memories/business-rules.md`. Extract:
- Product constraints
- Content rules
- User personas
- Non-negotiable requirements

---

### Step 4 — Load Incident History

Read `.cursor/memories/incidents.md`. Extract:
- Open incidents (P1/P2 require immediate attention)
- Recurring failure patterns
- Components with known fragility

---

### Step 5 — Load SDLC State

Read `.sdlc/sdlc.yaml`. Extract:
- Enabled autonomous maintenance features
- Integration health
- Workflow definitions
- Operational constraints

---

### Step 6 — Load Recent Decisions

List and read the 5 most recent ADR files in `.sdlc/context/decisions/`. Extract constraints they impose on current work.

Do **not** read ADR files to discover playbook catalog entries — playbooks are not ADRs.

---

### Step 6b — INDEX (scoped, optional)

If duplicate-work check is needed, read **only** these INDEX sections: `[ACTIVE_WORK]`, `[SPECS]`, `[ADRS]`, `[RUNTIME.COMMANDS]`, `[RUNTIME.SKILLS]`.

Skip: `[HYDRATION_SCOPE]` is meta; playbook catalog lives in `playbooks/PLAYBOOKS.md` (lazy).

---

### Step 7 — Production Signal Check

When `project.stack.observability` is `none` (current default):
- Query GitHub for open P1/P2 issues: `gh issue list --label P1,P2 --state open`
- Read `.cursor/memories/incidents.md` for active incidents
- If P1 issues exist: surface them immediately — they take priority over planned work

When an observability integration is active, use its MCP per `.sdlc/integrations/{provider}/`.

---

### Step 8 — Hydration Report

Output a compact hydration summary for use during the session:

```
Context Hydrated — {timestamp}

Architecture:   Astro.js {version} / Tailwind / TypeScript strict
Sprint:         {current sprint name and goal}
Active:         {features in progress}
Incidents:      {count open P1/P2, or "none"}
Last Deploy:    {version and date}
Key Constraints:
  - {top 3 constraints from rules/memories}
Decisions:
  - {most recent ADR title}

Ready for: {suggested next action}
```

This summary stays active for the entire session. Reference it before making any architectural or implementation decision.
