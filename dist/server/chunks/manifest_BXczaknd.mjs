import { a as jsonOk } from './api-json_NZ1Md3KT.mjs';
import { b as buildUiControlManifest } from './runtime-ui-bridge_BuA7KtyC.mjs';

const GET = async ({ url }) => {
  const origin = url.origin;
  return jsonOk(buildUiControlManifest(origin));
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
