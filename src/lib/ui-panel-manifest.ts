import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { resolveHarnessBinding } from './harness-binding';

export type WidgetId = 'attention' | 'jobs' | 'activity' | 'health';

export interface WidgetManifestEntry {
  id: WidgetId;
  visible: boolean;
  order: number;
  height: number;
}

export interface RightPanelManifest {
  version: number;
  collapsed: boolean;
  widgets: WidgetManifestEntry[];
}

const DEFAULT_WIDGETS: WidgetManifestEntry[] = [
  { id: 'attention', visible: true, order: 0, height: 180 },
  { id: 'jobs', visible: true, order: 1, height: 180 },
  { id: 'activity', visible: true, order: 2, height: 220 },
  { id: 'health', visible: true, order: 3, height: 200 },
];

export const DEFAULT_RIGHT_PANEL_MANIFEST: RightPanelManifest = {
  version: 1,
  collapsed: false,
  widgets: DEFAULT_WIDGETS,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isWidgetId(value: unknown): value is WidgetId {
  return value === 'attention' || value === 'jobs' || value === 'activity' || value === 'health';
}

function normalizeWidgetEntry(raw: unknown, fallbackOrder: number): WidgetManifestEntry | null {
  if (!isRecord(raw) || !isWidgetId(raw.id)) {
    return null;
  }

  return {
    id: raw.id,
    visible: typeof raw.visible === 'boolean' ? raw.visible : true,
    order: typeof raw.order === 'number' ? raw.order : fallbackOrder,
    height: typeof raw.height === 'number' && raw.height >= 120 ? raw.height : 180,
  };
}

function normalizeManifest(raw: unknown): RightPanelManifest {
  if (!isRecord(raw)) {
    return DEFAULT_RIGHT_PANEL_MANIFEST;
  }

  const widgetsRaw = Array.isArray(raw.widgets) ? raw.widgets : [];
  const widgets = widgetsRaw
    .map((entry, index) => normalizeWidgetEntry(entry, index))
    .filter((entry): entry is WidgetManifestEntry => entry !== null)
    .sort((left, right) => left.order - right.order);

  const mergedWidgets = DEFAULT_WIDGETS.map((defaultEntry) => {
    const existing = widgets.find((entry) => entry.id === defaultEntry.id);
    return existing ?? defaultEntry;
  });

  return {
    version: typeof raw.version === 'number' ? raw.version : 1,
    collapsed: typeof raw.collapsed === 'boolean' ? raw.collapsed : false,
    widgets: mergedWidgets,
  };
}

async function panelPaths() {
  const binding = await resolveHarnessBinding();
  const uiDir = join(binding.harnessRoot, 'ui');
  return {
    uiDir,
    manifestPath: join(uiDir, 'right-panel.yaml'),
  };
}

export async function readRightPanelManifest(): Promise<RightPanelManifest> {
  const paths = await panelPaths();
  try {
    const raw = await readFile(paths.manifestPath, 'utf8');
    return normalizeManifest(parseYaml(raw));
  } catch {
    await writeRightPanelManifest(DEFAULT_RIGHT_PANEL_MANIFEST);
    return DEFAULT_RIGHT_PANEL_MANIFEST;
  }
}

export async function writeRightPanelManifest(manifest: RightPanelManifest): Promise<RightPanelManifest> {
  const paths = await panelPaths();
  await mkdir(paths.uiDir, { recursive: true });
  const normalized = normalizeManifest(manifest);
  await writeFile(paths.manifestPath, stringifyYaml(normalized), 'utf8');
  return normalized;
}

export async function patchRightPanelManifest(
  patch: Partial<Pick<RightPanelManifest, 'collapsed'>> & {
    widgets?: WidgetManifestEntry[];
  },
): Promise<RightPanelManifest> {
  const current = await readRightPanelManifest();
  return writeRightPanelManifest({
    ...current,
    collapsed: patch.collapsed ?? current.collapsed,
    widgets: patch.widgets ?? current.widgets,
  });
}
