const DEFAULT_READER_PREFERENCES = {
  version: 1,
  fontSize: "base",
  lineHeight: "relaxed",
  spacing: "comfortable"
};
const FONT_SIZE_MAP = {
  sm: "0.8125rem",
  base: "0.9375rem",
  lg: "1.0625rem",
  xl: "1.1875rem"
};
const LINE_HEIGHT_MAP = {
  tight: "1.35",
  normal: "1.5",
  relaxed: "1.625",
  loose: "1.8"
};
const SPACING_MAP = {
  compact: "0.375rem",
  comfortable: "0.625rem",
  airy: "0.875rem"
};
function isReaderFontSize(value) {
  return value === "sm" || value === "base" || value === "lg" || value === "xl";
}
function isReaderLineHeight(value) {
  return value === "tight" || value === "normal" || value === "relaxed" || value === "loose";
}
function isReaderSpacing(value) {
  return value === "compact" || value === "comfortable" || value === "airy";
}
function normalizeReaderPreferences(raw) {
  if (typeof raw !== "object" || raw === null) {
    return DEFAULT_READER_PREFERENCES;
  }
  const record = raw;
  return {
    version: typeof record.version === "number" ? record.version : 1,
    fontSize: isReaderFontSize(record.fontSize) ? record.fontSize : DEFAULT_READER_PREFERENCES.fontSize,
    lineHeight: isReaderLineHeight(record.lineHeight) ? record.lineHeight : DEFAULT_READER_PREFERENCES.lineHeight,
    spacing: isReaderSpacing(record.spacing) ? record.spacing : DEFAULT_READER_PREFERENCES.spacing
  };
}
function readerPreferencesToCssVars(preferences) {
  return {
    "--chat-font-size": FONT_SIZE_MAP[preferences.fontSize],
    "--chat-line-height": LINE_HEIGHT_MAP[preferences.lineHeight],
    "--chat-paragraph-spacing": SPACING_MAP[preferences.spacing],
    "--chat-list-spacing": SPACING_MAP[preferences.spacing]
  };
}
function applyReaderPreferencesToDocument(preferences) {
  if (typeof document === "undefined") {
    return;
  }
  const vars = readerPreferencesToCssVars(preferences);
  for (const [name, value] of Object.entries(vars)) {
    document.documentElement.style.setProperty(name, value);
  }
}

export { DEFAULT_READER_PREFERENCES as D, isReaderLineHeight as a, isReaderSpacing as b, applyReaderPreferencesToDocument as c, isReaderFontSize as i, normalizeReaderPreferences as n };
