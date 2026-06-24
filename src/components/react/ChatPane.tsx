'use client';

import {
  Database,
  Paperclip,
  Send,
  Sparkles,
} from 'lucide-react';
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';

import { useChatArtifact } from '@/components/react/ChatArtifactProvider';
import AgentMessageStack from '@/components/react/AgentMessageStack';
import RuntimeActivityIndicator from '@/components/react/RuntimeActivityIndicator';
import { Button } from '@/components/ui/button';
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from '@/components/ui/prompt-input';
import type { HarnessCommand, ReadinessSlot } from '@/lib/harness-types';
import type { ChatMessage } from '@/lib/runtime-hub-types';
import { useRuntimeConversation } from '@/hooks/useRuntimeConversation';
import { useRuntimeHub } from '@/components/react/RuntimeHubProvider';
import {
  hideEmptyStateCommand,
  readHiddenEmptyStateCommands,
} from '@/lib/empty-state-commands';
import { formatSessionTimestamp } from '@/lib/format-session-time';
import { isDraftConversationId } from '@/lib/draft-conversation';
import CommandCard from './CommandCard';
import EmptyStateHero from './EmptyStateHero';

function ChatPaneMessagesSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`mx-auto w-full max-w-4xl space-y-4 px-4 ${compact ? 'py-4' : 'py-8'}`}
      data-testid="chat-pane-loading"
      aria-busy="true"
      aria-label="Loading runtime session"
    >
      <div className="space-y-3 animate-pulse">
        <div className="flex justify-end">
          <div className="h-10 w-2/5 max-w-xs rounded-2xl bg-gray-100" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-full rounded bg-gray-100" />
          <div className="h-3 w-11/12 rounded bg-gray-100" />
          <div className="h-3 w-4/5 rounded bg-gray-100" />
        </div>
        <div className="flex justify-end">
          <div className="h-10 w-1/3 max-w-[12rem] rounded-2xl bg-gray-100" />
        </div>
      </div>
    </div>
  );
}

interface ChatPaneProps {
  conversationId: string | null;
  compact?: boolean;
  seedArtifactE2e?: boolean;
}

interface ReadinessResponse {
  slots: ReadinessSlot[];
}

type ChatMessageRole = 'user' | 'assistant' | 'system' | 'thinking' | 'tool';

interface UploadedAttachment {
  name: string;
  path: string;
  content_type?: string;
}

const EMPTY_STATE_COMMAND_LIMIT = 6;

const E2E_ARTIFACT_DEMO_MESSAGE: ChatMessage = {
  id: 'e2e-artifact-demo',
  role: 'assistant',
  content:
    'Relatório gerado em `e2e/fixtures/chat-artifact-target.md` — clique para abrir o painel.',
};

export default function ChatPane({
  conversationId,
  compact = false,
  seedArtifactE2e = false,
}: ChatPaneProps) {
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const suggestionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    state,
    dispatchMessage,
    isLoading,
    visibleMessages,
    hasConversationContent,
  } = useRuntimeConversation(conversationId);
  const hub = useRuntimeHub();

  const [input, setInput] = useState('');
  const [commands, setCommands] = useState<HarnessCommand[]>([]);
  const [integrationSlots, setIntegrationSlots] = useState<ReadinessSlot[]>([]);
  const [selectedIntegrations, setSelectedIntegrations] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [deepResearch, setDeepResearch] = useState(false);
  const [showIntegrations, setShowIntegrations] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [hiddenCommands, setHiddenCommands] = useState<Set<string>>(() => new Set());
  const [isBootstrapping, setIsBootstrapping] = useState(
    () =>
      Boolean(conversationId) &&
      !isDraftConversationId(conversationId) &&
      !(hub.getConversationState(conversationId ?? '')?.hydrated ?? false),
  );
  const { openArtifact, selection: selectedArtifact } = useChatArtifact();

  const artifactPanelOpen = selectedArtifact !== null;

  const conversationTitle = state.title;
  const projectId = state.projectId;
  const agentId = state.agentId;
  const conversationUpdatedAt = state.updatedAt;
  const toolActivity = state.toolActivity;
  const error = state.error;
  const runPhase = state.runPhase;
  const runActivity = state.runActivity;
  const activeRunId = state.activeRunId;
  const isStreaming = runPhase === 'streaming';

  const sessionTimestamp =
    conversationId && !isDraftConversationId(conversationId)
      ? formatSessionTimestamp(conversationId, conversationUpdatedAt)
      : null;

  const sessionSubtitle = [
    `Runtime session ${agentId ? '· resumed' : '· new'}`,
    runPhase === 'streaming' ? 'active' : null,
    `Project ${projectId}`,
    sessionTimestamp,
  ]
    .filter(Boolean)
    .join(' · ');

  useEffect(() => {
    setHiddenCommands(readHiddenEmptyStateCommands(projectId));
  }, [projectId]);

  const suggestedCommands = useMemo(
    () =>
      commands
        .filter((item) => !hiddenCommands.has(item.command))
        .slice(0, EMPTY_STATE_COMMAND_LIMIT),
    [commands, hiddenCommands],
  );

  const displayMessages = useMemo(() => {
    if (!seedArtifactE2e) {
      return visibleMessages;
    }

    const hasDemo = visibleMessages.some((message) => message.id === E2E_ARTIFACT_DEMO_MESSAGE.id);
    if (hasDemo) {
      return visibleMessages;
    }

    return [...visibleMessages, E2E_ARTIFACT_DEMO_MESSAGE];
  }, [seedArtifactE2e, visibleMessages]);

  const showMessageList =
    hasConversationContent ||
    isStreaming ||
    (seedArtifactE2e && displayMessages.some((message) => message.role === 'assistant'));

  const consoleGridClass = compact
    ? 'grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden'
    : conversationTitle
      ? 'grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden'
      : 'grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden';

  const slashSuggestions = useMemo(() => {
    const trimmed = input.trim();
    if (!trimmed.startsWith('/')) {
      return [];
    }

    const token = trimmed.split(/\s/)[0] ?? '';
    if (trimmed.includes(' ') && token.length > 1) {
      return [];
    }

    return commands
      .filter((item) => item.command.startsWith(token))
      .slice(0, 8);
  }, [commands, input]);

  const isSelectingSlashCommand = slashSuggestions.length > 0;

  useEffect(() => {
    setSelectedSuggestionIndex(0);
  }, [slashSuggestions.length, input]);

  useEffect(() => {
    const activeItem = suggestionRefs.current[selectedSuggestionIndex];
    activeItem?.scrollIntoView({ block: 'nearest' });
  }, [selectedSuggestionIndex, slashSuggestions.length]);

  useEffect(() => {
    if (!conversationId || isDraftConversationId(conversationId)) {
      setIsBootstrapping(false);
      return;
    }

    setIsBootstrapping(!(hub.getConversationState(conversationId)?.hydrated ?? false));
  }, [conversationId, hub, state.hydrated]);

  useEffect(() => {
    if (state.hydrated) {
      setIsBootstrapping(false);
    }
  }, [state.hydrated]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [visibleMessages]);

  useEffect(() => {
    function onScheduleCompose(event: Event): void {
      const detail = (event as CustomEvent<{ prefix?: string }>).detail;
      setInput(detail?.prefix ?? '/schedule ');
    }
    window.addEventListener('runtime:schedule-compose', onScheduleCompose);
    return () => window.removeEventListener('runtime:schedule-compose', onScheduleCompose);
  }, []);

  useEffect(() => {
    function handleFileReferenceClick(event: MouseEvent): void {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const trigger = target.closest('[data-file-path]');
      if (!(trigger instanceof HTMLElement)) {
        return;
      }

      const filePath = trigger.dataset.filePath;
      if (!filePath) {
        return;
      }

      event.preventDefault();
      void openArtifact(filePath);
    }

    document.addEventListener('click', handleFileReferenceClick);
    return () => document.removeEventListener('click', handleFileReferenceClick);
  }, [openArtifact]);

  useEffect(() => {
    void fetch('/api/runtime/commands')
      .then(async (response) => {
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as { commands: HarnessCommand[] };
        setCommands(payload.commands);
      })
      .catch(() => undefined);

    void fetch('/api/runtime/readiness')
      .then(async (response) => {
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as ReadinessResponse;
        setIntegrationSlots(payload.slots ?? []);
        setSelectedIntegrations(
          payload.slots.filter((slot) => slot.ready).map((slot) => slot.slotId),
        );
      })
      .catch(() => undefined);
  }, []);

  function applySlashSuggestion(command: string): void {
    setInput(`${command} `);
    setSelectedSuggestionIndex(0);
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (!isSelectingSlashCommand) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedSuggestionIndex((current) => (current + 1) % slashSuggestions.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedSuggestionIndex(
        (current) => (current - 1 + slashSuggestions.length) % slashSuggestions.length,
      );
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      const selected = slashSuggestions[selectedSuggestionIndex];
      if (selected) {
        applySlashSuggestion(selected.command);
      }
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      const selected = slashSuggestions[selectedSuggestionIndex];
      if (selected) {
        event.preventDefault();
        applySlashSuggestion(selected.command);
      }
    }
  }

  async function handleUpload(file: File): Promise<void> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/runtime/upload', {
      method: 'POST',
      body: formData,
    });

    const body = (await response.json()) as UploadedAttachment & { error?: string };
    if (!response.ok) {
      throw new Error(body.error ?? 'Upload failed');
    }

    setAttachments((current) => [
      ...current,
      {
        name: body.name,
        path: body.path,
        content_type: body.content_type,
      },
    ]);
  }

  async function handleSubmit(): Promise<void> {
    const trimmed = input.trim();
    if (!trimmed || isLoading) {
      return;
    }

    setInput('');
    setAttachments([]);

    await dispatchMessage({
      message: trimmed,
      projectId,
      mode: deepResearch ? 'deep_research' : 'default',
      integrationSlots: selectedIntegrations,
      attachments,
    });
  }

  function toggleIntegration(slotId: string): void {
    setSelectedIntegrations((current) =>
      current.includes(slotId)
        ? current.filter((entry) => entry !== slotId)
        : [...current, slotId],
    );
  }

  function handleDismissSuggestedCommand(command: string): void {
    hideEmptyStateCommand(projectId, command);
    setHiddenCommands((current) => new Set([...current, command]));
  }

  if (isBootstrapping) {
    return (
      <div className={consoleGridClass} data-testid="chat-pane">
        {conversationTitle && !compact ? (
          <header className="border-b border-gray-200 bg-white px-4 py-3">
            <h2 className="truncate text-sm font-semibold text-gray-900">
              {conversationTitle ?? 'Loading session…'}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">Runtime session · loading</p>
          </header>
        ) : null}
        <div className="min-h-0 overflow-y-auto overscroll-contain">
          <ChatPaneMessagesSkeleton compact={compact} />
        </div>
        <div className="pointer-events-none opacity-60" aria-hidden="true">
          <PromptInput>
            <PromptInputTextarea disabled placeholder="Loading session…" value="" readOnly />
          </PromptInput>
        </div>
      </div>
    );
  }

  const chatColumn = (
    <div className={consoleGridClass} data-testid="chat-pane">
      {conversationTitle && !compact ? (
        <header className="border-b border-gray-200 bg-white px-4 py-3">
          <h2 className="truncate text-sm font-semibold text-gray-900">{conversationTitle}</h2>
          <p className="mt-0.5 text-xs text-gray-500">{sessionSubtitle}</p>
        </header>
      ) : null}

      <div className="min-h-0 overflow-y-auto overscroll-contain" data-testid="chat-pane-messages">
        {!showMessageList ? (
          <div
            className="mx-auto flex w-full max-w-4xl flex-col items-center px-4 py-8"
            data-testid="chat-pane-empty-state"
          >
            {!compact ? <EmptyStateHero /> : null}

            {suggestedCommands.length > 0 ? (
              <div className="mt-4 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                {suggestedCommands.map((item) => (
                  <CommandCard
                    key={item.command}
                    command={item.command}
                    description={item.description}
                    onSelect={(command) => setInput(command)}
                    onDismiss={handleDismissSuggestedCommand}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <AgentMessageStack
              messages={displayMessages}
              showStreamingIndicator={isStreaming}
              runActivity={runActivity}
              toolActivity={toolActivity}
              onFileClick={(filePath) => {
                void openArtifact(filePath);
              }}
            />
            <div ref={messagesEndRef} className="h-px shrink-0" />
          </>
        )}
      </div>

      <div className="border-t border-gray-200 bg-white px-4 py-3">
        <div className="relative mx-auto max-w-3xl">
          {isStreaming ? (
            <div className="mb-3 flex items-center justify-between gap-3">
              <RuntimeActivityIndicator
                activity={runActivity}
                toolActivity={toolActivity}
                compact={compact}
              />
              {activeRunId && conversationId ? (
                <button
                  type="button"
                  data-testid="chat-stop-run"
                  className="shrink-0 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                  onClick={() => {
                    if (window.confirm('Stop the active runtime run?')) {
                      void hub.cancelActiveRun(conversationId);
                    }
                  }}
                >
                  Stop
                </button>
              ) : null}
            </div>
          ) : toolActivity.length > 0 ? (
            <div
              className="mb-2 max-h-20 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
              data-testid="chat-pane-tool-activity"
            >
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Runtime activity
              </p>
              <ul className="space-y-0.5 font-mono text-xs text-gray-600">
                {toolActivity.map((line, index) => (
                  <li key={`${index}-${line}`}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {slashSuggestions.length > 0 ? (
            <div
              className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
              data-testid="slash-command-suggestions"
            >
              {slashSuggestions.map((item, index) => (
                <button
                  key={item.command}
                  ref={(element) => {
                    suggestionRefs.current[index] = element;
                  }}
                  type="button"
                  className={`flex w-full flex-col items-start px-4 py-2 text-left ${
                    index === selectedSuggestionIndex
                      ? 'bg-violet-100 text-violet-900'
                      : 'hover:bg-violet-50'
                  }`}
                  aria-selected={index === selectedSuggestionIndex}
                  onMouseEnter={() => setSelectedSuggestionIndex(index)}
                  onClick={() => applySlashSuggestion(item.command)}
                >
                  <span className="font-mono text-xs font-semibold text-violet-700">{item.command}</span>
                  <span className="text-xs text-gray-500">{item.description}</span>
                </button>
              ))}
            </div>
          ) : null}

          {attachments.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachments.map((attachment) => (
                <span
                  key={attachment.path}
                  className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700"
                >
                  {attachment.name}
                </span>
              ))}
            </div>
          ) : null}

          {showIntegrations ? (
            <div className="mb-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Active integrations
              </p>
              <div className="flex flex-wrap gap-2">
                {integrationSlots.length === 0 ? (
                  <span className="text-xs text-gray-500">No integration slots configured.</span>
                ) : (
                  integrationSlots.map((slot) => (
                    <button
                      key={slot.slotId}
                      type="button"
                      className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${
                        selectedIntegrations.includes(slot.slotId)
                          ? 'bg-violet-100 text-violet-800 ring-violet-300'
                          : 'bg-white text-gray-600 ring-gray-200'
                      }`}
                      onClick={() => toggleIntegration(slot.slotId)}
                    >
                      {slot.slotId} · {slot.status}
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : null}

          <PromptInput
            value={input}
            onValueChange={setInput}
            onSubmit={() => {
              void handleSubmit();
            }}
            isLoading={isLoading}
            disabled={isLoading}
          >
            <PromptInputTextarea
              placeholder="Ask the runtime or type '/' for harness commands..."
              onKeyDown={handleComposerKeyDown}
            />
            <PromptInputActions>
              <div className="flex items-center gap-1">
                <input
                  id={fileInputId}
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void handleUpload(file).catch(() => undefined);
                    }
                    event.target.value = '';
                  }}
                />
                <PromptInputAction
                  tooltip="Upload file"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="h-4 w-4" />
                  Attach
                </PromptInputAction>
                <PromptInputAction
                  tooltip="Toggle active integration slots"
                  onClick={() => setShowIntegrations((current) => !current)}
                >
                  <Database className="h-4 w-4" />
                  Integrations
                </PromptInputAction>
                <PromptInputAction
                  tooltip="Deep research mode"
                  className={deepResearch ? 'bg-violet-100 text-violet-700' : undefined}
                  onClick={() => setDeepResearch((current) => !current)}
                >
                  <Sparkles className="h-4 w-4" />
                  {deepResearch ? 'Deep research on' : 'Deep research'}
                </PromptInputAction>
              </div>

              <Button
                type="button"
                size="sm"
                data-testid="chat-pane-send"
                disabled={isLoading || input.trim().length === 0}
                onClick={() => {
                  void handleSubmit();
                }}
              >
                <Send className="h-4 w-4" />
                {isLoading ? 'Streaming…' : 'Send'}
              </Button>
            </PromptInputActions>
          </PromptInput>

          {error ? (
            <p className="mt-2 text-xs text-red-600" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );

  if (compact) {
    return chatColumn;
  }

  return chatColumn;
}
