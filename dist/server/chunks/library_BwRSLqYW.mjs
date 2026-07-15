import { c as createComponent } from './astro-component_Bqk75bGj.mjs';
import 'piccolore';
import { p as renderComponent, h as renderTemplate } from './server_CDSaKx-0.mjs';
import { $ as $$OrchestrationLayout } from './OrchestrationLayout_BKmXZiJF.mjs';

const prerender = false;
const $$Library = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "OrchestrationLayout", $$OrchestrationLayout, { "title": "Library", "description": "Generated and uploaded files across workspace projects." })}`;
}, "/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/pages/library.astro", void 0);

const $$file = "/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/pages/library.astro";
const $$url = "/library";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Library,
  file: $$file,
  prerender,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
