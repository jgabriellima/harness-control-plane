import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const DESIGN_DAEMON_DEFAULT_HOST = '127.0.0.1';
export const DESIGN_DAEMON_DEFAULT_PORT = 7456;

export interface DesignDaemonConfig {
  host: string;
  port: number;
  baseUrl: string;
  vendorRoot: string | null;
  vendorPresent: boolean;
}

function resolveVendorRoot(): string | null {
  const candidates = [
    process.env.OPEN_DESIGN_VENDOR_ROOT,
    resolve(process.cwd(), '../business-workflow/vendor/open-design'),
    resolve(process.cwd(), '../worktrees/BUSIN-61-open-design-absorption/vendor/open-design'),
    resolve(process.cwd(), 'vendor/open-design'),
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);

  for (const candidate of candidates) {
    const daemonPackage = join(candidate, 'apps/daemon/package.json');
    if (existsSync(daemonPackage)) {
      return candidate;
    }
  }

  return null;
}

export function resolveDesignDaemonConfig(): DesignDaemonConfig {
  const host = process.env.DESIGN_DAEMON_HOST ?? DESIGN_DAEMON_DEFAULT_HOST;
  const port = Number(process.env.DESIGN_DAEMON_PORT ?? DESIGN_DAEMON_DEFAULT_PORT);
  const vendorRoot = resolveVendorRoot();

  return {
    host,
    port,
    baseUrl: `http://${host}:${port}`,
    vendorRoot,
    vendorPresent: vendorRoot !== null,
  };
}

export function designDaemonApiUrl(path: string, config = resolveDesignDaemonConfig()): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${config.baseUrl}${normalized}`;
}
