import React from 'react';
import {
  Blocks,
  Calendar,
  Home,
  LayoutGrid,
  Library,
  Link2,
  MessageSquare,
  Palette,
  Play,
  Plus,
  Workflow,
} from 'lucide-react';
import { designPathForView, type DesignView } from '@/lib/design-navigation';
import { navigateDesign, useDesignRoute } from '@/lib/design-shell-navigation';
import { useShellPathname } from '@/lib/shell-navigation';

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

const HARNESS_RAIL_ITEMS: RailItem[] = [
  { view: 'conversations', label: 'Conversations', icon: <MessageSquare className="h-[18px] w-[18px]" strokeWidth={1.75} /> },
  { view: 'library', label: 'Library', icon: <Library className="h-[18px] w-[18px]" strokeWidth={1.75} /> },
  { view: 'executions', label: 'Executions', icon: <Play className="h-[18px] w-[18px]" strokeWidth={1.75} /> },
  { view: 'scheduled', label: 'Scheduled', icon: <Calendar className="h-[18px] w-[18px]" strokeWidth={1.75} /> },
];

function isActiveView(current: DesignView, item: DesignView, pathname: string): boolean {
  if (item === 'home' && (current === 'home' || (current === 'projects' && pathname === '/'))) {
    return true;
  }
  if (item === 'projects' && (current === 'studio' || (current === 'projects' && pathname !== '/'))) {
    return true;
  }
  if (item === 'design-systems' && (current === 'design-system-detail' || current === 'design-system-create')) {
    return true;
  }
  if (item === 'plugins' && current === 'plugin-detail') {
    return true;
  }
  if (item === 'conversations' && current === 'conversation-chat') {
    return true;
  }
  return current === item;
}

function NavButton({
  active,
  label,
  href,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  href: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={`entry-nav-rail__btn${active ? ' is-active' : ''}`}
      title={label}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      data-tooltip={label}
      onClick={(event) => {
        event.preventDefault();
        onClick();
      }}
    >
      {children}
    </a>
  );
}

export default function DesignActivityRail() {
  const route = useDesignRoute();
  const pathname = useShellPathname();

  return (
    <nav
      className="entry-nav-rail is-open"
      aria-label="Primary"
      data-testid="design-activity-rail"
    >
      <div className="entry-nav-rail__group">
        <NavButton
          active={false}
          label="New design project"
          href={designPathForView('home')}
          onClick={() => navigateDesign(designPathForView('home'))}
        >
          <Plus className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </NavButton>

        {RAIL_ITEMS.map((item) => {
          const active = isActiveView(route.view, item.view, pathname);
          return (
            <NavButton
              key={item.view}
              active={active}
              label={item.label}
              href={designPathForView(item.view)}
              onClick={() => navigateDesign(designPathForView(item.view))}
            >
              {item.icon}
            </NavButton>
          );
        })}
      </div>
      <div className="entry-nav-rail__group entry-nav-rail__group--harness" data-testid="design-harness-rail">
        {HARNESS_RAIL_ITEMS.map((item) => {
          const active = isActiveView(route.view, item.view, pathname);
          return (
            <NavButton
              key={item.view}
              active={active}
              label={item.label}
              href={designPathForView(item.view)}
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
