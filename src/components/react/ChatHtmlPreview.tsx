'use client';

import React, { useState } from 'react';

import { looksLikeHtmlDocument } from '@/lib/html-document';
import { cn } from '@/lib/utils';

type HtmlViewMode = 'preview' | 'source';

interface ChatHtmlPreviewProps {
  source: string;
  className?: string;
}

export default function ChatHtmlPreview({ source, className }: ChatHtmlPreviewProps) {
  const [viewMode, setViewMode] = useState<HtmlViewMode>('preview');

  if (!looksLikeHtmlDocument(source)) {
    return (
      <code className="block whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-gray-700">
        {source}
      </code>
    );
  }

  return (
    <div
      className={cn('mb-3 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm', className)}
      data-testid="chat-html-preview"
    >
      <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-3 py-1.5">
        <span className="text-[11px] font-medium text-gray-600">HTML preview</span>
        <div className="flex gap-1">
          <button
            type="button"
            className={cn(
              'rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
              viewMode === 'preview'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            )}
            data-testid="chat-html-preview-tab-preview"
            onClick={() => setViewMode('preview')}
          >
            Preview
          </button>
          <button
            type="button"
            className={cn(
              'rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
              viewMode === 'source'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            )}
            data-testid="chat-html-preview-tab-source"
            onClick={() => setViewMode('source')}
          >
            Source
          </button>
        </div>
      </div>

      {viewMode === 'preview' ? (
        <iframe
          title="HTML preview"
          className="h-[min(480px,60vh)] w-full border-0 bg-white"
          sandbox="allow-scripts"
          srcDoc={source}
          data-testid="chat-html-preview-frame"
        />
      ) : (
        <pre className="max-h-[min(480px,60vh)] overflow-auto bg-gray-50 p-3">
          <code className="block whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-gray-700">
            {source}
          </code>
        </pre>
      )}
    </div>
  );
}
