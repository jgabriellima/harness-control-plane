const MAX_JSON_UNWRAP_DEPTH = 4;

function looksLikeJsonDocument(value: string): boolean {
  const trimmed = value.trim();
  return (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  );
}

export function tryParseJson(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

export function normalizeInspectablePayload(value: unknown, depth = 0): unknown {
  if (depth >= MAX_JSON_UNWRAP_DEPTH) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (looksLikeJsonDocument(trimmed)) {
      const parsed = tryParseJson(trimmed);
      if (parsed === value || parsed === undefined) {
        return value;
      }
      return normalizeInspectablePayload(parsed, depth + 1);
    }

    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      const parsed = tryParseJson(trimmed);
      if (typeof parsed === 'string') {
        return normalizeInspectablePayload(parsed, depth + 1);
      }
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeInspectablePayload(entry, depth));
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        normalizeInspectablePayload(entry, depth),
      ]),
    );
  }

  return value;
}

export function formatInspectable(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }

  const normalized = normalizeInspectablePayload(value);

  if (typeof normalized === 'string') {
    return normalized;
  }

  try {
    return JSON.stringify(normalized, null, 2);
  } catch {
    return String(normalized);
  }
}
