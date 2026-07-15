import React from 'react';
import {
  Blocks,
  ChevronRight,
  Folder,
  Grid3x3,
  Home,
  Kanban,
  Link2,
  Palette,
  Plus,
  Search,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react';

export type DesignOdIconName =
  | 'home'
  | 'folder'
  | 'grid'
  | 'kanban'
  | 'sparkles'
  | 'palette'
  | 'link'
  | 'plus'
  | 'search'
  | 'close'
  | 'chevron-right';

const ICON_MAP: Record<DesignOdIconName, LucideIcon> = {
  home: Home,
  folder: Folder,
  grid: Grid3x3,
  kanban: Kanban,
  sparkles: Sparkles,
  palette: Palette,
  link: Link2,
  plus: Plus,
  search: Search,
  close: X,
  'chevron-right': ChevronRight,
};

interface DesignOdIconProps {
  name: DesignOdIconName;
  size?: number;
  className?: string;
}

export default function DesignOdIcon({ name, size = 14, className }: DesignOdIconProps) {
  const IconComponent = ICON_MAP[name] ?? Blocks;
  return <IconComponent size={size} strokeWidth={1.75} className={className} aria-hidden />;
}
