import { c as createComponent } from './astro-component_Bqk75bGj.mjs';
import 'piccolore';
import { p as renderComponent, h as renderTemplate } from './server_CDSaKx-0.mjs';
import { $ as $$AppLayout } from './AppLayout_CVeWsWA3.mjs';

const $$OrchestrationLayout = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$OrchestrationLayout;
  const { title, description, seedArtifactE2e = false } = Astro2.props;
  return renderTemplate`${renderComponent($$result, "AppLayout", $$AppLayout, { "title": title, "description": description, "seedArtifactE2e": seedArtifactE2e })}`;
}, "/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/layouts/OrchestrationLayout.astro", void 0);

export { $$OrchestrationLayout as $ };
