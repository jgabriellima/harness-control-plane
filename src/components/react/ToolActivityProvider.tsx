'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { registerHcpUiHandlers } from '@/lib/runtime-ui-bridge';

export interface ToolActivitySelection {
  conversationId: string;
  projectId: string;
  agentId: string | null;
  title: string | null;
}

interface ToolActivityContextValue {
  openToolActivityReport: (
    conversationId: string,
    projectId: string,
    title: string | null,
    agentId?: string | null,
  ) => void;
  closeToolActivityReport: () => void;
  selection: ToolActivitySelection | null;
}

const ToolActivityContext = createContext<ToolActivityContextValue | null>(null);

export function ToolActivityProvider({ children }: { children: React.ReactNode }) {
  const [selection, setSelection] = useState<ToolActivitySelection | null>(null);

  const openToolActivityReport = useCallback(
    (
      conversationId: string,
      projectId: string,
      title: string | null,
      agentId: string | null = null,
    ): void => {
      setSelection({
        conversationId,
        projectId,
        agentId,
        title,
      });
    },
    [],
  );

  const closeToolActivityReport = useCallback((): void => {
    setSelection(null);
  }, []);

  const value = useMemo(
    () => ({
      openToolActivityReport,
      closeToolActivityReport,
      selection,
    }),
    [closeToolActivityReport, openToolActivityReport, selection],
  );

  React.useEffect(() => {
    return registerHcpUiHandlers({
      openToolActivityReport: (conversationId, projectId, title, agentId) => {
        openToolActivityReport(conversationId, projectId ?? 'default', title ?? null, agentId ?? null);
      },
      closeToolActivityReport,
    });
  }, [closeToolActivityReport, openToolActivityReport]);

  return <ToolActivityContext.Provider value={value}>{children}</ToolActivityContext.Provider>;
}

export function useToolActivity(): ToolActivityContextValue {
  const context = useContext(ToolActivityContext);
  if (!context) {
    throw new Error('useToolActivity must be used within ToolActivityProvider');
  }
  return context;
}
