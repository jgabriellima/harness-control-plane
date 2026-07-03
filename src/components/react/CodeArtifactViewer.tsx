'use client';

import Editor from '@monaco-editor/react';
import React from 'react';

import { inferMonacoLanguageFromPath } from '@/lib/file-reference';

interface CodeArtifactViewerProps {
  path: string;
  content: string;
  mime?: string;
}

export default function CodeArtifactViewer({ path, content, mime }: CodeArtifactViewerProps) {
  const language = inferMonacoLanguageFromPath(path, mime);

  return (
    <div
      className="h-full min-h-[480px] w-full overflow-hidden rounded-lg border border-gray-200 bg-white"
      data-testid="chat-artifact-code-viewer"
    >
      <Editor
        height="100%"
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
