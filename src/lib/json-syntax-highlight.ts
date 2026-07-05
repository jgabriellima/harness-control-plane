import type { Highlighter } from 'shiki';

const JSON_HIGHLIGHT_THEME = 'github-light';
const MAX_JSON_HIGHLIGHT_CHARS = 120_000;

let highlighterPromise: Promise<Highlighter> | null = null;

export function isJsonInspectableText(text: string): boolean {
  const trimmed = text.trim();
  return (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  );
}

async function loadHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = import('shiki').then(({ createHighlighter }) =>
      createHighlighter({
        themes: [JSON_HIGHLIGHT_THEME],
        langs: ['json'],
      }),
    );
  }
  return highlighterPromise;
}

export async function highlightJsonText(text: string): Promise<string | null> {
  if (!isJsonInspectableText(text) || text.length > MAX_JSON_HIGHLIGHT_CHARS) {
    return null;
  }

  try {
    const highlighter = await loadHighlighter();
    return highlighter.codeToHtml(text, {
      lang: 'json',
      theme: JSON_HIGHLIGHT_THEME,
    });
  } catch {
    return null;
  }
}

/** Test-only reset for singleton highlighter cache. */
export function resetJsonSyntaxHighlightCacheForTests(): void {
  highlighterPromise = null;
}
