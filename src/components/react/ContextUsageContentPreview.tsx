'use client';

import { Check } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Markdown } from '@/components/ui/markdown';
import { textLooksLikeMarkdown } from '@/lib/markdown-gfm';
import { cn } from '@/lib/utils';

const COPY_FEEDBACK_MS = 2000;

const COMPACT_MARKDOWN_VARS = {
  '--chat-font-size': '13px',
  '--chat-line-height': '1.55',
  '--chat-paragraph-spacing': '0.45rem',
  '--chat-list-spacing': '0.45rem',
} as React.CSSProperties;

interface ContextUsageContentPreviewProps {
  content: string;
  testId?: string;
}

export default function ContextUsageContentPreview({
  content,
  testId = 'context-usage-content-preview',
}: ContextUsageContentPreviewProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const resetTimeoutRef = useRef<number | null>(null);
  const renderAsMarkdown = useMemo(() => textLooksLikeMarkdown(content), [content]);

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current !== null) {
        window.clearTimeout(resetTimeoutRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
        setCopyState('copied');
        if (resetTimeoutRef.current !== null) {
          window.clearTimeout(resetTimeoutRef.current);
        }
        resetTimeoutRef.current = window.setTimeout(() => {
          setCopyState('idle');
          resetTimeoutRef.current = null;
        }, COPY_FEEDBACK_MS);
      }
    } catch {
      setCopyState('idle');
    }
  }, [content]);

  const copied = copyState === 'copied';

  return (
    <div
      className="overflow-hidden rounded-md border border-gray-200 bg-white"
      data-testid={testId}
    >
      <div className="flex items-center justify-end border-b border-gray-100 px-2 py-1">
        <button
          type="button"
          aria-label={copied ? 'Copied to clipboard' : 'Copy content'}
          data-testid="context-usage-content-copy"
          data-copy-state={copyState}
          className={cn(
            'inline-flex min-w-[3.75rem] items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
            copied
              ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'
              : 'bg-gray-50 text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-100 hover:text-gray-800',
          )}
          onClick={() => {
            void handleCopy();
          }}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 shrink-0" aria-hidden />
              Copied
            </>
          ) : (
            'Copy'
          )}
        </button>
      </div>

      {renderAsMarkdown ? (
        <div
          className="context-usage-markdown px-3 py-2.5 [&_.chat-markdown_h1]:mb-2 [&_.chat-markdown_h1]:mt-0 [&_.chat-markdown_h1]:text-sm [&_.chat-markdown_h2]:mb-1.5 [&_.chat-markdown_h2]:mt-3 [&_.chat-markdown_h2]:text-[13px] [&_.chat-markdown_h3]:mb-1 [&_.chat-markdown_h3]:mt-2 [&_.chat-markdown_h3]:text-[13px] [&_.chat-markdown_table]:text-[12px]"
          style={COMPACT_MARKDOWN_VARS}
          data-testid="context-usage-content-preview-markdown"
          aria-label="Instruction content preview"
        >
          <Markdown>{content}</Markdown>
        </div>
      ) : (
        <pre
          aria-label="Instruction content preview"
          data-testid="context-usage-content-preview-text"
          className="max-w-none whitespace-pre-wrap break-words px-3 py-2.5 font-sans text-[13px] leading-relaxed text-gray-700"
        >
          {content}
        </pre>
      )}
    </div>
  );
}
