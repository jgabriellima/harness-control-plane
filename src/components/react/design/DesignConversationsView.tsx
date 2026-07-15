'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, MessageSquare } from 'lucide-react';

import { useRuntimeHub } from '@/components/react/RuntimeHubProvider';
import { navigateDesign } from '@/lib/design-shell-navigation';
import { designPathForView } from '@/lib/design-navigation';
import DesignHarnessPageHeader from './DesignHarnessPageHeader';

interface ConversationSummary {
  id: string;
  title?: string;
  updated_at?: string;
}

function formatTitle(conversation: ConversationSummary): string {
  const raw = conversation.title?.trim();
  if (raw) {
    return raw;
  }
  return `Chat ${conversation.id.slice(0, 8)}`;
}

export default function DesignConversationsView() {
  const hub = useRuntimeHub();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch('/api/conversations');
        if (!response.ok) {
          throw new Error('Failed to load conversations');
        }
        const payload = (await response.json()) as { conversations: ConversationSummary[] };
        if (!cancelled) {
          setConversations(payload.conversations ?? []);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load conversations');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="harness-conversations-view" data-testid="design-conversations-view">
      <DesignHarnessPageHeader
        title="Conversations"
        description="Assistant conversations in Tailwind studio"
      />

      <div className="harness-conversations-view__body">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading conversations…
          </div>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : conversations.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No conversations yet.</p>
        ) : (
          <ul className="space-y-1">
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-[var(--bg-subtle)]"
                  onClick={() => {
                    hub.navigateToConversation(conversation.id);
                    navigateDesign(
                      designPathForView('conversation-chat', { conversationId: conversation.id }),
                    );
                  }}
                  data-testid="design-conversation-row"
                >
                  <MessageSquare className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text)]">
                    {formatTitle(conversation)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
