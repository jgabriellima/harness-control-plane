'use client';

import React from 'react';

import ChatPane from '@/components/react/ChatPane';
import DashboardView from '@/components/react/DashboardView';
import ExecutionsListView from '@/components/react/ExecutionsListView';
import ExecutionView from '@/components/react/ExecutionView';
import LibraryView from '@/components/react/LibraryView';
import ProjectDetailView from '@/components/react/ProjectDetailView';
import ProjectsListView from '@/components/react/ProjectsListView';
import ScheduledView from '@/components/react/ScheduledView';
import SettingsView from '@/components/react/SettingsView';
import ArtifactView from '@/components/react/ArtifactView';
import WorkflowView from '@/components/react/WorkflowView';
import DesignAutomationsView from './DesignAutomationsView';
import DesignConversationsView from './DesignConversationsView';
import DesignEntryTopBar from './DesignEntryTopBar';
import DesignHarnessSurface from './DesignHarnessSurface';
import DesignHomeView from './DesignHomeView';
import DesignIntegrationsView from './DesignIntegrationsView';
import DesignPluginDetailView from './DesignPluginDetailView';
import DesignPluginsView from './DesignPluginsView';
import DesignStudioView from './DesignStudioView';
import DesignSystemCreateView from './DesignSystemCreateView';
import DesignSystemDetailView from './DesignSystemDetailView';
import DesignSystemsView from './DesignSystemsView';
import { useDesignRoute } from '@/lib/design-navigation-hook';
import type { DesignShellMode } from '@/lib/design-navigation';
import { useShellPathname } from '@/lib/shell-navigation';
import type { DesignView } from '@/lib/design-navigation';

import type { PresentationAssets } from '@/lib/ui-branding';

interface DesignEmbeddedContentProps {
  presentationTitle: string;
  brandAssets?: PresentationAssets;
  initialPathname?: string;
  seedArtifactE2e?: boolean;
  shellMode?: DesignShellMode;
}

const CATALOG_VIEWS = new Set<DesignView>([
  'home',
  'projects',
  'automations',
  'plugins',
  'plugin-detail',
  'design-systems',
  'design-system-create',
  'design-system-detail',
  'integrations',
]);

const HARNESS_VIEWS = new Set<DesignView>([
  'conversations',
  'library',
  'executions',
  'scheduled',
  'conversation-chat',
  'settings',
  'dashboard',
  'execution-detail',
  'workflow-detail',
  'artifact-detail',
  'legacy-projects',
  'legacy-project-detail',
]);

const HARNESS_SURFACE_VIEWS = new Set<DesignView>([
  'library',
  'executions',
  'scheduled',
  'conversation-chat',
  'settings',
  'dashboard',
  'execution-detail',
  'workflow-detail',
  'artifact-detail',
  'legacy-projects',
  'legacy-project-detail',
]);

function isCatalogView(view: DesignView): boolean {
  return CATALOG_VIEWS.has(view);
}

function isHarnessView(view: DesignView): boolean {
  return HARNESS_VIEWS.has(view);
}

function usesHarnessSurface(view: DesignView): boolean {
  return HARNESS_SURFACE_VIEWS.has(view);
}

export default function DesignEmbeddedContent({
  presentationTitle,
  brandAssets,
  initialPathname = '/',
  seedArtifactE2e = false,
  shellMode = 'design',
}: DesignEmbeddedContentProps) {
  const pathname = useShellPathname(initialPathname);
  const route = useDesignRoute(initialPathname);

  let content: React.ReactNode;
  switch (route.view) {
    case 'home':
    case 'projects':
      content = <DesignHomeView presentationTitle={presentationTitle} brandAssets={brandAssets} />;
      break;
    case 'studio':
      content = route.projectId ? (
        <DesignStudioView projectId={route.projectId} />
      ) : (
        <DesignHomeView presentationTitle={presentationTitle} brandAssets={brandAssets} />
      );
      break;
    case 'automations':
      content = <DesignAutomationsView />;
      break;
    case 'plugins':
      content = <DesignPluginsView />;
      break;
    case 'plugin-detail':
      content = route.pluginId ? (
        <DesignPluginDetailView pluginId={route.pluginId} />
      ) : (
        <DesignPluginsView />
      );
      break;
    case 'design-systems':
      content = <DesignSystemsView />;
      break;
    case 'design-system-create':
      content = <DesignSystemCreateView />;
      break;
    case 'design-system-detail':
      content = route.designSystemId ? (
        <DesignSystemDetailView designSystemId={route.designSystemId} />
      ) : (
        <DesignSystemsView />
      );
      break;
    case 'integrations':
      content = <DesignIntegrationsView />;
      break;
    case 'conversations':
      content = <DesignConversationsView />;
      break;
    case 'conversation-chat': {
      const conversationId = route.conversationId;
      content = conversationId ? (
        <ChatPane conversationId={conversationId} seedArtifactE2e={seedArtifactE2e} />
      ) : (
        <DesignConversationsView />
      );
      break;
    }
    case 'library':
      content = <LibraryView />;
      break;
    case 'executions':
      content = <ExecutionsListView />;
      break;
    case 'scheduled':
      content = <ScheduledView />;
      break;
    case 'settings':
      content = <SettingsView />;
      break;
    case 'dashboard':
      content = <DashboardView />;
      break;
    case 'execution-detail':
      content = route.executionId ? (
        <ExecutionView executionId={route.executionId} />
      ) : (
        <ExecutionsListView />
      );
      break;
    case 'workflow-detail':
      content = route.workflowId ? <WorkflowView workflowId={route.workflowId} /> : null;
      break;
    case 'artifact-detail':
      content = route.artifactId ? <ArtifactView artifactId={route.artifactId} /> : null;
      break;
    case 'legacy-projects':
      content = <ProjectsListView />;
      break;
    case 'legacy-project-detail':
      content = route.harnessProjectId ? (
        <ProjectDetailView projectId={route.harnessProjectId} />
      ) : (
        <ProjectsListView />
      );
      break;
    default:
      content = <DesignHomeView presentationTitle={presentationTitle} brandAssets={brandAssets} />;
      break;
  }

  if (shellMode === 'studio' || route.view === 'studio') {
    return (
      <div
        className="design-embedded design-embedded--full-bleed h-full min-h-0 w-full overflow-hidden"
        data-testid="design-embedded-content"
        data-pathname={pathname}
        data-view={route.view}
      >
        {content}
      </div>
    );
  }

  const catalog = isCatalogView(route.view);
  const harness = isHarnessView(route.view);
  const embeddedClass = catalog
    ? 'design-embedded design-embedded--catalog'
    : 'design-embedded design-embedded--harness';
  const wrappedContent = usesHarnessSurface(route.view) ? (
    <DesignHarnessSurface>{content}</DesignHarnessSurface>
  ) : (
    content
  );

  if (!catalog && !harness) {
    return (
      <div
        className="design-embedded design-embedded--full-bleed h-full min-h-0 w-full overflow-hidden"
        data-testid="design-embedded-content"
        data-pathname={pathname}
        data-view={route.view}
      >
        {content}
      </div>
    );
  }

  return (
    <div
      className="entry-shell entry-shell--no-header h-full min-h-0 w-full overflow-hidden"
      data-testid="design-embedded-content"
      data-pathname={pathname}
      data-view={route.view}
    >
      <div className="entry entry--rail-open h-full min-h-0">
        <div className="entry-main entry-main--scroll">
          <DesignEntryTopBar />
          <div className="entry-main__inner">
            <div className={`${embeddedClass} min-h-0 flex-1 overflow-hidden`}>
              {wrappedContent}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
