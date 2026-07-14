'use client';

import React from 'react';

import DesignActivityRail from './DesignActivityRail';
import DesignHomeView from './DesignHomeView';
import DesignStudioView from './DesignStudioView';
import DesignAutomationsView from './DesignAutomationsView';
import DesignPluginsView from './DesignPluginsView';
import DesignPluginDetailView from './DesignPluginDetailView';
import DesignSystemsView from './DesignSystemsView';
import DesignSystemCreateView from './DesignSystemCreateView';
import DesignSystemDetailView from './DesignSystemDetailView';
import DesignIntegrationsView from './DesignIntegrationsView';
import { useDesignRoute } from '@/lib/design-shell-navigation';

interface DesignShellProps {
  presentationTitle: string;
  initialPathname?: string;
}

function DesignMainView({
  presentationTitle,
  initialPathname,
}: {
  presentationTitle: string;
  initialPathname: string;
}) {
  const route = useDesignRoute(initialPathname);

  switch (route.view) {
    case 'home':
      return <DesignHomeView presentationTitle={presentationTitle} />;
    case 'studio':
      return route.projectId ? (
        <DesignStudioView projectId={route.projectId} />
      ) : (
        <DesignHomeView presentationTitle={presentationTitle} />
      );
    case 'automations':
      return <DesignAutomationsView />;
    case 'plugins':
      return <DesignPluginsView />;
    case 'plugin-detail':
      return route.pluginId ? (
        <DesignPluginDetailView pluginId={route.pluginId} />
      ) : (
        <DesignPluginsView />
      );
    case 'design-systems':
      return <DesignSystemsView />;
    case 'design-system-create':
      return <DesignSystemCreateView />;
    case 'design-system-detail':
      return route.designSystemId ? (
        <DesignSystemDetailView designSystemId={route.designSystemId} />
      ) : (
        <DesignSystemsView />
      );
    case 'integrations':
      return <DesignIntegrationsView />;
    case 'projects':
    default:
      return <DesignHomeView presentationTitle={presentationTitle} />;
  }
}

export default function DesignShell({ presentationTitle, initialPathname = '/design' }: DesignShellProps) {
  return (
    <div className="flex h-screen min-h-0 w-full overflow-hidden bg-[var(--bg)]" data-testid="design-shell">
      <DesignActivityRail />
      <div className="flex min-w-0 flex-1 flex-col">
        <DesignMainView presentationTitle={presentationTitle} initialPathname={initialPathname} />
      </div>
    </div>
  );
}
