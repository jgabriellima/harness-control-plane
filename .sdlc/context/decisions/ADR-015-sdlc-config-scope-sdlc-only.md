# ADR-015: `/sdlc:config` Scope — SDLC Layer Only

Date: 2026-05-29
Status: ACCEPTED

## Context

`/sdlc:config` and the integration mutation pipeline (ADR-011 W3) discovered and patched files under `app/` and `workspace.target_root`, treating the monorepo as a single application surface. In dual-harness repos (SDLC + product layer at `app/`), this caused SDLC integration credentials and provider manifests to overwrite product/harness integration configs.

The failure mode is structural: discovery walked `app/`, categorized hits as `"app"`, and agent tasks instructed patching `target_root` SDK wiring. Profile-specific exceptions (e.g. excluding only `app/.business/`) would not scale — any nested product layer would remain vulnerable.

## Decision

**`/sdlc:config` scope is the SDLC harness layer only.** No profile branching. No path-specific allowlists beyond the SDLC layer definition.

### In scope

| Path | Purpose |
|---|---|
| `.sdlc/**` | Integration manifests, sdlc.yaml, workflows, credential manifest |
| Repo-root `.cursor/**` | SDLC commands, rules, agents, memories |
| `.github/**` | CI workflows for this repository |
| Root `.env` | Credentials with `layer: sdlc` in credential manifest |

### Out of scope (hard deny)

| Path | Rationale |
|---|---|
| `app/**` | Application or product code — not SDLC |
| `{target_root}/**` | Same — workspace binding does not grant config authority |
| Nested specialization / harness dirs | Owned by that layer's config command |

### Pipeline enforcement

1. `discovery.ts` walks only `.sdlc/`, `.cursor/`, `.github/` — never `app/`.
2. `buildAgentTasks()` never emits "patch target_root" or app SDK tasks.
3. Mutation plan includes `layer_boundary: { scope: "sdlc-only", excluded_paths: [...] }`.
4. `sdlc-config.md` Phase 0 documents the invariant; Phase 5.2 lists SDLC-only patches.

### Delegation

Product or harness integration configuration belongs to that layer's own command (e.g. `/business:config`). `/sdlc:config` completes SDLC work and outputs delegation — it does not cross the boundary.

### Credential namespaces

SDLC and product layers may use the same provider (e.g. Plane) with different workspaces, slots, and env var names. `/sdlc:config` writes only manifest entries with `layer: sdlc`. Never merge or copy SDLC integration YAML into product paths.

## Consequences

- Positive: Re-running `/sdlc:config` cannot mutate product/harness integration dirs.
- Positive: Rule is universal — no special cases per profile.
- Negative: App-level SDK wiring after an SDLC integration swap requires a separate explicit task or product-layer config — not automatic from `/sdlc:config`.
- Neutral: `/sdlc:init` compose mode may still scaffold `target_root` — that is init, not config delta.

## Verification

```bash
cd .sdlc
npx ts-node pipeline/integration-mutator.ts plan \
  --action add --provider plane --slots work_items --source config-add

# .last-plan.json must have:
# - zero discovery hits under app/
# - layer_boundary.scope === "sdlc-only"
# - no agent_tasks referencing target_root SDK patch
```

Doctor structural check: `config:scope-boundary-enforced`.

## References

- ADR-011 — Integration mutation pipeline
- `.cursor/commands/sdlc-config.md` Phase 0
- `.sdlc/pipeline/discovery.ts` — `SDLC_CONFIG_SCOPE_ROOTS`
