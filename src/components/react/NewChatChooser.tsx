'use client';

import React from 'react';
import { MessageSquare, Palette, X } from 'lucide-react';

interface NewChatChooserProps {
  open: boolean;
  presentationTitle: string;
  onClose: () => void;
  onHarnessChat: () => void;
  onDesignProject: () => void;
}

export default function NewChatChooser({
  open,
  presentationTitle,
  onClose,
  onHarnessChat,
  onDesignProject,
}: NewChatChooserProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 p-4"
      role="presentation"
      onClick={onClose}
      data-testid="new-chat-chooser-overlay"
    >
      <div
        role="dialog"
        aria-labelledby="new-chat-chooser-title"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
        data-testid="new-chat-chooser"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="new-chat-chooser-title" className="text-base font-semibold text-gray-900">
              Start a new session
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Choose assistant chat or a design project in {presentationTitle}.
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-3">
          <button
            type="button"
            className="flex items-start gap-3 rounded-xl border border-gray-200 px-4 py-3 text-left hover:border-[#6cc9ef] hover:bg-[#eaf7fd]"
            onClick={() => {
              onHarnessChat();
              onClose();
            }}
            data-testid="new-chat-chooser-harness"
          >
            <MessageSquare className="mt-0.5 h-5 w-5 shrink-0 text-[#3aa9d8]" />
            <span>
              <span className="block text-sm font-medium text-gray-900">Assistant chat</span>
              <span className="mt-0.5 block text-xs text-gray-500">
                Full runtime — integrations, runs, library, and scheduled workflows.
              </span>
            </span>
          </button>

          <button
            type="button"
            className="flex items-start gap-3 rounded-xl border border-gray-200 px-4 py-3 text-left hover:border-[#6cc9ef] hover:bg-[#eaf7fd]"
            onClick={() => {
              onDesignProject();
              onClose();
            }}
            data-testid="new-chat-chooser-design"
          >
            <Palette className="mt-0.5 h-5 w-5 shrink-0 text-[#3aa9d8]" />
            <span>
              <span className="block text-sm font-medium text-gray-900">Design project</span>
              <span className="mt-0.5 block text-xs text-gray-500">
                Open Design studio — brief, prototype, deck, or design-system work.
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
