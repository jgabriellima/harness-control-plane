#!/usr/bin/env node
/**
 * Pre-flight for desktop dev: free stale listeners, pick one port, export env for child shells.
 *
 * Usage:
 *   eval "$(node scripts/prepare-desktop-dev.mjs --export)"
 *   npm run dev:desktop
 *
 * Or run standalone to print the chosen port:
 *   node scripts/prepare-desktop-dev.mjs
 */
import { prepareDevPort } from './dev-port.mjs';

const exportMode = process.argv.includes('--export');
const port = await prepareDevPort({ logPrefix: '[prepare-desktop-dev]' });

if (exportMode) {
  process.stdout.write(
    `export CONTROL_PLANE_PORT=${port}; export PORT=${port};`,
  );
} else {
  console.log(`CONTROL_PLANE_PORT=${port}`);
  console.log(`PORT=${port}`);
  console.log(`devUrl=http://localhost:${port}/`);
}
