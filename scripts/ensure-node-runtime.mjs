#!/usr/bin/env node
/**
 * CLI: ensure application Node runtime (node:sqlite capable).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  applyNodeRuntimeToProcessEnv,
  ensureNodeRuntime,
  shellExportNodeRuntime,
} from './node-runtime.mjs';

const harnessRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

if (!process.env.CONTROL_PLANE_PROJECT_ROOT?.trim()) {
  process.env.CONTROL_PLANE_PROJECT_ROOT = path.resolve(harnessRoot, '..', 'business-workflow', 'app');
}

const exportMode = process.argv.includes('--export');
const runtime = await ensureNodeRuntime({ logPrefix: '[ensure-node-runtime]' });

if (exportMode) {
  process.stdout.write(shellExportNodeRuntime(runtime));
} else {
  applyNodeRuntimeToProcessEnv(runtime);
  console.log(`NODE_BINARY=${runtime.nodeBinary}`);
  console.log(`node_version=${runtime.version ?? 'unknown'}`);
  console.log(`node_source=${runtime.source}`);
}

process.exit(0);
