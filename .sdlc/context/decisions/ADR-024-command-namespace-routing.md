# ADR-024: Command Namespace Routing

## Status

ACCEPTED — 2026-06-05

## Context

The Cursor harness exposed slash commands without a consistent namespace prefix (`/sdlc:plan`, `/sdlc:feature`, `/sdlc:implement`, `/sdlc:handoff`, `/run:browser`, etc.). Agents could not infer routing: lifecycle orchestration vs direct capability invocation vs feature micro-flow.

ADR-020 replaced `/sdlc:e2e` with `/sdlc:goal` but left other loose commands, perpetuating ambiguous dispatch.

## Decision

All slash commands MUST use one of two namespaces:

| Namespace | Purpose | Routing |
|---|---|---|
| `/sdlc:*` | SDLC lifecycle — participates in workflow harness, continuity, gates | `sdlc_workflow_run.py`, `sdlc_continuity_resolve.py`, workflow DSL |
| `/run:*` | Direct capability — orthogonal tool invocation, no macro orchestration | Skill or playbook procedure; may be composed into workflows but not a lifecycle entry |

### Canonical command map

| Canonical | Former alias |
|---|---|
| `/sdlc:goal` | `/sdlc:e2e` |
| `/sdlc:spec` | `/sdlc:spec` |
| `/sdlc:plan` | `/sdlc:plan` |
| `/sdlc:feature` | `/sdlc:feature` |
| `/sdlc:implement` | `/sdlc:implement` |
| `/sdlc:deploy` | `/sdlc:deploy` |
| `/sdlc:incident` | `/sdlc:incident` |
| `/sdlc:hydrate` | `/sdlc:hydrate` |
| `/handoff` | `/sdlc:handoff` |
| `/reset` | `/sdlc:reset` |
| `/run:e2e` | `/run:e2e` |
| `/run:browser` | `/run:browser`, `/run:browser` |
| `/run:cua` | `/run:cua` |

Unchanged `/sdlc:*` commands: `init`, `discovery`, `engspec`, `doctor`, `baseline`, `reflect`, `post-deployment`, `token-health`, `learn`, `config`.

### Routing decision tree (agent)

1. Operator intent is macro delivery (multi-ticket, deploy, full cycle) → `/sdlc:goal`
2. Operator has a ticket and wants full implementation pipeline → `/sdlc:implement`
3. Operator has raw intent, needs spec + ticket + worktree → `/sdlc:spec`
4. Operator wants plan only → `/sdlc:plan`
5. Operator wants feature entry (discover/create ticket) → `/sdlc:feature`
6. Operator wants Playwright QA evidence only → `/run:e2e`
7. Operator wants authenticated browser session → `/run:browser`
8. Operator wants desktop/sandbox computer-use → `/run:cua`

## Consequences

- `.cursor/commands/*.md` filenames align to namespace (`sdlc-spec.md`, `run-browser.md`).
- `.sdlc/sdlc.yaml` `runtime.commands` and `workflows.*.trigger` use canonical names only.
- `sdlc_command_dispatch.py` and `sdlc_continuity_resolve.py` normalize legacy aliases at runtime (read-only compat for typed prompts and archived handoffs).
- Distributable templates sync on next `/sdlc:baseline`.

## References

- ADR-020 — goal-flow replaces e2e orchestration
- ADR-022 — goal agentPolicy DSL
- `.cursor/commands/README.md` — routing registry
