import type { ChatRequest } from './harness-types';
import type { UIConfig } from './ui-config';
import {
  DEFAULT_PRESENTATION_CONFIG,
  type PresentationConfig,
  type ResolvedPresentation,
  type RichUiMode,
  isRichUiMode,
  presentationPromptVariant,
  presentationWireMode,
} from './presentation-types';

function metadataRichUiMode(request: ChatRequest): RichUiMode | null {
  const metadata = request.metadata;
  if (!metadata) {
    return null;
  }

  const override = metadata.presentation_mode ?? metadata.presentation_override;
  if (isRichUiMode(override)) {
    return override;
  }

  if (metadata.response_mode === 'text') {
    return 'off';
  }

  if (metadata.response_mode === 'openui') {
    return 'always';
  }

  return null;
}

function messageRichUiOverride(message: string): RichUiMode | null {
  const trimmed = message.trimStart();
  if (trimmed.startsWith('/text ') || trimmed === '/text') {
    return 'off';
  }
  if (trimmed.startsWith('/openui ') || trimmed === '/openui') {
    return 'always';
  }
  return null;
}

export function parsePresentationDefaultFromUiConfig(uiConfig: UIConfig): RichUiMode {
  const configured = uiConfig.composer?.presentation?.rich_ui;
  return isRichUiMode(configured) ? configured : DEFAULT_PRESENTATION_CONFIG.richUi;
}

export function resolvePresentation(
  request: ChatRequest,
  workspaceConfig: PresentationConfig,
  dslDefault: RichUiMode = DEFAULT_PRESENTATION_CONFIG.richUi,
): ResolvedPresentation {
  const richUi =
    metadataRichUiMode(request) ??
    messageRichUiOverride(request.message) ??
    workspaceConfig.richUi ??
    dslDefault;

  return {
    richUi,
    wireMode: presentationWireMode(richUi),
    promptVariant: presentationPromptVariant(richUi),
  };
}

export function stripPresentationPrefixes(message: string): string {
  const trimmed = message.trimStart();

  if (trimmed.startsWith('/text ')) {
    return trimmed.slice('/text '.length).trim();
  }
  if (trimmed === '/text') {
    return 'Continue in plain markdown.';
  }

  if (trimmed.startsWith('/openui ')) {
    return trimmed.slice('/openui '.length).trim();
  }
  if (trimmed === '/openui') {
    return 'Summarize the latest workspace activity with metrics and a ranked list.';
  }

  return message.trim();
}
