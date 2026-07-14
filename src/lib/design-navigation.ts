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
  | 'integrations';

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
}

export function designPathForView(
  view: DesignView,
  options?: {
    projectId?: string;
    designSystemId?: string;
    pluginId?: string;
  },
): string {
  switch (view) {
    case 'home':
      return '/design';
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
    default:
      return '/design';
  }
}

export function parseDesignRoute(pathname: string): ParsedDesignRoute {
  if (pathname === '/design' || pathname === '/design/') {
    return { view: 'home', projectId: null, designSystemId: null, pluginId: null };
  }
  if (pathname === '/design/projects') {
    return { view: 'projects', projectId: null, designSystemId: null, pluginId: null };
  }
  if (pathname.startsWith('/design/projects/')) {
    const projectId = decodeURIComponent(
      pathname.slice('/design/projects/'.length).split('/')[0] ?? '',
    );
    return {
      view: 'studio',
      projectId: projectId || null,
      designSystemId: null,
      pluginId: null,
    };
  }
  if (pathname === '/design/automations' || pathname === '/design/tasks') {
    return { view: 'automations', projectId: null, designSystemId: null, pluginId: null };
  }
  if (pathname === '/design/plugins' || pathname === '/design/marketplace') {
    return { view: 'plugins', projectId: null, designSystemId: null, pluginId: null };
  }
  if (pathname.startsWith('/design/plugins/')) {
    const pluginId = decodeURIComponent(pathname.slice('/design/plugins/'.length).split('/')[0] ?? '');
    return {
      view: 'plugin-detail',
      projectId: null,
      designSystemId: null,
      pluginId: pluginId || null,
    };
  }
  if (pathname === '/design/design-systems') {
    return { view: 'design-systems', projectId: null, designSystemId: null, pluginId: null };
  }
  if (pathname === '/design/design-systems/create') {
    return { view: 'design-system-create', projectId: null, designSystemId: null, pluginId: null };
  }
  if (pathname.startsWith('/design/design-systems/')) {
    const designSystemId = decodeURIComponent(
      pathname.slice('/design/design-systems/'.length).split('/')[0] ?? '',
    );
    return {
      view: 'design-system-detail',
      projectId: null,
      designSystemId: designSystemId || null,
      pluginId: null,
    };
  }
  if (pathname === '/design/integrations') {
    return { view: 'integrations', projectId: null, designSystemId: null, pluginId: null };
  }
  return { view: 'home', projectId: null, designSystemId: null, pluginId: null };
}
