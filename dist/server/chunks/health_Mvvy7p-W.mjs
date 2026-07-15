import { a as jsonOk } from './api-json_NZ1Md3KT.mjs';
import { r as resolveDesignDaemonConfig, d as designDaemonApiUrl } from './design-daemon-config_D0YSN28V.mjs';

async function fetchDesignDaemonHealth() {
  const config = resolveDesignDaemonConfig();
  const base = {
    ok: false,
    port: config.port,
    vendorPresent: config.vendorPresent
  };
  if (!config.vendorPresent) {
    return {
      ...base,
      error: "Open Design vendor not found. Run scripts/sync-open-design-vendor.sh"
    };
  }
  try {
    const response = await fetch(designDaemonApiUrl("/api/health", config), {
      signal: AbortSignal.timeout(4e3)
    });
    if (!response.ok) {
      return {
        ...base,
        error: `Daemon health returned ${response.status}`
      };
    }
    const payload = await response.json();
    return {
      ok: payload.status === "ok" || response.ok,
      port: config.port,
      vendorPresent: true,
      version: typeof payload.version === "string" ? payload.version : void 0
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Daemon unreachable";
    return {
      ...base,
      error: message
    };
  }
}

const GET = async () => {
  const health = await fetchDesignDaemonHealth();
  return jsonOk(health, health.ok ? 200 : 503);
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
