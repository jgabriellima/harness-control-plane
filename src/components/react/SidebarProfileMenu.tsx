import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, LogOut, Settings, Sparkles, User } from 'lucide-react';

import { navigateShell } from '@/lib/shell-navigation';

const MENU_WIDTH_PX = 240;
const MENU_GAP_PX = 8;

function computeMenuPosition(
  triggerRect: DOMRect,
  menuWidth: number,
  menuHeight: number,
  placement: 'top' | 'right',
): { left: number; top: number } {
  const padding = MENU_GAP_PX;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = 0;
  let top = 0;

  if (placement === 'right') {
    left = triggerRect.right + MENU_GAP_PX;
    top = triggerRect.top;
    if (left + menuWidth > viewportWidth - padding) {
      left = triggerRect.left - menuWidth - MENU_GAP_PX;
    }
  } else {
    left = triggerRect.left + triggerRect.width / 2 - menuWidth / 2;
    top = triggerRect.top - menuHeight - MENU_GAP_PX;
    if (top < padding) {
      top = triggerRect.bottom + MENU_GAP_PX;
    }
  }

  left = Math.max(padding, Math.min(left, viewportWidth - menuWidth - padding));
  top = Math.max(padding, Math.min(top, viewportHeight - menuHeight - padding));

  return { left, top };
}

function useDismissOnOutside(
  open: boolean,
  onClose: () => void,
  containerRef: React.RefObject<HTMLElement | null>,
  menuRef: React.RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: MouseEvent): void {
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      onClose();
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [containerRef, menuRef, onClose, open]);
}

function MenuItem({
  icon,
  label,
  onClick,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-testid={testId}
      className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
      onClick={onClick}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-gray-500">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

export default function SidebarProfileMenu({
  displayName,
  subtitle,
  initials,
  harnessSpec,
  expanded,
  testId,
}: {
  displayName: string;
  subtitle: string;
  initials: string;
  harnessSpec: string | null;
  expanded: boolean;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);

  useDismissOnOutside(open, () => setOpen(false), containerRef, menuRef);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setMenuPosition(null);
      return;
    }

    function updatePosition(): void {
      const trigger = triggerRef.current;
      if (!trigger) {
        return;
      }
      const triggerRect = trigger.getBoundingClientRect();
      const menuWidth = menuRef.current?.offsetWidth ?? MENU_WIDTH_PX;
      const menuHeight = menuRef.current?.offsetHeight ?? 320;
      setMenuPosition(
        computeMenuPosition(triggerRect, menuWidth, menuHeight, expanded ? 'top' : 'right'),
      );
    }

    updatePosition();
    const frameId = window.requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [expanded, open]);

  const resolvedPosition =
    menuPosition ??
    (open && triggerRef.current
      ? computeMenuPosition(
          triggerRef.current.getBoundingClientRect(),
          MENU_WIDTH_PX,
          320,
          expanded ? 'top' : 'right',
        )
      : null);

  const menu =
    open && resolvedPosition && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            data-testid="sidebar-profile-menu"
            style={{
              position: 'fixed',
              left: resolvedPosition.left,
              top: resolvedPosition.top,
              zIndex: 100,
            }}
            className="w-60 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
          >
            <div className="border-b border-gray-100 px-3 py-3">
              <p className="truncate text-sm font-medium text-gray-900">{displayName}</p>
              <p className="truncate text-xs text-gray-500">{subtitle}</p>
            </div>
            <MenuItem
              icon={<Sparkles className="h-4 w-4" />}
              label="Personalization"
              onClick={() => {
                setOpen(false);
                navigateShell('/settings');
              }}
            />
            <MenuItem
              icon={<User className="h-4 w-4" />}
              label="Profile"
              onClick={() => {
                setOpen(false);
                navigateShell('/settings');
              }}
            />
            <MenuItem
              icon={<Settings className="h-4 w-4" />}
              label="Settings"
              testId="sidebar-profile-settings"
              onClick={() => {
                setOpen(false);
                navigateShell('/settings');
              }}
            />
            <div className="my-1 border-t border-gray-100" />
            <MenuItem
              icon={<HelpCircle className="h-4 w-4" />}
              label="Help"
              onClick={() => {
                setOpen(false);
                window.open('https://github.com/jambu-ai', '_blank', 'noopener,noreferrer');
              }}
            />
            <MenuItem
              icon={<LogOut className="h-4 w-4" />}
              label="Close session"
              onClick={() => {
                setOpen(false);
                navigateShell('/');
              }}
            />
            {harnessSpec ? (
              <p
                className="border-t border-gray-100 px-3 py-2 text-[10px] leading-relaxed text-gray-400"
                data-testid="sidebar-harness-spec"
              >
                {harnessSpec}
              </p>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        data-testid={testId}
        aria-label="Open profile menu"
        aria-expanded={open}
        aria-haspopup="menu"
        className={
          expanded
            ? `flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors ${
                open ? 'bg-gray-100' : 'hover:bg-gray-50'
              }`
            : `flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                open ? 'ring-2 ring-brand-200' : 'hover:bg-gray-100'
              }`
        }
        onClick={() => setOpen((current) => !current)}
      >
        <span
          className={`flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700 ${
            expanded ? 'h-8 w-8 text-xs' : 'h-8 w-8 text-[10px]'
          }`}
        >
          {initials}
        </span>
        {expanded ? (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium uppercase tracking-wide text-gray-900">
              {displayName}
            </span>
            <span className="block truncate text-[10px] text-gray-500">{subtitle}</span>
          </span>
        ) : null}
      </button>
      {menu}
    </div>
  );
}
