#!/usr/bin/env node
/**
 * Prepare Tauri desktop artifacts:
 * - externalBin wrapper for the current host triple (production sidecar)
 * - bundle resource path stubs so tauri-build succeeds before `astro build` (dev)
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(root, '..');
const binariesDir = path.join(appRoot, 'src-tauri', 'binaries');

function ensureDir(relativePath) {
  const dirPath = path.join(appRoot, relativePath);
  fs.mkdirSync(dirPath, { recursive: true });
  const keepPath = path.join(dirPath, '.keep');
  if (!fs.existsSync(keepPath)) {
    fs.writeFileSync(keepPath, '');
  }
  console.log(`[desktop-sidecar] ensured ${relativePath}/`);
}

for (const relativePath of [
  'dist/server',
  'dist/client',
  'desktop-shell',
  'src-tauri/resources/shell',
  'src-tauri/resources/harness-baseline',
]) {
  ensureDir(relativePath);
}

// Tauri production loads frontendDist before sidecar navigate — keep SSR dist/client clean.
const desktopShellDir = path.join(appRoot, 'desktop-shell');
const desktopShellIndex = path.join(desktopShellDir, 'index.html');
fs.mkdirSync(desktopShellDir, { recursive: true });
if (!fs.existsSync(desktopShellIndex)) {
  fs.writeFileSync(
    desktopShellIndex,
    `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Loading</title>
<style>body{margin:0;background:#0a0a0a;color:#e5e5e5;font:14px/1.5 system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh}</style>
</head>
<body><p>Starting application…</p></body>
</html>
`,
    'utf8',
  );
  console.log('[desktop-sidecar] wrote desktop-shell/index.html bootstrap');
} else {
  console.log('[desktop-sidecar] kept desktop-shell/index.html');
}

// Stale bootstrap in dist/client shadows Astro SSR for GET / in the sidecar.
const staleClientIndex = path.join(appRoot, 'dist', 'client', 'index.html');
if (fs.existsSync(staleClientIndex)) {
  fs.unlinkSync(staleClientIndex);
  console.log('[desktop-sidecar] removed stale dist/client/index.html');
}

const triple = execSync('rustc -vV', { encoding: 'utf8' })
  .split('\n')
  .find((line) => line.startsWith('host:'))
  ?.replace('host:', '')
  .trim();

if (!triple) {
  console.error('[desktop-sidecar] rustc host triple not found');
  process.exit(1);
}

fs.mkdirSync(binariesDir, { recursive: true });

const wrapperName = `business-server-${triple}`;
const wrapperPath = path.join(binariesDir, wrapperName);

const script = `#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"

# Production .app: binary lives in Contents/MacOS, resources in Contents/Resources
if [ -d "$HERE/../Resources" ]; then
  RESOURCE_ROOT="$(cd "$HERE/../Resources" && pwd)"
  SIDECAR="$RESOURCE_ROOT/_up_/desktop-sidecar/index.cjs"
else
  # Dev stub under src-tauri/binaries/
  RESOURCE_ROOT="$(cd "$HERE/../../.." && pwd)"
  SIDECAR="$(cd "$HERE/../../../desktop-sidecar" && pwd)/index.cjs"
fi

export TAURI_RESOURCE_DIR="\${TAURI_RESOURCE_DIR:-$RESOURCE_ROOT}"
export HOST="\${HOST:-127.0.0.1}"
export PORT="\${TAURI_APP_PORT:-\${PORT:-4321}}"

if [ ! -f "$SIDECAR" ]; then
  echo "[business-server] sidecar not found: $SIDECAR" >&2
  exit 1
fi

resolve_node() {
  if [ -n "\${NODE_BINARY:-}" ] && [ -x "\$NODE_BINARY" ]; then
    printf '%s\\n' "\$NODE_BINARY"
    return 0
  fi
  export PATH="/opt/homebrew/bin:/usr/local/bin:\${PATH:-/usr/bin:/bin:/usr/sbin:/sbin}"
  for candidate in /opt/homebrew/bin/node /usr/local/bin/node; do
    if [ -x "\$candidate" ]; then
      printf '%s\\n' "\$candidate"
      return 0
    fi
  done
  if command -v node >/dev/null 2>&1; then
    command -v node
    return 0
  fi
  echo "[business-server] node runtime not found — install Node.js 22+ or set NODE_BINARY" >&2
  return 127
}

NODE_BIN="$(resolve_node)" || exit \$?
exec "\$NODE_BIN" "$SIDECAR"
`;

if (fs.existsSync(wrapperPath)) {
  const existing = fs.readFileSync(wrapperPath, 'utf8');
  if (existing === script) {
    console.log(`[desktop-sidecar] unchanged ${wrapperPath}`);
  } else {
    fs.writeFileSync(wrapperPath, script, { mode: 0o755 });
    console.log(`[desktop-sidecar] wrote ${wrapperPath}`);
  }
} else {
  fs.writeFileSync(wrapperPath, script, { mode: 0o755 });
  console.log(`[desktop-sidecar] wrote ${wrapperPath}`);
}
