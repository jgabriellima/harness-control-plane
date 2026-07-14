'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';

import { fileNameFromPath } from '@/lib/file-reference';
import type { ThreadFileActivityItem } from '@/lib/thread-file-paths';
import type { FileArtifactAction } from '@/lib/tool-file-paths';

/** Above this count, the panel starts collapsed so the chat area stays usable. */
export const FILE_ACTIVITY_AUTO_COLLAPSE_THRESHOLD = 6;

function actionChipClasses(action: FileArtifactAction): string {
  switch (action) {
    case 'create':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    case 'edit':
      return 'bg-sky-50 text-sky-700 ring-sky-200';
    case 'upload':
      return 'bg-violet-50 text-violet-700 ring-violet-200';
    case 'delete':
      return 'bg-rose-50 text-rose-700 ring-rose-200';
    default:
      return 'bg-gray-100 text-gray-600 ring-gray-200';
  }
}

function FileActionChip({ action }: { action: FileArtifactAction }) {
  return (
    <span
      className={`ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset ${actionChipClasses(action)}`}
      data-testid="agent-file-activity-action"
      data-file-action={action}
    >
      {action}
    </span>
  );
}

export function FileActivityGroup({
  items,
  onFileClick,
  defaultCollapsed = false,
}: {
  items: ThreadFileActivityItem[];
  onFileClick?: (filePath: string) => void;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  if (items.length === 0) {
    return null;
  }

  return (
    <div
      className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
      data-testid="thread-file-activity-group"
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 border-b border-gray-100 bg-gray-50/80 px-3 py-2 text-left text-xs font-medium text-gray-600 hover:bg-gray-100/80"
        onClick={() => setCollapsed((current) => !current)}
        aria-expanded={!collapsed}
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        )}
        <span>Files</span>
        <span className="ml-auto rounded-full bg-gray-200/80 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
          {items.length}
        </span>
      </button>
      {!collapsed ? (
        <ul
          className="max-h-40 overflow-y-auto overscroll-contain"
          data-testid="thread-file-activity-scroll"
        >
          {items.map((item) => (
            <li key={item.path} className="border-b border-gray-100 last:border-b-0">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50/80"
                data-testid="agent-file-activity-item"
                data-file-path={item.path}
                onClick={() => onFileClick?.(item.path)}
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[11px] font-medium text-gray-800">
                    {fileNameFromPath(item.path)}
                  </span>
                  <span className="block truncate font-mono text-[10px] text-gray-400">{item.path}</span>
                </span>
                {item.action ? <FileActionChip action={item.action} /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
