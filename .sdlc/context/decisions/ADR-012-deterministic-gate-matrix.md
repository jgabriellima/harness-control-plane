# ADR-012: Deterministic Gate Matrix and Workspace Rebind

**Status:** ACCEPTED  
**Date:** 2026-05-25  
**Context:** Run `llm-playground-20260525` exposed gate holes, protocol guard miscalibration, and missing workspace-rebind workflow when intent declares a new `app/` target.

## Problem Statement

The E2E orchestrator can mark stages complete without artefact proof. Protocol guard blocks legitimate deploy infra edits while allowing orchestrator implementation bypass. `workspace.target_root` changes are documented in specs but not materialized through CI, integrations, or doctor checks. Run closure (`mark-done`) can succeed while SDLC cognitive state remains uncommitted — next session loses continuity.

## Decision

### 1. Gate matrix is the contract

All stage transitions MUST pass gates declared in `.sdlc/sdlc.yaml` → `gates:` (new section) and enforced in `.sdlc/bin/sdlc_gate_check.py`. Doctor (`runtime-alignment.ts`) materializes the same checks. No gate exists only in prose.

### 2. Protocol guard — deploy-stage allowlist (not deploy worktree)

**Rejected:** Option B — dedicated deploy worktree ticket for every pipeline retarget.

**Accepted:** Option A refined — orchestrator may edit allowlisted infra paths when manifest stage `deploy` is `in_progress`:

| Allowlisted path pattern | Rationale |
|---|---|
| `.github/workflows/deploy.yaml` | Pipeline target |
| `.github/workflows/release.yaml` | Version bump path |
| `.github/workflows/dependency-updates.yaml` | Lockfile maintenance |
| `.sdlc/integrations/vercel/vercel.yaml` | Deploy integration root |
| `{target_root}/vercel.json` | Vercel adapter config |
| `{target_root}/e2e/smoke.spec.ts` | Deploy smoke gate |
| `{target_root}/CHANGELOG.md` | Release record |
| `{target_root}/package.json` | Version field only (semver bump) |

**Never allowlisted for orchestrator:** `{target_root}/src/**`, `{target_root}/components/**`, feature E2E specs beyond smoke.

Implementation: extend `sdlc_protocol_guard.py` with `_deploy_stage_allowlist(path) -> bool`.

### 3. Workspace rebind sub-workflow

When classify/discovery detects `target_root` change (new app path or profile change), orchestrator MUST run **workspace-rebind** before execution:

```
Trigger: intent declares new target_root OR target_root != current sdlc.yaml value
Entry:   python3 .sdlc/bin/sdlc_workspace_rebind.py --target app --profile astro
Actions:
  1. Update .sdlc/sdlc.yaml workspace.target_root + profile
  2. Patch .github/workflows/{deploy,release,dependency-updates}.yaml working-directory
  3. Patch .sdlc/integrations/vercel/vercel.yaml root_directory
  4. Update .cursor/memories/architecture.md target_root row
  5. Run doctor:structural gate workspace:ci-target-aligned
Exit:    rebind-report.md in run dir; stage-complete workspace-rebind blocked until doctor PASS
```

This replaces ad-hoc "update target_root on merge" notes in specs.

### 4. `/sdlc:discovery` (strategic repo discovery)

Distinct from E2E stage `discovery` (reference URL pixel capture):

| Command | Purpose | Output |
|---|---|---|
| `/sdlc:discovery` | Understand repo structure before intent classification | `.sdlc/runs/{id}/repo-discovery.md` |
| E2E `discovery` stage | Capture reference UI for clone/greenfield visual fidelity | `reference-screenshots/` |

`/sdlc:discovery` procedure: INDEX → sdlc.yaml → directory indices → key workflows → current target_root → integration slots → doctor structural summary. Invoked at hydrate or standalone before `/sdlc:e2e`.

### 5. Run closure requires durable cognitive state

`mark-done` gate additions:

- `handoff_recorded`: LATEST.md must not be session-stub pattern
- `sdlc_state_committed`: `.sdlc/sdlc.yaml`, run manifest, INDEX delta, memories delta either committed to main or explicitly listed in run policy with reason
- `doctor:operational` PASS on workspace CI alignment

A run is **not complete** if the next session cannot hydrate from git + LATEST.md alone.

### 6. Type coercion in manifest CLI

`update-ticket --field plane_evidence_uploaded --value true` MUST store YAML boolean `true`, not string `'true'`.

Known boolean fields: `plane_evidence_uploaded`, `plane_state_synced`, `subagent_dispatched`, `feature_flow_complete`, all `definition_of_done` keys.

### 7. Auto-sync definition_of_done

`_sync_definition_of_done(manifest, repo_root)` called on:

| Event | Flags set |
|---|---|
| `stage-complete execution` | `implementation_working`, `all_tickets_done`, `all_prs_merged` |
| `stage-complete deploy` | `deployed_to_production` |
| `stage-complete board-sync` | `all_evidence_uploaded`, `board_fully_updated` |
| `record-handoff` (non-stub) | `handoff_recorded` |

Eliminates routine `mark-done --force`.

## Stage-complete gates (new)

| Stage | Gate |
|---|---|
| `integration` | `integration-report.md` exists; joint E2E pass logged |
| `deploy` | CI deploy workflow references `workspace.target_root`; staging smoke PASS or URL in manifest |
| `post-deploy` | evidence dir with manifest.md; production HTTP 200 |
| `reflect` | `reflect-report.md` exists; verdict PASS |
| `workspace-rebind` | doctor `workspace:ci-target-aligned` PASS; `rebind-report.md` exists |

## Consequences

- Next `/sdlc:e2e` with new app path auto-triggers rebind — no manual deploy.yaml fix mid-deploy
- Orchestrator deploy edits no longer trigger false ADR-009 violations
- Doctor catches CI drift before deploy stage
- Session-stop stub cannot overwrite enriched handoff (separate hook fix)
- Wave 1 infra handoff (1451) closes when gates + doctor + templates sync verified by pytest + doctor

## References

- ADR-009 E2E orchestration composition
- ADR-011 workspace.target_root
- Handoff `2026-05-25-1451-e2e-gates-protocol`
- Forensic: run `llm-playground-20260525`
