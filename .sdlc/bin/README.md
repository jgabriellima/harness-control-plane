# `.sdlc/bin/` — SDLC Runtime Scripts

Deterministic tooling for the SDLC orchestration layer. Materialized at `.sdlc/bin/` on install (ADR-011). Resolves paths via `_sdlc_paths.py` (`workspace.target_root`, repo root).

Cross-reference: [`.sdlc/INDEX.md`](../INDEX.md) · ADR-011 §9

| File | Role | Trigger / entry-point | Key dependencies |
|---|---|---|---|
| [`_sdlc_paths.py`](_sdlc_paths.py) | Repo root, `.sdlc/`, `workspace.target_root` | Imported by all bin scripts | `.sdlc/sdlc.yaml` |
| [`sdlc_dsl_bindings.py`](sdlc_dsl_bindings.py) | Resolve paths from DSL + integration gate_contract | Imported by gate/rebind scripts | `sdlc.yaml`, `integrations/*/`
| [`sdlc_gate_runner.py`](sdlc_gate_runner.py) | Execute integration gate_contract; validate-contract for authoring | `run-gate`, `/sdlc:config`, pb.sdlc.integration-authoring | ADR-013 |
| [`sdlc_playbook.py`](sdlc_playbook.py) | Playbook catalog, provision, resolve, learn (ADR-010) | `/sdlc:learn` | `.sdlc/playbooks/` |
| [`sdlc_delivery.py`](sdlc_delivery.py) | Closure tiers, delivery surfaces, DoD sync (ADR-028) | `explain`, `validate`; goal-flow skip matrix | `sdlc.yaml` `delivery` block; guide=`docs/engineering/delivery-closure.md` |
| [`sdlc_profile.py`](sdlc_profile.py) | Ticket-scoped QA evidence interpreter for `config/profile-qa.manifest.yaml` (ADR-029) | Imported by gate adapters, validate-local | `ticket.qa_surface`, `ticket.validation_checks`, `delivery.surfaces.local.evidence` |
| [`sdlc_workflow_validate_local.py`](sdlc_workflow_validate_local.py) | qa_surface-aware build/test + record local-validated closure | goal-flow `validate-local` node | `sdlc_profile.py`, `workspace.target_root` |
| [`sdlc_workflow_run.py`](sdlc_workflow_run.py) | Composite workflow orchestrator — run/resume/step/submit | `/sdlc:goal`, ADR-017/020 | `sdlc_workflow_manifest.py`, `sdlc_gate_executor.py` |
| [`sdlc_continuity_resolve.py`](sdlc_continuity_resolve.py) | Command-level continuity vs active goal runs | `/sdlc:spec` Step 0 | `sdlc.yaml`, workflow-runs ACTIVE |
| [`sdlc_workflow_run_resolve.py`](sdlc_workflow_run_resolve.py) | Goal vs feature-flow run binding; stall detection (ADR-023) | `sdlc_continuity_resolve.py`, `sdlc_goal_runtime.py` | workflow-runs manifests |
| [`sdlc_workflow_reconcile.py`](sdlc_workflow_reconcile.py) | Scan/check orphan child runs; CI integrity gate | `validate.yaml`, ADR-023 | `reconcile-suppressions.yaml` |
| [`sdlc_goal_runtime.py`](sdlc_goal_runtime.py) | Cursor hook policy for `/sdlc:goal` (ADR-022/023) | `.cursor/hooks/sdlc_runtime_guard.py` | `sdlc_workflow_run.py` |
| [`sdlc_ecosystem_scope.py`](sdlc_ecosystem_scope.py) | Ecosystem ops allowlist audit for stop hook (ADR-039 Phase 2) | `.cursor/hooks/sdlc_runtime_guard.py` | `ecosystem-ops-flow` manifests |
| [`sdlc_workflow_manifest.py`](sdlc_workflow_manifest.py) | Workflow run manifest (`.sdlc/workflow-runs/`) | `sdlc_workflow_run.py` | workflow DSL |
| [`sdlc_workflow_validate.py`](sdlc_workflow_validate.py) | Reject legacy workflow format | CI validate job | `workflow-contract.rules.yaml` |
| [`sdlc_e2e_execution.py`](sdlc_e2e_execution.py) | Parallel feature-flow fan-out per goal wave | goal-flow execution node | `sdlc_workflow_manifest.py` |
| [`sdlc_workflow_pr.py`](sdlc_workflow_pr.py) | `gh pr create` + manifest `pr_url` registration | goal-flow `pr-creation` node | `sdlc_workflow_manifest.py`, `gh` |
| [`sdlc_workflow_migrate.py`](sdlc_workflow_migrate.py) | Legacy `.sdlc/runs/` → workflow-runs migration (ADR-027 FM-8) | `migrate --run-id`, `check` | `sdlc_workflow_manifest.py` |
| [`sdlc_workflow_overlap.py`](sdlc_workflow_overlap.py) | Open integration overlap detection (ADR-027 FM-5) | goal init, deploy gate, continuity | workflow + legacy manifests |
| [`sdlc_harness_parity.py`](sdlc_harness_parity.py) | TS/Python harness invariant checker (ADR-027 FM-7) | integration gate, `harness-parity.contract.yaml` | target_root harness files |
| [`sdlc_e2e_manifest.py`](sdlc_e2e_manifest.py) | Legacy `.sdlc/runs/` read-only archive (ADR-020) | status/list-runs/validate only | `.sdlc/runs/`, `sdlc_gate_check.py` |
| [`sdlc_gate_check.py`](sdlc_gate_check.py) | Hard gates for workflow and legacy manifests | `sdlc_workflow_gate.py`, read-only legacy | run manifest, ADR-012 gate matrix |
| [`sdlc_workspace_rebind.py`](sdlc_workspace_rebind.py) | Patch CI + integrations when target_root changes | `/sdlc:discovery`, classify | `sdlc_dsl_bindings.py`, `sdlc_gate_check.py` |
| [`sdlc_protocol_guard.py`](sdlc_protocol_guard.py) | ADR-009 edit/shell guard; deploy-stage allowlist (ADR-012); shell path extraction via `_extract_shell_probe_paths` (learn 2026-06-06) | `.cursor/hooks/hook_handler.py` | `sdlc_dsl_bindings.py`, ACTIVE manifest |
| [`work_items_sync.py`](work_items_sync.py) | Work-items provider dispatcher (manifest → provider state + harness index) | `sync --ticket JAMBU-N`, `sdlc_workflow_manifest.py` register-ticket | `sdlc_dsl_bindings.py`, `plane_ticket_state.py`, `local_ticket_state.py` |
| [`plane_ticket_state.py`](plane_ticket_state.py) | Plane adapter for work_items sync | `work_items_sync.py` when provider=plane | `.sdlc/integrations/plane/plane.yaml` |
| [`local_ticket_state.py`](local_ticket_state.py) | Filesystem adapter for local-work-items provider (ADR-025) | `work_items_sync.py` when provider=local-work-items; `create`, `list`, `regenerate-board` | `.sdlc/integrations/local-work-items/local-work-items.yaml`, `.sdlc/work-items/` |
| [`sdlc_plane_create.py`](sdlc_plane_create.py) | Create epic + child issues for E2E plane-hierarchy | `/sdlc:e2e` plane-hierarchy stage | `plane_ticket_state.py`, `PLANE_API_KEY` |
| [`sdlc_plane_labels.py`](sdlc_plane_labels.py) | Plane label ensure/list + filtered issue listing | Plane label hygiene | `plane_ticket_state.py` |
| [`sdlc_token_health.py`](sdlc_token_health.py) | Token budget audit | `/sdlc:token-health` | `.cursor/rules`, commands |
| [`token_health_artifacts.py`](token_health_artifacts.py) | HTML/canvas report generators | `--html` / `--canvas` | `sdlc_token_health.py` |
| [`bracket_compress.py`](bracket_compress.py) | Bracket notation table/KV compression | imported by token-health, context-optimize | — |
| [`sdlc_context_optimize.py`](sdlc_context_optimize.py) | Hydration corpus audit (doctor Group 7); `run_fix` called by token-health `--fix` | doctor audit; token-health fix | `bracket_compress.py`, `sdlc.yaml` `context_budget` |
| [`visual_fidelity_check.py`](visual_fidelity_check.py) | Pixel diff gate | webdesign playbook | Pillow |
| [`upload_plane_evidence.py`](upload_plane_evidence.py) | Plane attachment upload | QA evidence pipeline | Plane API |
| [`browser-remote-bridge.sh`](browser-remote-bridge.sh) | SSH tunnel for remote Playwright MCP | `/run:browser --remote` | ssh, curl |
| [`sdlc_trace_collector.py`](sdlc_trace_collector.py) | Local trace JSONL collector from Cursor hooks | `.cursor/hooks/hook_handler.py` | `.sdlc/trace/events.jsonl` |
| [`sdlc_trace_ensure.py`](sdlc_trace_ensure.py) | Trace server health probe + auto-start | `.cursor/hooks/session-start.sh` | `@jambu/ai-native-sdlc` trace CLI |
| [`sdlc_baseline.py`](sdlc_baseline.py) | Baseline init/advance/verify/status (ADR-014) | `/sdlc:init`, `/sdlc:baseline` | `.sdlc/sdlc.yaml`, `scripts/reset.sh` |
| [`sdlc_init_validate.py`](sdlc_init_validate.py) | Validate `.init-selections.json` before mutator apply (ADR-029) | `/sdlc:init` Phase C→D gate | `init-selections.schema.json` |
