'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { fetchActiveRunsIndex } from '@/lib/active-run-sync';
import { isTauriDesktopShell } from '@/lib/runtime-surface';

interface DesktopCloseGuardProps {
  activeRunCount: number;
}

export default function DesktopCloseGuard({ activeRunCount }: DesktopCloseGuardProps) {
  const [open, setOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const closingRef = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
      return;
    }

    if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const confirmClose = useCallback(async (): Promise<void> => {
    closingRef.current = true;
    setOpen(false);

    try {
      await fetch('/api/runtime/shutdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'app_close' }),
      });
    } catch {
      // Proceed with close even if shutdown API fails — sidecar exit will still terminate runs.
    }

    if (isTauriDesktopShell()) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().close();
      return;
    }

    window.close();
  }, []);

  useEffect(() => {
    if (!isTauriDesktopShell()) {
      const handleBeforeUnload = (event: BeforeUnloadEvent): void => {
        if (closingRef.current || activeRunCount <= 0) {
          return;
        }
        event.preventDefault();
        event.returnValue = '';
      };

      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };
    }

    let unlisten: (() => void) | undefined;

    void (async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const appWindow = getCurrentWindow();
      unlisten = await appWindow.onCloseRequested(async (event) => {
        if (closingRef.current) {
          return;
        }

        const indexed = await fetchActiveRunsIndex();
        const count = Math.max(indexed.length, activeRunCount);
        if (count <= 0) {
          return;
        }

        event.preventDefault();
        setPendingCount(count);
        setOpen(true);
      });
    })();

    return () => {
      unlisten?.();
    };
  }, [activeRunCount]);

  if (!open) {
    return null;
  }

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-[100] m-auto w-full max-w-md rounded-xl border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/40"
      data-testid="desktop-close-guard-dialog"
      onCancel={(event) => {
        event.preventDefault();
        setOpen(false);
      }}
      onClose={() => setOpen(false)}
    >
      <form
        method="dialog"
        className="flex flex-col gap-4 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          void confirmClose();
        }}
      >
        <div>
          <h2 className="text-base font-semibold text-gray-900">Active runs in progress</h2>
          <p className="mt-2 text-sm text-gray-600">
            {pendingCount} run{pendingCount === 1 ? '' : 's'} will be interrupted if you close the
            app. Partial output remains in each conversation; you can resume later when that flow is
            available.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            data-testid="desktop-close-cancel"
            onClick={() => setOpen(false)}
          >
            Keep app open
          </Button>
          <Button
            type="submit"
            data-testid="desktop-close-confirm"
            className="bg-red-600 hover:bg-red-700"
          >
            Interrupt and close
          </Button>
        </div>
      </form>
    </dialog>
  );
}
