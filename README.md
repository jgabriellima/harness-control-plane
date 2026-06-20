# @jambu/control-plane

Domain-neutral harness operating console (ADR-039). Astro SSR API + React islands + optional Tauri desktop shell.

Install once, bind any workspace via `.cursor/runtime-binding.yaml`, operate any specialized harness pack (`.business/`, `.sdlc/`, `.energy/`, …).

## Repository role

| Tier | Artifact | This repo |
|---|---|---|
| 1 | Control plane shell | **here** |
| 2 | Workspace container | `~/jambu/workspaces/` or `{host}/workspaces/` |
| 3 | Harness pack + binding | Consumer repos (e.g. `business-workflow/app/`) |

**Remote:** https://github.com/jgabriellima/harness-control-plane

## Quick start (ecosystem dogfood)

With sibling checkout layout:

```text
jambu/
├── harness-control-plane/   ← this repo
└── business-workflow/
    └── app/                 ← platform workspace (.business + runtime-binding stamp)
```

```bash
cd harness-control-plane
cp .env.example .env
npm ci
npm run dev
```

E2E (requires `business-workflow/app` stamp):

```bash
npm run test:unit
npm run build
npx playwright test e2e/platform-complete.spec.ts
```

## Environment

| Variable | Purpose |
|---|---|
| `CONTROL_PLANE_PLATFORM_ROOT` | Workspace with `.cursor/runtime-binding.yaml` (default: sibling `../business-workflow/app`) |
| `CONTROL_PLANE_HOST_REPO` | Host product repo for `{repo}/workspaces/` dev layout |
| `CONTROL_PLANE_WORKSPACES_ROOT` | Override workspace container path |

## Desktop (Tauri)

```bash
npm run tauri:dev
npm run tauri:build
```

Domain harness packs are **not** bundled in the installer (ADR-039 Phase 2). Bind a workspace after install.

See `DESKTOP.md`.

## Related

- ADR-039: `.sdlc/context/decisions/` in consumer product repos
- Business dogfood workspace: `jgabriellima/business-workflow` → `app/.business/`
