import { c as createComponent } from './astro-component_Bqk75bGj.mjs';
import 'piccolore';
import { p as renderComponent, h as renderTemplate } from './server_CDSaKx-0.mjs';
import { $ as $$AppLayout } from './AppLayout_CVeWsWA3.mjs';

const $$DesignLayout = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$DesignLayout;
  const { title, description } = Astro2.props;
  return renderTemplate`${renderComponent($$result, "AppLayout", $$AppLayout, { "title": title, "description": description })}`;
}, "/Users/joaogabriellima/Documents/Work/jambu/harness-control-plane/src/layouts/DesignLayout.astro", void 0);

export { $$DesignLayout as $ };
