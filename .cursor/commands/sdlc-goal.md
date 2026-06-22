---
name: sdlc-goal
description: >
  Thin trigger for goal-flow — sole control plane is sdlc_workflow_run.py (ADR-017, ADR-020).
---

# /sdlc:goal — Workflow Runner Trigger

**Control plane:** `python3 .sdlc/bin/sdlc_workflow_run.py` (ADR-017, ADR-018, ADR-020, ADR-022)  
**Manifest:** `.sdlc/workflow-runs/{run_id}/manifest.yaml`  
**Workflow DSL:** `.sdlc/workflows/goal-flow.yaml` — **`spec.agentPolicy` is normative**  
**CI on `main`:** GitHub Actions (`validate.yaml`, `deploy.yaml`) — orthogonal path

**Forbidden:** `sdlc_e2e_manifest.py` (removed ADR-020), `stage-complete`, advancing `.sdlc/runs/` for active orchestration, **implementing app code in the orchestrator session**, **asking the operator to choose worktree vs PR vs local review** (use `continuity.required_actions` from manifest instead), **text-only discovery without PNGs or waiver ADR** (ADR-027).

## Reference UI contract (ADR-027)

When the intent includes reference images, attachments, or `target.reference_url`:

1. **`reference-detect`** — inventory detected sources; write `reference-inventory.json`.
2. **`discovery`** — capture PNGs to `{output_dir}/reference-screenshots/` (>1KB each).
3. **`reference-confirm`** — set `target.reference_ui.confirmed: true` or write `reference-confirmation.md`.
4. Gate **`reference-ui-ready.pass`** blocks discovery completion without PNGs or `reference-waiver-adr.md`.

Runtime/control-plane intents additionally require **`feasibility-report.md`**, **`spec-reconciliation.md`**, and `manifest.target.deploy_target` before wave planning.

On-disk PNGs are the authoritative target UI — not prose from specs or model training.

## Usage

```text
/sdlc:goal <intent>
/sdlc:goal --resume [<run-id>]
/sdlc:goal --status [--run-id <run-id>]
/sdlc:goal --manual
```

## Execution protocol (mandatory)

This is a **cognitive workflow with deterministic gates**, not a chat. The DSL `agentPolicy` block in `goal-flow.yaml` is normative. Cursor hooks in `.cursor/hooks/sdlc_runtime_guard.py` enforce it (see `.cursor/hooks/README.md`).

**Hook contract (Cursor docs):** `beforeSubmitPrompt` cannot inject `additional_context` — only `continue` / `user_message`. Dispatch context is injected via `postToolUse` after `sdlc_workflow_run.py step` runs in the shell.

### 0. Continuity resolve (first shell command)

```bash
python3 .sdlc/bin/sdlc_continuity_resolve.py resolve \
  --command /sdlc:goal \
  --intent "<intent>" \
  --json
```

Obey `action` and `cli` in JSON. Never end a turn with "do you want worktree or PR?" — emit `sdlc_workflow_run.py status --json` and execute `continuity.required_actions`.

### 1. Init or resume

```bash
python3 .sdlc/bin/sdlc_workflow_run.py run \
  --workflow goal-flow \
  --intent "<intent>" \
  --mode agent \
  [--run-id <slug>]

python3 .sdlc/bin/sdlc_workflow_run.py resume --run-id <run-id>
```

Register tickets on the **workflow-run** manifest before `execution`:

```bash
python3 .sdlc/bin/sdlc_workflow_manifest.py register-ticket \
  --run-id <slug> \
  --ticket JAMBU-N \
  --worktree /path/to/worktree \
  --branch feat/JAMBU-N-desc
```

### 2. Preflight (automatic)

Node `preflight` runs after `hydrate` and enforces:

- `doctor-pass.pass` — structural doctor (MCP, hooks, integrations)
- `ci-target-aligned.pass` — CI `working-directory` matches `workspace.target_root` (`app/`)

Fix failures before planning or implementation. Required MCPs are those with `required: true` in `.sdlc/sdlc.yaml` `runtime.mcps` (currently playwright and github).

### 3. Step loop (GOD rule — runner authority)

The orchestrator is the **only** control plane. Agents must not implement nodes, write `cognitive/*.json`, or advance the manifest without `step` → exit 42 → work → `submit`.

```bash
python3 .sdlc/bin/sdlc_workflow_run.py step --run-id <run-id> --mode agent
```

| Exit | Meaning | Agent action |
|---:|---|---|
| 0 | Node completed or run finished | Loop `step` |
| 42 | Cognitive dispatch | Node is `running` (started by runner). Execute objective; then `submit` |
| 1 | postCondition FAIL or sequence violation | Fix gates; retry `step` |

**Forbidden (runner rejects):**

- Writing `.sdlc/workflow-runs/output/**/cognitive/<node>.json` before `step` exit 42
- Calling `submit` when node status is not `running`
- `nodeId` / `runId` in cognitive JSON that do not match `--node` / `--run-id`
- Implementation in repo root when `qa.worktree_gate` is true — use `register-ticket --worktree` first

```bash
python3 .sdlc/bin/sdlc_workflow_run.py submit \
  --run-id <run-id> \
  --node <node-id> \
  --cognitive <path-to-json>
```

Gates `worktree-registered.pass` (after `plane-hierarchy`) and `worktree-committed.pass` (before `execution` completes) enforce registered worktrees and at least one commit per slice with a clean tree.

### 4. Execution and PR (mandatory)

After `execution`, node **`pr-creation`** runs (subprocess — not optional for feature/greenfield):

```bash
python3 .sdlc/bin/sdlc_workflow_pr.py create --run-id <run-id>
```

| Step | Contract |
|------|----------|
| Push | Each slice `branch` pushed to `origin` from its `worktree` |
| Create | `gh pr create --base main` when `pr_url` absent |
| Register | `manifest.tickets.{id}.pr_url` set to `https://github.com/.../pull/N` |
| Gate | `pr-registered.pass` — blocks `integration` until every slice has `pr_url` |

**Agent fallback** (if `create` cannot run in subprocess): `gh pr create` from worktree, then:

```bash
python3 .sdlc/bin/sdlc_workflow_pr.py register --run-id <run-id> --ticket JAMBU-N --pr-url <url>
```

`board-sync` also requires `pr_url` on all slice tickets.

### 5. Execution node (feature-flow fan-out)

```bash
python3 .sdlc/bin/sdlc_e2e_execution.py dispatch --workflow-run-id <run-id> [--parallel 4]
```

Each ticket: feature-flow via `step`/`submit` with `--run-id <slug>-ff-<ticket>`.

### 6. Deploy node

Records CI deploy evidence (`gates/deploy-recorded.pass`) — does **not** re-run doctor. Set `structured.deploy_run_url` or `manifest.deployment.ci_run_url` on submit.

## Verification

```bash
python3 .sdlc/bin/sdlc_workflow_validate.py review
python3 .sdlc/bin/sdlc_workflow_run.py status --run-id <run-id>
python3 .sdlc/bin/sdlc_workflow_manifest.py validate --run-id <run-id>
```
