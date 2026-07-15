#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = resolve(fileURLToPath(new URL('.', import.meta.url)));
const hcpRoot = resolve(scriptDir, '..');
const PNPM = process.env.OD_PNPM ?? 'npx';
const PNPM_ARGS = process.env.OD_PNPM_ARGS?.split(' ').filter(Boolean) ?? ['pnpm@10.33.2'];

function resolveNodeBin() {
  const candidates = [
    process.env.OD_NODE_BIN,
    resolve(hcpRoot, '../business-workflow/app/.business/runtime/node/current/bin/node'),
    process.env.npm_node_execpath,
    process.execPath,
  ].filter((value) => typeof value === 'string' && value.length > 0);

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return process.execPath;
}

const NODE_BIN = resolveNodeBin();

function resolveVendorRoot() {
  const candidates = [
    process.env.OPEN_DESIGN_VENDOR_ROOT,
    resolve(hcpRoot, '../business-workflow/vendor/open-design'),
    resolve(hcpRoot, '../worktrees/BUSIN-61-open-design-absorption/vendor/open-design'),
    resolve(hcpRoot, 'vendor/open-design'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'apps/daemon/package.json'))) {
      return candidate;
    }
  }

  return null;
}

function runPnpm(args, cwd) {
  const child = spawn(PNPM, [...PNPM_ARGS, ...args], {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      npm_node_execpath: NODE_BIN,
      PATH: `${resolve(NODE_BIN, '..')}:${process.env.PATH ?? ''}`,
    },
  });
  return new Promise((resolvePromise, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise(undefined);
      } else {
        reject(new Error(`pnpm ${args.join(' ')} exited with code ${code ?? 1}`));
      }
    });
  });
}

const command = process.argv[2] ?? 'run';

if (command === 'install') {
  const vendorRoot = resolveVendorRoot();
  if (!vendorRoot) {
    console.error('Open Design vendor not found. Run scripts/sync-open-design-vendor.sh from business-workflow.');
    process.exit(1);
  }

  console.log(`Installing Open Design deps in ${vendorRoot} (node: ${NODE_BIN})...`);
  await runPnpm(['install'], vendorRoot);
} else if (command === 'run') {
  const vendorRoot = resolveVendorRoot();
  if (!vendorRoot) {
    console.error('Open Design vendor not found. Run scripts/sync-open-design-vendor.sh from business-workflow.');
    process.exit(1);
  }

  const host = process.env.DESIGN_DAEMON_HOST ?? '127.0.0.1';
  const port = process.env.DESIGN_DAEMON_PORT ?? '7456';

  console.log(`Starting Open Design daemon at http://${host}:${port} ...`);
  const daemonDir = join(vendorRoot, 'apps/daemon');
  const child = spawn(
    PNPM,
    [...PNPM_ARGS, 'run', 'daemon'],
    {
      cwd: daemonDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        OD_BIND_HOST: host,
        PORT: port,
        npm_node_execpath: NODE_BIN,
        PATH: `${resolve(NODE_BIN, '..')}:${process.env.PATH ?? ''}`,
      },
    },
  );
  child.on('exit', (code) => process.exit(code ?? 1));
} else {
  console.error(`Unknown command: ${command}. Use: install | run`);
  process.exit(1);
}
