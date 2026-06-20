'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import ChatArtifactPanel from '@/components/react/ChatArtifactPanel';
import {
  emptyArtifactSelection,
  type ChatArtifactSelection,
} from '@/lib/chat-artifact-types';

interface ChatArtifactContextValue {
  openArtifact: (filePath: string) => Promise<void>;
  closeArtifact: () => void;
  selection: ChatArtifactSelection | null;
}

const ChatArtifactContext = createContext<ChatArtifactContextValue | null>(null);

export function ChatArtifactProvider({ children }: { children: React.ReactNode }) {
  const [selection, setSelection] = useState<ChatArtifactSelection | null>(null);

  const openArtifact = useCallback(async (filePath: string): Promise<void> => {
    setSelection(emptyArtifactSelection(filePath));

    try {
      const response = await fetch(`/api/workspace/file?path=${encodeURIComponent(filePath)}`);
      const payload = (await response.json()) as {
        path?: string;
        content?: string;
        mime?: string;
        error?: string;
      };

      if (!response.ok) {
        setSelection({
          path: filePath,
          content: null,
          mime: 'text/plain',
          loading: false,
          error: payload.error ?? 'Failed to load file',
        });
        return;
      }

      setSelection({
        path: payload.path ?? filePath,
        content: payload.content ?? null,
        mime: payload.mime ?? 'text/plain',
        loading: false,
        error: null,
      });
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Failed to load file';
      setSelection({
        path: filePath,
        content: null,
        mime: 'text/plain',
        loading: false,
        error: message,
      });
    }
  }, []);

  const closeArtifact = useCallback((): void => {
    setSelection(null);
  }, []);

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
    }),
    [closeArtifact, openArtifact, selection],
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

export function ChatArtifactSplitShell({ children, enabled = true }: ChatArtifactSplitShellProps) {
  const { selection, closeArtifact } = useChatArtifact();
  const artifactPanelOpen = selection !== null;

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <div
      className={`grid h-full min-h-0 overflow-hidden ${
        artifactPanelOpen ? 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)]' : 'grid-cols-1'
      }`}
      data-testid="runtime-console-shell"
    >
      {children}
      {selection ? (
        <ChatArtifactPanel selection={selection} onClose={closeArtifact} />
      ) : null}
    </div>
  );
}
