#!/usr/bin/env node
/**
 * Application Node runtime bootstrap.
 *
 * Ensures a Node binary with built-in `node:sqlite` is available without operator
 * intervention. Uses the system Node when capable; otherwise downloads an official
 * Node LTS tarball into `.business/runtime/node/` (or harness `.runtime/node/`).
 */
import { spawnSync } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import {
  access,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { constants } from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

/** Minimum Node release with stable built-in `node:sqlite`. */
export const PINNED_NODE_VERSION = process.env.CONTROL_PLANE_NODE_VERSION?.trim() || '22.14.0';

const harnessRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Walk cwd → parents for ui.config.yaml (app integrator root).
 * @returns {string | null}
 */
export function discoverProjectRootFromCwd(cwd = process.cwd()) {
  let dir = path.resolve(cwd);
  for (;;) {
    if (existsSync(path.join(dir, 'ui.config.yaml'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return null;
}

/**
 * @returns {string | null}
 */
export function resolveControlPlaneProjectRoot() {
  const explicit = process.env.CONTROL_PLANE_PROJECT_ROOT?.trim();
  if (explicit) {
    return path.resolve(explicit);
  }
  return discoverProjectRootFromCwd();
}

/**
 * @param {string} [harnessRootOverride]
 */
export function resolveNodeRuntimeRoot(harnessRootOverride = harnessRoot) {
  const projectRoot = resolveControlPlaneProjectRoot();
  if (projectRoot) {
    return path.join(projectRoot, '.business', 'runtime', 'node');
  }
  return path.join(harnessRootOverride, '.runtime', 'node');
}

/**
 * @returns {string}
 */
export function resolveNodeDistPlatform() {
  const { platform, arch } = process;
  if (platform === 'darwin') {
    return arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
  }
  if (platform === 'linux') {
    return arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
  }
  if (platform === 'win32') {
    return 'win-x64';
  }
  throw new Error(`Unsupported platform for automatic Node provisioning: ${platform}-${arch}`);
}

/**
 * @param {string} runtimeRoot
 */
export function resolveVendoredNodeBinary(runtimeRoot) {
  const platform = process.platform;
  const binName = platform === 'win32' ? 'node.exe' : 'node';
  return path.join(runtimeRoot, 'current', 'bin', binName);
}

/**
 * @param {string} nodeBinary
 */
export async function pathExists(nodeBinary) {
  try {
    await access(nodeBinary, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} nodeBinary
 */
export function probeNodeSqlite(nodeBinary) {
  const result = spawnSync(
    nodeBinary,
    ['-e', "import('node:sqlite').then(()=>process.exit(0)).catch(()=>process.exit(2))"],
    { encoding: 'utf8', timeout: 15_000 },
  );
  return result.status === 0;
}

/**
 * @param {string} nodeBinary
 */
export function readNodeVersion(nodeBinary) {
  const result = spawnSync(nodeBinary, ['-p', 'process.version'], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  if (result.status !== 0) {
    return null;
  }
  return result.stdout.trim() || null;
}

/**
 * @param {string} url
 * @param {string} destination
 */
async function downloadFile(url, destination) {
  await mkdir(path.dirname(destination), { recursive: true });
  await new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        downloadFile(response.headers.location, destination).then(resolve).catch(reject);
        response.resume();
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Download failed (${response.statusCode}): ${url}`));
        response.resume();
        return;
      }
      const file = createWriteStream(destination);
      pipeline(response, file).then(resolve).catch(reject);
    });
    request.on('error', reject);
  });
}

/**
 * @param {string} archivePath
 * @param {string} runtimeRoot
 * @param {string} archiveBaseName
 */
async function extractNodeArchive(archivePath, runtimeRoot, archiveBaseName) {
  await mkdir(runtimeRoot, { recursive: true });
  const extractDir = path.join(runtimeRoot, archiveBaseName);

  if (archivePath.endsWith('.zip')) {
    const unzip = spawnSync('unzip', ['-qo', archivePath, '-d', runtimeRoot], {
      stdio: 'inherit',
    });
    if (unzip.status !== 0) {
      throw new Error(`Failed to extract ${archivePath} (unzip exit ${unzip.status ?? 'unknown'})`);
    }
  } else {
    const tar = spawnSync('tar', ['-xJf', archivePath, '-C', runtimeRoot], {
      stdio: 'inherit',
    });
    if (tar.status !== 0) {
      throw new Error(`Failed to extract ${archivePath} (tar exit ${tar.status ?? 'unknown'})`);
    }
  }

  const currentLink = path.join(runtimeRoot, 'current');
  await rm(currentLink, { recursive: true, force: true });
  await symlink(extractDir, currentLink, 'dir');

  return extractDir;
}

/**
 * @param {{ logPrefix?: string, version?: string }} [options]
 */
export async function ensureNodeRuntime(options = {}) {
  if (process.env.NODE_RUNTIME_SKIP_PROVISION === '1') {
    return {
      nodeBinary: process.execPath,
      version: readNodeVersion(process.execPath),
      source: 'system',
      provisioned: false,
    };
  }

  const logPrefix = options.logPrefix ?? '[node-runtime]';
  const version = options.version ?? PINNED_NODE_VERSION;
  const runtimeRoot = resolveNodeRuntimeRoot();
  const distPlatform = resolveNodeDistPlatform();
  const manifestPath = path.join(runtimeRoot, 'manifest.json');

  const systemBinary = process.env.NODE_BINARY?.trim() || process.execPath;
  if (await pathExists(systemBinary) && probeNodeSqlite(systemBinary)) {
    return {
      nodeBinary: systemBinary,
      version: readNodeVersion(systemBinary),
      source: 'system',
      provisioned: false,
    };
  }

  const vendoredBinary = resolveVendoredNodeBinary(runtimeRoot);
  if (await pathExists(vendoredBinary) && probeNodeSqlite(vendoredBinary)) {
    console.log(`${logPrefix} using vendored Node (${readNodeVersion(vendoredBinary) ?? version})`);
    return {
      nodeBinary: vendoredBinary,
      version: readNodeVersion(vendoredBinary) ?? version,
      source: 'vendored',
      provisioned: false,
    };
  }

  const archiveBaseName = `node-v${version}-${distPlatform}`;
  const isWindows = distPlatform.startsWith('win-');
  const archiveFileName = isWindows ? `${archiveBaseName}.zip` : `${archiveBaseName}.tar.xz`;
  const downloadUrl = `https://nodejs.org/dist/v${version}/${archiveFileName}`;
  const cacheDir = path.join(runtimeRoot, '.cache');
  const archivePath = path.join(cacheDir, archiveFileName);

  console.log(`${logPrefix} system Node lacks node:sqlite — provisioning Node ${version} (${distPlatform})…`);
  console.log(`${logPrefix} download ${downloadUrl}`);

  await downloadFile(downloadUrl, archivePath);
  const extractDir = await extractNodeArchive(archivePath, runtimeRoot, archiveBaseName);

  const nodeBinary = resolveVendoredNodeBinary(runtimeRoot);
  if (!(await pathExists(nodeBinary)) || !probeNodeSqlite(nodeBinary)) {
    throw new Error(`${logPrefix} vendored Node failed node:sqlite probe: ${nodeBinary}`);
  }

  const manifest = {
    version,
    platform: distPlatform,
    nodeBinary,
    extractDir,
    installedAt: new Date().toISOString(),
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`${logPrefix} ready ${nodeBinary} (${readNodeVersion(nodeBinary) ?? version})`);

  return {
    nodeBinary,
    version: readNodeVersion(nodeBinary) ?? version,
    source: 'vendored',
    provisioned: true,
  };
}

/**
 * @param {{ nodeBinary: string, version?: string | null }} runtime
 * @param {NodeJS.ProcessEnv} [baseEnv]
 */
export function buildNodeRuntimeEnv(runtime, baseEnv = process.env) {
  const binDir = path.dirname(runtime.nodeBinary);
  const pathSegments = (baseEnv.PATH ?? '').split(path.delimiter).filter(Boolean);
  if (!pathSegments.includes(binDir)) {
    pathSegments.unshift(binDir);
  }
  return {
    ...baseEnv,
    NODE_BINARY: runtime.nodeBinary,
    PATH: pathSegments.join(path.delimiter),
    CONTROL_PLANE_NODE_VERSION: runtime.version ?? PINNED_NODE_VERSION,
  };
}

/**
 * @param {{ nodeBinary: string, version?: string | null }} runtime
 */
export function applyNodeRuntimeToProcessEnv(runtime) {
  const env = buildNodeRuntimeEnv(runtime);
  process.env.NODE_BINARY = env.NODE_BINARY;
  process.env.PATH = env.PATH;
  if (env.CONTROL_PLANE_NODE_VERSION) {
    process.env.CONTROL_PLANE_NODE_VERSION = env.CONTROL_PLANE_NODE_VERSION;
  }
}

/**
 * @param {{ nodeBinary: string }} runtime
 */
export function shellExportNodeRuntime(runtime) {
  const env = buildNodeRuntimeEnv(runtime);
  const quote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;
  return `export NODE_BINARY=${quote(env.NODE_BINARY)}; export PATH=${quote(env.PATH)};`;
}

/**
 * @param {string} runtimeRoot
 */
export async function readNodeRuntimeManifest(runtimeRoot) {
  try {
    const raw = await readFile(path.join(runtimeRoot, 'manifest.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
