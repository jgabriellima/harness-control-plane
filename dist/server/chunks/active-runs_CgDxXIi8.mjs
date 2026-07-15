import { r as readRunSessionSnapshot } from './runtime-active-runs_D57KghA-.mjs';
import { a as jsonOk } from './api-json_NZ1Md3KT.mjs';

const GET = async () => {
  const snapshot = await readRunSessionSnapshot();
  return jsonOk(snapshot);
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
