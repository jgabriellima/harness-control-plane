'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Code2,
  Download,
  Eye,
  Loader2,
  Maximize2,
  Monitor,
  RefreshCw,
  Share2,
} from 'lucide-react';

import {
  createDesignRun,
  fetchProjectFileText,
  getDesignProject,
  listProjectFiles,
  projectRawFileUrl,
  resolveProjectPreviewSrcdoc,
  streamDesignRunEvents,
  type DesignProjectFile,
  type DesignProjectRecord,
} from '@/lib/design-api';
import {
  dispatchOrchestratorChat,
  isOrchestratorWorkspaceProject,
  resolveOrchestratorWorkspaceRoot,
} from '@/lib/design-runtime-bridge';
import {
  DECK_STUDIO_HEIGHT,
  DECK_STUDIO_WIDTH,
  inferDesignStudioSurface,
  studioSurfaceUsesDeckBridge,
  type DesignStudioSurface,
} from '@/lib/design-studio-surface';
import { useDeckStudioScale } from '@/hooks/useDeckStudioScale';

interface DesignStudioViewProps {
  projectId: string;
}

type StudioMode = 'preview' | 'code';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

interface SlideState {
  active: number;
  count: number;
}

function fileLabel(file: DesignProjectFile): string {
  return file.name || file.path;
}

function activeFileRecord(files: DesignProjectFile[], activeFile: string | null): DesignProjectFile | null {
  if (!activeFile) {
    return null;
  }
  return files.find((file) => file.path === activeFile) ?? null;
}

function postDeckSlideAction(
  iframe: HTMLIFrameElement | null,
  action: 'next' | 'prev' | 'first' | 'last',
): void {
  iframe?.contentWindow?.postMessage({ type: 'od:slide', action }, '*');
}

export default function DesignStudioView({ projectId }: DesignStudioViewProps) {
  const [mode, setMode] = useState<StudioMode>('preview');
  const [projectName, setProjectName] = useState('Design project');
  const [projectRecord, setProjectRecord] = useState<DesignProjectRecord | null>(null);
  const [files, setFiles] = useState<DesignProjectFile[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [previewHtml, setPreviewHtml] = useState(
    '<p style="padding:2rem;color:#74716b;font-family:system-ui,sans-serif;">Select a file to preview.</p>',
  );
  const [studioSurface, setStudioSurface] = useState<DesignStudioSurface>('prototype');
  const [slideState, setSlideState] = useState<SlideState>({ active: 0, count: 0 });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [composer, setComposer] = useState('');
  const [runBusy, setRunBusy] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const deckFrameRef = useRef<HTMLDivElement | null>(null);

  const usesDeckCanvas = studioSurfaceUsesDeckBridge(studioSurface);
  useDeckStudioScale(deckFrameRef, usesDeckCanvas && mode === 'preview');

  const refreshFiles = useCallback(async () => {
    const nextFiles = await listProjectFiles(projectId);
    setFiles(nextFiles);
    setActiveFile((current) => {
      if (current && nextFiles.some((file) => file.path === current)) {
        return current;
      }
      const htmlFile = nextFiles.find((file) => /\.html?$/i.test(file.path));
      const imageFile = nextFiles.find((file) => file.kind === 'image');
      const videoFile = nextFiles.find((file) => file.kind === 'video');
      return htmlFile?.path ?? imageFile?.path ?? videoFile?.path ?? nextFiles[0]?.path ?? null;
    });
    setLoadingFiles(false);
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;

    async function loadProject() {
      const project = await getDesignProject(projectId);
      if (!cancelled && project) {
        setProjectRecord(project);
        if (project.name) {
          setProjectName(project.name);
        }
      }
    }

    void loadProject();
    void refreshFiles();

    return () => {
      cancelled = true;
    };
  }, [projectId, refreshFiles]);

  useEffect(() => {
    if (!activeFile) {
      return;
    }

    let cancelled = false;
    const fileRecord = activeFileRecord(files, activeFile);
    const projectKind = projectRecord?.metadata?.kind;

    async function loadActiveFile() {
      const text = await fetchProjectFileText(projectId, activeFile);
      if (cancelled) {
        return;
      }

      const surface = inferDesignStudioSurface(
        projectKind,
        fileRecord ? { path: fileRecord.path, kind: fileRecord.kind } : { path: activeFile },
        text,
      );
      setStudioSurface(surface);
      setFileContent(text ?? '');

      if (surface === 'image' || surface === 'video' || surface === 'audio') {
        setPreviewHtml('');
        setSlideState({ active: 0, count: 0 });
        return;
      }

      const srcdoc = await resolveProjectPreviewSrcdoc(projectId, activeFile, {
        projectKind,
        fileKind: fileRecord?.kind,
        surface,
      });

      if (cancelled) {
        return;
      }

      setPreviewHtml(
        srcdoc ??
          '<p style="padding:2rem;color:#74716b;font-family:system-ui,sans-serif;">Preview unavailable for this file.</p>',
      );
      setSlideState({ active: 0, count: 0 });
    }

    void loadActiveFile();
    return () => {
      cancelled = true;
    };
  }, [activeFile, files, projectId, projectRecord?.metadata?.kind]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data as { type?: string; active?: number; count?: number } | null;
      if (!data || data.type !== 'od:slide-state') {
        return;
      }
      if (typeof data.active !== 'number' || typeof data.count !== 'number') {
        return;
      }
      setSlideState({ active: data.active, count: data.count });
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    const prompt = composer.trim();
    if (!prompt || runBusy) {
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const userMessageId = `user-${Date.now()}`;
    const assistantMessageId = `assistant-${Date.now()}`;

    setMessages((current) => [
      ...current,
      { id: userMessageId, role: 'user', content: prompt },
      { id: assistantMessageId, role: 'assistant', content: '', streaming: true },
    ]);
    setComposer('');
    setRunBusy(true);
    setRunError(null);

    try {
      if (projectRecord && isOrchestratorWorkspaceProject(projectRecord)) {
        const workspaceRoot = resolveOrchestratorWorkspaceRoot(projectRecord);
        if (!workspaceRoot) {
          throw new Error('Orchestrator workspace root is missing');
        }

        await dispatchOrchestratorChat(
          {
            projectId,
            message: prompt,
            workspaceRoot,
            signal: controller.signal,
          },
          {
            onTextUpdate: (content) => {
              setMessages((current) =>
                current.map((message) =>
                  message.id === assistantMessageId ? { ...message, content } : message,
                ),
              );
            },
            onError: (error) => {
              setRunError(error.message);
            },
            onComplete: () => {
              setMessages((current) =>
                current.map((message) =>
                  message.id === assistantMessageId ? { ...message, streaming: false } : message,
                ),
              );
              void refreshFiles();
            },
          },
        );
      } else {
        const { runId } = await createDesignRun({
          projectId,
          message: prompt,
          sessionMode: 'design',
        });

        await streamDesignRunEvents(
          runId,
          {
            onTextDelta: (delta) => {
              setMessages((current) =>
                current.map((message) =>
                  message.id === assistantMessageId
                    ? { ...message, content: message.content + delta }
                    : message,
                ),
              );
            },
            onError: (error) => {
              setRunError(error.message);
            },
            onComplete: () => {
              setMessages((current) =>
                current.map((message) =>
                  message.id === assistantMessageId ? { ...message, streaming: false } : message,
                ),
              );
              void refreshFiles();
            },
          },
          controller.signal,
        );
      }
    } catch (error) {
      setRunError(error instanceof Error ? error.message : 'Run failed');
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                content: message.content || 'Generation failed.',
                streaming: false,
              }
            : message,
        ),
      );
    } finally {
      setRunBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0" data-testid="design-studio-view">
      <aside className="flex w-[360px] shrink-0 flex-col border-r border-[var(--border-soft)] bg-[var(--bg-elevated)]">
        <div className="border-b border-[var(--border-soft)] px-4 py-3">
          <p className="truncate text-[14px] font-semibold text-[var(--text)]">{projectName}</p>
          <p className="mt-1 text-[12px] text-[var(--text-muted)]">Describe changes to refine this artifact.</p>
        </div>

        <div className="flex-1 space-y-3 overflow-auto px-4 py-4" data-testid="design-studio-messages">
          {messages.length === 0 ? (
            <p className="text-[13px] leading-6 text-[var(--text-muted)]">
              Send a prompt to generate or refine design files for this project.
            </p>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={[
                  'rounded-2xl px-3 py-2 text-[13px] leading-6',
                  message.role === 'user'
                    ? 'ml-8 bg-[var(--bg-subtle)] text-[var(--text)]'
                    : 'mr-4 border border-[var(--border-soft)] bg-[var(--bg-panel)] text-[var(--text-muted)]',
                ].join(' ')}
              >
                <p className="whitespace-pre-wrap">{message.content || (message.streaming ? '...' : '')}</p>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {runError ? (
          <p className="px-4 pb-2 text-[12px] text-[var(--red)]" data-testid="design-studio-run-error">
            {runError}
          </p>
        ) : null}

        <div className="border-t border-[var(--border-soft)] p-4">
          <textarea
            value={composer}
            onChange={(event) => setComposer(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Describe what you want to generate..."
            className="min-h-[88px] w-full resize-none rounded-2xl border border-[var(--border-soft)] px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--border)]"
            data-testid="design-studio-composer"
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!composer.trim() || runBusy}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--text-strong)] px-4 py-2 text-[12px] font-medium text-[var(--bg-elevated)] disabled:opacity-40"
              data-testid="design-studio-send"
            >
              {runBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUp className="h-3.5 w-3.5" />}
              Send
            </button>
          </div>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-[var(--bg-subtle)]">
        <div className="flex items-center justify-between border-b border-[var(--border-soft)] bg-[var(--bg-elevated)] px-4 py-2">
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
            <span className="shrink-0 rounded-lg bg-[var(--bg-subtle)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-muted)]">
              Design Files
            </span>
            {loadingFiles ? (
              <span className="text-[12px] text-[var(--text-soft)]">Loading...</span>
            ) : files.length === 0 ? (
              <span className="text-[12px] text-[var(--text-soft)]">No files yet</span>
            ) : (
              files.map((file) => {
                const label = fileLabel(file);
                const active = activeFile === file.path;
                return (
                  <button
                    key={file.path}
                    type="button"
                    onClick={() => setActiveFile(file.path)}
                    className={[
                      'shrink-0 rounded-lg border px-2.5 py-1 text-[12px] transition',
                      active
                        ? 'border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--text)]'
                        : 'border-[var(--border-soft)] bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text)]',
                    ].join(' ')}
                    data-testid="design-studio-file-tab"
                  >
                    {label}
                  </button>
                );
              })
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void refreshFiles()}
              className="rounded-lg border border-[var(--border-soft)] px-3 py-1.5 text-[12px] text-[var(--text-muted)]"
            >
              <RefreshCw className="mr-1 inline h-3.5 w-3.5" />
              Refresh
            </button>
            <button
              type="button"
              className="rounded-lg border border-[var(--border-soft)] px-3 py-1.5 text-[12px] text-[var(--text-muted)]"
            >
              <Share2 className="mr-1 inline h-3.5 w-3.5" />
              Share
            </button>
            <button
              type="button"
              className="rounded-lg border border-[var(--border-soft)] px-3 py-1.5 text-[12px] text-[var(--text-muted)]"
            >
              <Download className="mr-1 inline h-3.5 w-3.5" />
              Download
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 border-b border-[var(--border-soft)] bg-[var(--bg-elevated)] px-4 py-2">
          <div className="inline-flex rounded-xl bg-[var(--bg-subtle)] p-1">
            <button
              type="button"
              onClick={() => setMode('preview')}
              className={[
                'inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-medium',
                mode === 'preview'
                  ? 'bg-[var(--bg-elevated)] text-[var(--text)] shadow-[var(--shadow-xs)]'
                  : 'text-[var(--text-muted)]',
              ].join(' ')}
              data-testid="design-studio-preview-toggle"
            >
              <Eye className="h-3.5 w-3.5" />
              Preview
            </button>
            <button
              type="button"
              onClick={() => setMode('code')}
              className={[
                'inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-medium',
                mode === 'code'
                  ? 'bg-[var(--bg-elevated)] text-[var(--text)] shadow-[var(--shadow-xs)]'
                  : 'text-[var(--text-muted)]',
              ].join(' ')}
              data-testid="design-studio-code-toggle"
            >
              <Code2 className="h-3.5 w-3.5" />
              Code
            </button>
          </div>
          <div className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-soft)] px-2.5 py-1.5 text-[12px] text-[var(--text-muted)]">
            <Monitor className="h-3.5 w-3.5" />
            {usesDeckCanvas ? `${DECK_STUDIO_WIDTH}×${DECK_STUDIO_HEIGHT}` : 'Desktop'}
          </div>
          {studioSurface === 'hyperframes' ? (
            <span className="rounded-full bg-[var(--accent-tint)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent)]">
              HyperFrames
            </span>
          ) : null}
          {studioSurface === 'image' ? (
            <span className="rounded-full bg-[var(--accent-tint)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent)]">
              Image studio
            </span>
          ) : null}
          {studioSurface === 'video' ? (
            <span className="rounded-full bg-[var(--accent-tint)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent)]">
              Video studio
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-2 text-[var(--text-soft)]">
            <Maximize2 className="h-4 w-4" />
            <span className="text-[12px]">100%</span>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center p-8">
          {mode === 'preview' ? (
            studioSurface === 'image' && activeFile ? (
              <img
                src={projectRawFileUrl(projectId, activeFile)}
                alt={fileLabel(activeFileRecord(files, activeFile) ?? { path: activeFile, name: activeFile })}
                className="max-h-full max-w-[1100px] rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] object-contain shadow-[var(--shadow-lg)]"
                data-testid="design-studio-image-preview"
              />
            ) : studioSurface === 'video' && activeFile ? (
              <video
                src={projectRawFileUrl(projectId, activeFile)}
                controls
                className="max-h-full max-w-[1100px] rounded-xl border border-[var(--border)] bg-black shadow-[var(--shadow-lg)]"
                data-testid="design-studio-video-preview"
              />
            ) : studioSurface === 'audio' && activeFile ? (
              <audio
                src={projectRawFileUrl(projectId, activeFile)}
                controls
                className="w-full max-w-[640px]"
                data-testid="design-studio-audio-preview"
              />
            ) : usesDeckCanvas ? (
              <div
                ref={deckFrameRef}
                className="relative flex h-full w-full max-w-[1100px] items-start justify-center overflow-hidden"
                style={{ aspectRatio: `${DECK_STUDIO_WIDTH} / ${DECK_STUDIO_HEIGHT}` }}
                data-testid="design-studio-deck-frame"
              >
                <iframe
                  ref={previewFrameRef}
                  title="Design deck preview"
                  sandbox="allow-scripts"
                  srcDoc={previewHtml}
                  className="origin-top-left rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-lg)]"
                  style={{
                    width: `${DECK_STUDIO_WIDTH}px`,
                    height: `${DECK_STUDIO_HEIGHT}px`,
                    transform: 'scale(var(--deck-studio-scale, 1))',
                  }}
                  data-testid="design-studio-preview-frame"
                />
              </div>
            ) : (
              <iframe
                ref={previewFrameRef}
                title="Design preview"
                sandbox="allow-scripts"
                srcDoc={previewHtml}
                className="h-full w-full max-w-[1100px] rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-lg)]"
                data-testid="design-studio-preview-frame"
              />
            )
          ) : (
            <pre className="h-full w-full max-w-[1100px] overflow-auto rounded-xl border border-[var(--border)] bg-[#111] p-4 text-left text-[12px] leading-6 text-[#d6d6d6]">
              {fileContent || '<!-- source will appear after generation -->'}
            </pre>
          )}
        </div>

        <div className="flex items-center justify-center gap-3 border-t border-[var(--border-soft)] bg-[var(--bg-elevated)] py-3 text-[12px] text-[var(--text-muted)]">
          <button
            type="button"
            className="rounded p-1 hover:bg-[var(--bg-subtle)] disabled:opacity-30"
            disabled={!usesDeckCanvas || slideState.active <= 0}
            onClick={() => postDeckSlideAction(previewFrameRef.current, 'prev')}
            aria-label="Previous slide"
            data-testid="design-studio-slide-prev"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {usesDeckCanvas && slideState.count > 0
            ? `${slideState.active + 1} / ${slideState.count}`
            : files.length > 0
              ? `${files.findIndex((file) => file.path === activeFile) + 1 || 1} / ${files.length}`
              : '0 / 0'}
          <button
            type="button"
            className="rounded p-1 hover:bg-[var(--bg-subtle)] disabled:opacity-30"
            disabled={!usesDeckCanvas || slideState.count === 0 || slideState.active >= slideState.count - 1}
            onClick={() => postDeckSlideAction(previewFrameRef.current, 'next')}
            aria-label="Next slide"
            data-testid="design-studio-slide-next"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </section>
    </div>
  );
}
