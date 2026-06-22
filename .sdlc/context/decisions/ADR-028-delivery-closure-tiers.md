# ADR-028: Delivery Closure Tiers — Local-Default Goal Completion

Status: ACCEPTED  
Date: 2026-06-08  
Extends: ADR-011, ADR-018, ADR-027

## Context

`goal-flow` declared `deployed_to_production` in `definition_of_done` and chained `integration → deploy → post-deploy` unconditionally (except mode skips). That encodes a dogfood pipeline (GitHub Actions + Cloudflare Pages) as framework default, contradicting ADR-011 distributable lifecycle slots and ADR-018 orthogonal CI.

Teams complete development at a validation layer (local build + QA evidence). Promotion to preview, staging, or production is a separate concern bound to optional integration slots — not exogenous CI state.

## Decision

### 1. Closure tiers (ordered)

| Tier | Meaning |
|---|---|
| `local-validated` | Build, typecheck, feature-flow QA evidence aggregated — **framework default** |
| `preview-validated` | PR registered; optional preview surface smoke |
| `staging-validated` | Remote staging deploy + E2E evidence |
| `production-validated` | Production deploy + post-deploy smoke |

`delivery.default_closure` in `sdlc.yaml` sets the tier required for `goal-flow` completion. Default: `local-validated`.

### 2. Delivery surfaces (opt-in)

```yaml
delivery:
  default_closure: local-validated
  surfaces:
    local: { enabled: true, evidence: [build, typecheck, playwright, qa-manifest] }
    preview: { enabled: false }
    staging: { enabled: false }
    production: { enabled: false }
```

Promotion beyond local uses `/sdlc:deploy` (`deployment-flow.yaml`) when surfaces are enabled. Goal-flow does not require CI `ci_run_url` for default closure.

### 3. Goal-flow graph

- New node `validate-local` after `execution` — subprocess build/typecheck + `local-validation-recorded.pass`
- `pr-creation`, `integration`, `deploy`, `post-deploy` gated by `skipUnlessClosureAtLeast` and `skipUnlessSurfacesEnabled`
- `board-sync` depends on `validate-local` (remote chain nodes skipped when not required)
- DoD: `closure_satisfied` replaces `deployed_to_production` as primary flag; legacy `deployed_to_production` derived only when tier ≥ production

### 4. Deploy target default

`manifest.target.deploy_target` defaults to `local-only`. `waived-local-only` remains accepted alias.

### 5. Exogenous CI decoupling

- `ci-target-aligned.pass` at preflight: N/A when no integration serves `ci` slot
- `deploy-recorded.pass`: N/A when closure < staging-validated or deploy/post-deploy nodes skipped
- GitHub merge state does not block local-default goal completion

### 6. Dogfood override

This repository may enable `staging` and `production` surfaces and raise `default_closure` via `sdlc.yaml` — project config, not framework default.

## Consequences

- Distributable template ships local-only delivery; zero deploy integration required for operational goal runs
- `sdlc_delivery.py` centralizes closure rank, surface checks, DoD sync
- Package templates and goal-flow DSL version bump to 1.5.0

## Verification

```bash
python3 .sdlc/bin/tests/test_delivery_closure.py
python3 .sdlc/bin/tests/test_workflow_gate_adapters.py
python3 .sdlc/bin/sdlc_workflow_validate.py review
```
