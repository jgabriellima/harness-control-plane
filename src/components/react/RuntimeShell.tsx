'use client';

import React from 'react';

import ChatPane from './ChatPane';
import ChatPaneEmptySlot from './ChatPaneEmptySlot';
import { ChatArtifactProvider, ChatArtifactSplitShell } from './ChatArtifactProvider';
import ContextPanel from './ContextPanel';
import ExecutionsListView from './ExecutionsListView';
import ResizableOrchestrationShell from './ResizableOrchestrationShell';
import SettingsView from './SettingsView';
import { RuntimeBrowserProvider, RuntimeBrowserSplitShell } from './RuntimeBrowserProvider';
import SidebarPanel from './SidebarPanel';
import WorkspaceHeader from './WorkspaceHeader';
import { RuntimeHubProvider, useRuntimeHub } from './RuntimeHubProvider';
import { DRAFT_CONVERSATION_ID, isDraftConversationId } from '@/lib/draft-conversation';
import { conversationIdFromPath, isChatRoute, useShellPathname } from '@/lib/shell-navigation';

function resolveSinglePaneConversationId(
  pathname: string,
  foregroundId: string | null,
  paneIds: string[],
): string {
  const fromPath = conversationIdFromPath(pathname);
  if (fromPath) {
    return fromPath;
  }

  if (pathname === '/') {
    return DRAFT_CONVERSATION_ID;
  }

  if (foregroundId) {
    return foregroundId;
  }

  const paneCandidate = paneIds[0];
  if (paneCandidate && !isDraftConversationId(paneCandidate)) {
    return paneCandidate;
  }

  return DRAFT_CONVERSATION_ID;
}

interface RuntimeShellProps {
  projectName: string;
  initialPathname?: string;
  seedArtifactE2e?: boolean;
  children?: React.ReactNode;
}

function ChatWorkspaceGrid({
  initialPathname,
  seedArtifactE2e = false,
}: {
  initialPathname: string;
  seedArtifactE2e?: boolean;
}) {
  const hub = useRuntimeHub();
  const pathname = useShellPathname(initialPathname);
  const foregroundId =
    hub.foregroundConversationId ?? conversationIdFromPath(pathname);

  const paneIds = hub.paneConversationIds;
  const mode = hub.layoutMode;

  const workspace = (() => {
    if (mode === 'single') {
      const singleId = resolveSinglePaneConversationId(pathname, foregroundId, paneIds);
      return (
        <div className="h-full min-h-0">
          <ChatPane conversationId={singleId} seedArtifactE2e={seedArtifactE2e} />
        </div>
      );
    }

    const count = mode === 'grid-4' ? 4 : 2;
    const cells = Array.from({ length: count }, (_, index) => paneIds[index] ?? '');

    const gridClass =
      mode === 'grid-4'
        ? 'grid h-full min-h-0 grid-cols-2 grid-rows-2 gap-px bg-gray-200'
        : 'grid h-full min-h-0 grid-cols-2 gap-px bg-gray-200';

    return (
      <div className={gridClass} data-testid="chat-workspace-grid">
        {cells.map((paneConversationId, index) => (
          <div key={`pane-${index}`} className="min-h-0 bg-white">
            {paneConversationId ? (
              <ChatPane conversationId={paneConversationId} compact paneIndex={index} />
            ) : (
              <ChatPaneEmptySlot
                paneIndex={index}
                paneLabel={mode === 'split-2' ? (index === 0 ? 'Left pane' : 'Right pane') : `Pane ${index + 1}`}
              />
            )}
          </div>
        ))}
      </div>
    );
  })();

  return (
    <RuntimeBrowserSplitShell>
      <ChatArtifactSplitShell>{workspace}</ChatArtifactSplitShell>
    </RuntimeBrowserSplitShell>
  );
}

function RuntimeShellBody({
  projectName,
  initialPathname = '/',
  seedArtifactE2e = false,
  children,
}: RuntimeShellProps) {
  const pathname = useShellPathname(initialPathname);
  const chatRoute = isChatRoute(pathname);

  const mainContent = (() => {
    if (chatRoute) {
      return <ChatWorkspaceGrid initialPathname={pathname} seedArtifactE2e={seedArtifactE2e} />;
    }
    if (pathname === '/executions') {
      return <ExecutionsListView />;
    }
    if (pathname === '/settings' || pathname.startsWith('/settings/')) {
      return <SettingsView />;
    }
    return children;
  })();

  return (
    <>
      <ResizableOrchestrationShell
        sidebar={<SidebarPanel />}
        main={
          <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-white">
            <WorkspaceHeader projectName={projectName} />
            <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{mainContent}</main>
          </div>
        }
        context={<ContextPanel />}
      />
    </>
  );
}

export default function RuntimeShell({
  projectName,
  initialPathname,
  seedArtifactE2e = false,
  children,
}: RuntimeShellProps) {
  return (
    <RuntimeHubProvider>
      <RuntimeBrowserProvider>
        <ChatArtifactProvider>
          <RuntimeShellBody
            projectName={projectName}
            initialPathname={initialPathname}
            seedArtifactE2e={seedArtifactE2e}
          >
            {children}
          </RuntimeShellBody>
        </ChatArtifactProvider>
      </RuntimeBrowserProvider>
    </RuntimeHubProvider>
  );
}
