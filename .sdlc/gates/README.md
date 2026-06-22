# Gate registry — deterministic governance definitions
# Cross-reference: schemas/gate-dsl.schema.json, schemas/workflow-contract.rules.yaml

| Gate file | Outcome when |
|---|---|
| `structured-output.pass.yaml` | Cognitive output validates against schema + confidence >= 0.7 |
| `schema-valid.pass.yaml` | Artifact validates against declared JSON Schema |
| `doctor-pass.pass.yaml` | Doctor structural/operational check exits 0 |
| `index-registered.pass.yaml` | Resource registered in INDEX.md |
| `integration-report.pass.yaml` | Workflow output integration-report.md or cognitive joint_e2e PASS |
| `ci-target-aligned.pass.yaml` | GitHub gate_contract only (working-directory: target_root) — preflight |
| `deploy-recorded.pass.yaml` | CI deploy run URL on manifest.deployment or cognitive output |
| `post-deploy-recorded.pass.yaml` | production_url or post_deploy_smoke_pass recorded |
| `board-sync-ready.pass.yaml` | All workflow manifest slice tickets status done |
| `delivery-complete.pass.yaml` | Output bundle contains required artifacts |
| `visual-evidence.pass.yaml` | Evidence manifest + viewport PNG captures (ticket `qa_surface=browser`) |
| `library-evidence.pass.yaml` | manifest.md + pytest/unit-test evidence (ticket `qa_surface=headless`) |
| `ticket-qa-contract.pass.yaml` | Ticket declares valid `qa_surface` + headless `validation_checks` at spec-flow (ADR-029) |
| `shell-tier-checklist.pass.yaml` | Product-shell fidelity.json overall_pass + no REVOKED checklist |
| `playwright-report.pass.yaml` | playwright-report.json exitCode 0 when present |
| `feature-flow-complete.pass.yaml` | All feature_flow_stages completed for ticket |
| `worktree-registered.pass.yaml` | Slice tickets have valid git worktree paths (`qa.worktree_gate`) |
| `worktree-committed.pass.yaml` | Slice worktrees clean and >=1 commit ahead of main/master |
| `pr-registered.pass.yaml` | Slice tickets have GitHub PR URL (`sdlc_workflow_pr.py create`) |
| `reference-ui-ready.pass.yaml` | Reference PNGs on disk or waiver ADR (ADR-027 — blocks text-only discovery) |
| `reference-confirmed.pass.yaml` | `target.reference_ui.confirmed` or reference-confirmation.md |
| `feasibility-research.pass.yaml` | feasibility-report.md + deploy_target for runtime intents |
| `spec-reconciliation.pass.yaml` | spec-reconciliation.md without unresolved P0 |
| `deploy-target-declared.pass.yaml` | manifest.target.deploy_target enum set (default local-only) |
| `local-validation-recorded.pass.yaml` | local-validated closure + build/typecheck evidence (ADR-028) |
| `closure-satisfied.pass.yaml` | achieved closure tier >= delivery.default_closure (ADR-028) |
| `execution-plane-adr.pass.yaml` | ADR when subprocess/spawn execution plane |
| `e2e-deploy-target.pass.yaml` | Deploy-target E2E before serverless/vm deploy |
| `memory-consistency.pass.yaml` | Handoff verdict aligns with operational-context |
| `open-integration-run.pass.yaml` | No overlapping goal run with integration pending (FM-5) |
| `harness-parity.pass.yaml` | TS/Python harness invariants per harness-parity.contract.yaml (FM-7) |
| `legacy-run-migrated.pass.yaml` | Legacy .sdlc/runs/ migrated before mutation (FM-8) |
| `harness-parity.contract.yaml` | Cross-language harness invariant definitions |
| `ecosystem-scope.pass.yaml` | Ecosystem ops scope-report.md PASS — no forbidden child app scaffold (ADR-039) |

Cognition never invokes gates directly — harness orchestrator evaluates gate after cognitive output is written.

Cross-reference: `.sdlc/INDEX.md` [RUNTIME.COMMANDS]; `bin/sdlc_workflow_validate.py review`
