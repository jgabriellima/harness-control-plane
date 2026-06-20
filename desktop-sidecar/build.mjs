#!/usr/bin/env node
/**
 * Build sidecar wrapper script with target-triple suffix for Tauri externalBin.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(root, '..');
const binariesDir = path.join(appRoot, 'src-tauri', 'binaries');

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
RESOURCE_ROOT="$(cd "$HERE/../../.." && pwd)"
export TAURI_RESOURCE_DIR="\${TAURI_RESOURCE_DIR:-$RESOURCE_ROOT}"
export HOST="\${HOST:-127.0.0.1}"
export PORT="\${TAURI_APP_PORT:-\${PORT:-4321}}"
exec node "$HERE/../../../desktop-sidecar/index.cjs"
`;

fs.writeFileSync(wrapperPath, script, { mode: 0o755 });
console.log(`[desktop-sidecar] wrote ${wrapperPath}`);
