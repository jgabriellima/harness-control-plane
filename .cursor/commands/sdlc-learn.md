---
name: sdlc-learn
description: Acquire domain procedural capabilities via mandatory deep research, critical synthesis, and playbook materialization. Delivers ready capability + user prerequisites — never a feature implementation plan.
---

# /sdlc:learn — Domain Capability Acquisition

Acquires reusable **domain procedural expertise** as Playbooks (Three.js modeling, OpenAI video, translation, WebRTC realtime, etc.).

This command does **not** create Plane tickets, worktrees, specs, or `app/` code. It learns procedure and delivers capability.

Skills (`.cursor/skills/{name}/SKILL.md`) remain unchanged. Playbooks live in `.sdlc/playbooks/`.

ADR: `.sdlc/context/decisions/ADR-010-playbooks-procedural-runtime.md`

---

## Usage

```
/sdlc:learn <domain query>
/sdlc:learn --domain tag1,tag2
```

Examples:

```
/sdlc:learn "OpenAI realtime + Web3D"
/sdlc:learn --domain openai-realtime,threejs-modeling
```

CLI entry points:

```bash
python3 .sdlc/bin/sdlc_playbook.py learn-init --query "OpenAI realtime Web3D"
python3 .sdlc/bin/sdlc_playbook.py research-gate --run-id {run_id}
python3 .sdlc/bin/sdlc_playbook.py register --file .sdlc/playbooks/domains/openai/realtime.pb.yaml
python3 .sdlc/bin/sdlc_playbook.py resolve --domain openai-realtime,threejs
```

---

## Pipeline (mandatory order)

```
F0 DEEP RESEARCH     → gate REQUIRED — no skip
F1 CRITICAL SYNTHESIS
F2 PLAYBOOK MATERIALIZE + register
F3 DELIVERY
F4 COMPOSE (opt-in)  → --wire only; default SKIP
```

Abort on any gate failure. Never emit partial playbooks without passed F0 gate.

---

## Hierarchy (canonical — ADR-010)

```
Playbook (.pb.yaml)       atomic domain procedure
    ↑ optional compose
Skill (.md)               SDLC orchestration (NEW skills may declare playbooks: in frontmatter)
    ↑ compose
Command / Workflow stage  declares skills[] and/or playbooks_when[]
    ↑ delegates
Agent                     executes one stage — does NOT embed domain playbooks
```

**Default learn output:** playbooks registered + indexed + delivery.md. **No contamination** of agents, rules, or existing skills.

---

## Isolation guarantee (why learn does not pollute the SDLC pack)

Adding a playbook to the catalog is **not** the same as injecting it into every flow.

| Layer | Loaded when | Grows on learn? | Affects other flows? |
|---|---|---|---|
| Playbook catalog (`PLAYBOOKS.md`) | `provision` / `resolve` / `--wire` only | Yes | No |
| INDEX `[HYDRATION_SCOPE]` | Every hydrate | No (fixed meta) | No — tells agents what NOT to load |
| INDEX operational sections | hydrate (scoped) | No on learn | No |
| `catalog --summary` | Optional count check | N/A | No — ids/domains only, no procedure bodies |
| `sessionStart` hook | Every session | No | No — hook does not load playbooks |
| Agents / rules / skills | Every matching task | **Must not** | Would contaminate — **forbidden** |
| Workflow `playbooks_when` | Condition true at runtime | Only with `--wire` | Yes — scoped to that condition |

**Analogy:** learn adds a book to the library shelf. It does not rewrite the QA agent's brain. A flow only reads the book when its stage declares `playbooks_when` or you run `provision`.

**Deterministic enforcement:** F3 ends with:

```bash
python3 .sdlc/bin/sdlc_playbook.py contamination-check --run-id {run_id}
```

Compares git paths changed since `learn-init` against an allowlist. Touching `.cursor/agents/`, `.cursor/rules/`, `.cursor/skills/`, `sdlc.yaml`, workflows (without `--wire`), or `app/` → **hard fail**.

---

## F0 — Deep Research (mandatory)

### Init

```bash
python3 .sdlc/bin/sdlc_playbook.py learn-init --query "{user_query}"
```

Creates:

```
.sdlc/playbooks/.research/{run_id}/
  report.md       ← from .sdlc/templates/playbook-research-report.md
  manifest.json
  delivery.md     ← written in F3
```

Audit trail lives under `.sdlc/playbooks/.research/` — not in agents, rules, or `context/learnings/`.

### Agent obligations

1. **Scope parse** — decompose query into capability targets (`openai.realtime`, `threejs.modeling`)
2. **Source gathering** — per target, minimum 2 sources; at least 1 MUST be official vendor docs
3. **Critical analysis** — ONE winning choice per decision; reject alternatives with explicit rationale
4. **No plan language** — forbidden: "consider", "you could", "alternatively", "optionally"
5. **Complete report sections** — all sections in template; Gate Checklist checked when done

Parallelize source gathering: one subagent/research pass per capability target when targets are independent.

### Gate (hard fail)

```bash
python3 .sdlc/bin/sdlc_playbook.py research-gate --run-id {run_id}
```

Exit 0 required before F2. Fix report and re-run gate on failure.

---

## F1 — Critical Synthesis

Transform research into single-path procedural specs.

| Research | Playbook-bound output |
|---|---|
| 3 SDKs exist | ONE SDK + version pin; others in Rejected Alternatives section only |
| REST vs WebSocket | ONE transport with MUST/MUST NOT |
| Three.js vs Babylon | ONE engine with rationale |

Rejected alternatives stay in `report.md` audit trail — never in `.pb.yaml` as "options".

---

## F2 — Playbook Materialization

Write one `.pb.yaml` per capability target under:

```
.sdlc/playbooks/domains/{vendor}/{name}.pb.yaml
```

Schema: `.sdlc/playbooks/playbook.schema.json`

Each playbook MUST include:

- `metadata.id` — `pb.{vendor}.{name}`
- `metadata.sourced_from` — path to research report
- `procedure[]` — steps with explicit `mode: deterministic|adaptive`
- `done[]` — measurable gates (artifact exists, API response, render check)
- `user_prerequisites[]` — what user must supply

Register:

```bash
python3 .sdlc/bin/sdlc_playbook.py validate --id pb.{vendor}.{name}
python3 .sdlc/bin/sdlc_playbook.py register --file .sdlc/playbooks/domains/{vendor}/{name}.pb.yaml
```

Update research manifest:

```json
{ "phase": "F2_materialized", "playbooks_created": ["pb.vendor.name"] }
```

---

## F3 — Delivery

Write `.sdlc/playbooks/.research/{run_id}/delivery.md` from template:

`.sdlc/templates/playbook-delivery.md`

Deliver to user:

1. **Capability Ready** — playbook ids + versions + file paths
2. **What You Must Provide** — env vars, API keys, version pins, local deps
3. **Ready to Use** — `provision` / `resolve` commands
4. **Not Included** — explicitly state no feature plan, no ticket, no app code

User-facing message structure:

```markdown
## Capability Ready
Provisioned: pb.openai.realtime, pb.threejs.modeling

## What you must provide
| Requirement | Why | How |
...

## Ready to use
python3 .sdlc/bin/sdlc_playbook.py provision --ids pb.openai.realtime,pb.threejs.modeling
```

---

## Forbidden outputs

- Feature implementation plan ("create plan for XYZ")
- Plane ticket creation
- Worktree setup
- Edits to existing `.cursor/skills/{name}/SKILL.md`, `.cursor/agents/*.md`, `.cursor/rules/*.mdc`
- Playbook with multiple acceptable alternatives in procedure
- Skipping F0 gate before writing `.pb.yaml`
- F4 wire without explicit `--wire` flag or user confirmation

---

## F4 — Compose (opt-in, `--wire`)

Wire newly registered playbooks into a **specific flow only** when user passes `--wire`:

```
/sdlc:learn "..." --wire sdlc:goal
/sdlc:learn "..." --wire workflow:goal-flow.yaml#execution
```

**Allowed wire targets:**

| Target | Mechanism |
|---|---|
| Workflow stage | `playbooks_when:` block with `condition` + `playbooks:` list |
| Command stage | `provision:` block referencing playbook ids |
| Run manifest | `required_playbooks:` on ticket or run |

**Forbidden wire targets:** agents, rules, sessionStart, global `sdlc.yaml` skills list.

If `--wire` is omitted, F4 is **skipped**. Playbooks sit in catalog until a flow composes them.

Example (already wired for webdesign clone):

```yaml
# goal-flow.yaml — execution stage
playbooks_when:
  - condition: "manifest.mode == greenfield AND manifest.target.reference_url"
    playbooks: [pb.webdesign.design-contract, pb.webdesign.visual-fidelity-gate]
    inject: subagent_prompt
```

---

## Consumption (after learn)

Playbooks are consumed by runtime — not by rewriting skills:

```bash
python3 .sdlc/bin/sdlc_playbook.py resolve --domain threejs,openai
python3 .sdlc/bin/sdlc_playbook.py provision --ids pb.threejs.modeling
```

Future: spec `domain_tags` → auto-provision on `/sdlc:implement`.

---

## Parallelization

| Phase | Parallel safe |
|---|---|
| F0 source gathering | Yes — per capability target |
| F0 synthesis | No — single decision log must be coherent |
| F2 playbook write | Yes — per target after F1 |
| F3 delivery | No — single user-facing artifact |

---

## Verification

```bash
python3 .sdlc/bin/sdlc_playbook.py catalog
python3 .sdlc/bin/sdlc_playbook.py validate
python3 .sdlc/bin/sdlc_playbook.py research-gate --run-id {run_id}
python3 .sdlc/bin/sdlc_playbook.py contamination-check --run-id {run_id}
python3 .sdlc/bin/sdlc_playbook.py resolve --query "{original_query}" --json
```

Success = gate passed + playbooks registered + delivery.md written + **contamination-check exit 0** + user informed of prerequisites.
