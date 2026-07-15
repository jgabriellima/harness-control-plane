import { a as jsonOk } from './api-json_NZ1Md3KT.mjs';
import { d as readBrowserCdpManifest } from './runtime-browser-bridge_DsG8qbJ7.mjs';

const GET = async () => {
  const manifest = await readBrowserCdpManifest();
  if (!manifest) {
    return jsonOk({ active: null, mcpHint: null });
  }
  return jsonOk(manifest);
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
