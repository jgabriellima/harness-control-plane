---
description: Control plane product architecture memory.
---

# Architecture Memory — @jambu/control-plane

## Identity

| Field | Value |
|---|---|
| Repo | `jgabriellima/harness-control-plane` |
| Package | `@jambu/control-plane` |
| ADR | ADR-039 (declared in consumer repos, e.g. business-workflow) |

## Stack

| Layer | Technology |
|---|---|
| SSR | Astro 6 + `@astrojs/node` |
| UI | React islands, Tailwind 4 |
| Desktop | Tauri 2 + Node sidecar |
| Binding | `src/lib/harness-binding.ts` — stamp-only MS-6 |
| Runtime SDK | `@cursor/sdk` |
| Code preview | `@monaco-editor/react`, `monaco-editor` |
| Markdown | `react-markdown`, `remark-gfm` |
| Spreadsheet preview | `xlsx` (SheetJS) |
| Document preview | `mammoth` (DOCX → HTML) |
| Presentation preview | `@aiden0z/pptx-renderer` |
| 3D mesh preview | `three` (vanilla WebGL — **not** `@react-three/drei`) |

## Chat artifact panel (multi-format preview)

| Mode | Extensions | Component | Load strategy |
|---|---|---|---|
| `spreadsheet` | csv, tsv, xlsx, xls | `ArtifactSpreadsheetPreview` | `React.lazy` |
| `document` | docx, doc | `ArtifactDocxPreview` | `React.lazy` |
| `presentation` | pptx, ppt | `ArtifactPptxPreview` | `React.lazy` |
| `model-3d` | gltf, glb, obj, stl, fbx | `ArtifactModel3DPreview` | `React.lazy` |
| `unsupported-binary` | blend, dwg, step, dxf | `ArtifactUnsupportedPreview` | eager |
| existing | md, html, pdf, images, code | Monaco / iframe / native | eager |

Routing: `src/lib/artifact-preview-modes.ts` → `inferArtifactPreviewMode()`.

Binary office/3D files fetch via `GET /api/workspace/file?raw=1` (ArrayBuffer client-side).

**Hydration invariant:** preview chunks MUST be lazy-loaded — eager imports of drei/three helpers block Astro island hydration.

## UI control bridge (agent preview)

| Surface | Contract |
|---|---|
| `window.__hcpUi` | `openArtifact(path, projectId?)`, `closeArtifact()` — installed in `ChatArtifactProvider` |
| URL | `?artifact-open={harness-relative-path}` |
| Event | `hcp:ui-command` CustomEvent |
| Manifest | `GET /api/runtime/ui/manifest` |

Implementation: `src/lib/runtime-ui-bridge.ts`.

## Forbidden dependencies

| Package | Reason |
|---|---|
| `@react-three/drei` | Avast/AVG/Norton false positive on Vite prebundle `node_modules/.vite/deps/@react-three_drei.js` (`JS:Prontexi-Z`). Use vanilla `three` for 3D preview. |
| `@react-three/fiber` | Only required by drei — removed with drei |

## Invariants

- No domain harness in repo (no `.business/` workflows in installer bundle)
- All paths via `resolveHarnessBinding()` from workspace `.cursor/runtime-binding.yaml`
- Dogfood: `CONTROL_PLANE_PLATFORM_ROOT=../business-workflow/app`

## Default env

| Variable | Purpose |
|---|---|
| `CONTROL_PLANE_PLATFORM_ROOT` | Bound workspace root |
| `CONTROL_PLANE_HOST_REPO` | Product repo for `{repo}/workspaces/` |
| `CONTROL_PLANE_WORKSPACES_ROOT` | Workspace container override |
