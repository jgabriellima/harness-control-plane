# ADR-040: User deliverables root and local-only work items

**Status:** ACCEPTED  
**Date:** 2026-06-20  
**Extends:** ADR-025, ADR-032 (MS-5 storage), ADR-020 (harness-first manifests)  
**Supersedes:** authoring-repo default of `source_of_truth.work_items: plane`

---

## Problem statement

Two coupled failures block operator efficiency in the SDLC authoring repo:

### 1. Deliverables buried inside harness infrastructure

Workflow outputs, QA evidence, specs, and cognitive artifacts are scattered under `.sdlc/`:

| Artifact kind | Current path | Operator discovery cost |
|---|---|---|
| Run delivery bundle | `.sdlc/workflow-runs/output/{workflow}/{run_id}/` | Must know workflow id and opaque run id |
| QA evidence | `.sdlc/evidence/{ticket}/` | Separate tree; gitignored binaries |
| Specs | `.sdlc/specs/` | Harness-internal |
| Handoffs | `.sdlc/handoffs/LATEST.md` | Agent continuity, not user I/O |
| Cognitive JSON | nested under `workflow-runs/output/.../cognitive/` | Requires manifest literacy |

The harness package (`.sdlc/`) is **operational infrastructure** for agents — manifests, gates, traces, INDEX. Treating it as the user-facing results surface forces operators to open SDLC internals and search by ticket name or run id across disjoint directories. The `ArtifactGallery` demo component encodes this anti-pattern by displaying `.sdlc/...` paths as the canonical artifact locations.

Delivery bundle machinery (`RunOutput`, `_write_delivery_bundle`, `delivery-complete.pass`) already exists but writes to `.sdlc/workflow-runs/output/`, which remains inside the harness tree. Evidence is never consolidated into the bundle by default.

### 2. Plane integration overhead without operator value (authoring repo)

The authoring repo (`ai-native-sdlc`) dogfoods the SDLC product. It currently declares `source_of_truth.work_items: plane`, requiring:

- `PLANE_API_KEY` credential maintenance
- S3 presigned upload flows for QA evidence
- Browser sessions for board operations
- Network calls on every ticket sync and evidence post

ADR-025 introduced `local-work-items` as the zero-credential default for **consumers**, but the authoring repo never switched. Plane adds cost without improving local iteration velocity. Work items already exist at `.sdlc/work-items/tickets/` (PROJ-1, PROJ-2) from prior validation — the filesystem board is ready.

---

## Decision

### 1. Introduce `deliverables.root` outside harness storage

User-facing workflow results **MUST** resolve under a repository-root deliverables tree, separate from `.sdlc/` harness state.

```
output/                              # deliverables.root (repo root)
├── README.md                        # navigation index (directory mandate)
├── LATEST → {workflow}/{run_id}/    # symlink — same contract as handoffs/LATEST.md
├── {workflow_id}/
│   └── {run_id}/
│       ├── manifest.yaml            # RunOutput (sdlc.jambu/v1)
│       ├── consolidated.md          # human-readable report
│       ├── cognitive/               # per-node JSON
│       └── assets/                  # screenshots, exports, attachments
└── by-ticket/
    └── {ticket_id}/                 # index entry — symlink or manifest pointer
        ├── consolidated.md          # from parent run or ticket-scoped rollup
        └── assets/                  # published evidence (copied from staging)
```

Harness state remains under `.sdlc/`:

```
.sdlc/                               # storage.root — agents only
├── workflow-runs/{run_id}/          # WorkflowRunManifest (no user browsing)
├── evidence/{ticket}/               # staging during execution (gitignored)
├── work-items/                      # local ticket mirror (ADR-025)
├── handoffs/                        # session continuity
└── trace/                           # cognitive trace events
```

**Dual-root contract (MS-5 + MS-7):**

| Root | DSL key | Audience | Committed to git |
|---|---|---|---|
| `.sdlc/` | `storage.root` | Agents, gates, doctor | manifests yes; evidence binaries no |
| `output/` | `deliverables.root` | Operators, reviewers, next session | manifest.yaml, consolidated.md yes; binaries no |

### 2. Publish pipeline (normative)

On workflow completion and on QA gate pass, the runner **MUST** publish from harness staging to deliverables:

1. **Run close** — `_write_delivery_bundle` writes to `deliverables.root/{workflow}/{run_id}/` (not `.sdlc/workflow-runs/output/`).
2. **Evidence publish** — copy or symlink `.sdlc/evidence/{ticket}/` → `output/by-ticket/{ticket}/assets/`; append paths to ticket `evidence` list in local work item YAML.
3. **LATEST pointer** — update `output/LATEST` symlink to the most recently completed run directory.
4. **by-ticket index** — write `output/by-ticket/{ticket_id}/manifest.yaml` with backrefs to run id, worktree, branch, verdict.

`delivery-complete.pass` gate validates the **deliverables** path, not harness-internal paths.

### 3. Disable Plane for the authoring repo; activate local-work-items

For `jambu/ai-native-sdlc` (this repo):

```yaml
source_of_truth:
  work_items: local-work-items

integrations:
  local-work-items:
    status: active
    serves_slots: [work_items]
  plane:
    status: disabled
    serves_slots: []

qa:
  evidence_upload_to_plane: false
  evidence_upload_to_work_items: true
  evidence_publish_to_deliverables: true

autonomous_maintenance:
  # all plane_ticket_on_* → false
```

Plane integration files remain in the repo as **distributable templates** for consumers who select Plane at init. They are not active in this authoring checkout.

Ticket id prefix: `PROJ` (from `local-work-items.yaml connection.id_prefix`).

### 4. Rename mental model: `plane_ticket_required` → work-items ticket

`constraints.plane_ticket_required` retains its YAML key (backward compatibility) but means **work-items ticket required** regardless of provider. Doctor resolves the active provider and checks `work-items-ticket` + provider skill (`local-ticket` or `plane-ticket`).

Workflows invoke `work-items-ticket` skill only — never hardcode provider skills (ADR-025).

---

## Rationale

### Why not keep everything in `.sdlc/` with better INDEX?

INDEX is agent hydration, not user I/O. Operators should not need to parse bracket notation or know harness layout to find "what did the last goal run produce?". A top-level `output/` directory matches conventional build-artifact expectations (`dist/`, `coverage/`, `reports/`).

### Why not Plane as the results surface?

Plane is an external system of record for teams that opt in. For local dogfooding it adds credential, network, and upload latency without improving discoverability on disk. Evidence on Plane is not browseable from the repo; local deliverables are.

### Why `output/` at repo root, not under `workspace.target_root`?

Deliverables span harness operations (specs, tickets, worktrees, PRs) — not only application code. `app/` is the Starlight docs site; SDLC run results are repo-scoped. `deliverables.root` is sibling to `.sdlc/`, not nested in `app/`.

### Alternatives rejected

| Alternative | Rejection |
|---|---|
| Symlink-only (`output/` → `.sdlc/workflow-runs/output/`) | Does not fix discoverability; still one opaque path |
| Plane-only results | No local access; credential overhead |
| Commit all evidence to git | Binary bloat; ADR-030 profile-aware evidence stays gitignored |
| `workflows/output/` inside `.sdlc/` (business-workflow pattern) | Better naming but still harness-internal; does not solve user I/O |

---

## Consequences

### Positive

- Operators open `output/LATEST` or `output/by-ticket/PROJ-N/` without SDLC literacy
- Zero Plane credentials for authoring repo iteration
- Evidence staging (`.sdlc/evidence/`) decoupled from published deliverables (`output/`)
- Aligns with MS-5 dual-root: execution may occur in worktrees; deliverables anchor at repo root
- `RunOutput` and `delivery-complete` gate become user-meaningful

### Negative / trade-offs

- Two trees to understand (harness vs deliverables) — mitigated by README indices
- Publish step adds runner complexity; failure must fail `delivery-complete` gate
- Existing in-progress runs with old `output_dir` paths need one-time migration or re-run
- Plane consumers still use Plane; this ADR scopes **authoring repo default**, not product removal of Plane slot

### Neutral

- `plane.yaml` and `plane-ticket` skill remain in distributable templates
- Legacy manifest fields `plane_evidence_uploaded` / `plane_state_synced` remain as aliases (ADR-025)

---

## Implementation plan

### Phase 1 — Configuration (this change)

| File | Change |
|---|---|
| `.sdlc/sdlc.yaml` | `work_items: local-work-items`; Plane `disabled`; qa flags; `deliverables` block; maintenance flags off |
| `.sdlc/integrations/local-work-items/local-work-items.yaml` | Materialize from template |
| `.sdlc/integrations/plane/plane.yaml` | `status: disabled` |
| `output/README.md` | Directory index |
| `.sdlc/bin/sdlc_workflow_manifest.py` | Default `output_dir` → `output/{workflow_id}/{run_id}` |
| `.gitignore` | Ignore `output/**` binaries; allow manifest/consolidated |
| `.sdlc/doctor/runtime-alignment.ts` | local-work-items checks; provider-aware ticket skill |
| `.sdlc/INDEX.md`, `.cursor/memories/architecture.md` | Register ADR |

### Phase 2 — Publish pipeline (follow-up ticket)

| File | Change |
|---|---|
| `.sdlc/bin/sdlc_workflow_run.py` | `_publish_deliverables()` on run complete + QA |
| `.sdlc/bin/sdlc_workflow_gate.py` | `delivery-complete` validates `deliverables.root` |
| `.sdlc/bin/local_ticket_state.py` | Evidence path list on publish |
| `.sdlc/schemas/harness-storage.schema.json` | Add optional `deliverables_root` property |
| `packages/ai-native-sdlc/templates/**` | Sync distributable defaults |

### Phase 3 — UI and docs

| File | Change |
|---|---|
| `app/src/components/react/ArtifactGallery.tsx` | Point paths to `output/` |
| `docs/engineering/operational-layer.md` | Document dual-root |
| trace-ui | Resolve board via `work_items_board_surface()` |

---

## Verification criteria

```bash
# Provider is local, Plane inactive
python3 -c "
from pathlib import Path
import sys
sys.path.insert(0, '.sdlc/bin')
from sdlc_dsl_bindings import work_items_provider
print(work_items_provider(Path('.'))[0])
"
# Expected: local-work-items

# New run manifest uses deliverables root
python3 .sdlc/bin/sdlc_workflow_manifest.py init --workflow goal-flow --intent "adr-039 smoke" --dry-run 2>/dev/null || true
# Inspect paths.output_dir starts with output/

# Doctor passes structural mode without PLANE_API_KEY
python3 .sdlc/bin/sdlc_doctor.py --mode structural

# Directory index exists
test -f output/README.md
```

---

## Review

| Field | Value |
|---|---|
| Author | agent session |
| Date | 2026-06-20 |
| Ticket | PROJ-3 (local) |
| Plane | disabled for authoring repo per this ADR |
