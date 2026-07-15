import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const DESIGN_DAEMON_DEFAULT_HOST = "127.0.0.1";
const DESIGN_DAEMON_DEFAULT_PORT = 7456;
function resolveVendorRoot() {
  const candidates = [
    process.env.OPEN_DESIGN_VENDOR_ROOT,
    resolve(process.cwd(), "../business-workflow/vendor/open-design"),
    resolve(process.cwd(), "../worktrees/BUSIN-61-open-design-absorption/vendor/open-design"),
    resolve(process.cwd(), "vendor/open-design")
  ].filter((value) => typeof value === "string" && value.length > 0);
  for (const candidate of candidates) {
    const daemonPackage = join(candidate, "apps/daemon/package.json");
    if (existsSync(daemonPackage)) {
      return candidate;
    }
  }
  return null;
}
function resolveDesignDaemonConfig() {
  const host = process.env.DESIGN_DAEMON_HOST ?? DESIGN_DAEMON_DEFAULT_HOST;
  const port = Number(process.env.DESIGN_DAEMON_PORT ?? DESIGN_DAEMON_DEFAULT_PORT);
  const vendorRoot = resolveVendorRoot();
  return {
    host,
    port,
    baseUrl: `http://${host}:${port}`,
    vendorRoot,
    vendorPresent: vendorRoot !== null
  };
}
function designDaemonApiUrl(path, config = resolveDesignDaemonConfig()) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${config.baseUrl}${normalized}`;
}

export { designDaemonApiUrl as d, resolveDesignDaemonConfig as r };
