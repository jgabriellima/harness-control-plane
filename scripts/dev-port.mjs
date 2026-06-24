import { execSync } from 'node:child_process';
import net from 'node:net';

const DEV_PROCESS_PATTERN =
  /node|astro|business-runtime|cargo|tauri|vite|harness-control-plane|control-plane/i;
const PROTECTED_PROCESS_PATTERN = /Cursor|Code Helper/i;

/**
 * @param {number} port
 * @returns {Promise<boolean>}
 */
export function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

/**
 * @param {number} port
 * @returns {number[]}
 */
export function listListeningPids(port) {
  try {
    const output = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN 2>/dev/null`, {
      encoding: 'utf8',
    }).trim();
    if (!output) {
      return [];
    }
    return output
      .split('\n')
      .map((value) => Number(value.trim()))
      .filter((pid) => Number.isFinite(pid) && pid > 0);
  } catch {
    return [];
  }
}

/**
 * @param {number} pid
 * @returns {string}
 */
function processCommand(pid) {
  try {
    return execSync(`ps -p ${pid} -o command=`, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

/**
 * Free a port by terminating prior dev-server processes only (never Cursor/IDE).
 *
 * @param {number} port
 * @returns {Promise<boolean>} true if anything was killed
 */
export async function freeDevPort(port) {
  let killed = false;

  for (const pid of listListeningPids(port)) {
    const command = processCommand(pid);
    if (!command) {
      continue;
    }
    if (PROTECTED_PROCESS_PATTERN.test(command)) {
      console.log(
        `[dev-port] :${port} held by protected process pid ${pid} — will not kill`,
      );
      continue;
    }
    if (!DEV_PROCESS_PATTERN.test(command)) {
      console.log(
        `[dev-port] :${port} held by pid ${pid} (${command.slice(0, 72)}) — skipping`,
      );
      continue;
    }
    console.log(`[dev-port] stopping pid ${pid} on :${port}`);
    try {
      process.kill(pid, 'SIGTERM');
      killed = true;
    } catch {
      // already exited
    }
  }

  if (killed) {
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  return killed;
}

/**
 * @param {number} [preferred=4321]
 * @param {number} [maxAttempts=24]
 * @returns {Promise<number>}
 */
export async function resolveDevPort(preferred = 4321, maxAttempts = 24) {
  const envRaw = process.env.CONTROL_PLANE_PORT?.trim() || process.env.PORT?.trim();
  const envPort = envRaw ? Number(envRaw) : NaN;
  const start = Number.isFinite(envPort) && envPort > 0 ? envPort : preferred;

  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const candidate = start + offset;
    await freeDevPort(candidate);
    if (await isPortFree(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `No free dev port in range ${start}-${start + maxAttempts - 1}. Set CONTROL_PLANE_PORT.`,
  );
}

/**
 * Prepare CONTROL_PLANE_PORT / PORT for Astro + Tauri desktop dev.
 *
 * @param {{ preferred?: number, logPrefix?: string }} [options]
 * @returns {Promise<number>}
 */
export async function prepareDevPort(options = {}) {
  const preferred = options.preferred ?? Number(process.env.CONTROL_PLANE_PORT ?? 4321);
  const logPrefix = options.logPrefix ?? '[dev-port]';

  const requested = Number(process.env.CONTROL_PLANE_PORT ?? preferred);
  const port = await resolveDevPort(requested);

  if (port !== requested) {
    console.log(`${logPrefix} port ${requested} unavailable — using ${port}`);
  } else {
    console.log(`${logPrefix} using port ${port}`);
  }

  process.env.CONTROL_PLANE_PORT = String(port);
  process.env.PORT = String(port);
  return port;
}
