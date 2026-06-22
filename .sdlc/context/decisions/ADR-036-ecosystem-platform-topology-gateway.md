# ADR-035: Ecosystem Platform Topology — Gateway Layer

Status: ACCEPTED  
Date: 2026-06-15  
Extends: ADR-032, ADR-033, ADR-034  
Ticket: (architecture — ecosystem framing session 2026-06-15)

## Context

ADR-033 normatively assigns repository ownership for the harness paradigm and subproduct siblings. ADR-034 assigns **public static web surfaces** (docs, marketing, personal). Neither ADR positions **`agent-runtime-gateway`** — a sibling repo at `jambu/agent-runtime-gateway/` (`jambuai/agent-runtime-gateway` on GitHub).

The gateway is not a marketing site, not a harness kernel, and not a domain pack. It is the **operational runtime platform**: entry point for channels, run lifecycle orchestration, reconnectable streaming, cancellation, auth, and (on feature branches) workspace/sandbox/session planes. Product runtimes such as `business-workflow` delegate agent execution through it.

Without explicit framing, agents conflate:

| Wrong inference | Reality |
|---|---|
| Gateway is part of `@jambu/harness` | Harness governs **development-time** procedure (workflows, gates, playbooks). Gateway governs **runtime** execution (runs, SSE, sandboxes). |
| Gateway belongs in ADR-034 site matrix | Gateway is an **API/service deploy surface**, not Cloudflare Pages static HTML. |
| Gateway is a fourth ADR-032 Product | No `target_root` app subject, no product install CLI — it is a **PyPI library** embedded by Products. |
| `jambu-ai-homepage` "Agent Kernel" hero implies gateway is live at `jambu.ai` | Marketing copy describes capability; gateway deploy URL is separate (deferred). |

The platform diagram (Gateway as central block: API & Ingress, Channels, Queueing, Scheduling, Execution Context, Security, Storage, Observability, Artifacts, Runtime Routing) defines the **runtime plane** of the Jambu ecosystem. This ADR makes that plane normative alongside ADR-033 repo topology and ADR-034 web topology.

## Decision

> **`jambu/agent-runtime-gateway` is the canonical Platform Service repository for agent run orchestration.** It sits between Channels and Agent Runtimes. ADR-032 Kernel / Pack / Product taxonomy applies to harness development bundles; the gateway is a **Platform Library** layer that Products consume at runtime — not a subproduct kind in ADR-032.

### 1. Ecosystem layers (normative)

```text
┌─────────────────────────────────────────────────────────────────┐
│  CHANNELS — web UI, REST clients, Slack, email, voice, APIs     │
│  Static web (ADR-034): ai-native-sdlc.org | jambu.ai | personal │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTP / SSE / webhooks
┌───────────────────────────────▼─────────────────────────────────┐
│  PLATFORM — agent-runtime-gateway (@ PyPI: agent-runtime-gateway)│
│  Run lifecycle · SSE replay · cancel · auth · queue · schedule  │
│  (future) workspace / sandbox / session metadata planes         │
└───────────────┬─────────────────────────────┬───────────────────┘
                │                             │
    ┌───────────▼──────────┐      ┌───────────▼──────────┐
    │  CAPABILITY HARNESS   │      │  AGENT RUNTIME        │
    │  @jambu/harness       │      │  Cursor SDK, LangGraph│
    │  + domain packs       │      │  custom AgentRunner   │
    │  (procedure, gates)   │      │  (execution engine)   │
    └───────────┬──────────┘      └───────────┬──────────┘
                │                             │
                └──────────────┬──────────────┘
                               ▼
                    ┌─────────────────────┐
                    │  CAPABILITIES /      │
                    │  PRODUCT OUTCOMES    │
                    │  business-workflow,  │
                    │  domain apps         │
                    └─────────────────────┘
```

**Invariant:** Harness **governs** how engineering work is done (SDLC, business lifecycle). Gateway **orchestrates** how agent **runs** are executed, streamed, and isolated at runtime. A Product may use both — e.g. `business-workflow` uses harness for repo lifecycle and gateway for in-app chat/runtime.

### 2. Repository assignment

| Repo | Layer | Role | Remote |
|---|---|---|---|
| `jambu/harness` | Paradigm / Kernel | PCR paradigm owner, `@jambu/harness` | `jambu-ai/harness` (expected) |
| `jambu/agent-runtime-gateway` | Platform | Run gateway library + optional FastAPI service | `jambuai/agent-runtime-gateway` |
| `jambu/ai-native-sdlc` | Product | SDLC product + engineering docs channel | `jambu-ai/ai-native-sdlc` |
| `jambu/business-workflow` | Product | Business control plane — **gateway consumer** | (M4 sibling) |
| `jambu/jambu-ai-homepage` | Channel (static) | Marketing → `jambu.ai` (ADR-034) | to create |
| `jambu/joao-personal-website` | Channel (static) | Personal — out of Jambu product scope (ADR-034) | `jgabriellima/joao-personal-website` |

**Checkout note:** `jambu/deep-agent-gateway/` is the same git remote with SDLC harness bound for gateway development (PROJ-1..6). It is a **dev workspace binding**, not a separate platform repo. Canonical library source: `agent-runtime-gateway`.

### 3. Classification vs ADR-032 / ADR-033

| ADR-032 kind | `agent-runtime-gateway` fits? |
|---|---|
| Kernel | No — no `.harness/`, no runner/gates/playbook engine |
| Pack | No — no `*.domain-pack.yaml` |
| Product | No — no product `target_root` subject or product install CLI |

**Normative label: Platform Library** — publishable Python package (`pip install agent-runtime-gateway`) with optional `[http]`, `[cursor-sdk]`, `[langgraph]`, `[sqlite]` extras. Products embed it; gateway does not embed harness paradigm source.

ADR-033 subproduct rule ("sibling repo under `jambu/`") **includes** `agent-runtime-gateway` as a sibling, but **not** as a harness subproduct — it is platform infrastructure parallel to the paradigm owner.

### 4. Gateway responsibilities (maps to platform diagram)

| Responsibility | Shipped today (main) | Feature branch / planned |
|---|---|---|
| Receive & validate | FastAPI routes, auth (`StaticApiKey`, JWT) | Webhook ingress |
| Route & orchestrate | `RunManager`, `AgentRunner` protocol | Runtime routing policies |
| Manage flow | Concurrency semaphore, timeouts, `DoubleTextStrategy` | Per-thread enqueue |
| Schedule work | — | `[scheduler]` / APScheduler |
| Provide context | Run metadata, `thread_id`, correlation via run store | Workspace/session metadata |
| Secure & govern | Bearer auth, cancel authority | Tenant isolation |
| Store & retrieve | `InMemoryRunStore`, `SqliteRunStore` | Postgres metadata (PROJ branches) |
| Observe & monitor | AG-UI event stream, run history API | Metrics export TBD |
| Manage artifacts | Event buffer (ring) | Artifact store TBD |
| Route to runtime | `contrib/langgraph`, `contrib/cursor_sdk` | OpenSandbox sandbox plane |

Execution-plane ADRs in the SDLC-bound checkout (`deep-agent-gateway/.sdlc/context/decisions/`) remain **gateway-repo local** until promoted here or to a gateway `context/decisions/` tree:

- ADR-026 (cursor-sdk execution plane)
- ADR-027 (workspace/sandbox separation)
- ADR-028 (OpenSandbox execution plane)

### 5. Relationship to ADR-034 (web topology)

| Surface | ADR owner | Gateway relationship |
|---|---|---|
| `ai-native-sdlc.org` | ADR-034 | Documents gateway in engineering corpus; **not** gateway host |
| `jambu.ai` | ADR-034 | Marketing may describe Agent Kernel / platform story; **not** gateway API host unless explicitly added later |
| `joaogabriellima.com` | ADR-034 | Independent |
| Gateway API (production) | **This ADR — deferred** | Subdomain TBD (e.g. `api.jambu.ai`, `gateway.jambu.ai`) or product-embedded — not Cloudflare Pages |

**Rule:** Do not add gateway to ADR-034 Pages project matrix. When gateway production URL is chosen, register deploy slot in this ADR (amendment) and optionally `agent-runtime-gateway` repo CI — not in `jambu-ai-homepage` or `ai-native-sdlc/app/`.

### 6. Consumer contract (Products → Platform)

Products that need durable agent streaming **depend on** `agent-runtime-gateway` as a library or sidecar service:

```yaml
# Illustrative — business-workflow runtime binding
runtime:
  gateway:
    package: agent-runtime-gateway
    extras: [http, cursor-sdk, sqlite]
    deploy: embedded | sidecar | managed   # product choice
```

**Forbidden:** Copying gateway run-manager logic into product repos. **Required:** Import from published package; dogfood via path dep during development.

Known consumers (2026-06-15): `business-workflow` worktrees (`runtime-gateway.ts`, `runtime-orchestrator.ts` — HTTP client to gateway API).

### 7. Updated repo topology (supersedes ADR-034 §6 snapshot)

```text
jambu/
├── harness/                 paradigm owner (ADR-033)
├── agent-runtime-gateway/   platform library — THIS ADR
├── ai-native-sdlc/          SDLC Product → ai-native-sdlc.org (ADR-034)
├── jambu-ai-homepage/             marketing → jambu.ai (ADR-034)
├── joao-personal-website/   personal (ADR-034)
├── business-workflow/       Product + gateway consumer (ADR-033 M4)
└── deep-agent-gateway/      same remote as agent-runtime-gateway; SDLC dev binding only
```

## Consequences

### Positive

- Agents stop merging harness, gateway, and static web into one mental model
- `business-workflow` integration has explicit upstream (platform) vs procedure (harness)
- Marketing (`jambu.ai`) can describe platform capabilities without implying deploy state
- Gateway feature work (sandbox, sessions) has a home in ecosystem docs

### Negative / deferred

- Gateway production deploy URL and DNS not decided
- Platform ADRs in `deep-agent-gateway/.sdlc/` not yet canonicalized in gateway repo root
- Engineering docs site should add gateway architecture page (content task — not blocking ADR)
- ADR-032 unchanged — Platform Library is documented here, not a fifth artifact kind amendment (avoid ADR-032 churn unless paradigm owners agree)

## Implementation Notes

### P1 — Documentation cross-links

1. Add gateway row to `architecture.md` ecosystem table
2. Optional: `app/src/content/docs/engineering/platform-topology.md` on docs site (W1/W2 phase)
3. `jambu-ai-homepage` doc links → `ai-native-sdlc.org` platform section when written

### P2 — Gateway repo hygiene

1. Treat `deep-agent-gateway` checkout as dev binding; merge feature branches to `agent-runtime-gateway` main
2. Move execution-plane ADRs from `.sdlc/context/decisions/` to `agent-runtime-gateway/docs/decisions/` or repo `context/decisions/` when stable
3. Remove legacy `deep_agent_gateway/` package name from main if still present

### P3 — Production deploy (operator decision)

1. Choose host: dedicated subdomain vs product-embedded vs K8s ingress (see OpenSandbox ADR-028 in dev checkout)
2. Amend this ADR with URL + CI owner when decided

## Verification

Framing-only (no deploy required):

```bash
test -d ../agent-runtime-gateway/src/agent_runtime_gateway
grep -q 'agent-runtime-gateway' .cursor/memories/architecture.md
grep -q 'ADR-035' .sdlc/INDEX.md
```

Consumer smoke (when business-workflow active):

```bash
curl -s http://localhost:8000/config   # gateway dev
```

## Review

| Field | Value |
|---|---|
| Author | Cursor agent (architecture session) |
| Date | 2026-06-15 |
| Extends | ADR-032 (clarifies non-fit), ADR-033 (sibling topology), ADR-034 (web vs platform) |
| Trigger | Operator request — include agent-runtime-gateway in ecosystem framing |
| Complements | deep-agent-gateway ADR-026..028 (execution plane detail) |
