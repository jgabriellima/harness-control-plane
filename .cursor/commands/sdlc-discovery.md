---
name: sdlc-discovery
description: Strategic repo discovery — understand structure, integrations, and doctor state before intent classification or E2E orchestration.
---

# /sdlc:discovery — Strategic Repository Discovery

Distinct from the goal-flow `discovery` node (reference URL pixel capture). This command builds a cognitive map of the repository before `/sdlc:goal` classifies intent or declares a new `workspace.target_root`.

## Usage

```
/sdlc:discovery [--run-id <slug>]
```

Invoke at hydrate or standalone before `/sdlc:goal` when entering a new session or when intent may change application layout.

## Output

`.sdlc/runs/{run_id}/repo-discovery.md` (uses ACTIVE run when `--run-id` omitted)

## Execution Protocol

1. Read `.sdlc/INDEX.md` — scoped sections: ACTIVE_WORK, SPECS, ADRS, RUNTIME.COMMANDS, RUNTIME.SKILLS
2. Read `.sdlc/sdlc.yaml` — `workspace.target_root`, `workspace.profile`, `gates:`, `integrations:`
3. Walk directory indices: `.github/README.md`, `.cursor/commands/README.md`, `.sdlc/bin/README.md`
4. Inspect key workflows: `.github/workflows/deploy.yaml`, `release.yaml`, `dependency-updates.yaml`, `e2e.yaml`
5. Record current `target_root`, `project.stack.observability`, and integration slots (Plane, GitHub, Cloudflare Pages)
6. Run structural doctor summary:

```bash
cd .sdlc && npm run doctor:structural 2>&1 | tail -40
```

7. Write `repo-discovery.md` with:
   - Current `target_root` and CI alignment status
   - Integration slot coverage
   - Doctor pass/warn/fail counts
   - Recommended next action (rebind, init, or proceed to classify)

## Workspace Rebind Trigger

If intent declares a new application path OR `target_root` in classify output differs from `.sdlc/sdlc.yaml`:

```bash
python3 .sdlc/bin/sdlc_workspace_rebind.py --target <path> --profile <profile> [--run-id <slug>]
python3 .sdlc/bin/sdlc_workflow_run.py submit --run-id <workflow-run-id> --node workspace-rebind \
  --cognitive .sdlc/workflow-runs/output/goal-flow/<workflow-run-id>/cognitive/workspace-rebind.json
```

Do not proceed to `wave-planning` or `execution` until `workspace-rebind` stage completes and doctor `workspace:ci-target-aligned` passes.

## Verification

- `repo-discovery.md` exists under run directory
- Doctor structural run captured in report
- If rebind required, `rebind-report.md` exists with Verdict: PASS
