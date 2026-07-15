export type OpenUISurfaceStatus = 'streaming' | 'completed' | 'failed';

export interface TextPart {
  type: 'text';
  text: string;
}

export interface OpenUISurfacePart {
  type: 'openui';
  id: string;
  format: 'openui-lang';
  schemaVersion: string;
  source: string;
  status: OpenUISurfaceStatus;
  metadata?: Record<string, unknown>;
}

export type AssistantMessagePart = TextPart | OpenUISurfacePart;

export const OPENUI_SCHEMA_VERSION = '0.2.8';
export const OPENUI_LIBRARY_VERSION = '1.0.0';

export function createOpenUISurfacePart(
  id: string,
  source: string,
  status: OpenUISurfaceStatus = 'streaming',
): OpenUISurfacePart {
  return {
    type: 'openui',
    id,
    format: 'openui-lang',
    schemaVersion: OPENUI_SCHEMA_VERSION,
    source,
    status,
    metadata: {
      libraryVersion: OPENUI_LIBRARY_VERSION,
    },
  };
}

export function createTextPart(text: string): TextPart {
  return { type: 'text', text };
}

export function textFromParts(parts: AssistantMessagePart[]): string {
  return parts
    .filter((part): part is TextPart => part.type === 'text')
    .map((part) => part.text)
    .join('\n\n')
    .trim();
}

export function upsertParts(
  parts: AssistantMessagePart[] | undefined,
  next: AssistantMessagePart[],
): AssistantMessagePart[] {
  const merged = [...(parts ?? [])];

  for (const part of next) {
    if (part.type === 'text') {
      const index = merged.findIndex((item) => item.type === 'text');
      if (index === -1) {
        merged.push(part);
      } else {
        merged[index] = part;
      }
      continue;
    }

    const index = merged.findIndex(
      (item) => item.type === 'openui' && item.id === part.id,
    );
    if (index === -1) {
      merged.push(part);
    } else {
      merged[index] = part;
    }
  }

  return merged;
}
