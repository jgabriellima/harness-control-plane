import { a as jsonOk, j as jsonError } from './api-json_NZ1Md3KT.mjs';
import { r as resolveProjectRoot } from './project-root_D7dTqIZJ.mjs';
import { r as resolveRuntimeSurface } from './runtime-surface_DYjhsAWH.mjs';
import { a as resolvePresentationAssets } from './presentation-assets_bMGCp9w3.mjs';
import { r as resolveUIBranding } from './ui-branding_xMGaxulv.mjs';
import { l as loadUIConfig } from './ui-config_Wh0_gC44.mjs';
import { r as resolveVoiceInputConfig } from './voice-input-config_CWyqBP_K.mjs';
import { r as resolveContextUsagePanelEnabled } from './context-usage-config_CzC-3OnE.mjs';
import { p as parsePresentationDefaultFromUiConfig } from './presentation-policy_bxNmgI-T.mjs';
import { s as scheduleVoiceTranscriptionBootstrap, g as getVoiceTranscriptionStatus } from './voice-transcription_BDPyoG_X.mjs';

function resolveComposerToolActivityEnabled(uiConfig) {
  const featureFlag = uiConfig.features?.composer_tool_activity;
  if (featureFlag === false) {
    return false;
  }
  return true;
}

function resolveDesignStudioEnabled(uiConfig) {
  return uiConfig.features?.design_studio === true;
}

const GET = async () => {
  try {
    const projectRoot = resolveProjectRoot();
    const uiConfig = await loadUIConfig(projectRoot);
    const branding = resolveUIBranding(uiConfig);
    const desktopRuntime = process.env.CONTROL_PLANE_DESKTOP === "1";
    const surface = resolveRuntimeSurface({
      distributionSurface: uiConfig.distribution?.surface,
      desktopRuntime
    });
    const voiceInput = resolveVoiceInputConfig(uiConfig, { desktopRuntime });
    if (voiceInput.enabled && voiceInput.engine === "media") {
      scheduleVoiceTranscriptionBootstrap();
    }
    const voiceTranscription = voiceInput.enabled && voiceInput.engine === "media" ? await getVoiceTranscriptionStatus() : null;
    return jsonOk({
      voice_input: voiceInput,
      voice_transcription: voiceTranscription,
      locale: uiConfig.presentation?.locale ?? "en-US",
      surface,
      desktop_runtime: desktopRuntime,
      presentationTitle: branding.presentationTitle,
      windowTitle: branding.windowTitle,
      desktopIdentifier: branding.desktopIdentifier,
      brandAssets: resolvePresentationAssets(branding.assets) ?? null,
      features: {
        context_usage_panel: resolveContextUsagePanelEnabled(uiConfig),
        composer_tool_activity: resolveComposerToolActivityEnabled(uiConfig),
        design_studio: resolveDesignStudioEnabled(uiConfig)
      },
      presentation: {
        default_rich_ui: parsePresentationDefaultFromUiConfig(uiConfig)
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load composer config";
    return jsonError(message, 500);
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
