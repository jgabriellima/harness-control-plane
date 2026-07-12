'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import type { ContextUsageSelection } from '@/lib/context-usage-types';
import { registerHcpUiHandlers } from '@/lib/runtime-ui-bridge';

interface ContextUsageContextValue {
  openContextReport: (
    conversationId: string,
    projectId: string,
    title: string | null,
    agentId?: string | null,
  ) => void;
  closeContextReport: () => void;
  selection: ContextUsageSelection | null;
}

const ContextUsageContext = createContext<ContextUsageContextValue | null>(null);

export function ContextUsageProvider({ children }: { children: React.ReactNode }) {
  const [selection, setSelection] = useState<ContextUsageSelection | null>(null);

  const openContextReport = useCallback(
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
        loading: true,
        error: null,
      });
    },
    [],
  );

  const closeContextReport = useCallback((): void => {
    setSelection(null);
  }, []);

  const value = useMemo(
    () => ({
      openContextReport,
      closeContextReport,
      selection,
    }),
    [closeContextReport, openContextReport, selection],
  );

  React.useEffect(() => {
    return registerHcpUiHandlers({
      openContextReport: (conversationId, projectId, title, agentId) => {
        openContextReport(conversationId, projectId ?? 'default', title ?? null, agentId ?? null);
      },
      closeContextReport,
    });
  }, [closeContextReport, openContextReport]);

  return <ContextUsageContext.Provider value={value}>{children}</ContextUsageContext.Provider>;
}

export function useContextUsage(): ContextUsageContextValue {
  const context = useContext(ContextUsageContext);
  if (!context) {
    throw new Error('useContextUsage must be used within ContextUsageProvider');
  }
  return context;
}
