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
