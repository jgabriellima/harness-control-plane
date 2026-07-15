import {
  ChevronDown,
  File,
  FileText,
  Filter,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Plus,
  Search,
} from 'lucide-react';
import React, { useDeferredValue, useEffect, useRef, useState } from 'react';

import { useChatArtifact } from '@/components/react/ChatArtifactProvider';
import { useActiveProject } from '@/hooks/useActiveProject';

import type { LibraryItem, LibraryItemSource, LibraryKindFilter } from '../../lib/library-types';
import { libraryPreviewUrl } from '../../lib/library-types';

interface LibraryResponse {
  items: LibraryItem[];
  error?: string;
}

type SortField = 'modified' | 'name' | 'size';
type SourceFilter = 'all' | LibraryItemSource;

const SOURCE_FILTER_OPTIONS: Array<{ value: SourceFilter; label: string }> = [
  { value: 'all', label: 'All sources' },
  { value: 'upload', label: 'Uploads' },
  { value: 'output', label: 'Outputs' },
  { value: 'workflow-output', label: 'Workflow outputs' },
  { value: 'playbook-artifact', label: 'Playbook artifacts' },
];

const LIBRARY_CONTENT_CLASS = 'mx-auto w-full max-w-4xl px-8 sm:px-12 lg:px-16';

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
    <div className={LIBRARY_CONTENT_CLASS}>
      <div className="divide-y divide-gray-100" data-testid="library-skeleton">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 py-4">
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-gray-100" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 w-2/5 animate-pulse rounded bg-gray-100" />
              <div className="h-2.5 w-3/5 animate-pulse rounded bg-gray-100" />
            </div>
            <div className="hidden h-3 w-16 animate-pulse rounded bg-gray-100 sm:block" />
            <div className="hidden h-3 w-12 animate-pulse rounded bg-gray-100 md:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

function LibraryRow({
  item,
  selected,
  onSelect,
}: {
  item: LibraryItem;
  selected: boolean;
  onSelect: (item: LibraryItem) => void;
}) {
  const previewUrl = item.kind === 'image' ? libraryPreviewUrl(item.projectId, item.path) : null;

  return (
    <button
      type="button"
      className={`group flex w-full items-start gap-4 rounded-lg py-3 text-left transition-colors ${
        selected ? 'bg-gray-100' : 'hover:bg-gray-50'
      }`}
      onClick={() => onSelect(item)}
      data-testid={`library-item-${item.id}`}
      aria-pressed={selected}
    >
      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
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
        <p
          className={`truncate text-sm font-medium ${
            selected ? 'text-gray-900' : 'text-gray-900 group-hover:text-gray-700'
          }`}
        >
          {item.name}
        </p>
        <p className="truncate text-xs text-gray-400" title={item.path}>
          {item.path}
        </p>
      </div>

      <div className="hidden w-24 shrink-0 pt-0.5 text-right text-sm text-gray-500 sm:block">
        {formatModifiedLabel(item.modifiedAt)}
      </div>

      <div className="hidden w-20 shrink-0 pt-0.5 text-right text-sm text-gray-500 md:block">
        {formatFileSize(item.size)}
      </div>
    </button>
  );
}

export default function LibraryView() {
  const activeProject = useActiveProject();
  const { openArtifact, selection } = useChatArtifact();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const newMenuRef = useRef<HTMLDivElement>(null);

  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<LibraryKindFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [sortField, setSortField] = useState<SortField>('modified');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [filterOpen, setFilterOpen] = useState(false);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent): void {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (filterMenuRef.current && !filterMenuRef.current.contains(target)) {
        setFilterOpen(false);
      }
      if (newMenuRef.current && !newMenuRef.current.contains(target)) {
        setNewMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

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

      if (activeProject?.id) {
        params.set('project_id', activeProject.id);
      }

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
  }, [activeProject?.id, deferredQuery, kind, reloadToken, sortField, sortDir]);

  const filteredItems =
    sourceFilter === 'all' ? items : items.filter((item) => item.source === sourceFilter);

  function handleSelectItem(item: LibraryItem): void {
    void openArtifact(item.path, item.projectId);
  }

  function isItemSelected(item: LibraryItem): boolean {
    if (!selection) {
      return false;
    }
    return selection.path === item.path;
  }

  function toggleSort(field: SortField): void {
    if (sortField === field) {
      setSortDir((current) => (current === 'desc' ? 'asc' : 'desc'));
      return;
    }
    setSortField(field);
    setSortDir(field === 'name' ? 'asc' : 'desc');
  }

  async function handleUploadSelected(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (activeProject?.id) {
        formData.append('project_id', activeProject.id);
      }

      const response = await fetch('/api/runtime/upload', {
        method: 'POST',
        body: formData,
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? 'Upload failed');
      }

      setReloadToken((current) => current + 1);
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : 'Upload failed';
      setError(message);
    } finally {
      setUploading(false);
      setNewMenuOpen(false);
    }
  }

  const sortIndicator = sortDir === 'desc' ? '↓' : '↑';
  const activeSourceLabel =
    SOURCE_FILTER_OPTIONS.find((option) => option.value === sourceFilter)?.label ?? 'All sources';

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white" data-testid="library-view">
      <header className="border-b border-gray-200 bg-white py-5">
        <div className={LIBRARY_CONTENT_CLASS}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Library</h1>

            <div className="flex w-full max-w-md items-center gap-2">
              <label className="relative flex-1">
                <span className="sr-only">Search library</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search"
                  className="w-full rounded-full border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-200"
                  data-testid="library-search"
                />
              </label>

              <div className="relative" ref={newMenuRef}>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-full bg-gray-900 px-3.5 py-2 text-sm font-medium text-white transition-opacity hover:bg-gray-800 disabled:opacity-60"
                  onClick={() => setNewMenuOpen((current) => !current)}
                  disabled={uploading}
                  data-testid="library-new"
                  aria-expanded={newMenuOpen}
                  aria-haspopup="menu"
                >
                  <Plus className="h-4 w-4" />
                  New
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                </button>

                {newMenuOpen ? (
                  <div
                    className="absolute right-0 z-20 mt-2 min-w-[10rem] rounded-lg border border-gray-200 bg-white py-1 shadow-xl"
                    role="menu"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-50"
                      onClick={() => fileInputRef.current?.click()}
                      data-testid="library-upload"
                    >
                      Upload file
                    </button>
                  </div>
                ) : null}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(event) => void handleUploadSelected(event)}
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 rounded-full bg-gray-100 p-1" role="tablist">
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
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
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
              <div className="relative" ref={filterMenuRef}>
                <button
                  type="button"
                  className={`rounded-lg p-2 transition-colors ${
                    sourceFilter !== 'all' || filterOpen
                      ? 'bg-gray-100 text-gray-900'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                  }`}
                  aria-label="Filter by source"
                  aria-expanded={filterOpen}
                  onClick={() => setFilterOpen((current) => !current)}
                  data-testid="library-filter"
                >
                  <Filter className="h-4 w-4" />
                </button>

                {filterOpen ? (
                  <div className="absolute right-0 z-20 mt-2 min-w-[11rem] rounded-lg border border-gray-200 bg-white py-1 shadow-xl">
                    {SOURCE_FILTER_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`flex w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                          sourceFilter === option.value ? 'text-gray-900' : 'text-gray-600'
                        }`}
                        onClick={() => {
                          setSourceFilter(option.value);
                          setFilterOpen(false);
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                className={`rounded-lg p-2 transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-gray-100 text-gray-900 ring-1 ring-gray-200'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                }`}
                aria-label="Grid view"
                aria-pressed={viewMode === 'grid'}
                onClick={() => setViewMode('grid')}
                data-testid="library-view-grid"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                className={`rounded-lg p-2 transition-colors ${
                  viewMode === 'list'
                    ? 'bg-gray-100 text-gray-900 ring-1 ring-gray-200'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                }`}
                aria-label="List view"
                aria-pressed={viewMode === 'list'}
                onClick={() => setViewMode('list')}
                data-testid="library-view-list"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>

          {sourceFilter !== 'all' ? (
            <p className="mt-3 text-xs text-gray-500">Filter: {activeSourceLabel}</p>
          ) : null}
        </div>
      </header>

      {error ? (
        <div className={`${LIBRARY_CONTENT_CLASS} py-4`} data-testid="library-error">
          <p className="text-sm font-medium text-red-600" role="alert">
            {error}
          </p>
        </div>
      ) : null}

      {!loading && filteredItems.length === 0 ? (
        <div
          className={`${LIBRARY_CONTENT_CLASS} flex flex-1 flex-col items-center justify-center py-16 text-center`}
          data-testid="library-empty"
        >
          <p className="text-sm font-medium text-gray-700">No files yet</p>
          <p className="mt-1 max-w-md text-sm text-gray-500">
            Uploads and outputs from this workspace appear here. Select a file to preview it, or
            use New to upload.
          </p>
        </div>
      ) : null}

      {loading ? (
        <LibrarySkeletonRows />
      ) : filteredItems.length > 0 ? (
        viewMode === 'list' ? (
          <div className="min-h-0 flex-1 overflow-y-auto py-2">
            <div className={LIBRARY_CONTENT_CLASS}>
              <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_6rem_5rem] gap-4 border-b border-gray-100 bg-white py-2 text-xs font-medium uppercase tracking-wide text-gray-400 sm:grid-cols-[minmax(0,1fr)_6rem_5rem]">
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

              <div data-testid="library-list">
                {filteredItems.map((item) => (
                  <LibraryRow
                    key={item.id}
                    item={item}
                    selected={isItemSelected(item)}
                    onSelect={handleSelectItem}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className={`${LIBRARY_CONTENT_CLASS} min-h-0 flex-1 overflow-y-auto py-4`}>
            <div
              className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-3"
              data-testid="library-grid"
            >
              {filteredItems.map((item) => {
                const previewUrl =
                  item.kind === 'image' ? libraryPreviewUrl(item.projectId, item.path) : null;
                const selected = isItemSelected(item);

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`group overflow-hidden rounded-xl border text-left transition-colors ${
                      selected
                        ? 'border-gray-300 bg-gray-50 ring-2 ring-gray-200'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                    }`}
                    onClick={() => handleSelectItem(item)}
                    data-testid={`library-item-${item.id}`}
                    aria-pressed={selected}
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
                    <div className="space-y-0.5 p-3">
                      <p className="truncate text-sm font-medium text-gray-900">{item.name}</p>
                      <p className="truncate text-xs text-gray-400" title={item.path}>
                        {item.path}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        {formatModifiedLabel(item.modifiedAt)}
                        <span className="mx-1.5">·</span>
                        {formatFileSize(item.size)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )
      ) : null}

      {!loading && filteredItems.length > 0 ? (
        <footer className={`${LIBRARY_CONTENT_CLASS} border-t border-gray-100 py-3 text-xs text-gray-400`}>
          {filteredItems.length} file{filteredItems.length === 1 ? '' : 's'}
          {kind !== 'all' ? ` · ${kind}` : ''}
          {sourceFilter !== 'all' ? ` · ${activeSourceLabel.toLowerCase()}` : ''}
          {deferredQuery.trim() ? ` · matching "${deferredQuery.trim()}"` : ''}
        </footer>
      ) : null}
    </div>
  );
}
