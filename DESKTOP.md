# Business Runtime — Desktop (Tauri)

Native desktop shell for the Astro SSR control plane. Production builds embed a Node sidecar that runs `dist/server/entry.mjs` on `127.0.0.1`.

## Prerequisites

- Rust stable (`rustup`)
- Linux: `libwebkit2gtk-4.1-dev`, `libsoup-3.0-dev`, `build-essential`
- Node.js >= 22.12
- Python 3 + Pillow (only to regenerate icons: `npm run desktop:icons`)

## Development

```bash
cd harness-control-plane   # or from app/: npm run desktop:prepare
npm run desktop:prepare    # free stale dev listeners, pick CONTROL_PLANE_PORT
npm run tauri:dev          # sidecar stub + Tauri (includes port prep)
```

From `business-workflow/app`:

```bash
npm run dev:desktop
```

`scripts/dev-port.mjs` frees prior **node/astro/tauri** listeners on the target port (never kills Cursor). If `:4321` is busy, the next free port is chosen and injected into Astro (`server.port` + `--port`) and Tauri (`devUrl`).

Manual preflight:

```bash
node scripts/prepare-desktop-dev.mjs
# CONTROL_PLANE_PORT=4322
# devUrl=http://localhost:4322/
```

`npm run tauri:dev` runs `desktop:sidecar` first to create the platform `externalBin` stub required by the Tauri build (sidecar is production-only; dev uses Astro directly).

If the app panics with `invalid icon` on launch, regenerate icons and rebuild Rust:

```bash
npm run desktop:icons
cd src-tauri && cargo clean && cargo build
```
Project workspaces are created under `{repo-root}/workspaces/` (gitignored). Each workspace receives `.cursor/` and `.business/` baseline packs on creation via `POST /api/projects`.

Production (Tauri sidecar) uses `~/business/workspaces/` unless `BUSINESS_WORKSPACES_ROOT` is set in `config.env`.
`npm run dev` works without `.env` (UI only); runtime dispatch needs `CURSOR_API_KEY` in local `app/.env`.

## Production build (local)

```bash
cd app
npm run tauri:build
```

Rust setup spawns the `business-server` sidecar, polls `GET /api/runtime/readiness`, then navigates the WebView.

## Secrets (production desktop)

Production builds store secrets in the **OS keychain** (service: `ai.jambu.business-runtime`), not in plaintext files.

| Platform | Backend |
|---|---|
| Linux | Secret Service (GNOME Keyring / KWallet) |
| macOS | Login Keychain |
| Windows | Credential Manager |

Configure via **Settings** in the app (Integrations → expand slot → credential fields), or Tauri IPC:

- `secrets_set(key, value)` — write only; no read-back via IPC
- `secrets_has(key)` — presence check
- `secrets_list()` — key names only

**One-time migration:** if `{app_data_dir}/config.env` exists from a prior install, it is imported into keychain on first prod launch and renamed to `config.env.migrated`.

**Dev mode** (`npm run tauri:dev`): unchanged — use `app/.env` for `CURSOR_API_KEY` and integration vars.

Platform paths follow Tauri `app_data_dir` for identifier `ai.jambu.business-runtime`.

## Secrets (legacy — deprecated)

`config.env` in app data dir is **deprecated**. Do not create new `config.env` files.

## Playbook

Procedure: `.sdlc/playbooks/domains/tauri/astro-ssr-desktop.pb.yaml`

Distribution CI: `.sdlc/playbooks/domains/tauri/distribute.pb.yaml`

## CI release (GitHub Actions)

Workflow: `.github/workflows/desktop-release.yml`

### Trigger

```bash
# Bump version in app/package.json, sync manifests, tag, push
cd app
npm run desktop:sync-version
git add package.json src-tauri/tauri.conf.json
git commit -m "chore(desktop): release v0.2.0"
git tag v0.2.0
git push origin HEAD --tags
```

Tag pattern `v*` starts the matrix build (macOS DMG x2, Linux AppImage, Windows NSIS).

Manual staging build: Actions → Desktop Release → Run workflow.

### Required GitHub secrets (macOS signing)

| Secret | Purpose |
|---|---|
| `APPLE_CERTIFICATE` | Base64-encoded `.p12` distribution certificate |
| `APPLE_CERTIFICATE_PASSWORD` | Export password for the `.p12` |
| `APPLE_SIGNING_IDENTITY` | Developer ID Application identity string |
| `APPLE_ID` | Apple ID email for notarization |
| `APPLE_PASSWORD` | App-specific password or notarization credential |
| `APPLE_TEAM_ID` | Apple Developer Team ID |

Linux and Windows jobs produce unsigned artifacts when signing secrets are absent. macOS falls back to ad-hoc signing if `APPLE_*` secrets are missing (Gatekeeper may block downloads).

### Post-install smoke

1. Install the artifact for your OS.
2. Launch Business Runtime.
3. Confirm window loads after readiness poll.
4. With `config.env` containing `CURSOR_API_KEY`, verify `GET /api/runtime/readiness` returns HTTP 200 (local curl against sidecar port from logs if needed).
