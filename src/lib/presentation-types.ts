export type RichUiMode = 'off' | 'adaptive' | 'always';

export type PresentationPromptVariant = 'none' | 'adaptive' | 'full';

export type PresentationWireMode = 'text' | 'rich';

export interface PresentationConfig {
  richUi: RichUiMode;
}

export const DEFAULT_PRESENTATION_CONFIG: PresentationConfig = {
  richUi: 'adaptive',
};

export interface ResolvedPresentation {
  richUi: RichUiMode;
  wireMode: PresentationWireMode;
  promptVariant: PresentationPromptVariant;
}

export function isRichUiMode(value: unknown): value is RichUiMode {
  return value === 'off' || value === 'adaptive' || value === 'always';
}

export function presentationWireMode(richUi: RichUiMode): PresentationWireMode {
  return richUi === 'off' ? 'text' : 'rich';
}

export function presentationPromptVariant(richUi: RichUiMode): PresentationPromptVariant {
  if (richUi === 'off') {
    return 'none';
  }
  if (richUi === 'always') {
    return 'full';
  }
  return 'adaptive';
}
