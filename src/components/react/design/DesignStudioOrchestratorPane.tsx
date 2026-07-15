'use client';

import React, { useEffect, useState } from 'react';

import ChatPane from '@/components/react/ChatPane';
import { useRuntimeHub } from '@/components/react/RuntimeHubProvider';
import {
  consumeDesignPendingPrompt,
  fetchHarnessWorkspaceContext,
  resolveOrCreateHarnessConversation,
} from '@/lib/design-harness-context';
import type { DesignProjectRecord } from '@/lib/design-api';
import { isOrchestratorWorkspaceProject } from '@/lib/design-runtime-bridge';

interface DesignStudioOrchestratorPaneProps {
  projectId: string;
  projectRecord: DesignProjectRecord;
}

export default function DesignStudioOrchestratorPane({
  projectId,
  projectRecord,
}: DesignStudioOrchestratorPaneProps) {
  const hub = useRuntimeHub();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function linkConversation() {
      try {
        const context = await fetchHarnessWorkspaceContext();
        const resolved = await resolveOrCreateHarnessConversation({
          projectId,
          projectName: projectRecord.name,
          harnessProjectId: context?.harnessProjectId,
          existingConversationId: projectRecord.metadata?.harnessConversationId,
        });
        if (cancelled) {
          return;
        }
        setConversationId(resolved);
        void hub.hydrateConversation(resolved);

        const pendingPrompt = consumeDesignPendingPrompt(projectId);
        if (pendingPrompt && context?.harnessProjectId) {
          void hub.dispatchMessage(resolved, {
            message: pendingPrompt,
            projectId: context.harnessProjectId,
          });
        }
      } catch (linkError) {
        if (!cancelled) {
          setError(linkError instanceof Error ? linkError.message : 'Failed to link harness conversation');
        }
      }
    }

    void linkConversation();
    return () => {
      cancelled = true;
    };
  }, [hub, projectId, projectRecord.metadata?.harnessConversationId, projectRecord.name]);

  if (error) {
    return (
      <p className="px-4 py-3 text-[12px] text-[var(--red)]" data-testid="design-studio-orchestrator-error">
        {error}
      </p>
    );
  }

  if (!conversationId) {
    return (
      <p className="px-4 py-3 text-[13px] text-[var(--text-muted)]" data-testid="design-studio-orchestrator-loading">
        Linking orchestration session…
      </p>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="design-studio-orchestrator-pane">
      <ChatPane conversationId={conversationId} compact />
    </div>
  );
}

export function shouldUseOrchestratorPane(project: DesignProjectRecord | null): boolean {
  return project !== null && isOrchestratorWorkspaceProject(project);
}
