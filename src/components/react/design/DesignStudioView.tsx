'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Code2,
  Download,
  Eye,
  Loader2,
  Monitor,
  Paperclip,
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
  resolveOrchestratorHarnessProjectId,
  resolveOrchestratorWorkspaceRoot,
} from '@/lib/design-runtime-bridge';
import {
  fetchHarnessWorkspaceContext,
  resolveOrCreateHarnessConversation,
  storeHarnessConversationId,
} from '@/lib/design-harness-context';
import { designPathForView } from '@/lib/design-navigation';
import { navigateDesign } from '@/lib/design-shell-navigation';
import DesignStudioOrchestratorPane, {
  shouldUseOrchestratorPane,
} from './DesignStudioOrchestratorPane';
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

function projectKindLabel(record: DesignProjectRecord | null): string {
  const skillId = record?.skillId ?? '';
  if (skillId.includes('prototype') || record?.metadata?.kind === 'prototype') {
    return 'Web Prototype';
  }
  if (skillId.includes('deck') || record?.metadata?.kind === 'deck') {
    return 'Deck';
  }
  if (record?.metadata?.kind) {
    return String(record.metadata.kind);
  }
  return 'Design project';
}

function postDeckSlideAction(
  iframe: HTMLIFrameElement | null,
  action: 'next' | 'prev' | 'first' | 'last',
): void {
  iframe?.contentWindow?.postMessage({ type: 'od:slide', action }, '*');
}

function StudioChatHeader({
  projectName,
  kindLabel,
}: {
  projectName: string;
  kindLabel: string;
}) {
  return (
    <div className="design-studio-chat__header">
      <button
        type="button"
        className="design-studio-chat__back"
        aria-label="Back to projects"
        onClick={() => navigateDesign(designPathForView('projects'))}
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <div className="design-studio-chat__title-wrap">
        <h2 className="design-studio-chat__title">{projectName}</h2>
        <span className="design-studio-chat__tag">{kindLabel}</span>
      </div>
    </div>
  );
}

function StudioTurnFilesSidebar({
  files,
  activeFile,
  projectId,
  onSelectFile,
}: {
  files: DesignProjectFile[];
  activeFile: string | null;
  projectId: string;
  onSelectFile: (path: string) => void;
}) {
  if (files.length === 0) {
    return null;
  }

  return (
    <section className="studio-turn-files studio-turn-files--sidebar" data-testid="design-studio-turn-files">
      <p className="studio-turn-files__label">FILES FROM THIS TURN</p>
      <div className="studio-turn-files__list" role="list">
        {files.map((file) => {
          const label = fileLabel(file);
          const active = activeFile === file.path;
          return (
            <div key={`turn-${file.path}`} className="studio-turn-files__row" role="listitem">
              <button
                type="button"
                className={`studio-turn-files__row-name${active ? ' is-active' : ''}`}
                onClick={() => onSelectFile(file.path)}
              >
                {label}
              </button>
              <div className="studio-turn-files__row-actions">
                <button
                  type="button"
                  className="studio-turn-files__row-btn"
                  onClick={() => onSelectFile(file.path)}
                >
                  Open
                </button>
                <a
                  className="studio-turn-files__row-btn"
                  href={projectRawFileUrl(projectId, file.path)}
                  download={label}
                >
                  Download
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function DesignStudioView({ projectId }: DesignStudioViewProps) {
  const [mode, setMode] = useState<StudioMode>('preview');
  const [projectName, setProjectName] = useState('Design project');
  const [projectRecord, setProjectRecord] = useState<DesignProjectRecord | null>(null);
  const [projectLoading, setProjectLoading] = useState(true);
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
  const kindLabel = projectKindLabel(projectRecord);
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
      try {
        const project = await getDesignProject(projectId);
        if (!cancelled && project) {
          setProjectRecord(project);
          if (project.name) {
            setProjectName(project.name);
          }
        }
      } finally {
        if (!cancelled) {
          setProjectLoading(false);
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

  const usesOrchestratorPane = shouldUseOrchestratorPane(projectRecord);

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

        const harnessContext = await fetchHarnessWorkspaceContext();
        const conversationId = await resolveOrCreateHarnessConversation({
          projectId,
          projectName: projectRecord.name,
          harnessProjectId:
            harnessContext?.harnessProjectId ?? resolveOrchestratorHarnessProjectId(workspaceRoot),
          existingConversationId: projectRecord.metadata?.harnessConversationId,
        });

        const dispatchResult = await dispatchOrchestratorChat(
          {
            projectId,
            message: prompt,
            workspaceRoot,
            conversationId,
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

        if (dispatchResult.conversationId) {
          storeHarnessConversationId(projectId, dispatchResult.conversationId);
        }
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

  const activeLabel = activeFile ? fileLabel(activeFileRecord(files, activeFile) ?? { path: activeFile, name: activeFile }) : null;

  return (
    <div className="app h-full min-h-0" data-testid="design-studio-view">
      <div className="split h-full min-h-0">
        <div className="split-chat-slot">
          <div className="pane design-studio-chat">
            {projectLoading ? (
              <p
                className="px-4 py-3 text-[13px] text-[var(--text-muted)]"
                data-testid="design-studio-project-loading"
              >
                Loading project…
              </p>
            ) : usesOrchestratorPane && projectRecord ? (
              <>
                <StudioChatHeader projectName={projectName} kindLabel={kindLabel} />
                <div className="flex min-h-0 flex-1 flex-col">
                  <DesignStudioOrchestratorPane projectId={projectId} projectRecord={projectRecord} />
                </div>
                <StudioTurnFilesSidebar
                  files={files}
                  activeFile={activeFile}
                  projectId={projectId}
                  onSelectFile={setActiveFile}
                />
              </>
            ) : (
              <>
                <StudioChatHeader projectName={projectName} kindLabel={kindLabel} />

                <div className="design-studio-chat__messages" data-testid="design-studio-messages">
                  {messages.length === 0 ? (
                    <p className="text-[13px] leading-6 text-[var(--text-muted)]">
                      Send a prompt to generate or refine design files for this project.
                    </p>
                  ) : (
                    messages.map((message) => (
                      <div
                        key={message.id}
                        className={`design-studio-chat__message design-studio-chat__message--${message.role}`}
                      >
                        {message.content || (message.streaming ? '...' : '')}
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <StudioTurnFilesSidebar
                  files={files}
                  activeFile={activeFile}
                  projectId={projectId}
                  onSelectFile={setActiveFile}
                />

                {runError ? (
                  <p className="px-4 pb-2 text-[12px] text-[var(--red)]" data-testid="design-studio-run-error">
                    {runError}
                  </p>
                ) : null}

                <div className="design-studio-composer">
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
                    className="design-studio-composer__input"
                    data-testid="design-studio-composer"
                  />
                  <div className="design-studio-composer__footer">
                    <span className="design-studio-composer__hints">
                      <Paperclip className="h-3.5 w-3.5" aria-hidden />
                      Attach
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleSend()}
                      disabled={!composer.trim() || runBusy}
                      className="design-studio-composer__send"
                      data-testid="design-studio-send"
                    >
                      {runBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUp className="h-3.5 w-3.5" />}
                      Send
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="split-resize-handle" role="separator" aria-orientation="vertical" aria-hidden />

        <div className="workspace min-w-0">
          <div className="ws-tabs-shell">
            <div className="ws-tabs-bar" role="tablist">
              <button type="button" className="ws-tab pages-tab active" data-testid="design-studio-design-files-tab">
                <span className="tab-icon" aria-hidden>
                  <Monitor className="h-3.5 w-3.5" />
                </span>
                <span className="ws-tab-label">Design Files</span>
              </button>
              {activeLabel ? (
                <>
                  <span className="ws-tab-sep" aria-hidden>
                    ›
                  </span>
                  <button
                    type="button"
                    className="ws-tab browser-tab active has-meta"
                    data-testid="design-studio-file-tab"
                  >
                    <span className="ws-tab-label">{activeLabel}</span>
                  </button>
                </>
              ) : loadingFiles ? (
                <span className="ws-tab-meta">Loading...</span>
              ) : null}
            </div>
            <div className="ws-tabs-actions">
              <div className="ws-tabs-file-actions">
                <button
                  type="button"
                  onClick={() => void refreshFiles()}
                  className="icon-only"
                  aria-label="Refresh files"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
                <div className="present-wrap">
                  <button
                    type="button"
                    className="chrome-action chrome-action-primary chrome-action-with-label present-trigger design-studio-share"
                    data-testid="design-studio-share"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    Share
                  </button>
                </div>
                {activeFile ? (
                  <a
                    className="icon-only"
                    href={projectRawFileUrl(projectId, activeFile)}
                    download={activeLabel ?? 'file'}
                    aria-label="Download file"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                ) : (
                  <button type="button" className="icon-only" aria-label="Download" disabled>
                    <Download className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="ws-body">
            <div className="design-studio-viewer">
              <div className="viewer-toolbar">
                <div className="viewer-toolbar__modes">
                  <button
                    type="button"
                    onClick={() => setMode('preview')}
                    className={`viewer-toolbar__mode${mode === 'preview' ? ' active' : ''}`}
                    data-testid="design-studio-preview-toggle"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('code')}
                    className={`viewer-toolbar__mode${mode === 'code' ? ' active' : ''}`}
                    data-testid="design-studio-code-toggle"
                  >
                    <Code2 className="h-3.5 w-3.5" />
                    Code
                  </button>
                </div>
                <div className="viewer-toolbar__viewport">
                  <Monitor className="h-3.5 w-3.5" />
                  {usesDeckCanvas ? `${DECK_STUDIO_WIDTH}×${DECK_STUDIO_HEIGHT}` : 'Desktop'}
                </div>
                <div className="viewer-toolbar__spacer" />
                <div className="viewer-toolbar__zoom">
                  <span>100%</span>
                </div>
              </div>

              {mode === 'preview' ? (
                studioSurface === 'image' && activeFile ? (
                  <div className="html-viewer design-studio-preview design-studio-preview--media">
                    <img
                      src={projectRawFileUrl(projectId, activeFile)}
                      alt={activeLabel ?? 'Preview'}
                      data-testid="design-studio-image-preview"
                    />
                  </div>
                ) : studioSurface === 'video' && activeFile ? (
                  <div className="html-viewer design-studio-preview design-studio-preview--media">
                    <video
                      src={projectRawFileUrl(projectId, activeFile)}
                      controls
                      data-testid="design-studio-video-preview"
                    />
                  </div>
                ) : studioSurface === 'audio' && activeFile ? (
                  <div className="html-viewer design-studio-preview design-studio-preview--media">
                    <audio
                      src={projectRawFileUrl(projectId, activeFile)}
                      controls
                      data-testid="design-studio-audio-preview"
                    />
                  </div>
                ) : (
                  <div
                    className={`html-viewer design-studio-preview${usesDeckCanvas ? ' design-studio-preview--deck' : ''}`}
                    ref={usesDeckCanvas ? deckFrameRef : undefined}
                  >
                    <div className="preview-frame-clip">
                      <iframe
                        ref={previewFrameRef}
                        title="Design preview"
                        sandbox="allow-scripts"
                        srcDoc={previewHtml}
                        style={
                          usesDeckCanvas
                            ? {
                                width: `${DECK_STUDIO_WIDTH}px`,
                                height: `${DECK_STUDIO_HEIGHT}px`,
                              }
                            : undefined
                        }
                        data-testid="design-studio-preview-frame"
                      />
                    </div>
                  </div>
                )
              ) : (
                <pre className="design-studio-code-panel">
                  {fileContent || '<!-- source will appear after generation -->'}
                </pre>
              )}

              <div className="design-studio-slide-nav">
                <button
                  type="button"
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
                  disabled={!usesDeckCanvas || slideState.count === 0 || slideState.active >= slideState.count - 1}
                  onClick={() => postDeckSlideAction(previewFrameRef.current, 'next')}
                  aria-label="Next slide"
                  data-testid="design-studio-slide-next"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
