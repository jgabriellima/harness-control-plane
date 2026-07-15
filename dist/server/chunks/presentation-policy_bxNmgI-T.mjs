import { D as DEFAULT_PRESENTATION_CONFIG, i as isRichUiMode, p as presentationPromptVariant, a as presentationWireMode } from './presentation-types_CtohLCX-.mjs';

function metadataRichUiMode(request) {
  const metadata = request.metadata;
  if (!metadata) {
    return null;
  }
  const override = metadata.presentation_mode ?? metadata.presentation_override;
  if (isRichUiMode(override)) {
    return override;
  }
  if (metadata.response_mode === "text") {
    return "off";
  }
  if (metadata.response_mode === "openui") {
    return "always";
  }
  return null;
}
function messageRichUiOverride(message) {
  const trimmed = message.trimStart();
  if (trimmed.startsWith("/text ") || trimmed === "/text") {
    return "off";
  }
  if (trimmed.startsWith("/openui ") || trimmed === "/openui") {
    return "always";
  }
  return null;
}
function parsePresentationDefaultFromUiConfig(uiConfig) {
  const configured = uiConfig.composer?.presentation?.rich_ui;
  return isRichUiMode(configured) ? configured : DEFAULT_PRESENTATION_CONFIG.richUi;
}
function resolvePresentation(request, workspaceConfig, dslDefault = DEFAULT_PRESENTATION_CONFIG.richUi) {
  const richUi = metadataRichUiMode(request) ?? messageRichUiOverride(request.message) ?? workspaceConfig.richUi ?? dslDefault;
  return {
    richUi,
    wireMode: presentationWireMode(richUi),
    promptVariant: presentationPromptVariant(richUi)
  };
}
function stripPresentationPrefixes(message) {
  const trimmed = message.trimStart();
  if (trimmed.startsWith("/text ")) {
    return trimmed.slice("/text ".length).trim();
  }
  if (trimmed === "/text") {
    return "Continue in plain markdown.";
  }
  if (trimmed.startsWith("/openui ")) {
    return trimmed.slice("/openui ".length).trim();
  }
  if (trimmed === "/openui") {
    return "Summarize the latest workspace activity with metrics and a ranked list.";
  }
  return message.trim();
}

export { parsePresentationDefaultFromUiConfig as p, resolvePresentation as r, stripPresentationPrefixes as s };
