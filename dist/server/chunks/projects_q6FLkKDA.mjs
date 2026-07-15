import { c as createComponent } from './astro-component_Bqk75bGj.mjs';
import 'piccolore';
import { p as renderComponent, h as renderTemplate } from './server_CDSaKx-0.mjs';
import { $ as $$AppLayout } from './AppLayout_CVeWsWA3.mjs';

const prerender = false;
const $$Projects = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "AppLayout", $$AppLayout, { "title": "Projects", "description": "Jambu project scopes." })}`;
}, "/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/pages/projects.astro", void 0);

const $$file = "/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/pages/projects.astro";
const $$url = "/projects";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Projects,
  file: $$file,
  prerender,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
