'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { Renderer } from '@openuidev/react-lang';
import type { ParseResult } from '@openuidev/react-lang';

import { Markdown } from '@/components/ui/markdown';
import { looksLikeOpenUILang } from '@/lib/openui-envelope';
import type { OpenUISurfacePart } from '@/lib/message-parts';
import { jambuOpenUILibrary } from '@/openui/library';

function friendlySurfaceMessage(): React.ReactNode {
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
      This visual layout could not be displayed. The written summary above still applies.
    </div>
  );
}

export default function OpenUISurface({
  part,
  isStreaming,
}: {
  part: OpenUISurfacePart;
  isStreaming?: boolean;
}) {
  const response = part.source.length > 0 ? part.source : null;
  const streaming = isStreaming ?? part.status === 'streaming';
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);

  const preferMarkdown = useMemo(() => {
    if (!response || response.trim().length === 0) {
      return false;
    }
    return !looksLikeOpenUILang(response);
  }, [response]);

  const handleParseResult = useCallback((result: ParseResult | null) => {
    setParseResult(result);
  }, []);

  const handleError = useCallback((errors: { message?: string; code?: string }[]) => {
    if (errors.length > 0) {
      console.warn('[openui] surface render issue', {
        surfaceId: part.id,
        status: part.status,
        errors,
      });
    }
  }, [part.id, part.status]);

  if (part.status === 'failed' && !response) {
    return friendlySurfaceMessage();
  }

  if (preferMarkdown && response) {
    return (
      <div data-testid="openui-surface" data-surface-id={part.id} data-render-mode="markdown-fallback">
        <Markdown>{response}</Markdown>
      </div>
    );
  }

  if (!response && !streaming) {
    return friendlySurfaceMessage();
  }

  const parsedRoot = parseResult?.root ?? null;
  const renderFailed = !streaming && Boolean(response) && parsedRoot === null;

  return (
    <div className="space-y-2" data-testid="openui-surface" data-surface-id={part.id}>
      <Renderer
        library={jambuOpenUILibrary}
        response={response}
        isStreaming={streaming}
        onParseResult={handleParseResult}
        onError={handleError}
      />
      {renderFailed ? friendlySurfaceMessage() : null}
    </div>
  );
}
