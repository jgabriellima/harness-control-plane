import { Copy, X } from 'lucide-react';
import React, { useState } from 'react';

import { Markdown } from '@/components/ui/markdown';
import { fileNameFromPath } from '@/lib/file-reference';
import type { ChatArtifactSelection } from '@/lib/chat-artifact-types';

export type ArtifactPanelView = 'preview' | 'code';

interface ChatArtifactPanelProps {
  selection: ChatArtifactSelection;
  onClose: () => void;
}

function panelTabClass(active: boolean): string {
  return active
    ? 'border-b-2 border-gray-900 text-gray-700'
    : 'border-b-2 border-transparent text-gray-500 hover:text-gray-700';
}

export default function ChatArtifactPanel({ selection, onClose }: ChatArtifactPanelProps) {
  const [view, setView] = useState<ArtifactPanelView>('preview');
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');

  const fileName = fileNameFromPath(selection.path);
  const isMarkdown = selection.mime === 'text/markdown';
  const isHtml = selection.mime === 'text/html';

  async function handleCopy(): Promise<void> {
    if (!selection.content) {
      return;
    }

    try {
      await navigator.clipboard.writeText(selection.content);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('idle');
    }
  }

  return (
    <aside
      className="flex min-h-0 min-w-0 flex-col border-l border-gray-200 bg-white"
      data-testid="chat-artifact-panel"
      aria-label={`Artifact preview: ${fileName}`}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-600">Artifact</p>
          <p className="truncate text-sm font-semibold text-gray-900" data-testid="chat-artifact-filename">
            {fileName}
          </p>
          <p className="truncate font-mono text-[10px] text-gray-400">{selection.path}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="rounded-md p-2 text-gray-500 hover:bg-gray-100"
            aria-label="Copy artifact content"
            data-testid="chat-artifact-copy"
            disabled={!selection.content}
            onClick={() => {
              void handleCopy();
            }}
          >
            <Copy className="h-4 w-4" />
          </button>
          {copyState === 'copied' ? (
            <span className="text-[10px] text-gray-600">Copied</span>
          ) : null}
          <button
            type="button"
            className="rounded-md p-2 text-gray-500 hover:bg-gray-100"
            aria-label="Close artifact panel"
            data-testid="chat-artifact-close"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="flex shrink-0 gap-4 border-b border-gray-200 bg-white px-4">
        <button
          type="button"
          className={`px-1 py-2 text-xs font-semibold ${panelTabClass(view === 'preview')}`}
          data-testid="chat-artifact-tab-preview"
          onClick={() => setView('preview')}
        >
          Preview
        </button>
        <button
          type="button"
          className={`px-1 py-2 text-xs font-semibold ${panelTabClass(view === 'code')}`}
          data-testid="chat-artifact-tab-code"
          onClick={() => setView('code')}
        >
          Code
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4" data-testid="chat-artifact-content">
        {selection.loading ? (
          <p className="text-sm text-gray-500">Loading artifact…</p>
        ) : null}

        {!selection.loading && selection.error ? (
          <p className="text-sm text-red-600" role="alert">
            {selection.error}
          </p>
        ) : null}

        {!selection.loading && !selection.error && selection.content ? (
          view === 'code' ? (
            <pre className="whitespace-pre-wrap break-words rounded-lg border border-gray-200 bg-gray-50 p-4 font-mono text-xs text-gray-800">
              {selection.content}
            </pre>
          ) : isMarkdown ? (
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <Markdown>{selection.content}</Markdown>
            </div>
          ) : isHtml ? (
            <iframe
              title={fileName}
              className="h-full min-h-[480px] w-full rounded-lg border border-gray-200 bg-white"
              sandbox=""
              srcDoc={selection.content}
            />
          ) : (
            <pre className="whitespace-pre-wrap break-words rounded-lg border border-gray-200 bg-gray-50 p-4 font-mono text-xs text-gray-800">
              {selection.content}
            </pre>
          )
        ) : null}

        {!selection.loading && !selection.error && !selection.content ? (
          <p className="text-sm text-gray-500">No content available.</p>
        ) : null}
      </div>
    </aside>
  );
}
