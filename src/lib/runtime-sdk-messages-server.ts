import { getPresentationTitle } from './ui-branding';
import { resolveProjectRoot } from './project-root';
import { loadUIConfig } from './ui-config';
import {
  cacheServerSdkMessageContext,
  resolveServerSdkMessageContext,
  type RuntimeSdkMessageContext,
} from './runtime-sdk-messages';

export async function loadServerSdkMessageContext(): Promise<RuntimeSdkMessageContext> {
  try {
    const projectRoot = resolveProjectRoot();
    const uiConfig = await loadUIConfig(projectRoot);
    const ctx = resolveServerSdkMessageContext({
      distributionSurface: uiConfig.distribution?.surface,
      presentationTitle: getPresentationTitle(uiConfig),
    });
    cacheServerSdkMessageContext(ctx);
    return ctx;
  } catch {
    const ctx = resolveServerSdkMessageContext();
    cacheServerSdkMessageContext(ctx);
    return ctx;
  }
}
