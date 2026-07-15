import { c as createComponent } from './astro-component_Bqk75bGj.mjs';
import 'piccolore';
import { p as renderComponent, h as renderTemplate } from './server_CDSaKx-0.mjs';
import { $ as $$AppLayout } from './AppLayout_CVeWsWA3.mjs';

const prerender = false;
const $$id = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$id;
  const { id } = Astro2.params;
  const artifactId = id ?? "";
  const title = artifactId ? `Artifact — ${artifactId}` : "Artifact";
  return renderTemplate`${renderComponent($$result, "AppLayout", $$AppLayout, { "title": title })}`;
}, "/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/pages/artifact/[id].astro", void 0);

const $$file = "/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/pages/artifact/[id].astro";
const $$url = "/artifact/[id]";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
	__proto__: null,
	default: $$id,
	file: $$file,
	prerender,
	url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
