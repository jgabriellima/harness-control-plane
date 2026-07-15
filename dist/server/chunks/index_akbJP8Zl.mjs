import { c as createComponent } from './astro-component_Bqk75bGj.mjs';
import 'piccolore';
import { p as renderComponent, h as renderTemplate } from './server_CDSaKx-0.mjs';
import { $ as $$OrchestrationLayout } from './OrchestrationLayout_BKmXZiJF.mjs';

const $$Index = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$Index;
  const seedArtifactE2e = Astro2.url.searchParams.get("artifact-e2e") === "1";
  return renderTemplate`${renderComponent($$result, "OrchestrationLayout", $$OrchestrationLayout, { "title": "Runtime Console", "description": "Chat with the business runtime via Cursor SDK.", "seedArtifactE2e": seedArtifactE2e })}`;
}, "/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/pages/index.astro", void 0);

const $$file = "/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/pages/index.astro";
const $$url = "";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
