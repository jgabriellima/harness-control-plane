'use client';

import React from 'react';

import ChatPane from './ChatPane';
import { ChatArtifactProvider, ChatArtifactSplitShell } from './ChatArtifactProvider';
import ContextPanel from './ContextPanel';
import LayoutGridController from './LayoutGridController';
import SidebarPanel from './SidebarPanel';
import WorkspaceHeader from './WorkspaceHeader';
import { RuntimeHubProvider, useRuntimeHub } from './RuntimeHubProvider';

interface RuntimeShellProps {
  projectName: string;
  initialPathname?: string;
  seedArtifactE2e?: boolean;
  children?: React.ReactNode;
}

function conversationIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/conversation\/([^/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function isChatRoute(pathname: string): boolean {
  return pathname === '/' || pathname.startsWith('/conversation/');
}

function ChatWorkspaceGrid({
  initialPathname,
  seedArtifactE2e = false,
}: {
  initialPathname: string;
  seedArtifactE2e?: boolean;
}) {
  const hub = useRuntimeHub();
  const pathname =
    typeof window !== 'undefined' ? window.location.pathname : initialPathname;
  const foregroundId =
    hub.foregroundConversationId ?? conversationIdFromPath(pathname);

  const paneIds = hub.paneConversationIds;
  const mode = hub.layoutMode;

  const workspace = (() => {
    if (mode === 'single') {
      const singleId = foregroundId ?? paneIds[0] ?? null;
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
              <ChatPane conversationId={paneConversationId} compact />
            ) : (
              <div
                className="flex h-full items-center justify-center px-4 text-center text-sm text-gray-500"
                data-testid="chat-pane-picker"
              >
                Select a conversation from the sidebar to open this pane.
              </div>
            )}
          </div>
        ))}
      </div>
    );
  })();

  return <ChatArtifactSplitShell>{workspace}</ChatArtifactSplitShell>;
}

function RuntimeShellBody({
  projectName,
  initialPathname = '/',
  seedArtifactE2e = false,
  children,
}: RuntimeShellProps) {
  const pathname =
    typeof window !== 'undefined' ? window.location.pathname : initialPathname;
  const chatRoute = isChatRoute(pathname);

  return (
    <>
      <LayoutGridController />
      <div
        id="orchestration-grid"
        className="orchestration-grid grid h-screen grid-cols-[280px_minmax(0,1fr)_320px] overflow-hidden [&>*]:min-h-0"
        data-testid="orchestration-layout"
      >
      <SidebarPanel />

      <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-white">
        <WorkspaceHeader projectName={projectName} />

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {chatRoute ? (
            <ChatWorkspaceGrid initialPathname={pathname} seedArtifactE2e={seedArtifactE2e} />
          ) : (
            children
          )}
        </main>
      </div>

      <ContextPanel />
      </div>
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
      <ChatArtifactProvider>
        <RuntimeShellBody
          projectName={projectName}
          initialPathname={initialPathname}
          seedArtifactE2e={seedArtifactE2e}
        >
          {children}
        </RuntimeShellBody>
      </ChatArtifactProvider>
    </RuntimeHubProvider>
  );
}
