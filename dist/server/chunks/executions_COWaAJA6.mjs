import { c as createComponent } from './astro-component_Bqk75bGj.mjs';
import 'piccolore';
import { p as renderComponent, h as renderTemplate, m as maybeRenderHead } from './server_CDSaKx-0.mjs';
import { E as ExecutionsListView } from './AppLayout_CVeWsWA3.mjs';
import { $ as $$OrchestrationLayout } from './OrchestrationLayout_BKmXZiJF.mjs';

const prerender = false;
const $$Executions = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "OrchestrationLayout", $$OrchestrationLayout, { "title": "Workflow Runs", "description": "Jambu execution history." }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="flex min-h-0 flex-1 flex-col overflow-hidden"> ${renderComponent($$result2, "ExecutionsListView", ExecutionsListView, { "client:load": true, "client:component-hydration": "load", "client:component-path": "/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/components/react/ExecutionsListView", "client:component-export": "default" })} </div> ` })}`;
}, "/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/pages/executions.astro", void 0);

const $$file = "/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/pages/executions.astro";
const $$url = "/executions";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Executions,
  file: $$file,
  prerender,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
