---
description: Operational context — sprint state, active features, deployments.
---

# Operational Context — harness-control-plane

## Status

**Last session:** 2026-07-08 | multi-format-artifact-preview | validated locally — branch `feat/multi-format-artifact-preview`, uncommitted → commit pending  
**Evidence:** consumer repo `.sdlc/evidence/multi-format-artifact-preview/manifest.md`  
**Samples:** `workspaces/default/.business/samples/preview/` (CSV, XLSX, DOCX, PPTX, OBJ)

## Active Features

| Feature | Status | Branch | Notes |
|---|---|---|---|
| Multi-format artifact preview | validated | `feat/multi-format-artifact-preview` | CSV/XLSX/DOCX/PPTX/3D + UI bridge; manual browser PASS |
| HCP-1 SDLC bootstrap | in_progress | `feat/HCP-1-sdlc-bootstrap` | Materialize `.sdlc/` — was missing (ADR-039 gap) |
| ADR-040 P1–P3 | done | main | CLI, embed, distribution merged |

## Artifact preview validation (2026-07-08)

| Format | Sample | Result |
|---|---|---|
| CSV | `quarterly-report.csv` | PASS — table renderer |
| XLSX | `inventory.xlsx` | PASS — multi-sheet tabs |
| DOCX | `proposal.docx` | PASS — mammoth HTML |
| PPTX | `quarterly-review.pptx` | PASS — slide navigation |
| OBJ | `sample-cube.obj` | PASS — Three.js WebGL canvas |
| UI bridge | `window.__hcpUi.openArtifact()` | PASS after Astro hydration |

## Local dev

```bash
cd ../business-workflow/app && npm run dev
# → http://127.0.0.1:4321
# Open preview: ?artifact-open=.business/samples/preview/quarterly-report.csv
```

## Security note (2026-07-08)

Avast flagged `node_modules/.vite/deps/@react-three_drei.js` as `JS:Prontexi-Z [Trj]`. Verified false positive (pmndrs/drei#2239). `@react-three/drei` and `@react-three/fiber` **removed** — 3D preview uses vanilla `three` only.

## Worktrees

| Worktree | Branch | Purpose |
|---|---|---|
| `HCP-1-sdlc-bootstrap` | `feat/HCP-1-sdlc-bootstrap` | SDLC harness install |

## Runtime chat continue contract

When operator loads a saved conversation and sends a message:

1. Gateway **must** `Agent.resume` + `agent.send(message)` — never silent reattach to stale `runs-index.json`
2. Hub fanout under harness workspace cwd
3. `CURSOR_API_KEY` in Astro process env (`harness-control-plane/.env`)

Symptom `ConnectError: [unauthenticated]` = auth missing in sidecar, not UI bug.
