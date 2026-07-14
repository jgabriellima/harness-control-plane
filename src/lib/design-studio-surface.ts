import type { ProjectKind } from './design-contracts';

export type DesignStudioSurface = 'prototype' | 'deck' | 'image' | 'video' | 'hyperframes' | 'audio';

export type DesignProjectFileKind =
  | 'html'
  | 'image'
  | 'video'
  | 'audio'
  | 'sketch'
  | 'text'
  | 'code'
  | 'pdf'
  | 'document'
  | 'presentation'
  | 'spreadsheet'
  | 'binary';

/** Studio canvas for deck / HyperFrames HTML artifacts (16:9). */
export const DECK_STUDIO_WIDTH = 1920;
export const DECK_STUDIO_HEIGHT = 1080;

export interface DesignStudioFileRef {
  path: string;
  kind?: DesignProjectFileKind;
}

/**
 * Detect deck-shaped HTML using OD export heuristics — avoids treating generic
 * `.slide` carousels as presentation decks.
 */
export function sourceLooksLikeDeck(source: string | null | undefined): boolean {
  if (!source) {
    return false;
  }

  return (
    /<deck-stage[\s/>]|\bdata-screen-label\s*=|class\s*=\s*['"](?:[^'"]*\s)?(?:deck-slide|ppt-slide)(?:\s|['"])/i.test(
      source,
    ) ||
    /<[^>]*\bclass\s*=\s*['"](?:[^'"]*\s)?slide(?:\s|['"])[^>]*\bdata-title\s*=|<[^>]*\bdata-title\s*=[^>]*\bclass\s*=\s*['"](?:[^'"]*\s)?slide(?:\s|['"])/i.test(
      source,
    ) ||
    /<[^>]*\bclass\s*=\s*['"](?:[^'"]*\s)?deck(?:\s|['"])[^>]*>\s*<[^>]*\bclass\s*=\s*['"](?:[^'"]*\s)?slide(?:\s|['"])/i.test(
      source,
    )
  );
}

export function inferDesignStudioSurface(
  projectKind: ProjectKind | string | undefined,
  file: DesignStudioFileRef | null,
  htmlSource?: string | null,
): DesignStudioSurface {
  const fileKind = file?.kind;
  const path = file?.path ?? '';
  const normalizedKind = (projectKind ?? '').toLowerCase();

  if (fileKind === 'image' || normalizedKind === 'image') {
    return 'image';
  }
  if (fileKind === 'audio' || normalizedKind === 'audio') {
    return 'audio';
  }

  const pathSuggestsHyperframes = /hyperframes/i.test(path);
  const kindSuggestsHyperframes = normalizedKind.includes('hyperframes');

  if (fileKind === 'video' || normalizedKind === 'video') {
    if (fileKind === 'html' || /\.html?$/i.test(path) || pathSuggestsHyperframes || kindSuggestsHyperframes) {
      return 'hyperframes';
    }
    return 'video';
  }

  if (pathSuggestsHyperframes || kindSuggestsHyperframes) {
    return 'hyperframes';
  }

  if (normalizedKind === 'deck' || (htmlSource && sourceLooksLikeDeck(htmlSource))) {
    return 'deck';
  }

  if (fileKind === 'html' || /\.html?$/i.test(path)) {
    if (htmlSource && sourceLooksLikeDeck(htmlSource)) {
      return 'deck';
    }
    return 'prototype';
  }

  return 'prototype';
}

export function studioSurfaceUsesDeckBridge(surface: DesignStudioSurface): boolean {
  return surface === 'deck' || surface === 'hyperframes';
}

export function encodeDesignProjectPath(filePath: string): string {
  return filePath
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export function projectRawFileUrl(projectId: string, filePath: string): string {
  return `/api/design/projects/${encodeURIComponent(projectId)}/raw/${encodeDesignProjectPath(filePath)}`;
}
