'use client';

import React, { useEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';

interface StopRunConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export default function StopRunConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
}: StopRunConfirmDialogProps) {
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

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-50 m-auto w-full max-w-md rounded-xl border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/40"
      data-testid="stop-run-confirm-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClose={() => onOpenChange(false)}
    >
      <form
        method="dialog"
        className="flex flex-col gap-4 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
          onOpenChange(false);
        }}
      >
        <div>
          <h2 className="text-base font-semibold text-gray-900">Stop active run?</h2>
          <p className="mt-2 text-sm text-gray-600">
            The runtime will cancel the current task immediately. Partial output may remain in the
            conversation.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            data-testid="stop-run-cancel"
            onClick={() => onOpenChange(false)}
          >
            Continue run
          </Button>
          <Button type="submit" data-testid="stop-run-confirm" className="bg-red-600 hover:bg-red-700">
            Stop run
          </Button>
        </div>
      </form>
    </dialog>
  );
}
