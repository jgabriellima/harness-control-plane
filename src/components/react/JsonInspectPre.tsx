'use client';

import React, { useEffect, useState } from 'react';

import { highlightJsonText, isJsonInspectableText } from '@/lib/json-syntax-highlight';

const INSPECT_PRE_CLASS =
  'max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-gray-200 bg-gray-50 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-gray-600';

interface JsonInspectPreProps {
  text: string;
  testId?: string;
}

export default function JsonInspectPre({ text, testId }: JsonInspectPreProps) {
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const shouldHighlight = isJsonInspectableText(text);

  useEffect(() => {
    if (!shouldHighlight) {
      setHighlightedHtml(null);
      return;
    }

    let cancelled = false;

    void highlightJsonText(text).then((html) => {
      if (!cancelled) {
        setHighlightedHtml(html);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [shouldHighlight, text]);

  if (highlightedHtml) {
    return (
      <div
        className={`inspect-json-highlight ${INSPECT_PRE_CLASS}`}
        data-testid={testId ?? 'tool-inspect-json-highlight'}
        dangerouslySetInnerHTML={{ __html: highlightedHtml }}
      />
    );
  }

  return (
    <pre className={INSPECT_PRE_CLASS} data-testid={testId ?? 'tool-inspect-pre'}>
      {text}
    </pre>
  );
}
