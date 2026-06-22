# ADR-017: SDLC Workflow Runner as Sole Execution Plane

Date: 2026-05-31
Status: ACCEPTED

## Context

ADR-016 declared all seven SDLC workflows migrated to `sdlc.jambu/v1` composite nodes. Operationally, `.sdlc/workflows/` remained on legacy `stages:` format until 2026-05-31. The effective control plane for `/sdlc:e2e` was `sdlc_e2e_manifest.py` plus agent-improvised markdown commands — not `sdlc_workflow_run.py` with `postCondition.checks[]`.

Run `product-shell-20260530` demonstrated the failure mode: `update-ticket --field visual_gate PASS` and `qa_verdict PASS` were set without gate adapter exit 0. Evidence was self-certified via grep and agent-authored tier checklist markdown.

Two parallel stacks existed:

| Layer | Declared contract | Runtime |
|---|---|---|
| Composite workflows + runner | ADR-016 | Never invoked by `/sdlc:e2e` |
| Legacy manifest + commands | Implicit | Effective control plane |

This is not a protocol violation in the enforcement sense — no enforcer existed. It is architectural debt with false documentation.

## Decision

**`sdlc_workflow_run.py` is the sole execution plane for SDLC workflow continuity.** Cognition executes only inside `function.invoke`; the harness evaluates `postCondition.checks[]` before advancing nodes.

### Phase 0 — Stop the bleeding (this ADR)

1. Revert fraudulent PASS on active runs (e.g. `product-shell-20260530`) — `visual_gate: FAIL`, `qa_verdict: null`, run `status: blocked`, `protocol.violation: legacy-control-plane-bypass`.
2. CI MUST fail when `python3 .sdlc/bin/sdlc_workflow_validate.py review` reports legacy workflows.

### Phase 1 — Composite reference pipeline (this ADR)

1. Migrate all seven workflows in `.sdlc/workflows/` to `sdlc.jambu/v1` composite (template: `business-workflows/.sdlc/workflows/`).
2. Extend `feature-flow` QA node `postCondition.checks[]` with deterministic visual gates:
   - `gates/visual-evidence.pass`
   - `gates/shell-tier-checklist.pass`
   - `gates/playwright-report.pass`
3. Register gate adapters in `sdlc_workflow_gate.py` — measurement and file presence, not agent opinion.

### Phase 2 — Thin `/sdlc:e2e` command (this ADR)

1. `.cursor/commands/sdlc-e2e.md` reduced to runner trigger + step/submit loop (~80 lines).
2. Legacy 934-line procedure archived at `.sdlc/workflows/_archive/sdlc-e2e-procedure-legacy.md`.
3. `sdlc_workflow_run.py` exposes `status`, `step` (exit 42 = agent dispatch), `submit` (postCondition enforcement).
4. `e2e-orchestration-flow` execution node invokes `sdlc_e2e_execution.py dispatch --parallel 4` for ticket fan-out.
5. `orchestration.manifest.control_script` → `sdlc_workflow_run.py`.

### Phase 3 — Deprecate manifest control plane (partial — this ADR)

`sdlc_e2e_manifest.py` stage lifecycle moves to `sdlc_workflow_manifest.py`. `update-ticket --field visual_gate|qa_verdict` requires gate adapter PASS (implemented); `--force` only with incident ADR.

### Invariant (GOD rule)

```
NENHUM bloco cognitivo executa fora de:
  sdlc_workflow_run.py → node.function.invoke → postCondition PASS

NENHUM veredito PASS em manifest sem gate adapter exit 0.
NENHUM prompt solto — command = trigger, workflow = procedure, gate = truth.
```

## Consequences

- ADR-016 verification section corrected — migration was schema-ready, not operationally shipped until ADR-017 Phase 1.
- `product-shell-20260530` blocked until re-run through composite feature-flow with gate adapters.
- CI blocks merge on legacy workflow format.
- `/sdlc:e2e` still uses `sdlc_e2e_manifest.py` until Phase 2 — documented gap, not hidden.

## Verification

```bash
python3 .sdlc/bin/sdlc_workflow_validate.py review   # 7/7 PASS
python3 .sdlc/bin/tests/test_workflow_validate.py
python3 .sdlc/bin/tests/test_sdlc_workflow_run.py
# product-shell run blocked:
grep 'status: blocked' .sdlc/runs/product-shell-20260530/manifest.yaml
grep 'legacy-control-plane-bypass' .sdlc/runs/product-shell-20260530/manifest.yaml
```

## References

- ADR-016 (composite node schema — superseded operationally by this ADR for execution plane)
- ADR-009 (E2E orchestration composition)
- ADR-012 (deterministic gate matrix)
- `business-workflows/app/.business/workflows/workflow-authoring.yaml` (reference composite pattern)
