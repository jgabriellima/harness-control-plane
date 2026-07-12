'use client';

import {
  Send,
  Square,
} from 'lucide-react';
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { useChatArtifact } from '@/components/react/ChatArtifactProvider';
import AgentMessageStack from '@/components/react/AgentMessageStack';
import ComposerOptionsMenu from '@/components/react/ComposerOptionsMenu';
import ComputerUseSessionBadge from '@/components/react/ComputerUseSessionBadge';
import { useRuntimeBrowser } from '@/components/react/RuntimeBrowserProvider';
import { useRuntimeComputerUse } from '@/components/react/RuntimeComputerUseProvider';
import ComposerToolActivity from '@/components/react/ComposerToolActivity';
import { useSdkObservability } from '@/hooks/useSdkObservability';
import { useContextUsageReport } from '@/hooks/useContextUsageReport';
import {
  FILE_ACTIVITY_AUTO_COLLAPSE_THRESHOLD,
  FileActivityGroup,
} from '@/components/react/FileActivityGroup';
import StopRunConfirmDialog from '@/components/react/StopRunConfirmDialog';
import ContinuableRunBanner from '@/components/react/ContinuableRunBanner';
import VoiceInputButton from '@/components/react/VoiceInputButton';
import VoiceTranscriptionSetupBanner from '@/components/react/VoiceTranscriptionSetupBanner';
import { Button } from '@/components/ui/button';
import {
  PromptInput,
  PromptInputTextarea,
} from '@/components/ui/prompt-input';
import type { HarnessCommand, ReadinessSlot } from '@/lib/harness-types';
import type { ChatMessage } from '@/lib/runtime-hub-types';
import { useRuntimeConversation } from '@/hooks/useRuntimeConversation';
import { useComposerFileDrop } from '@/hooks/useComposerFileDrop';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { useRuntimeHub } from '@/components/react/RuntimeHubProvider';
import {
  DEFAULT_VOICE_INPUT_CONFIG,
  type VoiceInputConfig,
} from '@/lib/voice-input-config';
import {
  hideEmptyStateCommand,
  readHiddenEmptyStateCommands,
} from '@/lib/empty-state-commands';
import ComposerAttachmentBadge from '@/components/react/ComposerAttachmentBadge';
import ComposerFileMentionBadge from '@/components/react/ComposerFileMentionBadge';
import ComposerSlashCommandBadge from '@/components/react/ComposerSlashCommandBadge';
import {
  addComposerFileMention,
  buildComposerSubmitMessage,
  clearActiveFileMention,
  clearActiveSlashQuery,
  composerHasSubmittableContent,
  isActiveSlashQuery,
  parseActiveFileMention,
  rankFileMentionSuggestions,
  removeComposerFileMention,
  type FileMentionSuggestion,
} from '@/lib/composer-mention';
import { isDraftConversationId } from '@/lib/draft-conversation';
import { parseComputerUseTargetMode, type ComputerUseTargetMode } from '@/lib/runtime-computer-use-types';
import { computerUseTargetModeLabel } from '@/lib/runtime-computer-use-types';
import { collectThreadFilePaths } from '@/lib/thread-file-paths';
import ChatPaneHeader from './ChatPaneHeader';
import CommandCard from './CommandCard';
import EmptyStateHero from './EmptyStateHero';
import RunDiagnosticsPanel from './RunDiagnosticsPanel';
import ScheduleTipCard from './ScheduleTipCard';
import SdkHealthBanner from './SdkHealthBanner';
import {
  clientSdkMessageContext,
  sdkHealthBannerTitle,
  sdkHealthCheckingMessage,
  type RuntimeSdkMessageContext,
} from '@/lib/runtime-sdk-messages';
import { parseScheduleReadyBlock } from '@/lib/schedule-interview';
import { SCHEDULE_TIPS } from '@/lib/schedule-tips';

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
  paneIndex?: number;
  seedArtifactE2e?: boolean;
  variant?: 'default' | 'schedule';
  onScheduleRegistered?: () => void;
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
  paneIndex,
  seedArtifactE2e = false,
  variant = 'default',
  onScheduleRegistered,
}: ChatPaneProps) {
  const isScheduleVariant = variant === 'schedule';
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const suggestionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const registeredScheduleMessageIdsRef = useRef<Set<string>>(new Set());

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
  const [composerFileMentions, setComposerFileMentions] = useState<FileMentionSuggestion[]>([]);
  const [composerSlashCommand, setComposerSlashCommand] = useState<string | null>(null);
  const [deepResearch, setDeepResearch] = useState(false);
  const [computerUseMode, setComputerUseMode] = useState<ComputerUseTargetMode | null>(null);
  const [hostComputerUseAvailable, setHostComputerUseAvailable] = useState(false);
  const [sandboxComputerUseAvailable, setSandboxComputerUseAvailable] = useState(false);
  const [sandboxPreflightSummary, setSandboxPreflightSummary] = useState<string | null>(null);
  const [computerUseModeError, setComputerUseModeError] = useState<string | null>(null);
  const [showIntegrations, setShowIntegrations] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [workspaceMentionFiles, setWorkspaceMentionFiles] = useState<FileMentionSuggestion[]>([]);
  const [hiddenCommands, setHiddenCommands] = useState<Set<string>>(() => new Set());
  const [stopDialogOpen, setStopDialogOpen] = useState(false);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [voiceInputConfig, setVoiceInputConfig] = useState<VoiceInputConfig>(
    DEFAULT_VOICE_INPUT_CONFIG,
  );
  const [voiceTranscriptionReady, setVoiceTranscriptionReady] = useState(
    () => DEFAULT_VOICE_INPUT_CONFIG.engine !== 'media',
  );
  const [voiceTranscriptionMessage, setVoiceTranscriptionMessage] = useState<string | null>(null);
  const [voiceTranscriptionPhase, setVoiceTranscriptionPhase] = useState<string | null>(null);
  const [voiceTranscriptionProgress, setVoiceTranscriptionProgress] = useState(0);
  const [sdkMessageContext, setSdkMessageContext] = useState<RuntimeSdkMessageContext>(() =>
    clientSdkMessageContext(),
  );
  const [contextUsageEnabled, setContextUsageEnabled] = useState(true);
  const [isBootstrapping, setIsBootstrapping] = useState(
    () =>
      Boolean(conversationId) &&
      !isDraftConversationId(conversationId) &&
      !(hub.getConversationState(conversationId ?? '')?.hydrated ?? false),
  );
  const { openArtifact, selection: selectedArtifact } = useChatArtifact();
  const { openBrowser, navigateBrowser, selection: browserSelection } = useRuntimeBrowser();
  const { openPreview: openComputerUsePreview, restartPreview, selection: computerUseSelection } = useRuntimeComputerUse();

  const handleBrowserLinkClick = useCallback(
    (url: string) => {
      if (browserSelection?.sessionId) {
        void navigateBrowser(url);
        return;
      }
      void openBrowser(url, conversationId);
    },
    [browserSelection?.sessionId, conversationId, navigateBrowser, openBrowser],
  );

  const artifactPanelOpen = selectedArtifact !== null;

  const conversationTitle = state.title;
  const projectId = state.projectId;
  const agentId = state.agentId;
  const contextUsageRevision = state.contextUsageRevision;
  const conversationUpdatedAt = state.updatedAt;
  const error = state.error;
  const runPhase = state.runPhase;
  const activeRunId = state.activeRunId;
  const continuableRun = state.continuableRun;
  const lastRequestId = state.lastRequestId;
  const sdkHealth = state.sdkHealth;
  const sdkHealthMessage = state.sdkHealthMessage;
  const isStreaming = runPhase === 'streaming';
  const showStopMode = isStreaming && Boolean(activeRunId) && Boolean(conversationId);
  const dispatchBlocked = sdkHealth === 'unavailable' || sdkHealth === 'checking';

  const voiceInput = useVoiceInput({
    config: voiceInputConfig,
    value: input,
    onValueChange: setInput,
    onSubmit: () => {
      void handleSubmit();
    },
    disabled: isLoading || dispatchBlocked || showStopMode,
    transcriptionReady: voiceTranscriptionReady,
    transcriptionMessage: voiceTranscriptionMessage,
  });

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

  const sdkObservability = useSdkObservability({
    agentId,
    projectId,
    conversationId: conversationId ?? '',
    refreshRevision: contextUsageRevision,
  });

  const contextUsageSnapshot = useContextUsageReport({
    agentId,
    projectId,
    conversationId: conversationId ?? '',
    title: conversationTitle,
    messages: visibleMessages,
    refreshRevision: contextUsageRevision,
    observability: sdkObservability,
  });

  const threadFilePaths = useMemo(() => {
    const fromMessages = collectThreadFilePaths(displayMessages);
    const mutationPaths = sdkObservability.generatedFiles
      .filter((file) => file.mutation)
      .map((file) => file.path);

    const seen = new Set<string>();
    const merged: string[] = [];

    for (const path of mutationPaths) {
      if (!seen.has(path)) {
        seen.add(path);
        merged.push(path);
      }
    }

    for (const path of fromMessages) {
      if (!seen.has(path)) {
        seen.add(path);
        merged.push(path);
      }
    }

    return merged;
  }, [displayMessages, sdkObservability.generatedFiles]);

  const showMessageList =
    hasConversationContent ||
    isStreaming ||
    (seedArtifactE2e && displayMessages.some((message) => message.role === 'assistant'));

  const showHeader = Boolean(conversationId) && !isScheduleVariant;
  const consoleGridClass = showHeader
    ? 'grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden'
    : 'grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden';

  const slashSuggestions = useMemo(() => {
    if (!isActiveSlashQuery(input)) {
      return [];
    }

    const token = input.trim().split(/\s/)[0] ?? '';
    return commands.filter((item) => item.command.startsWith(token));
  }, [commands, input]);

  const activeMentionQuery = useMemo(() => parseActiveFileMention(input), [input]);

  const threadMentionFiles = useMemo(
    () =>
      threadFilePaths.map((path) => ({
        path,
        name: path.split('/').pop() ?? path,
        source: 'thread' as const,
      })),
    [threadFilePaths],
  );

  const fileMentionSuggestions = useMemo(() => {
    if (activeMentionQuery === null) {
      return [];
    }

    return rankFileMentionSuggestions([...threadMentionFiles, ...workspaceMentionFiles], activeMentionQuery);
  }, [activeMentionQuery, threadMentionFiles, workspaceMentionFiles]);

  const isSelectingFileMention = fileMentionSuggestions.length > 0;
  const isSelectingSlashCommand = !isSelectingFileMention && slashSuggestions.length > 0;

  useEffect(() => {
    setSelectedSuggestionIndex(0);
  }, [fileMentionSuggestions.length, slashSuggestions.length, input]);

  useEffect(() => {
    if (activeMentionQuery === null) {
      setWorkspaceMentionFiles([]);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({
      q: activeMentionQuery,
      project_id: projectId,
    });

    void fetch(`/api/workspace/files?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as { files: FileMentionSuggestion[] };
        setWorkspaceMentionFiles(payload.files ?? []);
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, [activeMentionQuery, projectId]);

  useEffect(() => {
    const activeItem = suggestionRefs.current[selectedSuggestionIndex];
    activeItem?.scrollIntoView({ block: 'nearest' });
  }, [fileMentionSuggestions.length, selectedSuggestionIndex, slashSuggestions.length]);

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
      const prefix = detail?.prefix ?? '/schedule ';
      const command = prefix.trim().split(/\s/)[0] ?? '/schedule';
      setComposerSlashCommand(command);
      setInput('');
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
      void openArtifact(filePath, projectId);
    }

    document.addEventListener('click', handleFileReferenceClick);
    return () => document.removeEventListener('click', handleFileReferenceClick);
  }, [openArtifact, projectId]);

  useEffect(() => {
    void fetch('/api/ui/composer-config')
      .then(async (response) => {
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as {
          voice_input?: VoiceInputConfig;
          voice_transcription?: {
            ready?: boolean;
            message?: string | null;
            phase?: string | null;
            progress?: number;
          } | null;
          surface?: RuntimeSdkMessageContext['surface'];
          presentationTitle?: string;
          features?: { context_usage_panel?: boolean };
        };
        setSdkMessageContext(
          clientSdkMessageContext({
            surface: payload.surface,
            presentationTitle: payload.presentationTitle,
          }),
        );
        if (payload.features?.context_usage_panel !== undefined) {
          setContextUsageEnabled(payload.features.context_usage_panel);
        }
        if (payload.voice_input) {
          setVoiceInputConfig(payload.voice_input);
        }
        if (payload.voice_transcription) {
          setVoiceTranscriptionReady(Boolean(payload.voice_transcription.ready));
          setVoiceTranscriptionMessage(payload.voice_transcription.message ?? null);
          setVoiceTranscriptionPhase(payload.voice_transcription.phase ?? null);
          setVoiceTranscriptionProgress(payload.voice_transcription.progress ?? 0);
        } else if (payload.voice_input?.engine !== 'media') {
          setVoiceTranscriptionReady(true);
          setVoiceTranscriptionMessage(null);
          setVoiceTranscriptionPhase('ready');
          setVoiceTranscriptionProgress(100);
        }
      })
      .catch(() => undefined);

    const deferHeavyStartup = (task: () => void): void => {
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(task, { timeout: 8000 });
        return;
      }
      window.setTimeout(task, 1500);
    };

    deferHeavyStartup(() => {
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

      void fetch('/api/settings/computer-use')
        .then(async (response) => {
          if (!response.ok) {
            return;
          }
          const payload = (await response.json()) as { active?: boolean };
          setHostComputerUseAvailable(payload.active === true);
        })
        .catch(() => undefined);

      void fetch('/api/runtime/computer-use/sandbox/preflight?project_id=default')
        .then(async (response) => {
          if (!response.ok) {
            return;
          }
          const payload = (await response.json()) as {
            contract_enabled?: boolean;
            preflight?: { ok?: boolean; summary?: string | null };
          };
          if (payload.contract_enabled === true) {
            setSandboxComputerUseAvailable(true);
          }
          if (payload.preflight?.ok === false) {
            setSandboxPreflightSummary(payload.preflight.summary ?? 'Sandbox pre-flight failed');
          } else {
            setSandboxPreflightSummary(null);
          }
        })
        .catch(() => undefined);

      void fetch('/api/runtime/computer-use/session?conversation_id=__probe__&project_id=default')
        .then(async (response) => {
          if (!response.ok) {
            return;
          }
          const payload = (await response.json()) as { contract_enabled?: boolean };
          setSandboxComputerUseAvailable(payload.contract_enabled === true);
        })
        .catch(() => undefined);
    });
  }, []);

  useEffect(() => {
    if (!conversationId || isDraftConversationId(conversationId)) {
      setComputerUseMode(null);
      return;
    }

    let cancelled = false;
    const loadSession = (): void => {
      void fetch(
        `/api/runtime/computer-use/session?conversation_id=${encodeURIComponent(conversationId)}&project_id=${encodeURIComponent(projectId)}`,
      )
        .then(async (response) => {
          if (!response.ok || cancelled) {
            return;
          }
          const payload = (await response.json()) as {
            enabled?: boolean;
            mode?: unknown;
            capability_available?: boolean;
            contract_enabled?: boolean;
            sandbox_preflight?: { ok?: boolean; summary?: string | null };
          };
          if (cancelled) {
            return;
          }
          const mode = parseComputerUseTargetMode(payload.mode);
          setComputerUseMode(payload.enabled === true && mode ? mode : null);
          if (payload.capability_available === true) {
            setHostComputerUseAvailable(true);
          }
          if (payload.contract_enabled === true) {
            setSandboxComputerUseAvailable(true);
          }
          if (payload.sandbox_preflight?.ok === false) {
            setSandboxPreflightSummary(payload.sandbox_preflight.summary ?? 'Sandbox pre-flight failed');
          }
        })
        .catch(() => undefined);
    };

    if (typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(loadSession, { timeout: 6000 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(idleId);
      };
    }

    const timerId = window.setTimeout(loadSession, 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [conversationId, projectId]);

  useEffect(() => {
    if (!voiceInputConfig.enabled || voiceInputConfig.engine !== 'media') {
      setVoiceTranscriptionReady(true);
      setVoiceTranscriptionMessage(null);
      setVoiceTranscriptionPhase('ready');
      setVoiceTranscriptionProgress(100);
      return;
    }

    let cancelled = false;
    let intervalId: number | undefined;

    async function pollVoiceTranscriptionStatus(): Promise<void> {
      try {
        const response = await fetch('/api/runtime/voice/status');
        if (!response.ok || cancelled) {
          return;
        }
        const payload = (await response.json()) as {
          ready?: boolean;
          message?: string | null;
          phase?: string | null;
          progress?: number;
        };
        if (cancelled) {
          return;
        }
        setVoiceTranscriptionReady(Boolean(payload.ready));
        setVoiceTranscriptionMessage(payload.message ?? null);
        setVoiceTranscriptionPhase(payload.phase ?? null);
        setVoiceTranscriptionProgress(typeof payload.progress === 'number' ? payload.progress : 0);
        if (payload.ready && intervalId !== undefined) {
          window.clearInterval(intervalId);
          intervalId = undefined;
        }
      } catch {
        /* fail-open polling */
      }
    }

    void pollVoiceTranscriptionStatus();
    intervalId = window.setInterval(() => {
      void pollVoiceTranscriptionStatus();
    }, 1000);

    return () => {
      cancelled = true;
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, [voiceInputConfig.enabled, voiceInputConfig.engine]);

  function applySlashSuggestion(command: string): void {
    setComposerSlashCommand(command);
    setInput(clearActiveSlashQuery(input));
    setSelectedSuggestionIndex(0);
  }

  function removeSlashCommand(): void {
    setComposerSlashCommand(null);
  }

  function applyFileMentionSuggestion(file: FileMentionSuggestion): void {
    setInput(clearActiveFileMention(input));
    setComposerFileMentions((current) => addComposerFileMention(current, file));
    setSelectedSuggestionIndex(0);
  }

  function removeFileMention(path: string): void {
    setComposerFileMentions((current) => removeComposerFileMention(current, path));
  }

  function handleSuggestionKeyDown(
    event: React.KeyboardEvent<HTMLTextAreaElement>,
    suggestions: Array<{ command?: string; file?: FileMentionSuggestion }>,
    onApply: (item: { command?: string; file?: FileMentionSuggestion }) => void,
  ): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedSuggestionIndex((current) => (current + 1) % suggestions.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedSuggestionIndex(
        (current) => (current - 1 + suggestions.length) % suggestions.length,
      );
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      const selected = suggestions[selectedSuggestionIndex];
      if (selected) {
        onApply(selected);
      }
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      const selected = suggestions[selectedSuggestionIndex];
      if (selected) {
        event.preventDefault();
        onApply(selected);
      }
    }
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (isSelectingFileMention) {
      handleSuggestionKeyDown(
        event,
        fileMentionSuggestions.map((file) => ({ file })),
        (item) => {
          if (item.file) {
            applyFileMentionSuggestion(item.file);
          }
        },
      );
      return;
    }

    if (!isSelectingSlashCommand) {
      return;
    }

    handleSuggestionKeyDown(
      event,
      slashSuggestions.map((item) => ({ command: item.command })),
      (item) => {
        if (item.command) {
          applySlashSuggestion(item.command);
        }
      },
    );
  }

  const handleUpload = useCallback(async (file: File): Promise<void> => {
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
  }, []);

  const handleDroppedFiles = useCallback(
    async (files: File[]) => {
      if (isLoading) {
        return;
      }
      for (const file of files) {
        await handleUpload(file).catch(() => undefined);
      }
    },
    [handleUpload, isLoading],
  );

  const fileDrop = useComposerFileDrop(handleDroppedFiles);

  function removeAttachment(path: string): void {
    setAttachments((current) => current.filter((attachment) => attachment.path !== path));
  }

  function selectComputerUseMode(mode: ComputerUseTargetMode | null): void {
    setComputerUseModeError(null);

    if (mode === 'sandbox' && sandboxPreflightSummary) {
      setComputerUseModeError(sandboxPreflightSummary);
      return;
    }

    setComputerUseMode(mode);

    if (conversationId && !isDraftConversationId(conversationId)) {
      void fetch('/api/runtime/computer-use/session', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId,
          project_id: projectId,
          enabled: mode !== null,
          mode,
        }),
      })
        .then(async (response) => {
          if (!response.ok) {
            const payload = (await response.json()) as { error?: string };
            setComputerUseMode(null);
            setComputerUseModeError(payload.error ?? 'Failed to enable computer-use mode');
            return;
          }
          if (
            mode === 'sandbox' &&
            computerUseSelection?.conversationId === conversationId &&
            (computerUseSelection.error || computerUseSelection.sessionId)
          ) {
            void restartPreview();
          }
        })
        .catch(() => {
          setComputerUseMode(null);
          setComputerUseModeError('Failed to enable computer-use mode');
        });
    }
  }

  async function handleSubmit(): Promise<void> {
    const message = buildComposerSubmitMessage(input, composerFileMentions, composerSlashCommand);
    if (
      !composerHasSubmittableContent(input, composerFileMentions, composerSlashCommand) ||
      isLoading ||
      dispatchBlocked
    ) {
      return;
    }

    const mentionAttachments = composerFileMentions.map((file) => ({
      name: file.name,
      path: file.path,
    }));

    setInput('');
    setComposerFileMentions([]);
    setComposerSlashCommand(null);
    setAttachments([]);

    await dispatchMessage({
      message,
      projectId,
      mode: deepResearch ? 'deep_research' : 'default',
      integrationSlots: selectedIntegrations,
      attachments: [...attachments, ...mentionAttachments],
      computerUseEnabled: computerUseMode !== null,
      computerUseMode: computerUseMode ?? undefined,
      scheduleInterview: isScheduleVariant,
    });
  }

  useEffect(() => {
    if (!isScheduleVariant || isLoading || !onScheduleRegistered) {
      return;
    }

    const lastAssistant = [...visibleMessages]
      .reverse()
      .find((message) => message.role === 'assistant' && !message.streaming && message.content.trim());

    if (!lastAssistant) {
      return;
    }

    if (registeredScheduleMessageIdsRef.current.has(lastAssistant.id)) {
      return;
    }

    const ready = parseScheduleReadyBlock(lastAssistant.content);
    if (!ready) {
      return;
    }

    registeredScheduleMessageIdsRef.current.add(lastAssistant.id);

    void (async () => {
      try {
        const response = await fetch('/api/schedules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ready),
        });
        if (!response.ok) {
          registeredScheduleMessageIdsRef.current.delete(lastAssistant.id);
          return;
        }
        onScheduleRegistered();
      } catch {
        registeredScheduleMessageIdsRef.current.delete(lastAssistant.id);
      }
    })();
  }, [isLoading, isScheduleVariant, onScheduleRegistered, visibleMessages]);

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
        {showHeader && conversationId ? (
          <ChatPaneHeader
            conversationId={conversationId}
            title={conversationTitle ?? 'Loading session…'}
            updatedAt={conversationUpdatedAt}
            messages={visibleMessages}
            projectId={projectId}
            contextUsageEnabled={contextUsageEnabled}
            contextUsageReport={contextUsageSnapshot.report}
            contextUsageLoading={contextUsageSnapshot.loading}
            compact={compact}
          />
        ) : null}
        <div className="min-h-0 overflow-y-auto overscroll-contain">
          <ChatPaneMessagesSkeleton compact={compact} />
        </div>
        <div className="shrink-0 px-4 pb-4" aria-hidden="true">
          <div className="mx-auto max-w-3xl opacity-60">
            <PromptInput>
              <PromptInputTextarea disabled placeholder="Loading session…" value="" readOnly />
            </PromptInput>
          </div>
        </div>
      </div>
    );
  }

  const chatColumn = (
    <div
      className={`relative ${consoleGridClass}`}
      data-testid="chat-pane"
      data-file-drop-active={fileDrop.isActive ? 'true' : 'false'}
      onDragEnter={fileDrop.onDragEnter}
      onDragLeave={fileDrop.onDragLeave}
      onDragOver={fileDrop.onDragOver}
      onDrop={fileDrop.onDrop}
    >
      {fileDrop.isActive ? (
        <div
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-blue-50/80 ring-2 ring-inset ring-blue-400"
          data-testid="chat-pane-file-drop-overlay"
          aria-hidden="true"
        >
          <p className="rounded-full border border-blue-300 bg-white px-4 py-2 text-sm font-medium text-blue-700 shadow-sm">
            Drop files to attach
          </p>
        </div>
      ) : null}
      {showHeader && conversationId ? (
        <ChatPaneHeader
          conversationId={conversationId}
          title={conversationTitle}
          updatedAt={conversationUpdatedAt}
          messages={visibleMessages}
          projectId={projectId}
          contextUsageEnabled={contextUsageEnabled}
          contextUsageReport={contextUsageSnapshot.report}
          contextUsageLoading={contextUsageSnapshot.loading}
          compact={compact}
          paneIndex={paneIndex}
        />
      ) : null}

      <div
        className="min-h-0 overflow-y-auto overscroll-contain"
        data-testid="chat-pane-messages"
      >
        {!showMessageList ? (
          <div
            className="mx-auto flex w-full max-w-4xl flex-col items-center px-4 py-8"
            data-testid={isScheduleVariant ? 'schedule-interview-empty-state' : 'chat-pane-empty-state'}
          >
            {!compact && !isScheduleVariant ? <EmptyStateHero /> : null}
            {isScheduleVariant ? (
              <div className="w-full max-w-2xl text-center">
                <h2 className="text-lg font-semibold text-gray-900">Schedule a task</h2>
                <p className="mt-2 text-sm text-gray-500">
                  Describe what you want automated. The agent will interview you about scope,
                  timing, and format before registering the workflow.
                </p>
              </div>
            ) : null}

            {isScheduleVariant ? (
              <div className="mt-6 grid w-full max-w-3xl grid-cols-1 gap-2 sm:grid-cols-2">
                {SCHEDULE_TIPS.map((tip) => (
                  <ScheduleTipCard key={tip.id} tip={tip} onSelect={(prompt) => setInput(prompt)} />
                ))}
              </div>
            ) : suggestedCommands.length > 0 ? (
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
              streaming={isStreaming}
              onFileClick={(filePath) => {
                void openArtifact(filePath, projectId);
              }}
              onLinkClick={handleBrowserLinkClick}
            />
            <div ref={messagesEndRef} className="h-px shrink-0" />
          </>
        )}
      </div>

      <div className="shrink-0 px-4 pb-4" data-testid="chat-pane-composer">
        <div className="relative mx-auto max-w-3xl">
          <ComposerToolActivity
            messages={displayMessages}
            streaming={isStreaming}
            agentId={agentId}
            projectId={projectId}
            conversationId={conversationId ?? ''}
            refreshRevision={contextUsageRevision}
          />

          {threadFilePaths.length > 0 ? (
            <div className="mb-2" data-testid="chat-composer-generated-files">
              <FileActivityGroup
                paths={threadFilePaths}
                onFileClick={(filePath) => {
                  void openArtifact(filePath, projectId);
                }}
                defaultCollapsed={threadFilePaths.length > FILE_ACTIVITY_AUTO_COLLAPSE_THRESHOLD}
              />
            </div>
          ) : null}

          {fileMentionSuggestions.length > 0 ? (
            <div
              className="absolute bottom-full left-0 right-0 mb-2 max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-white shadow-lg"
              data-testid="file-mention-suggestions"
              role="listbox"
              aria-label="Workspace file mentions"
            >
              {fileMentionSuggestions.map((item, index) => (
                <button
                  key={`${item.path}:${item.source}`}
                  ref={(element) => {
                    suggestionRefs.current[index] = element;
                  }}
                  type="button"
                  role="option"
                  className={`flex w-full flex-col items-start px-4 py-2 text-left ${
                    index === selectedSuggestionIndex
                      ? 'bg-gray-100 text-gray-900'
                      : 'hover:bg-gray-100'
                  }`}
                  aria-selected={index === selectedSuggestionIndex}
                  onMouseEnter={() => setSelectedSuggestionIndex(index)}
                  onClick={() => applyFileMentionSuggestion(item)}
                >
                  <span className="font-mono text-xs font-semibold text-gray-700">@{item.name}</span>
                  <span className="truncate text-xs text-gray-500">{item.path}</span>
                </button>
              ))}
            </div>
          ) : null}

          {slashSuggestions.length > 0 ? (
            <div
              className="absolute bottom-full left-0 right-0 mb-2 max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-white shadow-lg"
              data-testid="slash-command-suggestions"
              role="listbox"
              aria-label="Harness slash commands"
            >
              {slashSuggestions.map((item, index) => (
                <button
                  key={item.command}
                  ref={(element) => {
                    suggestionRefs.current[index] = element;
                  }}
                  type="button"
                  role="option"
                  className={`flex w-full flex-col items-start px-4 py-2 text-left ${
                    index === selectedSuggestionIndex
                      ? 'bg-gray-100 text-gray-900'
                      : 'hover:bg-gray-100'
                  }`}
                  aria-selected={index === selectedSuggestionIndex}
                  onMouseEnter={() => setSelectedSuggestionIndex(index)}
                  onClick={() => applySlashSuggestion(item.command)}
                >
                  <span className="font-mono text-xs font-semibold text-gray-700">{item.command}</span>
                  <span className="text-xs text-gray-500">{item.description}</span>
                </button>
              ))}
            </div>
          ) : null}

          {attachments.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-2" data-testid="composer-attachment-badges">
              {attachments.map((attachment) => (
                <ComposerAttachmentBadge
                  key={attachment.path}
                  name={attachment.name}
                  disabled={isLoading}
                  onRemove={() => removeAttachment(attachment.path)}
                />
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
                          ? 'bg-gray-100 text-gray-800 ring-gray-200'
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

          {sdkHealth !== 'ready' && sdkHealthMessage ? (
            <SdkHealthBanner
              title={sdkHealthBannerTitle(sdkMessageContext)}
              message={
                sdkHealth === 'checking'
                  ? sdkHealthCheckingMessage(sdkMessageContext)
                  : sdkHealthMessage
              }
              checking={sdkHealth === 'checking'}
              onRetry={
                conversationId
                  ? () => {
                      void hub.ensureSdkHealth(conversationId, projectId, { force: true });
                    }
                  : undefined
              }
            />
          ) : null}

          {voiceInputConfig.enabled &&
          voiceInputConfig.engine === 'media' &&
          !voiceTranscriptionReady ? (
            <VoiceTranscriptionSetupBanner
              phase={voiceTranscriptionPhase}
              progress={voiceTranscriptionProgress}
              message={voiceTranscriptionMessage}
            />
          ) : null}

          <PromptInput
            value={input}
            onValueChange={setInput}
            onSubmit={() => {
              void handleSubmit();
            }}
            isLoading={isLoading}
            disabled={isLoading}
            className="p-2"
          >
            {composerSlashCommand || composerFileMentions.length > 0 ? (
              <div
                className="mb-2 flex flex-wrap gap-2 px-1"
                data-testid="composer-context-badges"
              >
                {composerSlashCommand ? (
                  <ComposerSlashCommandBadge
                    command={composerSlashCommand}
                    disabled={isLoading}
                    onRemove={removeSlashCommand}
                  />
                ) : null}
                {composerFileMentions.map((file) => (
                  <ComposerFileMentionBadge
                    key={file.path}
                    file={file}
                    disabled={isLoading}
                    onOpen={(filePath) => {
                      void openArtifact(filePath, projectId);
                    }}
                    onRemove={() => removeFileMention(file.path)}
                  />
                ))}
              </div>
            ) : null}

            <div className="flex items-end gap-1">
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
              <ComposerOptionsMenu
                disabled={isLoading}
                deepResearch={deepResearch}
                integrationsOpen={showIntegrations}
                computerUseMode={computerUseMode}
                hostComputerUseAvailable={hostComputerUseAvailable}
                sandboxComputerUseAvailable={sandboxComputerUseAvailable}
                sandboxPreflightSummary={sandboxPreflightSummary}
                onAttach={() => fileInputRef.current?.click()}
                onToggleIntegrations={() => setShowIntegrations((current) => !current)}
                onToggleDeepResearch={() => setDeepResearch((current) => !current)}
                onSelectComputerUseMode={selectComputerUseMode}
              />
              <PromptInputTextarea
                className="min-h-[36px] flex-1 px-1 py-2"
                placeholder={
                  isScheduleVariant
                    ? 'Schedule a task'
                    : "Ask the runtime, type '/' for commands, or '@' for workspace files..."
                }
                onKeyDown={handleComposerKeyDown}
              />
              {voiceInputConfig.enabled && voiceTranscriptionReady ? (
                <VoiceInputButton
                  phase={voiceInput.phase}
                  disabled={isLoading || dispatchBlocked || showStopMode}
                  supported={voiceInput.supported}
                  shortcutLabel={voiceInput.shortcutLabel}
                  error={voiceInput.error}
                  onToggle={voiceInput.toggle}
                />
              ) : null}
              <Button
                type="button"
                size="icon"
                data-testid={showStopMode ? 'chat-stop-run' : 'chat-pane-send'}
                className={`h-9 w-9 shrink-0 rounded-full ${showStopMode ? 'bg-red-600 hover:bg-red-700' : ''}`}
                disabled={showStopMode ? false : isLoading || dispatchBlocked || !composerHasSubmittableContent(input, composerFileMentions, composerSlashCommand)}
                aria-label={showStopMode ? 'Stop run' : isLoading ? 'Streaming' : 'Send message'}
                onClick={() => {
                  if (showStopMode) {
                    setStopDialogOpen(true);
                    return;
                  }
                  void handleSubmit();
                }}
              >
                {showStopMode ? (
                  <Square className="h-3.5 w-3.5 fill-current" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            {deepResearch ? (
              <p className="mt-1.5 px-1 text-[11px] font-medium text-gray-500">Deep research enabled</p>
            ) : null}
            {computerUseMode ? (
              <div className="mt-1.5 flex items-center gap-2 px-1">
                <ComputerUseSessionBadge
                  mode={computerUseMode}
                  onOpenPreview={() => {
                    void openComputerUsePreview(conversationId, computerUseMode);
                  }}
                />
                <p className="text-[11px] font-medium text-emerald-700">
                  {computerUseTargetModeLabel(computerUseMode)} enabled for this chat
                </p>
              </div>
            ) : null}
            {computerUseModeError ? (
              <p className="mt-1.5 px-1 text-[11px] font-medium text-red-600" role="alert">
                {computerUseModeError}
              </p>
            ) : null}
          </PromptInput>

          {voiceInput.error ? (
            <p className="mt-2 text-xs text-amber-700" role="status">
              {voiceInput.error}
            </p>
          ) : null}

          <StopRunConfirmDialog
            open={stopDialogOpen}
            onOpenChange={setStopDialogOpen}
            onConfirm={() => {
              if (conversationId) {
                void hub.cancelActiveRun(conversationId);
              }
            }}
          />

          {continuableRun && runPhase === 'continuable' && !isDraftConversationId(conversationId) ? (
            <ContinuableRunBanner
              message={continuableRun.message}
              resumable={continuableRun.resumable}
              busy={resumeBusy}
              onContinue={() => {
                if (!conversationId) {
                  return;
                }
                setResumeBusy(true);
                void hub
                  .resumeContinuableRun(conversationId)
                  .catch(() => undefined)
                  .finally(() => {
                    setResumeBusy(false);
                  });
              }}
              onDismiss={() => {
                if (!conversationId) {
                  return;
                }
                hub.dismissContinuableRun(conversationId);
              }}
            />
          ) : null}

          {error && !isDraftConversationId(conversationId) && runPhase === 'failed' ? (
            <RunDiagnosticsPanel
              runId={activeRunId}
              projectId={projectId}
              requestId={lastRequestId}
              errorMessage={error}
            />
          ) : error && !isDraftConversationId(conversationId) ? (
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
