# ADR-016: SDLC Composite Workflow Node (sdlc.jambu/v1)

Date: 2026-05-30
Status: ACCEPTED

## Context

The business harness (`business.jambu/v1`) adopted composite nodes in ADR-001: `function.invoke` + `postCondition.checks[]`, absorbing former `type`+`gate` DAG nodes. The SDLC installation (`.sdlc/workflows/`) remained on the legacy shape, creating a false sense that the product harness was current while the distributable SDLC layer was one generation behind.

## Decision

**`sdlc.jambu/v1` workflows use the same composite node model as `business.jambu/v1`.**

```
preCondition?  →  function.invoke  →  postCondition.checks[]
```

### SDLC-specific extensions (preserved on compositeNode)

- `metadata.trigger` — required entry command
- `control` — blocking, onFailure, skipInModes
- `workflowRef`, `protocolGates` — E2E orchestration delegation
- `spec.orchestration`, `bootstrapCheck`, `severitySla`, etc. — workflow-level only

### Invoke types (sdlc.jambu/v1)

| type | ref pattern |
|---|---|
| `command` | `/slash:command` or `.cursor/commands/*.md` |
| `agent` | `.cursor/agents/*.md` |
| `skill` | `.cursor/skills/*/SKILL.md` |
| `subprocess` | logical ref + `command` + `args` |

Forbidden: `playbook`, legacy top-level `type`+`gate`, separate `gate-*` node ids.

### Validator

`sdlc_workflow_validate.py review` rejects legacy nodes and validates gate refs inside `postCondition.checks`.

## Consequences

- Composite node schema and validator shipped in v1.1.0+ (2026-05-30)
- **Operational migration of all 7 workflows deferred until ADR-017 (2026-05-31)** — ADR-016 prematurely claimed migration complete; see ADR-017 Phase 1
- Business and SDLC harnesses share the same node ontology — different apiVersion, same composite pattern
- Orchestrator/runner: `sdlc_workflow_run.py` + `sdlc_workflow_manifest.py` (parity with business `business_workflow_run.py`)
- Validator rejects missing command/agent/skill refs and trigger commands without on-disk targets

## Verification

```bash
python3 .sdlc/bin/sdlc_workflow_validate.py review
python3 .sdlc/bin/tests/test_workflow_validate.py
python3 .sdlc/bin/sdlc_workflow_run.py run --workflow incident-flow --intent "test" --mode stub
python3 .sdlc/bin/tests/test_sdlc_workflow_run.py
```

## References

- `business-workflows/app/.business/context/decisions/ADR-001-node-composite.md`
- `.sdlc/schemas/workflow-dsl.schema.json`
- `.sdlc/schemas/workflow-contract.rules.yaml`
