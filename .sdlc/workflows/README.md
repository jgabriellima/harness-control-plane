# SDLC Workflows — Composition Index

Workflow YAML files define stage contracts. Commands in `.cursor/commands/` are the human/agent entry points. Agents in `.cursor/agents/` execute stages within a workflow.

Cross-reference: [`.sdlc/INDEX.md`](../INDEX.md) | ADR-009

## Composition Hierarchy

```
/sdlc:goal (macro — manifest + waves + Plane hierarchy; /sdlc:e2e deprecated)
│
├── /hydrate-context
├── classify, discovery (orchestrator + browser-user)
├── decomposition ──────────► Task(planner) + /plan
├── plane-hierarchy ────────► /spec:create per ticket (spec-writer)
├── architecture ───────────► Task(planner)
├── wave-planning (orchestrator)
│
├── execution (per ticket, parallel by wave)
│   └── /implement-feature ──► feature-flow.yaml
│         ├── planner.md
│         ├── implementer.md
│         ├── reviewer.md
│         ├── qa.md (+ qa-recording skill only)
│         └── pr + plane-closure
│   └── playbooks_when (clone mode only): pb.webdesign.* via provision
│
├── integration (orchestrator — merge PRs, joint E2E)
├── /deploy-release ──────────► deployment-flow.yaml + deployer.md
├── /sdlc:post-deployment
├── board-sync (Plane evidence + INDEX)
└── /sdlc:reflect + /handoff
```

## Workflow Taxonomy

| Class | Flows | App code? |
|---|---|---|
| delivery-flow | `goal-flow`, `feature-flow`, `deployment-flow` | Yes |
| bootstrap-flow | `bootstrap-flow` | Compose only after `/sdlc:init` questionnaire |
| operational-flow | `engspec-flow`, `ecosystem-ops-flow`, `incident-flow` | No |

## Workflow Registry

| File | Trigger | Primary agents | Output |
|---|---|---|---|
| `ecosystem-ops-flow.yaml` | `/sdlc:ecosystem` | planner (ops capsule) | sibling harness install, ecosystem registration, scope report |
| `content-editorial-flow.yaml` | `/sdlc:goal` (mode=content) | orchestrator | editorial calendar, Plane labels |
| `goal-flow.yaml` | `/sdlc:goal` | orchestrator dispatches subagents | WorkflowRunManifest, deployed product |
| `feature-flow.yaml` | `/implement-feature` | planner, implementer, reviewer, qa | PR, evidence |
| `spec-flow.yaml` | `/spec:create` | spec-writer | spec, ticket, worktree |
| `e2e-flow.yaml` | `/run-e2e` | qa | evidence |
| `deployment-flow.yaml` | `/deploy-release` | deployer | release |
| `incident-flow.yaml` | `/fix-incident` | incident-resolver | hotfix PR |
| `bootstrap-flow.yaml` | `/sdlc:init` | planner, implementer | initialized project |
| `engspec-flow.yaml` | `/sdlc:engspec` | planner (engspec capsule) | engineering spec artifacts |

## Orchestrator Invariants

1. **Never implement `app/` code in the main workspace session.**
2. **Never skip `feature-flow` for a ticket in `execution` stage.**
3. **One Plane ticket → one worktree → one `/implement-feature` → one PR.**
4. **Mark manifest stages complete only after delegated workflow success_criteria pass.**
5. **Gates enforced by `.sdlc/bin/sdlc_gate_check.py` — not agent optimism.**

## Distributed Execution (Plane → agents)

When Plane hierarchy is populated:

- Epic JAMBU-N = run container in manifest
- Child JAMBU-N+1..M = independent `/implement-feature` dispatches
- Each dispatch can run in isolated Cursor agent session (local Task subagent or cloud agent)
- Wave N completes when all child PRs merge; wave N+1 dispatches only after merge gate

The protocol is identical whether agents run on one machine or many — only dispatch transport changes.
