'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';

import { fileNameFromPath } from '@/lib/file-reference';

/** Above this count, the panel starts collapsed so the chat area stays usable. */
export const FILE_ACTIVITY_AUTO_COLLAPSE_THRESHOLD = 6;

export function FileActivityGroup({
  paths,
  onFileClick,
  defaultCollapsed = false,
}: {
  paths: string[];
  onFileClick?: (filePath: string) => void;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  if (paths.length === 0) {
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
          {paths.length}
        </span>
      </button>
      {!collapsed ? (
        <ul
          className="max-h-40 overflow-y-auto overscroll-contain"
          data-testid="thread-file-activity-scroll"
        >
          {paths.map((filePath) => (
            <li key={filePath} className="border-b border-gray-100 last:border-b-0">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50/80"
                data-testid="agent-file-activity-item"
                data-file-path={filePath}
                onClick={() => onFileClick?.(filePath)}
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[11px] font-medium text-gray-800">
                    {fileNameFromPath(filePath)}
                  </span>
                  <span className="block truncate font-mono text-[10px] text-gray-400">{filePath}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
