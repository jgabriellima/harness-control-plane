import {
  File,
  FileText,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Search,
} from 'lucide-react';
import React, { useDeferredValue, useEffect, useState } from 'react';

import type { LibraryItem, LibraryKindFilter } from '../../lib/library-types';
import { libraryDownloadUrl, libraryPreviewUrl } from '../../lib/library-types';

interface LibraryResponse {
  items: LibraryItem[];
  error?: string;
}

type SortField = 'modified' | 'name' | 'size';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(bytes < 10_240 ? 1 : 0)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatModifiedLabel(isoValue: string): string {
  const parsed = new Date(isoValue);
  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  if (parsed >= startOfToday) {
    return 'Today';
  }
  if (parsed >= startOfYesterday) {
    return 'Yesterday';
  }

  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function sourceLabel(source: LibraryItem['source']): string {
  switch (source) {
    case 'upload':
      return 'Upload';
    case 'output':
      return 'Output';
    case 'workflow-output':
      return 'Workflow';
    case 'playbook-artifact':
      return 'Playbook';
    default:
      return source;
  }
}

function FileKindIcon({ item }: { item: LibraryItem }) {
  if (item.kind === 'image') {
    return <ImageIcon className="h-4 w-4 text-gray-400" aria-hidden="true" />;
  }

  if (item.mime.includes('pdf') || item.name.endsWith('.md')) {
    return <FileText className="h-4 w-4 text-gray-400" aria-hidden="true" />;
  }

  return <File className="h-4 w-4 text-gray-400" aria-hidden="true" />;
}

function LibrarySkeletonRows() {
  return (
    <div className="divide-y divide-gray-100" data-testid="library-skeleton">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="flex items-center gap-4 px-6 py-4">
          <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-gray-100" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-2/5 animate-pulse rounded bg-gray-100" />
            <div className="h-2.5 w-1/4 animate-pulse rounded bg-gray-100" />
          </div>
          <div className="hidden h-3 w-16 animate-pulse rounded bg-gray-100 sm:block" />
          <div className="hidden h-3 w-12 animate-pulse rounded bg-gray-100 md:block" />
        </div>
      ))}
    </div>
  );
}

function LibraryRow({ item }: { item: LibraryItem }) {
  const previewUrl = item.kind === 'image' ? libraryPreviewUrl(item.projectId, item.path) : null;
  const openUrl = libraryDownloadUrl(item.projectId, item.path);

  return (
    <a
      href={openUrl}
      target="_blank"
      rel="noreferrer"
      className="group flex items-center gap-4 px-6 py-3 transition-colors hover:bg-gray-50"
      data-testid={`library-item-${item.id}`}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <FileKindIcon item={item} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900 group-hover:text-gray-700">
          {item.name}
        </p>
        <p className="truncate text-xs text-gray-500">
          {item.projectName}
          <span className="mx-1.5 text-gray-300">·</span>
          {sourceLabel(item.source)}
        </p>
      </div>

      <div className="hidden w-24 shrink-0 text-right text-sm text-gray-500 sm:block">
        {formatModifiedLabel(item.modifiedAt)}
      </div>

      <div className="hidden w-20 shrink-0 text-right text-sm text-gray-500 md:block">
        {formatFileSize(item.size)}
      </div>
    </a>
  );
}

export default function LibraryView() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<LibraryKindFilter>('all');
  const [sortField, setSortField] = useState<SortField>('modified');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadLibrary(): Promise<void> {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        kind,
        sort: sortField,
        sort_dir: sortDir,
      });

      const trimmedQuery = deferredQuery.trim();
      if (trimmedQuery.length > 0) {
        params.set('q', trimmedQuery);
      }

      try {
        const response = await fetch(`/api/library?${params.toString()}`, {
          signal: controller.signal,
        });
        const payload = (await response.json()) as LibraryResponse;

        if (!response.ok) {
          throw new Error(payload.error ?? 'Failed to load library');
        }

        if (!cancelled) {
          setItems(payload.items);
        }
      } catch (loadError) {
        if (cancelled || (loadError instanceof DOMException && loadError.name === 'AbortError')) {
          return;
        }
        const message = loadError instanceof Error ? loadError.message : 'Failed to load library';
        setError(message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadLibrary();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [deferredQuery, kind, sortField, sortDir]);

  function toggleSort(field: SortField): void {
    if (sortField === field) {
      setSortDir((current) => (current === 'desc' ? 'asc' : 'desc'));
      return;
    }
    setSortField(field);
    setSortDir(field === 'name' ? 'asc' : 'desc');
  }

  const sortIndicator = sortDir === 'desc' ? '↓' : '↑';

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="library-view">
      <header className="border-b border-gray-200 bg-white px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Library</h1>
            <p className="mt-1 text-sm text-gray-500">
              Generated and uploaded files across all workspace projects.
            </p>
          </div>

          <div className="flex w-full max-w-md items-center gap-2">
            <label className="relative flex-1">
              <span className="sr-only">Search library</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search files"
                className="w-full rounded-full border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-200"
                data-testid="library-search"
              />
            </label>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1" role="tablist">
            {([
              ['all', 'All'],
              ['images', 'Images'],
              ['files', 'Files'],
            ] as const).map(([tabKind, label]) => (
              <button
                key={tabKind}
                type="button"
                role="tab"
                aria-selected={kind === tabKind}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  kind === tabKind
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                onClick={() => setKind(tabKind)}
                data-testid={`library-tab-${tabKind}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              className={`rounded-lg p-2 transition-colors ${
                viewMode === 'grid'
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              }`}
              aria-label="Grid view"
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={`rounded-lg p-2 transition-colors ${
                viewMode === 'list'
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              }`}
              aria-label="List view"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {error ? (
        <div className="px-6 py-4" data-testid="library-error">
          <p className="text-sm font-medium text-red-600" role="alert">
            {error}
          </p>
        </div>
      ) : null}

      {!loading && items.length === 0 ? (
        <div
          className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center"
          data-testid="library-empty"
        >
          <p className="text-sm font-medium text-gray-700">No files yet</p>
          <p className="mt-1 max-w-md text-sm text-gray-500">
            Workflow outputs, playbook artifacts, and uploads from every project in your workspace
            will appear here.
          </p>
        </div>
      ) : null}

      {loading ? (
        <LibrarySkeletonRows />
      ) : items.length > 0 ? (
        viewMode === 'list' ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_6rem_5rem] gap-4 border-b border-gray-100 bg-white px-6 py-2 text-xs font-medium uppercase tracking-wide text-gray-400 sm:grid-cols-[minmax(0,1fr)_6rem_5rem]">
              <button
                type="button"
                className="flex items-center gap-1 text-left hover:text-gray-600"
                onClick={() => toggleSort('name')}
              >
                Name
                {sortField === 'name' ? <span aria-hidden="true">{sortIndicator}</span> : null}
              </button>
              <button
                type="button"
                className="hidden text-right hover:text-gray-600 sm:block"
                onClick={() => toggleSort('modified')}
              >
                Modified
                {sortField === 'modified' ? <span aria-hidden="true"> {sortIndicator}</span> : null}
              </button>
              <button
                type="button"
                className="hidden text-right hover:text-gray-600 md:block"
                onClick={() => toggleSort('size')}
              >
                Size
                {sortField === 'size' ? <span aria-hidden="true"> {sortIndicator}</span> : null}
              </button>
            </div>

            <div className="divide-y divide-gray-100" data-testid="library-list">
              {items.map((item) => (
                <LibraryRow key={item.id} item={item} />
              ))}
            </div>
          </div>
        ) : (
          <div
            className="grid min-h-0 flex-1 grid-cols-2 gap-4 overflow-y-auto p-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
            data-testid="library-grid"
          >
            {items.map((item) => {
              const previewUrl =
                item.kind === 'image' ? libraryPreviewUrl(item.projectId, item.path) : null;
              const openUrl = libraryDownloadUrl(item.projectId, item.path);

              return (
                <a
                  key={item.id}
                  href={openUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="group overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex aspect-square items-center justify-center bg-gray-50">
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <FileKindIcon item={item} />
                    )}
                  </div>
                  <div className="space-y-1 p-3">
                    <p className="truncate text-sm font-medium text-gray-900">{item.name}</p>
                    <p className="truncate text-xs text-gray-500">{item.projectName}</p>
                  </div>
                </a>
              );
            })}
          </div>
        )
      ) : null}

      {!loading && items.length > 0 ? (
        <footer className="border-t border-gray-100 bg-white px-6 py-3 text-xs text-gray-400">
          {items.length} file{items.length === 1 ? '' : 's'}
          {kind !== 'all' ? ` · ${kind}` : ''}
          {deferredQuery.trim() ? ` · matching "${deferredQuery.trim()}"` : ''}
        </footer>
      ) : null}
    </div>
  );
}
