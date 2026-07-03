import { Copy, Download, ExternalLink, X } from 'lucide-react';
import React, { useState } from 'react';

import { Markdown } from '@/components/ui/markdown';
import { fileNameFromPath, isInlinePreviewMime } from '@/lib/file-reference';
import type { ChatArtifactSelection } from '@/lib/chat-artifact-types';

interface ChatArtifactPanelProps {
  selection: ChatArtifactSelection;
  onClose: () => void;
}

export default function ChatArtifactPanel({ selection, onClose }: ChatArtifactPanelProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');

  const fileName = fileNameFromPath(selection.path);
  const isMarkdown = selection.mime === 'text/markdown';
  const isHtml = selection.mime === 'text/html';
  const isPdf = selection.mime === 'application/pdf';
  const isImage = selection.mime.startsWith('image/');
  const isBinary = selection.encoding === 'binary';
  const canInlinePreview = Boolean(selection.previewUrl) && isInlinePreviewMime(selection.mime);
  const isImmersivePreview = canInlinePreview;

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

  const hasPreviewContent =
    canInlinePreview || (isMarkdown && selection.content) || (isHtml && selection.content) || (!isBinary && selection.content);

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
          {selection.previewUrl ? (
            <a
              href={selection.previewUrl}
              download={fileName}
              className="rounded-md p-2 text-gray-500 hover:bg-gray-100"
              aria-label="Download artifact"
              data-testid="chat-artifact-download"
            >
              <Download className="h-4 w-4" />
            </a>
          ) : null}
          {selection.previewUrl ? (
            <a
              href={selection.previewUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-md p-2 text-gray-500 hover:bg-gray-100"
              aria-label="Open artifact in new tab"
              data-testid="chat-artifact-open-external"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : null}
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

      <div
        className={
          isImmersivePreview
            ? 'min-h-0 flex-1 overflow-hidden bg-gray-100'
            : 'min-h-0 flex-1 overflow-y-auto p-4'
        }
        data-testid="chat-artifact-content"
      >
        {selection.loading ? (
          <p className={`text-sm text-gray-500 ${isImmersivePreview ? 'p-4' : ''}`}>Loading artifact…</p>
        ) : null}

        {!selection.loading && selection.error ? (
          <p className={`text-sm text-red-600 ${isImmersivePreview ? 'p-4' : ''}`} role="alert">
            {selection.error}
          </p>
        ) : null}

        {!selection.loading && !selection.error && hasPreviewContent ? (
          isPdf && selection.previewUrl ? (
            <object
              data={`${selection.previewUrl}#view=FitH`}
              type="application/pdf"
              className="block h-full min-h-0 w-full"
              data-testid="chat-artifact-pdf-preview"
            >
              <iframe
                title={fileName}
                className="h-full w-full border-0 bg-white"
                src={`${selection.previewUrl}#view=FitH`}
              />
            </object>
          ) : isImage && selection.previewUrl ? (
            <div className="flex h-full min-h-0 items-center justify-center p-4">
              <img
                src={selection.previewUrl}
                alt={fileName}
                className="max-h-full max-w-full rounded-lg border border-gray-200 bg-white object-contain shadow-sm"
                data-testid="chat-artifact-image-preview"
              />
            </div>
          ) : isMarkdown && selection.content ? (
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <Markdown>{selection.content}</Markdown>
            </div>
          ) : isHtml && selection.content ? (
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

        {!selection.loading && !selection.error && !hasPreviewContent ? (
          <p className={`text-sm text-gray-500 ${isImmersivePreview ? 'p-4' : ''}`}>
            No preview available for this file type.
          </p>
        ) : null}
      </div>
    </aside>
  );
}
