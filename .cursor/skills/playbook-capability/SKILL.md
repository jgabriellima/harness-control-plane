---
name: playbook-capability
description: Execute a domain playbook inside a workflow composite node via invoke.type skill. Resolves playbook procedure with sdlc_playbook.py, runs steps, writes cognitive output. Use when workflow DSL declares function.inputs.playbookRef and invoke.type skill ref playbook-capability — never invoke.type playbook.
---

# Playbook Capability Skill

## When to Use

- Workflow node has `function.invoke.type: skill` and `ref: .cursor/skills/playbook-capability/SKILL.md`
- Node declares `function.inputs.playbookRef` (e.g. `pb.vendor.openai-realtime`)
- Domain procedure must run inside auditable workflow continuity (ADR-020)

**Forbidden:** `invoke.type: playbook` on workflow DSL nodes.

## Inputs (from workflow node)

| Field | Source | Required |
|-------|--------|----------|
| `playbookRef` | `function.inputs.playbookRef` | yes |
| `objective` | `function.objective` | recommended |
| `run_id` | Active workflow run manifest | yes |
| `node_id` | Current composite node id | yes |

## Execution Protocol

### Step 1 — Resolve playbook

```bash
python3 .sdlc/bin/sdlc_playbook.py resolve --capability "<capability-from-playbookRef>" --json
# or
python3 .sdlc/bin/sdlc_playbook.py provision --ids "<playbookRef>" --json
```

Read returned playbook YAML path and procedure sections. If resolve fails, exit non-zero and do not mutate manifest.

### Step 2 — Execute procedure

Follow playbook MUST/MUST NOT and gate checklist. Domain I/O uses playbook-declared capabilities only — no ad-hoc `invoke.type: playbook`.

Write structured output to:

```
.sdlc/workflow-runs/{run_id}/cognitive/{node_id}.json
```

Schema: `schemas/cognitive-output.schema.json` (or node `function.outputSchema` when set).

### Step 3 — Return control to harness

Do not call `node-complete` yourself unless operating in `--manual` mode. The runner evaluates `postCondition.checks[]` after cognitive output exists.

On HITL: if playbook requires human approval, gate returns WAIT; runner sets `awaiting_*` per ADR-020.

## Example DSL Node

See `.sdlc/templates/workflow-node-playbook-capability.example.yaml`.

## Verification

```bash
python3 .sdlc/bin/sdlc_playbook.py validate --id <playbookRef>
python3 .sdlc/bin/sdlc_workflow_validate.py review
test -f .sdlc/workflow-runs/<run_id>/cognitive/<node_id>.json
```

## References

- ADR-010 (playbook catalog)
- ADR-020 (skill invoke, not playbook invoke)
- `.sdlc/bin/sdlc_playbook.py`
