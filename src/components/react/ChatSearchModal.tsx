'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageCircle, Plus, Search, X } from 'lucide-react';

interface ConversationItem {
  id: string;
  title: string;
  updatedAt: string;
}

interface ConversationGroup {
  label: string;
  items: ConversationItem[];
}

interface ChatSearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversations: ConversationItem[];
  activeConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  onNewChat: () => void;
  formatTitle: (conversation: ConversationItem) => string;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function groupConversationsByRecency(
  conversations: ConversationItem[],
): ConversationGroup[] {
  const today = startOfDay(new Date());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const todayItems: ConversationItem[] = [];
  const yesterdayItems: ConversationItem[] = [];
  const olderItems: ConversationItem[] = [];

  for (const conversation of conversations) {
    const updated = startOfDay(new Date(conversation.updatedAt));
    if (updated.getTime() === today.getTime()) {
      todayItems.push(conversation);
    } else if (updated.getTime() === yesterday.getTime()) {
      yesterdayItems.push(conversation);
    } else {
      olderItems.push(conversation);
    }
  }

  const groups: ConversationGroup[] = [];
  if (todayItems.length > 0) {
    groups.push({ label: 'Today', items: todayItems });
  }
  if (yesterdayItems.length > 0) {
    groups.push({ label: 'Yesterday', items: yesterdayItems });
  }
  if (olderItems.length > 0) {
    groups.push({ label: 'Older', items: olderItems });
  }
  return groups;
}

function filterConversations(
  conversations: ConversationItem[],
  query: string,
  formatTitle: (conversation: ConversationItem) => string,
): ConversationItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return conversations;
  }
  return conversations.filter((conversation) =>
    formatTitle(conversation).toLowerCase().includes(normalized),
  );
}

export default function ChatSearchModal({
  open,
  onOpenChange,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  formatTitle,
}: ChatSearchModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');

  const filteredConversations = useMemo(
    () => filterConversations(conversations, query, formatTitle),
    [conversations, formatTitle, query],
  );

  const groupedConversations = useMemo(
    () => groupConversationsByRecency(filteredConversations),
    [filteredConversations],
  );

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const frameId = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onOpenChange(false);
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frameId);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onOpenChange, open]);

  if (!open || typeof document === 'undefined') {
    return null;
  }

  function close(): void {
    onOpenChange(false);
  }

  function handleSelectConversation(conversationId: string): void {
    close();
    onSelectConversation(conversationId);
  }

  function handleNewChat(): void {
    close();
    onNewChat();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center bg-black/40 px-4 pt-[12vh]"
      data-testid="chat-search-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          close();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search chats"
        data-testid="chat-search-modal"
        className="flex max-h-[min(70vh,560px)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            placeholder="Search chats..."
            className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
            onChange={(event) => setQuery(event.target.value)}
            data-testid="chat-search-modal-input"
          />
          <button
            type="button"
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close search"
            data-testid="chat-search-modal-close"
            onClick={close}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-2">
          <button
            type="button"
            className="mx-2 flex w-[calc(100%-1rem)] items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-gray-800 hover:bg-gray-50"
            data-testid="chat-search-modal-new-chat"
            onClick={handleNewChat}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-500">
              <Plus className="h-4 w-4" />
            </span>
            <span>New chat</span>
          </button>

          {groupedConversations.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400">No chats found</p>
          ) : (
            groupedConversations.map((group) => (
              <section key={group.label} className="mt-2">
                <p className="px-4 py-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                  {group.label}
                </p>
                <ul>
                  {group.items.map((conversation) => {
                    const isActive = conversation.id === activeConversationId;
                    return (
                      <li key={conversation.id}>
                        <button
                          type="button"
                          className={`mx-2 flex w-[calc(100%-1rem)] items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                            isActive
                              ? 'bg-gray-100 font-medium text-gray-900'
                              : 'text-gray-700 hover:bg-gray-50'
                          }`}
                          data-testid={`chat-search-modal-item-${conversation.id}`}
                          onClick={() => handleSelectConversation(conversation.id)}
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-500">
                            <MessageCircle className="h-3.5 w-3.5" />
                          </span>
                          <span className="truncate">{formatTitle(conversation)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
