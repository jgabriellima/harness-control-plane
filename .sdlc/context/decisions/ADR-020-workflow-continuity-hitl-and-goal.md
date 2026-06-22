# ADR-020: Workflow Continuity, HITL Node Contract, and /sdlc:goal

Date: 2026-06-03
Status: ACCEPTED
Supersedes: `/sdlc:e2e` as product entry name; extends ADR-017, ADR-018, JAMBU-94
Spec: `.sdlc/specs/JAMBU-110-workflow-continuity-goal.md`

## Context

ADR-017 established `sdlc_workflow_run.py` and `WorkflowRunManifest` as the execution control plane. ADR-018 blocked legacy `sdlc_e2e_manifest.py` when a workflow run is ACTIVE. Operators still cannot answer, from machine state alone:

- Whether continuity is blocked on human input, human approval, or technical gate failure
- Which artifact keys (spec path, PR URL) bind the active run
- Whether a slash command should resume, skip idempotently, redo a node, or start a new run

`status: blocked` on runs and nodes conflates gate FAIL, protocol violation, and human-in-the-loop (HITL) waits. `cmd_status` returns `next_node` only — not `required_actions`.

Plane tickets (work_items provider) carry delivery metadata but are not the harness source of truth for continuity resolution. JAMBU-94 unified manifest→provider sync; it did not define run↔ticket↔node linkage or command-level idempotency.

## Decision

### 1. Workflow ontology (normative)

| Artifact | Role |
|---|---|
| `kind: Workflow` (DSL) | Declarative procedure: nodes, invokes, procedural gates |
| `kind: WorkflowRunManifest` | Mutable execution state per `run_id` |
| `kind: WorkflowTrace` | Derived observability projection |
| Bin/script | Stateless inspection or I/O — not a workflow |

**Classification rule:** Procedures requiring auditable continuity across sessions, multi-step gates, or composition → workflow + run manifest. Idempotent stateless tools → bin only.

Forbidden as procedure control planes: `invoke.type: playbook`, GitHub Actions workflows, free-form chat without run manifest.

### 2. HITL and node contract extension

Composite nodes MAY declare `control.hitl`:

```yaml
control:
  hitl:
    kind: input | approval | external
    reason: string
    resumeGate: gates/<id>.pass   # optional — gate that clears HITL
```

When HITL applies, the runner sets node `status` to one of:

- `awaiting_input`
- `awaiting_approval`
- `awaiting_external`

Run-level status MAY be `awaiting_human` when any blocking node is in an `awaiting_*` state.

`gate_outcome: WAIT` on a node MUST correlate with `awaiting_*` — not with `failed`.

### 3. Node and run metadata (`emits` / `artifacts`)

Nodes MAY declare `emits` in DSL (keys + ref paths). The runner materializes `nodes.{id}.artifacts` on the run manifest (e.g. `pr_url`, `spec_path`, `worktree_path`).

Run-level `deployment.*` remains for deploy URLs; per-node artifacts are the default for slice-local links.

### 4. Continuity block (run manifest)

Every active run SHOULD expose `continuity` (validated by `schemas/workflow-continuity.schema.json`):

```yaml
continuity:
  phase: string              # macro phase or child workflow_id
  awaiting: input | approval | external | none
  blocked_by_node: string | null
  required_actions: []       # machine-readable resume steps
  resume_hints: []           # human-readable
  conflict_policy: ask | reuse | force_new_run
  last_resolution: {}        # last command-router decision
```

`sdlc_workflow_run.py status` MUST print full `continuity` — not only `next_node`.

### 5. `/sdlc:goal` replaces `/sdlc:e2e`

- **Trigger:** `/sdlc:goal` (alias `/sdlc:e2e` deprecated, removed from docs after migration)
- **DSL:** `goal-flow.yaml` (rename from `e2e-orchestration-flow.yaml` with compatibility alias during transition)
- **Control plane:** `.sdlc/workflow-runs/{run_id}/manifest.yaml` only
- **Legacy:** `sdlc_e2e_manifest.py` and `.sdlc/runs/` stage lifecycle — removed, not archived indefinitely

Macro goal runs parent manifest; delegated phases use `workflowRef` with **child run ids** stored on `manifest.tickets[ticket_id].child_run_id`.

### 6. work_items as continuity index (harness-first)

Source of truth: `WorkflowRunManifest` (parent + child runs).

Provider mirror (Plane when `work_items: plane`): ticket fields or structured comment containing:

- `harness_run_id`, `harness_parent_run_id`, `harness_workflow_id`, `harness_node_id`, `continuity_status`

`work_items_sync.py` writes provider state from manifest tickets — never infers continuity from Plane alone.

### 7. Continuity resolver (command-level idempotency)

New runtime: `sdlc_continuity_resolve.py` (see JAMBU-110).

Before executing a mapped slash command:

1. Resolve `command → workflow_id` and candidate nodes from `sdlc.yaml` + DSL triggers
2. Inspect ACTIVE pointer and in-progress goal/child runs
3. On artifact overlap (`spec_path`, `ticket_id`, …):
   - **skip** if satisfied in active run
   - **resume** if awaiting continuity on same workflow phase
   - **ask** (CLI flags: `--continue`, `--redo-node`, `--new-run`) on explicit user conflict

Decisions recorded in `continuity.last_resolution`.

### 8. Playbook capabilities without `invoke.type: playbook`

Domain playbooks execute inside a composite node via:

- `invoke.type: skill` + `ref: .cursor/skills/playbook-capability/SKILL.md`
- `inputs.playbookRef` + expected output schema
- Workflow-specific procedural gates in `postCondition.checks[]`

## Consequences

- Schema and template updates: `workflow-dsl.schema.json`, `workflow-run-manifest` template, `workflow-continuity.schema.json`
- Runner: new node statuses, HITL transitions, enriched `status` command
- Removal of `sdlc_e2e_manifest.py` from active paths; CI grep guard
- Docs: `show-me.md`, `workflows.md`, architecture — `/sdlc:goal` terminology
- UI follow-up (JAMBU-104+): graph badges for `awaiting_*`, continuity panel

## Implementation phases (non-blocking order)

| Phase | Deliverable |
|---|---|
| 0b | Schemas + ADR-020 + JAMBU-110 (this ADR) |
| 1 | Kill legacy E2E manifest; `goal-flow` rename |
| 2 | Invoke parity (skill; business harness) |
| 3 | `playbook-capability` skill |
| 4 | `sdlc_continuity_resolve.py` + command hooks |
| 5 | `work_items_sync` harness fields |
| 6 | Trace/UI continuity surfaces |

## Verification

```bash
python3 .sdlc/bin/sdlc_workflow_validate.py review
python3 -m pytest .sdlc/bin/tests/ -q -k continuity
python3 .sdlc/bin/sdlc_workflow_run.py status --run-id <id>   # emits continuity JSON
python3 .sdlc/bin/sdlc_continuity_resolve.py --command /sdlc:spec --intent "..." --json
# CI: no active reference to sdlc_e2e_manifest stage-complete in .cursor/commands/
```

## References

- ADR-009 (orchestration composition)
- ADR-016 (composite node)
- ADR-017 (sole execution plane)
- ADR-018 (two-path execution; legacy block)
- JAMBU-94 (work_items DSL bindings)
- `.sdlc/schemas/workflow-continuity.schema.json`
