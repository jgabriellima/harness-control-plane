'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels';

import ChatArtifactPanel from '@/components/react/ChatArtifactPanel';
import ContextUsageReportPanel from '@/components/react/ContextUsageReportPanel';
import ToolActivityReportPanel from '@/components/react/ToolActivityReportPanel';
import { useContextUsage } from '@/components/react/ContextUsageProvider';
import { useToolActivity } from '@/components/react/ToolActivityProvider';
import { RuntimeComputerUsePanelSlot, useRuntimeComputerUse } from '@/components/react/RuntimeComputerUseProvider';
import {
  emptyArtifactSelection,
  type ChatArtifactSelection,
} from '@/lib/chat-artifact-types';
import {
  CHAT_ARTIFACT_LAYOUT_DEFAULTS,
  CHAT_ARTIFACT_LAYOUT_GROUP_ID,
  CHAT_ARTIFACT_LAYOUT_MIN,
  CHAT_ARTIFACT_PANEL_IDS,
  sanitizeChatArtifactLayout,
} from '@/lib/chat-artifact-layout';
import { buildWorkspaceFileRawUrl, normalizeArtifactPath } from '@/lib/file-reference';
import { runtimeLogger, errorFields } from '@/lib/runtime-logger';
import { installHcpUiBridge } from '@/lib/runtime-ui-bridge';
import { resolveThreadFileContent } from '@/lib/thread-file-content';
import type { ThreadFileMessage } from '@/lib/thread-file-paths';
import { toUserFacingArtifactErrorMessage } from '@/lib/user-facing-error';

interface ChatArtifactContextValue {
  openArtifact: (filePath: string, projectId?: string) => Promise<void>;
  closeArtifact: () => void;
  selection: ChatArtifactSelection | null;
  setThreadMessages: (messages: ThreadFileMessage[]) => void;
}

const ChatArtifactContext = createContext<ChatArtifactContextValue | null>(null);

function createThreadPreviewUrl(content: string, mime: string): string | null {
  if (mime !== 'text/html') {
    return null;
  }

  return URL.createObjectURL(new Blob([content], { type: 'text/html;charset=utf-8' }));
}

export function ChatArtifactProvider({ children }: { children: React.ReactNode }) {
  const [selection, setSelection] = useState<ChatArtifactSelection | null>(null);
  const threadMessagesRef = useRef<ThreadFileMessage[]>([]);
  const previewBlobUrlRef = useRef<string | null>(null);

  const revokePreviewBlobUrl = useCallback((): void => {
    if (previewBlobUrlRef.current) {
      URL.revokeObjectURL(previewBlobUrlRef.current);
      previewBlobUrlRef.current = null;
    }
  }, []);

  const setThreadMessages = useCallback((messages: ThreadFileMessage[]): void => {
    threadMessagesRef.current = messages;
  }, []);

  const applyThreadFallback = useCallback(
    (normalizedPath: string): boolean => {
      const fallback = resolveThreadFileContent(threadMessagesRef.current, normalizedPath);
      if (!fallback) {
        return false;
      }

      revokePreviewBlobUrl();
      const previewUrl = createThreadPreviewUrl(fallback.content, fallback.mime);
      if (previewUrl) {
        previewBlobUrlRef.current = previewUrl;
      }

      runtimeLogger.info('chat_artifact.thread_fallback', {
        path: normalizedPath,
        mime: fallback.mime,
        bytes: fallback.content.length,
      });

      setSelection({
        path: normalizedPath,
        content: fallback.content,
        mime: fallback.mime,
        size: fallback.content.length,
        loading: false,
        error: null,
        encoding: 'utf8',
        previewUrl,
      });
      return true;
    },
    [revokePreviewBlobUrl],
  );

  const openArtifact = useCallback(async (filePath: string, projectId?: string): Promise<void> => {
    const normalizedPath = normalizeArtifactPath(filePath);
    revokePreviewBlobUrl();
    setSelection(emptyArtifactSelection(normalizedPath));

    const params = new URLSearchParams({ path: normalizedPath });
    const trimmedProjectId = projectId?.trim();
    if (trimmedProjectId) {
      params.set('project_id', trimmedProjectId);
    }

    try {
      const response = await fetch(`/api/workspace/file?${params.toString()}`);
      const payload = (await response.json()) as {
        path?: string;
        content?: string | null;
        mime?: string;
        size?: number;
        encoding?: 'utf8' | 'binary';
        error?: string;
      };

      if (!response.ok) {
        runtimeLogger.warn('chat_artifact.load_failed', {
          path: normalizedPath,
          project_id: trimmedProjectId,
          status: response.status,
          error: payload.error,
        });
        if (applyThreadFallback(normalizedPath)) {
          return;
        }
        setSelection({
          path: normalizedPath,
          content: null,
          mime: 'text/plain',
          loading: false,
          error: toUserFacingArtifactErrorMessage(payload.error),
          encoding: 'utf8',
          previewUrl: null,
          size: 0,
        });
        return;
      }

      const resolvedPath = payload.path ?? normalizedPath;
      const encoding = payload.encoding ?? 'utf8';
      const mime = payload.mime ?? 'text/plain';

      setSelection({
        path: resolvedPath,
        content: payload.content ?? null,
        mime,
        size: payload.size ?? 0,
        loading: false,
        error: null,
        encoding,
        previewUrl: buildWorkspaceFileRawUrl(resolvedPath, trimmedProjectId),
      });
    } catch (loadError) {
      runtimeLogger.warn('chat_artifact.load_error', {
        path: normalizedPath,
        project_id: trimmedProjectId,
        ...errorFields(loadError),
      });
      if (applyThreadFallback(normalizedPath)) {
        return;
      }
      setSelection({
        path: normalizedPath,
        content: null,
        mime: 'text/plain',
        loading: false,
        error: toUserFacingArtifactErrorMessage(loadError),
        encoding: 'utf8',
        previewUrl: null,
        size: 0,
      });
    }
  }, [applyThreadFallback, revokePreviewBlobUrl]);

  const closeArtifact = useCallback((): void => {
    revokePreviewBlobUrl();
    setSelection(null);
  }, [revokePreviewBlobUrl]);

  useEffect(() => {
    return () => {
      revokePreviewBlobUrl();
    };
  }, [revokePreviewBlobUrl]);

  useEffect(() => {
    return installHcpUiBridge({
      openArtifact: (path, projectId) => {
        void openArtifact(path, projectId);
      },
      closeArtifact,
    });
  }, [closeArtifact, openArtifact]);

  // Auto-open artifact from URL query (?artifact-open=path)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const autoOpenPath = params.get('artifact-open');
    if (autoOpenPath) {
      void openArtifact(autoOpenPath);
    }
  }, [openArtifact]);

  const value = useMemo(
    () => ({
      openArtifact,
      closeArtifact,
      selection,
      setThreadMessages,
    }),
    [closeArtifact, openArtifact, selection, setThreadMessages],
  );

  return <ChatArtifactContext.Provider value={value}>{children}</ChatArtifactContext.Provider>;
}

export function useChatArtifact(): ChatArtifactContextValue {
  const context = useContext(ChatArtifactContext);
  if (!context) {
    throw new Error('useChatArtifact must be used within ChatArtifactProvider');
  }
  return context;
}

interface ChatArtifactSplitShellProps {
  children: React.ReactNode;
  enabled?: boolean;
}

function ResizableChatArtifactSplitShell({
  children,
  onClose,
  previewPanel,
}: {
  children: React.ReactNode;
  onClose: () => void;
  previewPanel: React.ReactNode;
}) {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    groupId: CHAT_ARTIFACT_LAYOUT_GROUP_ID,
    panelIds: [CHAT_ARTIFACT_PANEL_IDS.chat, CHAT_ARTIFACT_PANEL_IDS.artifact],
  });

  const resolvedLayout = sanitizeChatArtifactLayout(defaultLayout);

  const handleLayoutChanged = useCallback(
    (layout: Record<string, number>) => {
      onLayoutChanged(sanitizeChatArtifactLayout(layout));
    },
    [onLayoutChanged],
  );

  return (
    <div className="h-full min-h-0 overflow-hidden" data-testid="runtime-console-shell">
      <Group
        id={CHAT_ARTIFACT_LAYOUT_GROUP_ID}
        orientation="horizontal"
        className="h-full min-h-0 overflow-hidden"
        defaultLayout={resolvedLayout}
        onLayoutChanged={handleLayoutChanged}
      >
        <Panel
          id={CHAT_ARTIFACT_PANEL_IDS.chat}
          minSize={`${CHAT_ARTIFACT_LAYOUT_MIN.chat}%`}
          defaultSize={
            resolvedLayout[CHAT_ARTIFACT_PANEL_IDS.chat] ?? CHAT_ARTIFACT_LAYOUT_DEFAULTS.chat
          }
          className="relative min-h-0 min-w-0 overflow-hidden [&>*]:min-h-0"
        >
          {children}
        </Panel>
        <Separator
          id="chat-artifact-resize-handle"
          className="w-1 shrink-0 bg-gray-200 transition-colors hover:bg-gray-300"
        />
        <Panel
          id={CHAT_ARTIFACT_PANEL_IDS.artifact}
          minSize={`${CHAT_ARTIFACT_LAYOUT_MIN.artifact}%`}
          defaultSize={
            resolvedLayout[CHAT_ARTIFACT_PANEL_IDS.artifact] ?? CHAT_ARTIFACT_LAYOUT_DEFAULTS.artifact
          }
          className="relative min-h-0 min-w-0 overflow-hidden [&>*]:h-full [&>*]:min-h-0"
        >
          {previewPanel}
        </Panel>
      </Group>
    </div>
  );
}

export function ChatArtifactSplitShell({ children, enabled = true }: ChatArtifactSplitShellProps) {
  const { selection: artifactSelection, closeArtifact } = useChatArtifact();
  const { selection: computerUseSelection, closePreview } = useRuntimeComputerUse();
  const { selection: contextUsageSelection, closeContextReport } = useContextUsage();
  const { selection: toolActivitySelection, closeToolActivityReport } = useToolActivity();

  const previewMode = computerUseSelection
    ? 'computer-use'
    : artifactSelection
      ? 'artifact'
      : contextUsageSelection
        ? 'context-usage'
        : toolActivitySelection
          ? 'tool-activity'
          : null;

  if (!enabled) {
    return <>{children}</>;
  }

  if (!previewMode) {
    return (
      <div className="h-full min-h-0 overflow-hidden" data-testid="runtime-console-shell">
        {children}
      </div>
    );
  }

  if (previewMode === 'computer-use') {
    return (
      <ResizableChatArtifactSplitShell
        onClose={() => {
          void closePreview();
        }}
        previewPanel={<RuntimeComputerUsePanelSlot />}
      >
        {children}
      </ResizableChatArtifactSplitShell>
    );
  }

  if (previewMode === 'context-usage' && contextUsageSelection) {
    return (
      <ResizableChatArtifactSplitShell
        onClose={closeContextReport}
        previewPanel={
          <ContextUsageReportPanel
            selection={contextUsageSelection}
            onClose={closeContextReport}
          />
        }
      >
        {children}
      </ResizableChatArtifactSplitShell>
    );
  }

  if (previewMode === 'tool-activity' && toolActivitySelection) {
    return (
      <ResizableChatArtifactSplitShell
        onClose={closeToolActivityReport}
        previewPanel={
          <ToolActivityReportPanel
            selection={toolActivitySelection}
            onClose={closeToolActivityReport}
          />
        }
      >
        {children}
      </ResizableChatArtifactSplitShell>
    );
  }

  if (!artifactSelection) {
    return (
      <div className="h-full min-h-0 overflow-hidden" data-testid="runtime-console-shell">
        {children}
      </div>
    );
  }

  return (
    <ResizableChatArtifactSplitShell
      onClose={closeArtifact}
      previewPanel={<ChatArtifactPanel selection={artifactSelection} onClose={closeArtifact} />}
    >
      {children}
    </ResizableChatArtifactSplitShell>
  );
}
