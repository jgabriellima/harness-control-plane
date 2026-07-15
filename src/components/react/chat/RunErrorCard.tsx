'use client';

import { AlertCircle, ChevronRight, Copy } from 'lucide-react';
import React, { useCallback, useState } from 'react';

import { buildRunErrorDiagnosticText } from '@/lib/build-run-error-diagnostics';
import type { RunFailurePrimaryAction } from '@/runtime/amr-guidance';

export interface RunErrorCardProps {
  title: string;
  message: string;
  rawMessage?: string | null;
  primaryAction: RunFailurePrimaryAction;
  secondaryRetry?: boolean;
  tone?: 'error' | 'warn' | 'brand';
  traceId?: string | null;
  runId?: string | null;
  errorCode?: string | null;
  projectId?: string | null;
  conversationId?: string | null;
  assistantMessageId?: string | null;
  agentId?: string | null;
  onPrimaryAction?: () => void;
  onRetry?: () => void;
  primaryActionLabel?: string;
}

function primaryActionLabel(action: RunFailurePrimaryAction): string {
  switch (action) {
    case 'authorize':
      return 'Authorize & retry';
    case 'recharge':
      return 'Top up';
    case 'upgrade':
      return 'Upgrade plan';
    case 'launch-terminal-auth':
      return 'Open terminal to sign in';
    case 'launch-terminal-switch-model':
      return 'Open terminal to switch model';
    case 'retry':
      return 'Retry';
    case 'none':
      return '';
    default:
      return 'Retry';
  }
}

export default function RunErrorCard({
  title,
  message,
  rawMessage,
  primaryAction,
  secondaryRetry = false,
  tone = 'error',
  traceId,
  runId,
  errorCode,
  projectId,
  conversationId,
  assistantMessageId,
  agentId,
  onPrimaryAction,
  onRetry,
  primaryActionLabel: primaryActionLabelOverride,
}: RunErrorCardProps) {
  const [sourceOpen, setSourceOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const diagnosticText = buildRunErrorDiagnosticText({
    message,
    rawMessage,
    traceId,
    runId,
    errorCode,
    projectId,
    conversationId,
    assistantMessageId,
    agentId,
  });

  const sourcePeek = (rawMessage ?? message).split('\n')[0] ?? '';

  const handleCopyDiagnostics = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(diagnosticText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [diagnosticText]);

  const showPrimary = primaryAction !== 'none' && onPrimaryAction;
  const showRetry = secondaryRetry && onRetry;

  return (
    <div className="run-error" data-tone={tone} data-testid="run-error-card" role="alert">
      <div className="run-error__main">
        <span className="run-error__icon" aria-hidden="true">
          <AlertCircle />
        </span>
        <div className="run-error__copy">
          <p className="run-error__title">{title}</p>
          <p className="run-error__desc">{message}</p>
        </div>
      </div>

      <div className={`run-error__source${sourceOpen ? ' is-open' : ''}`}>
        <div className="run-error__source-head">
          <button
            type="button"
            className="run-error__source-bar"
            onClick={() => setSourceOpen((open) => !open)}
            aria-expanded={sourceOpen}
          >
            <ChevronRight className="run-error__source-chevron" aria-hidden="true" />
            <span className="run-error__source-label">Diagnostics</span>
            <span className="run-error__source-peek">{sourcePeek}</span>
          </button>
          <button
            type="button"
            className="run-error__source-copy"
            onClick={() => {
              void handleCopyDiagnostics();
            }}
            aria-label={copied ? 'Copied diagnostics' : 'Copy diagnostics'}
            title={copied ? 'Copied' : 'Copy diagnostics'}
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="run-error__source-full">
          <pre>{diagnosticText}</pre>
        </div>
      </div>

      {showPrimary || showRetry ? (
        <div className="run-error__actions">
          {showPrimary ? (
            <button
              type="button"
              className="chat-error-action"
              onClick={onPrimaryAction}
              data-testid="run-error-primary-action"
            >
              {primaryActionLabelOverride ?? primaryActionLabel(primaryAction)}
            </button>
          ) : null}
          {showRetry ? (
            <button
              type="button"
              className="chat-error-retry"
              onClick={onRetry}
              data-testid="run-error-retry"
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
