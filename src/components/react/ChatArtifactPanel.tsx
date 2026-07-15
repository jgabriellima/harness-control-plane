import { X } from 'lucide-react';
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';

import ArtifactActionsMenu, { type ArtifactMenuAction } from '@/components/react/ArtifactActionsMenu';
import ArtifactFullscreenOverlay from '@/components/react/ArtifactFullscreenOverlay';
import ArtifactHtmlFrame from '@/components/react/ArtifactHtmlFrame';
import ArtifactUnsupportedPreview from '@/components/react/ArtifactUnsupportedPreview';
import CodeArtifactViewer from '@/components/react/CodeArtifactViewer';
import { Markdown } from '@/components/ui/markdown';
import {
  inferArtifactPreviewMode,
  isClientParsedBinaryPreview,
  unsupportedBinaryMessage,
} from '@/lib/artifact-preview-modes';
import {
  fileNameFromPath,
  isFullscreenCapableArtifact,
  isInlinePreviewMime,
  isPresentationHtmlArtifact,
  isSyntaxHighlightedArtifact,
} from '@/lib/file-reference';
import type { ChatArtifactSelection } from '@/lib/chat-artifact-types';

function SpreadsheetPreviewLoadError(): React.ReactElement {
  return (
    <p className="p-4 text-sm text-red-600" role="alert" data-testid="chat-artifact-spreadsheet-load-error">
      Failed to load spreadsheet preview. Refresh the page and try again.
    </p>
  );
}

const ArtifactSpreadsheetPreview = lazy(() =>
  import('@/components/react/ArtifactSpreadsheetPreview').catch((error: unknown) => {
    console.error('[artifact-preview] spreadsheet chunk failed', error);
    return { default: SpreadsheetPreviewLoadError };
  }),
);
const ArtifactDocxPreview = lazy(() => import('@/components/react/ArtifactDocxPreview'));
const ArtifactPptxPreview = lazy(() => import('@/components/react/ArtifactPptxPreview'));
const ArtifactModel3DPreview = lazy(() => import('@/components/react/ArtifactModel3DPreview'));

function PreviewLoadingFallback(): React.ReactElement {
  return <p className="p-4 text-sm text-gray-500">Loading preview…</p>;
}

interface ArtifactPreviewErrorBoundaryProps {
  children: React.ReactNode;
  resetKey: string;
}

interface ArtifactPreviewErrorBoundaryState {
  hasError: boolean;
}

class ArtifactPreviewErrorBoundary extends React.Component<
  ArtifactPreviewErrorBoundaryProps,
  ArtifactPreviewErrorBoundaryState
> {
  state: ArtifactPreviewErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ArtifactPreviewErrorBoundaryState {
    return { hasError: true };
  }

  componentDidUpdate(prevProps: ArtifactPreviewErrorBoundaryProps): void {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  componentDidCatch(error: Error): void {
    console.error('[artifact-preview]', error);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <p className="p-4 text-sm text-red-600" role="alert" data-testid="chat-artifact-preview-error">
          Failed to load preview. Refresh the page or try again.
        </p>
      );
    }
    return this.props.children;
  }
}

interface ChatArtifactPanelProps {
  selection: ChatArtifactSelection;
  onClose: () => void;
}

type HtmlArtifactViewMode = 'preview' | 'source';

export default function ChatArtifactPanel({ selection, onClose }: ChatArtifactPanelProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [htmlViewMode, setHtmlViewMode] = useState<HtmlArtifactViewMode>('preview');

  useEffect(() => {
    setFullscreenOpen(false);
    setHtmlViewMode('preview');
  }, [selection.path]);

  const fileName = fileNameFromPath(selection.path);
  const previewMode = inferArtifactPreviewMode(selection.path, selection.mime);
  const isMarkdown = previewMode === 'markdown';
  const isHtml = previewMode === 'html';
  const isPdf = previewMode === 'pdf';
  const isImage = previewMode === 'image';
  const isBinary = selection.encoding === 'binary';
  const isPresentationHtml = isPresentationHtmlArtifact(selection.path, selection.content);
  const canInlinePreview =
    Boolean(selection.previewUrl) &&
    (isInlinePreviewMime(selection.mime) || isClientParsedBinaryPreview(previewMode));
  const useCodeViewer =
    Boolean(selection.content) && isSyntaxHighlightedArtifact(selection.path, selection.mime);
  const showHtmlSource = isHtml && htmlViewMode === 'source' && Boolean(selection.content);
  const showHtmlPreview = isHtml && htmlViewMode === 'preview' && Boolean(selection.previewUrl);
  const isImmersivePreview =
    canInlinePreview || useCodeViewer || showHtmlPreview || showHtmlSource;
  const canFullscreen = isFullscreenCapableArtifact(selection.path, selection.mime, selection.content);

  const copyTextToClipboard = useCallback(async (text: string): Promise<void> => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopyState('copied');
        window.setTimeout(() => setCopyState('idle'), 2000);
      }
    } catch {
      setCopyState('idle');
    }
  }, []);

  const menuActions = useMemo((): ArtifactMenuAction[] => {
    const actions: ArtifactMenuAction[] = [];

    if (canFullscreen) {
      actions.push({
        id: 'fullscreen',
        label: isPresentationHtml ? 'Presentation fullscreen' : 'Fullscreen preview',
        testId: 'chat-artifact-action-fullscreen',
        onSelect: () => setFullscreenOpen(true),
      });
    }

    if (isHtml && selection.content) {
      if (htmlViewMode === 'preview') {
        actions.push({
          id: 'view-source',
          label: 'View source',
          testId: 'chat-artifact-action-view-source',
          onSelect: () => setHtmlViewMode('source'),
        });
      } else {
        actions.push({
          id: 'view-preview',
          label: 'View preview',
          testId: 'chat-artifact-action-view-preview',
          onSelect: () => setHtmlViewMode('preview'),
        });
      }
    }

    if (selection.path) {
      const artifactPath = selection.path;
      actions.push({
        id: 'copy-path',
        label: 'Copy path',
        testId: 'chat-artifact-action-copy-path',
        onSelect: () => {
          void copyTextToClipboard(artifactPath);
        },
      });
    }

    if (selection.content) {
      const content = selection.content;
      actions.push({
        id: 'copy-content',
        label: 'Copy content',
        testId: 'chat-artifact-action-copy-content',
        onSelect: () => {
          void copyTextToClipboard(content);
        },
      });
    }

    if (selection.previewUrl) {
      actions.push({
        id: 'download',
        label: 'Download',
        testId: 'chat-artifact-action-download',
        onSelect: () => {
          const anchor = document.createElement('a');
          anchor.href = selection.previewUrl ?? '';
          anchor.download = fileName;
          anchor.rel = 'noreferrer';
          anchor.click();
        },
      });
      actions.push({
        id: 'open-external',
        label: 'Open in new tab',
        testId: 'chat-artifact-action-open-external',
        onSelect: () => {
          window.open(selection.previewUrl ?? '', '_blank', 'noopener,noreferrer');
        },
      });
    }

    return actions;
  }, [
    canFullscreen,
    copyTextToClipboard,
    fileName,
    htmlViewMode,
    isHtml,
    isPresentationHtml,
    selection.content,
    selection.previewUrl,
  ]);

  const hasPreviewContent =
    canInlinePreview ||
    (isMarkdown && selection.content) ||
    (isHtml && (selection.previewUrl || selection.content)) ||
    previewMode === 'spreadsheet' ||
    previewMode === 'document' ||
    previewMode === 'presentation' ||
    previewMode === 'model-3d' ||
    previewMode === 'unsupported-binary' ||
    (!isBinary && selection.content);

  return (
    <>
      <aside
        className="flex h-full min-h-0 min-w-0 flex-col border-l border-gray-200 bg-white"
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
            <ArtifactActionsMenu actions={menuActions} />
            {copyState === 'copied' ? (
              <span className="text-[10px] text-gray-600" data-testid="chat-artifact-copy-feedback">
                Copied
              </span>
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
            <p
              className={`text-sm text-gray-600 ${isImmersivePreview ? 'p-4' : ''}`}
              role="status"
              data-testid="chat-artifact-error"
            >
              {selection.error}
            </p>
          ) : null}

          {!selection.loading && !selection.error && hasPreviewContent ? (
            previewMode === 'spreadsheet' && selection.previewUrl ? (
              <ArtifactPreviewErrorBoundary resetKey={selection.path}>
                <Suspense fallback={<PreviewLoadingFallback />}>
                  <ArtifactSpreadsheetPreview
                    previewUrl={selection.previewUrl}
                    filePath={selection.path}
                    textContent={selection.content}
                  />
                </Suspense>
              </ArtifactPreviewErrorBoundary>
            ) : previewMode === 'document' && selection.previewUrl ? (
              <ArtifactPreviewErrorBoundary resetKey={selection.path}>
                <Suspense fallback={<PreviewLoadingFallback />}>
                  <ArtifactDocxPreview previewUrl={selection.previewUrl} />
                </Suspense>
              </ArtifactPreviewErrorBoundary>
            ) : previewMode === 'presentation' && selection.previewUrl ? (
              <ArtifactPreviewErrorBoundary resetKey={selection.path}>
                <Suspense fallback={<PreviewLoadingFallback />}>
                  <ArtifactPptxPreview previewUrl={selection.previewUrl} fileName={fileName} />
                </Suspense>
              </ArtifactPreviewErrorBoundary>
            ) : previewMode === 'model-3d' && selection.previewUrl ? (
              <ArtifactPreviewErrorBoundary resetKey={selection.path}>
                <Suspense fallback={<PreviewLoadingFallback />}>
                  <ArtifactModel3DPreview previewUrl={selection.previewUrl} filePath={selection.path} />
                </Suspense>
              </ArtifactPreviewErrorBoundary>
            ) : previewMode === 'unsupported-binary' ? (
              <ArtifactUnsupportedPreview
                message={unsupportedBinaryMessage(selection.path)}
                previewUrl={selection.previewUrl}
                fileName={fileName}
              />
            ) : isPdf && selection.previewUrl ? (
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
            ) : showHtmlPreview && selection.previewUrl ? (
              <ArtifactHtmlFrame
                title={fileName}
                previewUrl={selection.previewUrl}
                testId="chat-artifact-html-preview"
              />
            ) : showHtmlSource && selection.content ? (
              <CodeArtifactViewer path={selection.path} content={selection.content} mime={selection.mime} />
            ) : useCodeViewer && selection.content ? (
              <CodeArtifactViewer path={selection.path} content={selection.content} mime={selection.mime} />
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

      {fullscreenOpen ? (
        <ArtifactFullscreenOverlay title={fileName} onClose={() => setFullscreenOpen(false)}>
          {isPdf && selection.previewUrl ? (
            <object
              data={`${selection.previewUrl}#view=FitH`}
              type="application/pdf"
              className="block h-full w-full"
              data-testid="chat-artifact-fullscreen-pdf"
            >
              <iframe
                title={fileName}
                className="h-full w-full border-0 bg-white"
                src={`${selection.previewUrl}#view=FitH`}
              />
            </object>
          ) : isImage && selection.previewUrl ? (
            <div className="flex h-full items-center justify-center p-6">
              <img
                src={selection.previewUrl}
                alt={fileName}
                className="max-h-full max-w-full object-contain"
                data-testid="chat-artifact-fullscreen-image"
              />
            </div>
          ) : isHtml && selection.previewUrl ? (
            <ArtifactHtmlFrame
              title={fileName}
              previewUrl={selection.previewUrl}
              testId="chat-artifact-fullscreen-html"
            />
          ) : null}
        </ArtifactFullscreenOverlay>
      ) : null}
    </>
  );
}
