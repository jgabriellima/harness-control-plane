export type ReaderFontSize = 'sm' | 'base' | 'lg' | 'xl';

export type ReaderLineHeight = 'tight' | 'normal' | 'relaxed' | 'loose';

export type ReaderSpacing = 'compact' | 'comfortable' | 'airy';

export interface ReaderPreferences {
  version: number;
  fontSize: ReaderFontSize;
  lineHeight: ReaderLineHeight;
  spacing: ReaderSpacing;
}

export const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  version: 1,
  fontSize: 'base',
  lineHeight: 'relaxed',
  spacing: 'comfortable',
};

const FONT_SIZE_MAP: Record<ReaderFontSize, string> = {
  sm: '0.8125rem',
  base: '0.9375rem',
  lg: '1.0625rem',
  xl: '1.1875rem',
};

const LINE_HEIGHT_MAP: Record<ReaderLineHeight, string> = {
  tight: '1.35',
  normal: '1.5',
  relaxed: '1.625',
  loose: '1.8',
};

const SPACING_MAP: Record<ReaderSpacing, string> = {
  compact: '0.375rem',
  comfortable: '0.625rem',
  airy: '0.875rem',
};

export function isReaderFontSize(value: unknown): value is ReaderFontSize {
  return value === 'sm' || value === 'base' || value === 'lg' || value === 'xl';
}

export function isReaderLineHeight(value: unknown): value is ReaderLineHeight {
  return value === 'tight' || value === 'normal' || value === 'relaxed' || value === 'loose';
}

export function isReaderSpacing(value: unknown): value is ReaderSpacing {
  return value === 'compact' || value === 'comfortable' || value === 'airy';
}

export function normalizeReaderPreferences(raw: unknown): ReaderPreferences {
  if (typeof raw !== 'object' || raw === null) {
    return DEFAULT_READER_PREFERENCES;
  }

  const record = raw as Record<string, unknown>;

  return {
    version: typeof record.version === 'number' ? record.version : 1,
    fontSize: isReaderFontSize(record.fontSize) ? record.fontSize : DEFAULT_READER_PREFERENCES.fontSize,
    lineHeight: isReaderLineHeight(record.lineHeight)
      ? record.lineHeight
      : DEFAULT_READER_PREFERENCES.lineHeight,
    spacing: isReaderSpacing(record.spacing) ? record.spacing : DEFAULT_READER_PREFERENCES.spacing,
  };
}

export function readerPreferencesToCssVars(
  preferences: ReaderPreferences,
): Record<string, string> {
  return {
    '--chat-font-size': FONT_SIZE_MAP[preferences.fontSize],
    '--chat-line-height': LINE_HEIGHT_MAP[preferences.lineHeight],
    '--chat-paragraph-spacing': SPACING_MAP[preferences.spacing],
    '--chat-list-spacing': SPACING_MAP[preferences.spacing],
  };
}

export function applyReaderPreferencesToDocument(preferences: ReaderPreferences): void {
  if (typeof document === 'undefined') {
    return;
  }

  const vars = readerPreferencesToCssVars(preferences);
  for (const [name, value] of Object.entries(vars)) {
    document.documentElement.style.setProperty(name, value);
  }
}
