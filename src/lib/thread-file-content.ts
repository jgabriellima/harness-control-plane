import { fileNameFromPath, inferMimeFromPath, normalizeArtifactPath } from './file-reference';
import { looksLikeHtmlDocument } from './html-document';
import type { ThreadFileMessage } from './thread-file-paths';

export interface ThreadFileContentMatch {
  content: string;
  mime: string;
}

interface ThreadFileMessageWithParts extends ThreadFileMessage {
  parts?: Array<{ type: string; text?: string }>;
}

interface FencedBlock {
  language: string;
  source: string;
}

const FENCE_PATTERN = /```(\w*)\r?\n([\s\S]*?)```/g;

const LANGUAGE_BY_EXTENSION: Record<string, string[]> = {
  html: ['html', 'htm', ''],
  htm: ['html', 'htm', ''],
  md: ['markdown', 'md', 'mdx', ''],
  mdx: ['markdown', 'md', 'mdx', ''],
  json: ['json', ''],
  yaml: ['yaml', 'yml', ''],
  yml: ['yaml', 'yml', ''],
  py: ['python', 'py', ''],
  ts: ['typescript', 'ts', ''],
  tsx: ['typescript', 'tsx', ''],
  js: ['javascript', 'js', ''],
  jsx: ['javascript', 'jsx', ''],
  sh: ['shell', 'bash', 'sh', ''],
  txt: ['text', 'txt', 'plain', ''],
  csv: ['csv', 'tsv', ''],
};

function extractFencedBlocks(content: string): FencedBlock[] {
  const blocks: FencedBlock[] = [];
  FENCE_PATTERN.lastIndex = 0;

  let match = FENCE_PATTERN.exec(content);
  while (match) {
    blocks.push({
      language: (match[1] ?? '').trim().toLowerCase(),
      source: match[2] ?? '',
    });
    match = FENCE_PATTERN.exec(content);
  }

  return blocks;
}

function resolveMessageBody(message: ThreadFileMessageWithParts): string {
  const textParts = message.parts
    ?.filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text ?? '')
    .join('\n\n');

  if (textParts && textParts.trim().length > 0) {
    return textParts;
  }

  return message.content;
}

function messageReferencesPath(content: string, normalizedPath: string, basename: string): boolean {
  const normalizedContent = content.replace(/\\/g, '/');

  if (normalizedContent.includes(`\`${normalizedPath}\``)) {
    return true;
  }

  if (basename !== normalizedPath && normalizedContent.includes(`\`${basename}\``)) {
    return true;
  }

  const savePattern = new RegExp(
    `save(?:\\s+this)?(?:\\s+as)?[^\\n]*${escapeRegExp(basename)}`,
    'i',
  );
  if (savePattern.test(normalizedContent)) {
    return true;
  }

  return false;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extensionFromPath(filePath: string): string {
  return filePath.split('.').pop()?.toLowerCase() ?? '';
}

function blockMatchesExtension(block: FencedBlock, extension: string): boolean {
  const allowedLanguages = LANGUAGE_BY_EXTENSION[extension];
  if (!allowedLanguages) {
    return block.language.length === 0 || block.language === extension;
  }

  if (allowedLanguages.includes(block.language)) {
    return true;
  }

  if ((extension === 'html' || extension === 'htm') && looksLikeHtmlDocument(block.source)) {
    return true;
  }

  return false;
}

function pickBestBlock(blocks: FencedBlock[], extension: string): FencedBlock | null {
  const matching = blocks.filter((block) => blockMatchesExtension(block, extension));
  if (matching.length === 0) {
    return null;
  }

  return matching.reduce((best, current) =>
    current.source.length > best.source.length ? current : best,
  );
}

/**
 * Resolve artifact body from assistant markdown when the agent cited a path
 * but did not persist the file under `.uploads/` or another workspace location.
 */
export function resolveThreadFileContent(
  messages: ThreadFileMessage[],
  requestedPath: string,
): ThreadFileContentMatch | null {
  const normalizedPath = normalizeArtifactPath(requestedPath);
  if (!normalizedPath) {
    return null;
  }

  const basename = fileNameFromPath(normalizedPath);
  const extension = extensionFromPath(normalizedPath);
  const mime = inferMimeFromPath(normalizedPath);

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index] as ThreadFileMessageWithParts;
    if (message.role !== 'assistant') {
      continue;
    }

    const body = resolveMessageBody(message);
    if (!messageReferencesPath(body, normalizedPath, basename)) {
      continue;
    }

    const blocks = extractFencedBlocks(body);
    const selected = pickBestBlock(blocks, extension);
    if (!selected || selected.source.trim().length === 0) {
      continue;
    }

    return {
      content: selected.source.trim(),
      mime,
    };
  }

  return null;
}
