export type DesignView =
  | 'home'
  | 'projects'
  | 'studio'
  | 'automations'
  | 'plugins'
  | 'plugin-detail'
  | 'design-systems'
  | 'design-system-create'
  | 'design-system-detail'
  | 'integrations'
  | 'conversations'
  | 'conversation-chat'
  | 'library'
  | 'executions'
  | 'scheduled'
  | 'settings'
  | 'dashboard'
  | 'execution-detail'
  | 'workflow-detail'
  | 'artifact-detail'
  | 'legacy-projects'
  | 'legacy-project-detail';

export interface DesignSkillChip {
  id: string;
  label: string;
  mode: 'prototype' | 'live-artifact' | 'deck' | 'image' | 'video' | 'hyperframes' | 'audio';
}

export const DESIGN_SKILL_CHIPS: DesignSkillChip[] = [
  { id: 'web-prototype', label: 'Prototype', mode: 'prototype' },
  { id: 'live-dashboard', label: 'Live artifact', mode: 'live-artifact' },
  { id: 'guizang-ppt', label: 'Slide deck', mode: 'deck' },
  { id: 'od-media-generation', label: 'Image', mode: 'image' },
  { id: 'hyperframes', label: 'Video', mode: 'video' },
  { id: 'hyperframes-motion', label: 'HyperFrames', mode: 'hyperframes' },
  { id: 'audio-generation', label: 'Audio', mode: 'audio' },
];

export interface DesignProjectSummary {
  id: string;
  name: string;
  kind: string;
  updatedAt: string;
}

export interface ParsedDesignRoute {
  view: DesignView;
  projectId: string | null;
  designSystemId: string | null;
  pluginId: string | null;
  conversationId: string | null;
  executionId: string | null;
  workflowId: string | null;
  artifactId: string | null;
  harnessProjectId: string | null;
}

export type DesignShellMode = 'studio' | 'design' | 'legacy-harness';

/** Layout mode for DesignShell grid chrome (rail + content vs rail + content + context). */
export function resolveDesignShellMode(pathname: string, route: ParsedDesignRoute): DesignShellMode {
  if (route.view === 'studio') {
    return 'studio';
  }
  if (pathname === '/' || pathname.startsWith('/design')) {
    return 'design';
  }
  return 'legacy-harness';
}

export function designPathForView(
  view: DesignView,
  options?: {
    projectId?: string;
    designSystemId?: string;
    conversationId?: string;
  },
): string {
  switch (view) {
    case 'home':
      return '/';
    case 'projects':
      return '/design/projects';
    case 'studio':
      return options?.projectId
        ? `/design/projects/${encodeURIComponent(options.projectId)}`
        : '/design/projects';
    case 'automations':
      return '/design/automations';
    case 'plugins':
      return '/design/plugins';
    case 'plugin-detail':
      return options?.pluginId
        ? `/design/plugins/${encodeURIComponent(options.pluginId)}`
        : '/design/plugins';
    case 'design-systems':
      return '/design/design-systems';
    case 'design-system-create':
      return '/design/design-systems/create';
    case 'design-system-detail':
      return options?.designSystemId
        ? `/design/design-systems/${encodeURIComponent(options.designSystemId)}`
        : '/design/design-systems';
    case 'integrations':
      return '/design/integrations';
    case 'conversations':
      return '/design/conversations';
    case 'conversation-chat':
      return options?.conversationId
        ? `/design/conversation/${encodeURIComponent(options.conversationId)}`
        : '/design/conversations';
    case 'library':
      return '/design/library';
    case 'executions':
      return '/design/executions';
    case 'scheduled':
      return '/design/scheduled';
    default:
      return '/';
  }
}

function emptyRouteIds(): Omit<ParsedDesignRoute, 'view'> {
  return {
    projectId: null,
    designSystemId: null,
    pluginId: null,
    conversationId: null,
    executionId: null,
    workflowId: null,
    artifactId: null,
    harnessProjectId: null,
  };
}

export function parseDesignRoute(pathname: string): ParsedDesignRoute {
  const emptyIds = emptyRouteIds();

  if (pathname === '/') {
    return { view: 'projects', ...emptyIds };
  }
  if (pathname.startsWith('/conversation/')) {
    const conversationId = decodeURIComponent(
      pathname.slice('/conversation/'.length).split('/')[0] ?? '',
    );
    return {
      view: 'conversation-chat',
      ...emptyIds,
      conversationId: conversationId || null,
    };
  }
  if (pathname === '/library' || pathname.startsWith('/library/')) {
    return { view: 'library', ...emptyIds };
  }
  if (pathname === '/executions') {
    return { view: 'executions', ...emptyIds };
  }
  if (pathname.startsWith('/execution/')) {
    const executionId = decodeURIComponent(pathname.slice('/execution/'.length).split('/')[0] ?? '');
    return {
      view: 'execution-detail',
      ...emptyIds,
      executionId: executionId || null,
    };
  }
  if (pathname === '/scheduled') {
    return { view: 'scheduled', ...emptyIds };
  }
  if (pathname === '/settings' || pathname.startsWith('/settings/')) {
    return { view: 'settings', ...emptyIds };
  }
  if (pathname === '/dashboard') {
    return { view: 'dashboard', ...emptyIds };
  }
  if (pathname === '/projects') {
    return { view: 'legacy-projects', ...emptyIds };
  }
  if (pathname.startsWith('/project/')) {
    const harnessProjectId = decodeURIComponent(pathname.slice('/project/'.length).split('/')[0] ?? '');
    return {
      view: 'legacy-project-detail',
      ...emptyIds,
      harnessProjectId: harnessProjectId || null,
    };
  }
  if (pathname.startsWith('/workflow/')) {
    const workflowId = decodeURIComponent(pathname.slice('/workflow/'.length).split('/')[0] ?? '');
    return {
      view: 'workflow-detail',
      ...emptyIds,
      workflowId: workflowId || null,
    };
  }
  if (pathname.startsWith('/artifact/')) {
    const artifactId = decodeURIComponent(pathname.slice('/artifact/'.length).split('/')[0] ?? '');
    return {
      view: 'artifact-detail',
      ...emptyIds,
      artifactId: artifactId || null,
    };
  }

  if (pathname === '/design' || pathname === '/design/') {
    return { view: 'home', ...emptyIds };
  }
  if (pathname === '/design/projects') {
    return { view: 'projects', ...emptyIds };
  }
  if (pathname.startsWith('/design/projects/')) {
    const projectId = decodeURIComponent(
      pathname.slice('/design/projects/'.length).split('/')[0] ?? '',
    );
    return {
      view: 'studio',
      ...emptyIds,
      projectId: projectId || null,
    };
  }
  if (pathname === '/design/automations' || pathname === '/design/tasks') {
    return { view: 'automations', ...emptyIds };
  }
  if (pathname === '/design/plugins' || pathname === '/design/marketplace') {
    return { view: 'plugins', ...emptyIds };
  }
  if (pathname.startsWith('/design/plugins/')) {
    const pluginId = decodeURIComponent(pathname.slice('/design/plugins/'.length).split('/')[0] ?? '');
    return {
      view: 'plugin-detail',
      ...emptyIds,
      pluginId: pluginId || null,
    };
  }
  if (pathname === '/design/design-systems') {
    return { view: 'design-systems', ...emptyIds };
  }
  if (pathname === '/design/design-systems/create') {
    return { view: 'design-system-create', ...emptyIds };
  }
  if (pathname.startsWith('/design/design-systems/')) {
    const designSystemId = decodeURIComponent(
      pathname.slice('/design/design-systems/'.length).split('/')[0] ?? '',
    );
    return {
      view: 'design-system-detail',
      ...emptyIds,
      designSystemId: designSystemId || null,
    };
  }
  if (pathname === '/design/integrations') {
    return { view: 'integrations', ...emptyIds };
  }
  if (pathname === '/design/conversations') {
    return { view: 'conversations', ...emptyIds };
  }
  if (pathname.startsWith('/design/conversation/')) {
    const conversationId = decodeURIComponent(
      pathname.slice('/design/conversation/'.length).split('/')[0] ?? '',
    );
    return {
      view: 'conversation-chat',
      ...emptyIds,
      conversationId: conversationId || null,
    };
  }
  if (pathname === '/design/library' || pathname.startsWith('/design/library/')) {
    return { view: 'library', ...emptyIds };
  }
  if (pathname === '/design/executions' || pathname.startsWith('/design/execution/')) {
    return { view: 'executions', ...emptyIds };
  }
  if (pathname === '/design/scheduled') {
    return { view: 'scheduled', ...emptyIds };
  }
  return { view: 'home', ...emptyIds };
}
