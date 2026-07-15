'use client';

import React from 'react';

import { ChatArtifactProvider } from '../ChatArtifactProvider';
import ContextPanel from '../ContextPanel';
import DesktopCloseGuard from '../DesktopCloseGuard';
import { ContextUsageProvider } from '../ContextUsageProvider';
import { ReaderPreferencesProvider } from '../ReaderPreferencesProvider';
import { RuntimeBrowserProvider } from '../RuntimeBrowserProvider';
import { RuntimeComputerUseProvider } from '../RuntimeComputerUseProvider';
import { RuntimeHubProvider, useRuntimeHub } from '../RuntimeHubProvider';
import { ToolActivityProvider } from '../ToolActivityProvider';
import DesignActivityRail from './DesignActivityRail';
import DesignEmbeddedContent from './DesignEmbeddedContent';
import DesignWorkspaceChrome from './DesignWorkspaceChrome';

import { resolveDesignShellMode } from '@/lib/design-navigation';
import { useDesignRoute } from '@/lib/design-shell-navigation';
import { useShellPathname } from '@/lib/shell-navigation';

import type { PresentationAssets } from '@/lib/ui-branding';

interface DesignShellProps {
  presentationTitle: string;
  brandAssets?: PresentationAssets;
  themePack?: string;
  initialPathname?: string;
  seedArtifactE2e?: boolean;
}

function DesignShellBody({
  presentationTitle,
  brandAssets,
  initialPathname = '/',
  seedArtifactE2e = false,
}: DesignShellProps) {
  const hub = useRuntimeHub();
  const pathname = useShellPathname(initialPathname);
  const route = useDesignRoute(initialPathname);
  const shellMode = resolveDesignShellMode(pathname, route);
  const showContextPanel = shellMode === 'legacy-harness';
  const showWorkspaceChrome = shellMode !== 'studio';
  const gridClass = showContextPanel
    ? 'grid-cols-[56px_minmax(0,1fr)_320px]'
    : 'grid-cols-[56px_minmax(0,1fr)]';

  return (
    <>
      <DesktopCloseGuard activeRunCount={hub.activeRunCount} />
      <div
        className={`grid h-screen min-h-0 w-full ${gridClass} overflow-hidden bg-[var(--bg)] [&>*]:min-h-0`}
        data-testid="design-shell"
        data-shell-mode={shellMode}
      >
        <DesignActivityRail />
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          {showWorkspaceChrome ? <DesignWorkspaceChrome /> : null}
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <DesignEmbeddedContent
              presentationTitle={presentationTitle}
              brandAssets={brandAssets}
              initialPathname={initialPathname}
              seedArtifactE2e={seedArtifactE2e}
              shellMode={shellMode}
            />
          </main>
        </div>
        {showContextPanel ? (
          <aside className="design-context-panel min-h-0 min-w-0 overflow-hidden border-l border-[var(--border)]">
            <ContextPanel />
          </aside>
        ) : null}
      </div>
    </>
  );
}

export default function DesignShell({
  presentationTitle,
  brandAssets,
  themePack: _themePack,
  initialPathname = '/',
  seedArtifactE2e = false,
}: DesignShellProps) {
  return (
    <ReaderPreferencesProvider>
      <RuntimeHubProvider>
        <RuntimeBrowserProvider>
          <RuntimeComputerUseProvider>
            <ContextUsageProvider>
              <ToolActivityProvider>
                <ChatArtifactProvider>
                  <DesignShellBody
                    presentationTitle={presentationTitle}
                    brandAssets={brandAssets}
                    initialPathname={initialPathname}
                    seedArtifactE2e={seedArtifactE2e}
                  />
                </ChatArtifactProvider>
              </ToolActivityProvider>
            </ContextUsageProvider>
          </RuntimeComputerUseProvider>
        </RuntimeBrowserProvider>
      </RuntimeHubProvider>
    </ReaderPreferencesProvider>
  );
}
