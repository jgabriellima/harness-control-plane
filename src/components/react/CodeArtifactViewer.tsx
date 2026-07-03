'use client';

import Editor from '@monaco-editor/react';
import React, { useEffect, useRef, useState } from 'react';

import { inferMonacoLanguageFromPath } from '@/lib/file-reference';

interface CodeArtifactViewerProps {
  path: string;
  content: string;
  mime?: string;
}

const MIN_VIEWER_HEIGHT = 240;

export default function CodeArtifactViewer({ path, content, mime }: CodeArtifactViewerProps) {
  const language = inferMonacoLanguageFromPath(path, mime);
  const containerRef = useRef<HTMLDivElement>(null);
  const [editorHeight, setEditorHeight] = useState(MIN_VIEWER_HEIGHT);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const syncHeight = (): void => {
      const nextHeight = Math.max(container.clientHeight, MIN_VIEWER_HEIGHT);
      setEditorHeight((current) => (current === nextHeight ? current : nextHeight));
    };

    syncHeight();

    const observer = new ResizeObserver(() => {
      syncHeight();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [path]);

  return (
    <div
      ref={containerRef}
      className="h-full min-h-0 w-full overflow-hidden rounded-lg border border-gray-200 bg-white"
      data-testid="chat-artifact-code-viewer"
    >
      <Editor
        height={editorHeight}
        language={language}
        value={content}
        theme="vs"
        loading={
          <pre className="h-full overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs text-gray-800">
            {content}
          </pre>
        }
        options={{
          readOnly: true,
          domReadOnly: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: 12,
          lineNumbers: 'on',
          wordWrap: 'on',
          padding: { top: 12, bottom: 12 },
          renderLineHighlight: 'none',
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          overviewRulerBorder: false,
          scrollbar: { vertical: 'auto', horizontal: 'auto' },
          contextmenu: false,
          folding: true,
          links: false,
        }}
      />
    </div>
  );
}
