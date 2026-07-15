import { c as createComponent } from './astro-component_Bqk75bGj.mjs';
import 'piccolore';
import { p as renderComponent, h as renderTemplate } from './server_CDSaKx-0.mjs';
import { $ as $$AppLayout } from './AppLayout_CVeWsWA3.mjs';

const prerender = false;
const $$Settings = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "AppLayout", $$AppLayout, { "title": "Settings" })}`;
}, "/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/pages/settings.astro", void 0);

const $$file = "/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/pages/settings.astro";
const $$url = "/settings";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
	__proto__: null,
	default: $$Settings,
	file: $$file,
	prerender,
	url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
