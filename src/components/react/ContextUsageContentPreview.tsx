'use client';

import { Check } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

const COPY_FEEDBACK_MS = 2000;

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
    <div className="space-y-1.5" data-testid={testId}>
      <div className="flex justify-end">
        <button
          type="button"
          aria-label={copied ? 'Copied to clipboard' : 'Copy content'}
          data-testid="context-usage-content-copy"
          data-copy-state={copyState}
          className={cn(
            'inline-flex min-w-[3.75rem] items-center justify-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors',
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
      <textarea
        readOnly
        value={content}
        aria-label="Instruction content preview"
        data-testid="context-usage-content-preview-textarea"
        className="min-h-32 w-full resize-y overflow-auto whitespace-pre-wrap break-words rounded-md border border-gray-100 bg-gray-50 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-200"
      />
    </div>
  );
}
