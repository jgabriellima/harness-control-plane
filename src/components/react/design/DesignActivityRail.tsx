import React from 'react';
import {
  Blocks,
  Home,
  LayoutGrid,
  Link2,
  Palette,
  Plus,
  Workflow,
} from 'lucide-react';

import { designPathForView, type DesignView } from '@/lib/design-navigation';
import { navigateDesign, useDesignRoute } from '@/lib/design-shell-navigation';

interface RailItem {
  view: DesignView;
  label: string;
  icon: React.ReactNode;
}

const RAIL_ITEMS: RailItem[] = [
  { view: 'home', label: 'Home', icon: <Home className="h-[18px] w-[18px]" strokeWidth={1.75} /> },
  { view: 'projects', label: 'Projects', icon: <LayoutGrid className="h-[18px] w-[18px]" strokeWidth={1.75} /> },
  { view: 'automations', label: 'Automations', icon: <Workflow className="h-[18px] w-[18px]" strokeWidth={1.75} /> },
  { view: 'design-systems', label: 'Design systems', icon: <Palette className="h-[18px] w-[18px]" strokeWidth={1.75} /> },
  { view: 'plugins', label: 'Plugins', icon: <Blocks className="h-[18px] w-[18px]" strokeWidth={1.75} /> },
  { view: 'integrations', label: 'Integrations', icon: <Link2 className="h-[18px] w-[18px]" strokeWidth={1.75} /> },
];

function isActiveView(current: DesignView, item: DesignView): boolean {
  if (item === 'projects' && current === 'studio') {
    return true;
  }
  if (item === 'design-systems' && current === 'design-system-detail') {
    return true;
  }
  if (item === 'plugins' && current === 'plugin-detail') {
    return true;
  }
  return current === item;
}

function NavButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`entry-nav-rail__btn${active ? ' is-active' : ''}`}
      title={label}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      data-tooltip={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default function DesignActivityRail() {
  const route = useDesignRoute();

  return (
    <nav
      className="entry-nav-rail is-open shrink-0"
      style={{ width: 'var(--entry-rail-width, 56px)' }}
      aria-label="Primary"
      data-testid="design-activity-rail"
    >
      <div className="entry-nav-rail__group">
        <NavButton
          active={false}
          label="New design project"
          onClick={() => navigateDesign(designPathForView('home'))}
        >
          <Plus className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </NavButton>

        {RAIL_ITEMS.map((item) => {
          const active = isActiveView(route.view, item.view);
          return (
            <NavButton
              key={item.view}
              active={active}
              label={item.label}
              onClick={() => navigateDesign(designPathForView(item.view))}
            >
              {item.icon}
            </NavButton>
          );
        })}
      </div>
    </nav>
  );
}
