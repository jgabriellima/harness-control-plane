import type { APIRoute } from 'astro';

import { jsonError, jsonOk } from '../../../lib/api-json';
import {
  listLibraryItems,
  type LibraryKindFilter,
} from '../../../lib/library-index';

function parseKindFilter(value: string | null): LibraryKindFilter {
  if (value === 'images' || value === 'files') {
    return value;
  }
  return 'all';
}

function parseSort(value: string | null): 'modified' | 'name' | 'size' {
  if (value === 'name' || value === 'size') {
    return value;
  }
  return 'modified';
}

function parseSortDir(value: string | null): 'asc' | 'desc' {
  return value === 'asc' ? 'asc' : 'desc';
}

export const GET: APIRoute = async ({ url }) => {
  try {
    const items = await listLibraryItems({
      query: url.searchParams.get('q') ?? '',
      kind: parseKindFilter(url.searchParams.get('kind')),
      projectId: url.searchParams.get('project_id')?.trim() || undefined,
      sort: parseSort(url.searchParams.get('sort')),
      sortDir: parseSortDir(url.searchParams.get('sort_dir')),
    });

    return jsonOk({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list library items';
    return jsonError(message, 500);
  }
};
