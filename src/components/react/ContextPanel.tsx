import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GripVertical, MoreVertical } from 'lucide-react';

import type {
  ContextHealthSnapshot,
  ContextWidgetItem,
  ContextWidgetsSnapshot,
} from '../../lib/context-widgets';
import { panelLayoutStore, usePanelLayout } from '../../lib/panel-layout-store';
import type { WidgetId, WidgetManifestEntry } from '../../lib/ui-panel-manifest';

interface WidgetConfig {
  id: WidgetId;
  title: string;
  emptyMessage: string;
  icon: 'bell' | 'calendar' | 'activity' | 'health';
  actionLabel?: string;
}

const WIDGET_CONFIG: Record<WidgetId, WidgetConfig> = {
  attention: {
    id: 'attention',
    title: 'Needs Attention',
    emptyMessage: "You're all caught up!",
    icon: 'bell',
  },
  jobs: {
    id: 'jobs',
    title: 'Upcoming Jobs',
    emptyMessage: 'No upcoming jobs',
    icon: 'calendar',
    actionLabel: 'Schedule a job',
  },
  activity: {
    id: 'activity',
    title: 'Activity Feed',
    emptyMessage: 'No activity yet',
    icon: 'activity',
  },
  health: {
    id: 'health',
    title: 'Knowledge Health',
    emptyMessage: 'No readiness data yet',
    icon: 'health',
  },
};

function WidgetIcon({ icon }: { icon: WidgetConfig['icon'] }) {
  const className = 'h-5 w-5 text-gray-300';

  switch (icon) {
    case 'bell':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      );
    case 'calendar':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      );
    case 'activity':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
        </svg>
      );
    case 'health':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      );
  }
}

function formatTimestamp(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function WidgetItemRow({ item }: { item: ContextWidgetItem }) {
  const timestamp = formatTimestamp(item.timestamp);
  const content = (
    <>
      <p className="truncate text-sm font-medium text-gray-900">{item.label}</p>
      <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
        {item.statusLabel ? (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-600">
            {item.statusLabel}
          </span>
        ) : null}
        {timestamp ? <span>{timestamp}</span> : null}
      </div>
    </>
  );

  if (item.href) {
    return (
      <li>
        <a href={item.href} className="block rounded-lg px-2 py-2 hover:bg-gray-50">
          {content}
        </a>
      </li>
    );
  }

  return (
    <li className="px-2 py-2">
      {content}
    </li>
  );
}

function HealthWidgetBody({ health }: { health: ContextHealthSnapshot }) {
  if (health.totalSlots === 0 && !health.overall) {
    return (
      <div className="flex flex-col items-center px-4 py-6 text-center">
        <WidgetIcon icon="health" />
        <p className="mt-3 text-sm text-gray-500">No readiness data yet</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-sm font-semibold text-gray-900 capitalize">
          {health.overall ?? 'unknown'}
        </p>
        <p className="text-xs text-gray-500">
          {health.readySlots}/{health.totalSlots} slots ready
        </p>
      </div>
      <ul className="space-y-2">
        {health.slots.slice(0, 4).map((slot) => (
          <li key={slot.slotId} className="flex items-center justify-between text-xs">
            <span className="truncate text-gray-600">{slot.provider}</span>
            <span
              className={`rounded px-1.5 py-0.5 font-medium ${
                slot.ready ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
              }`}
            >
              {slot.ready ? 'ready' : slot.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ContextWidget({
  widget,
  entry,
  items,
  health,
  onHide,
  onResize,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  widget: WidgetConfig;
  entry: WidgetManifestEntry;
  items: ContextWidgetItem[];
  health: ContextHealthSnapshot | null;
  onHide: () => void;
  onResize: (height: number) => void;
  onDragStart: () => void;
  onDragOver: (event: React.DragEvent) => void;
  onDrop: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const resizeRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const isHealth = widget.id === 'health';

  function handleResizePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    event.preventDefault();
    resizeRef.current = { startY: event.clientY, startHeight: entry.height };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleResizePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    if (!resizeRef.current) {
      return;
    }
    const delta = event.clientY - resizeRef.current.startY;
    onResize(Math.max(120, resizeRef.current.startHeight + delta));
  }

  function handleResizePointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    if (!resizeRef.current) {
      return;
    }
    resizeRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <section
      className="flex shrink-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white"
      style={{ height: entry.height }}
      data-testid={`context-widget-${widget.id}`}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <header className="flex shrink-0 items-center gap-1 border-b border-gray-100 bg-gray-50 px-2 py-1.5">
        <button
          type="button"
          className="cursor-grab rounded p-1 text-gray-400 hover:bg-gray-100"
          aria-label={`Reorder ${widget.title}`}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <h2 className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          {widget.title}
        </h2>
        <div className="relative">
          <button
            type="button"
            className="rounded p-1 text-gray-400 hover:bg-gray-100"
            aria-label={`${widget.title} options`}
            onClick={() => setMenuOpen((current) => !current)}
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
          {menuOpen ? (
            <div className="absolute right-0 top-full z-10 mt-1 w-36 rounded-md border border-gray-200 bg-white py-1 shadow-md">
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                onClick={() => {
                  onHide();
                  setMenuOpen(false);
                }}
              >
                Hide widget
              </button>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                onClick={() => {
                  onResize(180);
                  setMenuOpen(false);
                }}
              >
                Reset height
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isHealth && health ? (
          <HealthWidgetBody health={health} />
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-6 text-center">
            <WidgetIcon icon={widget.icon} />
            <p className="mt-3 text-sm text-gray-500">{widget.emptyMessage}</p>
            {widget.actionLabel ? (
              <button
                type="button"
                className="mt-3 text-sm font-medium text-violet-600 hover:text-violet-700"
              >
                {widget.actionLabel}
              </button>
            ) : null}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 py-1">
            {items.map((item) => (
              <WidgetItemRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </div>

      <div
        className="h-1.5 shrink-0 cursor-row-resize bg-gray-100 hover:bg-violet-200"
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
        role="separator"
        aria-orientation="horizontal"
        aria-label={`Resize ${widget.title}`}
      />
    </section>
  );
}

export default function ContextPanel() {
  const { manifest } = usePanelLayout();
  const [snapshot, setSnapshot] = useState<ContextWidgetsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<WidgetId | null>(null);
  const [localWidgets, setLocalWidgets] = useState<WidgetManifestEntry[]>([]);

  useEffect(() => {
    void panelLayoutStore.loadManifest().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (manifest?.widgets) {
      setLocalWidgets(manifest.widgets);
    }
  }, [manifest]);

  useEffect(() => {
    let cancelled = false;

    async function loadWidgets(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/context/widgets');
        const payload = (await response.json()) as ContextWidgetsSnapshot & { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? 'Failed to load context widgets');
        }

        if (!cancelled) {
          setSnapshot(payload);
        }
      } catch (loadError) {
        if (!cancelled) {
          const message = loadError instanceof Error ? loadError.message : 'Failed to load widgets';
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadWidgets();

    return () => {
      cancelled = true;
    };
  }, []);

  const visibleWidgets = useMemo(
    () =>
      [...localWidgets]
        .filter((entry) => entry.visible)
        .sort((left, right) => left.order - right.order),
    [localWidgets],
  );

  async function persistWidgets(nextWidgets: WidgetManifestEntry[]): Promise<void> {
    setLocalWidgets(nextWidgets);
    try {
      await panelLayoutStore.persistManifest({ widgets: nextWidgets });
    } catch (persistError) {
      const message =
        persistError instanceof Error ? persistError.message : 'Failed to save widget layout';
      setError(message);
    }
  }

  function updateWidget(widgetId: WidgetId, patch: Partial<WidgetManifestEntry>): void {
    const next = localWidgets.map((entry) =>
      entry.id === widgetId ? { ...entry, ...patch } : entry,
    );
    void persistWidgets(next);
  }

  function reorderWidgets(sourceId: WidgetId, targetId: WidgetId): void {
    if (sourceId === targetId) {
      return;
    }

    const ordered = [...visibleWidgets];
    const sourceIndex = ordered.findIndex((entry) => entry.id === sourceId);
    const targetIndex = ordered.findIndex((entry) => entry.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) {
      return;
    }

    const [moved] = ordered.splice(sourceIndex, 1);
    ordered.splice(targetIndex, 0, moved);

    const orderById = new Map(ordered.map((entry, index) => [entry.id, index]));
    const next = localWidgets.map((entry) => ({
      ...entry,
      order: orderById.get(entry.id) ?? entry.order,
    }));

    void persistWidgets(next);
  }

  return (
    <aside
      className="flex w-80 shrink-0 flex-col gap-2 overflow-y-auto border-l border-gray-200 bg-gray-50 p-3"
      data-testid="context-panel"
    >
      {error ? (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {loading && !snapshot ? (
        <p className="text-xs text-gray-500">Loading context…</p>
      ) : null}
      {visibleWidgets.map((entry) => {
        const widget = WIDGET_CONFIG[entry.id];
        return (
          <ContextWidget
            key={entry.id}
            widget={widget}
            entry={entry}
            items={
              snapshot && entry.id !== 'health'
                ? snapshot[entry.id]
                : []
            }
            health={snapshot?.health ?? null}
            onHide={() => updateWidget(entry.id, { visible: false })}
            onResize={(height) => updateWidget(entry.id, { height })}
            onDragStart={() => setDraggingId(entry.id)}
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDrop={() => {
              if (draggingId) {
                reorderWidgets(draggingId, entry.id);
              }
              setDraggingId(null);
            }}
          />
        );
      })}
    </aside>
  );
}
