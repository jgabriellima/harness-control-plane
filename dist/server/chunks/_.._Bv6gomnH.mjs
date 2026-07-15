import { c as createComponent } from './astro-component_Bqk75bGj.mjs';
import 'piccolore';
import { p as renderComponent, h as renderTemplate } from './server_CDSaKx-0.mjs';
import { $ as $$DesignLayout } from './DesignLayout_D6OCsam2.mjs';

const $$ = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "DesignLayout", $$DesignLayout, { "title": "Design Studio", "description": "Open Design absorption — prototypes, decks, media, and design systems." })}`;
}, "/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/pages/design/[...slug].astro", void 0);

const $$file = "/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/pages/design/[...slug].astro";
const $$url = "/design/[...slug]";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
