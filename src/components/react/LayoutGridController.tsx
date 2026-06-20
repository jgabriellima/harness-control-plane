import { useEffect } from 'react';

import { panelLayoutStore, usePanelCollapsed } from '../../lib/panel-layout-store';

const GRID_ID = 'orchestration-grid';

export default function LayoutGridController() {
  const collapsed = usePanelCollapsed();

  useEffect(() => {
    void panelLayoutStore.loadManifest().catch(() => undefined);
  }, []);

  useEffect(() => {
    const grid = document.getElementById(GRID_ID);
    if (!grid) {
      return;
    }

    grid.dataset.panelCollapsed = collapsed ? 'true' : 'false';
    grid.classList.toggle('panel-collapsed', collapsed);
  }, [collapsed]);

  return null;
}
