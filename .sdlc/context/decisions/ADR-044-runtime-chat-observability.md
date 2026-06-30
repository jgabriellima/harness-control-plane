# ADR-044: Runtime Chat Observability Contract

**Status:** ACCEPTED  
**Date:** 2026-06-25  
**Repository:** harness-control-plane (`@jambu/control-plane`)  
**Cross-references:** ADR-041 (trace-ui vs control-plane boundary), business-workflow `app/.business/runtime-sessions/`

## Problem statement

Runtime Console chat dispatch (`POST /api/chat`) failed opaquely: Astro access logs showed `500` after ~81s with no phase, no correlation id, and no persisted trace beyond coarse `runs.jsonl` lifecycle events. Operators could not distinguish auth failures, stale agent resume, SDK timeouts, or fanout errors.

Sentry was integrated but disabled when `SENTRY_DSN` is unset. Server-side code emitted almost no structured logs.

## Decision

Introduce a **three-layer runtime chat observability contract**:

| Layer | Artifact | Audience |
|---|---|---|
| Structured stderr logs | JSON lines via `runtime-logger.ts` (`CONTROL_PLANE_LOG_LEVEL`) | Operator terminal / sidecar logs |
| Dispatch persistence | `app/.business/runtime-sessions/dispatch-log.jsonl` | Post-mortem, doctor, diagnostics API |
| UI surface | `RunDiagnosticsPanel` + `GET /api/runtime/runs/{runId}/diagnostics` | Runtime Console operator |

### Dispatch phases (normative)

`chat.request` → `chat.workspace.resolve` → `chat.commands.load` → `chat.sdk.dispatch` → `chat.fanout` → `chat.session.bind`

Each phase MUST log start/error at `info`/`error` and append to `dispatch-log.jsonl` on error paths.

### Error response contract

`jsonError` responses include:

- `error` — operator-facing message
- `request_id` — correlation id
- `phase` — failing phase
- `detail` — stack snippet when `CONTROL_PLANE_LOG_LEVEL=debug`

### Stale agent resume

When `Agent.resume(agent_id)` fails with not-found, gateway MUST fall back to `Agent.create` and log `chat.agent.resume_stale`. This prevents 500s from evicted local agent store entries.

### Post-dispatch work

Session bind and title derivation MUST NOT block the HTTP response after `agent.send` returns. They run fire-and-forget.

### Dispatch timeout

`CONTROL_PLANE_DISPATCH_TIMEOUT_MS` (default 120000) wraps SDK dispatch. Timeout returns HTTP 504 with explicit message.

## Verification

1. Reproduce failed dispatch → stderr JSON includes `phase` and `request_id`
2. `tail -f app/.business/runtime-sessions/dispatch-log.jsonl` shows event chain
3. UI failed state renders `RunDiagnosticsPanel` with dispatch trace
4. `hcp doctor --verbose` lists recent dispatch failures
5. Stale `agent_id` resume → 200 with new agent, log `chat.agent.resume_stale`

## Residual risks

- SDK internal hangs below gateway timeout still block until timeout elapses
- `dispatch-log.jsonl` is append-only with no rotation policy (future: ADR on retention)
- Sentry remains opt-in via `SENTRY_DSN`
