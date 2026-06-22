# ADR-010: Playbooks as Domain Procedural Units + `/sdlc:learn` Acquisition Pipeline

Status: ACCEPTED  
Date: 2026-05-23  
Ticket: JAMBU-playbooks-foundation

## Context

Skills (`.cursor/skills/*.md`) correctly own SDLC orchestration: worktree, spec-writer, plane-ticket, handoff. They must remain markdown with frontmatter — no format migration.

The runtime lacks a formal layer for **reusable domain procedural expertise** (Three.js modeling, OpenAI video generation, OpenAI translation, WebRTC realtime). Today this knowledge is either absent, embedded in ad-hoc prompts, or duplicated across agent sessions — causing context inflation and non-composable expertise.

A prior design mistake atomized SDLC operations (worktree creation) into "playbooks". That inverts the hierarchy: worktree is Skill-level SDLC infrastructure, not domain expertise.

`/sdlc:learn` must acquire domain capabilities through mandatory deep research, critical synthesis (single best choice, not acceptable alternatives), playbook materialization, and delivery of a ready capability plus user prerequisites — never an implementation plan.

## Decision

1. **Playbook** = atomic, versionable, domain procedural specification stored in `.sdlc/playbooks/`. Examples: `pb.threejs.modeling`, `pb.openai.video-generation`, `pb.openai.translation`.

2. **Skill** = SDLC orchestration layer (markdown + frontmatter, unchanged). Skills may optionally declare `playbooks:` in frontmatter on **new** skills only. Existing skills are not modified. Runtime can also provision playbooks via spec `domain_tags` without editing skills.

3. **`/sdlc:learn`** = acquisition pipeline with four mandatory phases:
   - **F0 Deep Research** — gather sources, critical analysis, decision log; hard gate via `sdlc_playbook.py research-gate`
   - **F1 Critical Synthesis** — one winning choice per decision; rejected alternatives audit-only in research report
   - **F2 Playbook Materialization** — write `.pb.yaml` artifacts + INDEX registration
   - **F3 Delivery** — capability ready manifest + user prerequisites (env, keys, versions); no feature plan

4. **Consumption** — after learn, playbooks are retrieved via `resolve` and injected via `provision` (`load_context: on_provision`). Not loaded at sessionStart.

5. **Deterministic governance** — macro gates remain `sdlc_gate_check.py`; playbook micro-gates in `sdlc_playbook.py verify`. Research gate blocks F2 if F0 fails.

6. **No changes to existing skills, workflows, or hooks** during learn F0–F3. Composition (F4) is opt-in only — see Decision 7.

7. **Composition (F4, opt-in)** — after F3, playbooks are **registered and indexed only**. Wiring into a flow requires explicit `--wire` or user confirmation:
   - **Allowed wire targets:** workflow stage `playbooks:` / `playbooks_when:` in `.sdlc/workflows/*.yaml`; command stage `provision:` in `.cursor/commands/*.md`; manifest `required_playbooks:` on a run or ticket.
   - **Forbidden wire targets:** `.cursor/agents/*.md`, `.cursor/rules/*.mdc`, existing `.cursor/skills/*.md`, `sessionStart` hydration, global `sdlc.yaml` skill lists.
   - Default learn output: playbooks in catalog + delivery.md. **No automatic contamination.**

8. **Contamination gate** — `python3 .sdlc/bin/sdlc_playbook.py contamination-check --run-id {run_id}` compares git delta since `learn-init` baseline against allowlist. Mandatory at F3. Hard fail on touch of agents, rules, skills, hooks, memories, `sdlc.yaml`, workflows (without `--wire`), or `app/`.

9. **Hierarchy (canonical):**

```
Playbook (.pb.yaml)     — atomic domain procedure
    ↑ composes into
Skill (.md)             — SDLC orchestration (optional playbooks: frontmatter on NEW skills only)
    ↑ composes into
Command / Workflow stage — declares skills[] and/or playbooks_when[]
    ↑ delegates to
Agent                   — executes one stage; does NOT embed domain playbooks in persona
```

## Rationale

- Domain expertise is cross-feature reusable; SDLC ops are pipeline-invariant — separating them prevents procedural monoliths in skills without rewriting them.
- Deep research gate prevents `/sdlc:learn` from emitting prompt dumps or plan language masquerading as playbooks.
- Markdown skills preserve agent compatibility and token-health corpus stability.
- Structural retrieval (INDEX tags, domain, capability) avoids vector DB cost in v1.

### Alternatives rejected

- **Playbooks as SDLC micro-ops** — no cross-domain reuse; oversplitting.
- **Skills as YAML** — breaks existing corpus; unnecessary migration.
- **Learn without research gate** — produces acceptable-alternatives noise; user asked for best-only synthesis.
- **Learn outputs implementation plan** — conflates acquisition with execution; violates command contract.

## Consequences

### Positive

- Domain expertise composable across features and skills
- `/sdlc:learn` delivers operational capability, not homework for the user
- Existing SDLC stack untouched
- Token budget: playbooks loaded on_provision only

### Negative / Trade-offs

- Playbook quality depends on F0 research execution; mitigated by deterministic research-gate schema
- INDEX must stay synchronized with playbook files
- Two "done" concepts: playbook done (domain artifact) vs workflow done (SDLC gates)

### Neutral

- New directory `.sdlc/playbooks/`, script `.sdlc/bin/sdlc_playbook.py`, command stub `sdlc-learn.md`

## Implementation Notes

| Artifact | Path |
|---|---|
| Playbook library index | `.sdlc/playbooks/PLAYBOOKS.md` (lazy — not in INDEX) |
| JSON Schema | `.sdlc/playbooks/playbook.schema.json` |
| Research audit trail | `.sdlc/playbooks/.research/{run_id}/` |
| Runtime CLI | `.sdlc/bin/sdlc_playbook.py` |
| Command protocol | `.cursor/commands/sdlc-learn.md` |
| INDEX section | `[HYDRATION_SCOPE]` + ENTRY_POINTS pointer — **not** per-playbook rows |
| Research template | `.sdlc/templates/playbook-research-report.md` |
| Delivery template | `.sdlc/templates/playbook-delivery.md` |

Layer stack after ADR-010:

```
Agent → Command → Workflow → Skill (.md) → Playbook (.pb.yaml) → Runtime/Tools
```

## Review

| Field | Value |
|---|---|
| Author | AI-Native SDLC |
| Date | 2026-05-23 |
| Reviewed by | — |
| Ticket | JAMBU-playbooks-foundation |
