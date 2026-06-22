# ADR-027: Reference-first UI and feasibility research gates for goal-flow

Date: 2026-06-08
Status: ACCEPTED
Extends: ADR-012, ADR-018, ADR-022
Supersedes: none (closes process-corruption gaps from consumer audit)

## Problem statement

Consumer run `business-workflow-ui-20260530` completed execution with declared visual fidelity PASS while:

1. Discovery completed in 0s with zero reference PNGs on disk.
2. Scope tripled via unreconciled specs without ADR expansion.
3. Architecture left deploy target and execution plane undeclared; production deploy broke runtime.
4. Integration stage was skipped; a second run deployed anyway.
5. QA gates measured local proxy metrics, not deploy-target runtime.

Agents followed what gates rewarded and bypassed what gates failed to enforce. The root cause is missing deterministic gates for reference UI binding, spec reconciliation, and deploy/runtime feasibility — not model incompetence.

## Decision

### 1. Reference UI gate chain (before decomposition)

Insert nodes in `goal-flow.yaml`:

| Node | Purpose |
|---|---|
| `reference-detect` | Scan intent, attachments, manifest paths, repo reference dirs; emit `reference-inventory.json` |
| `discovery` | Browser capture into `{output_dir}/reference-screenshots/` |
| `reference-confirm` | HITL or auto-confirm; set `target.reference_ui.confirmed: true` |
| `feasibility-research` | Deploy matrix, execution plane, spec reconciliation for runtime intents |

Gate `reference-ui-ready.pass` blocks `discovery` completion unless:

- At least one PNG > 1 KB exists under `{output_dir}/reference-screenshots/`, **or**
- Signed waiver artifact `reference-waiver-adr.md` exists in output dir or `.sdlc/context/decisions/`.

Zero-second discovery completion with `reference_screenshots_on_disk: false` is impossible when gate adapters run in agent mode.

### 2. Feasibility research (runtime intent class)

When intent or classify output matches runtime keywords (`control-plane`, `runtime`, `dispatch`, `subprocess`, `SSR`, `gateway`, `deploy`), gate `feasibility-research.pass` requires:

- `feasibility-report.md` in workflow output dir
- `manifest.target.deploy_target` in `{local-node, vm, serverless, waived-local-only}`

Pure visual-clone intents without runtime keywords pass with N/A.

### 3. Architecture hardening

`architecture` node postCondition adds:

- `spec-reconciliation.pass` — `spec-reconciliation.md` exists; zero unresolved P0 rows
- `deploy-target-declared.pass` — `manifest.target.deploy_target` enum set
- `execution-plane-adr.pass` — when execution plane uses subprocess/spawn, ADR reference recorded

### 4. Deploy and integration

`deploy` node preCondition adds `e2e-deploy-target.pass`:

- PASS when `deploy_target` is `local-node` or `waived-local-only`
- PASS when `e2e-deploy-target-report.md` logs E2E PASS against deployed URL
- FAIL for `serverless`/`vm` without deploy-target E2E evidence

### 5. Reflect memory consistency

`reflect` node postCondition adds `memory-consistency.pass`:

- Handoff verdict in `.sdlc/handoffs/LATEST.md` must not contradict `operational-context.md` COMPLETE flags for the same ticket/run.

### 6. Agent policy

`goal-flow` `agentPolicy.forbiddenAgentBehaviors` adds:

- `text_only_discovery_without_pngs_or_waiver`
- `decomposition_without_reference_ui_confirmed`

Intent plus on-disk reference images are authoritative target UI — not prose from training or unreconciled specs.

### 7. Open integration overlap (FM-5)

`sdlc_workflow_overlap.py` detects goal runs with execution complete and integration pending on the same `target_root` + route.

- New goal-flow runs blocked in `sdlc_workflow_run.py` and `sdlc_continuity_resolve.py`
- Deploy node preCondition: `open-integration-run.pass`

### 8. Harness parity (FM-7)

`.sdlc/gates/harness-parity.contract.yaml` defines cross-language invariants. Gate `harness-parity.pass` on integration node; checker `sdlc_harness_parity.py`.

### 9. Legacy migration (FM-8)

`sdlc_workflow_migrate.py migrate --run-id <id>` converts `.sdlc/runs/` → `.sdlc/workflow-runs/`. Legacy `stage-complete` / `update-ticket` blocked until migrated.

## Verification

```bash
python3 -m pytest .sdlc/bin/tests/test_workflow_gate_adapters.py \
  .sdlc/bin/tests/test_workflow_overlap.py \
  .sdlc/bin/tests/test_workflow_migrate.py -q
python3 .sdlc/bin/sdlc_workflow_validate.py review
python3 .sdlc/bin/sdlc_workflow_migrate.py check
python3 .sdlc/bin/sdlc_harness_parity.py
```

Acceptance:

1. Synthetic run cannot pass `discovery` without PNGs or waiver ADR.
2. Control-plane intent cannot pass `feasibility-research` without `feasibility-report.md` + `deploy_target`.
3. `deploy` fails when `deploy_target=serverless` without deploy-target E2E report.
4. New goal blocked when open integration run exists on same surface.
5. Legacy in-progress run cannot `stage-complete` without migration.
6. Harness parity FAIL when TS reader omits ACTIVE skip (when files exist).

## Consequences

### Positive

- Visual truth bound to hashed PNGs on disk.
- Runtime truth bound to deploy-target feasibility before wave planning.
- Spec truth bound to reconciled authority table.
- Consumer `/sdlc:goal` UI+runtime intents become trustworthy after sync.

### Negative

- Additional nodes increase orchestration latency for greenfield runs.
- Runtime intents cannot proceed without explicit deploy target declaration.

## References

- Consumer audit: `business-workflows/.sdlc/handoffs/2026-06-08-0200-SDLC-UPSTREAM-process-corruption-audit.md`
- ADR-012 — deterministic gate matrix
- ADR-018 — workflow-runs manifest authority
- ADR-022 — goal agentPolicy stepLoop
- Legacy discovery rule: `.sdlc/workflows/_archive/sdlc-e2e-procedure-legacy.md` Stage 3
