import { a as jsonOk, j as jsonError } from './api-json_NZ1Md3KT.mjs';
import { c as collectContextWidgets } from './context-widgets_DO20VoYs.mjs';

const GET = async () => {
  try {
    const widgets = await collectContextWidgets();
    return jsonOk(widgets);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load context widgets";
    return jsonError(message, 500);
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
