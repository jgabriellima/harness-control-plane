'use client';

import React, { useEffect, useId, useRef, useState } from 'react';

type MermaidApi = {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, text: string) => Promise<{ svg: string }>;
};

declare global {
  interface Window {
    mermaid?: MermaidApi;
  }
}

const MERMAID_SCRIPT_SRC = 'https://cdn.jsdelivr.net/npm/mermaid@11.6.0/dist/mermaid.min.js';
let mermaidLoaderPromise: Promise<MermaidApi> | null = null;

function loadMermaid(): Promise<MermaidApi> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('mermaid is client-only'));
  }

  if (window.mermaid) {
    return Promise.resolve(window.mermaid);
  }

  if (!mermaidLoaderPromise) {
    mermaidLoaderPromise = new Promise<MermaidApi>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = MERMAID_SCRIPT_SRC;
      script.async = true;
      script.onload = () => {
        const api = window.mermaid;
        if (!api) {
          reject(new Error('mermaid global missing after script load'));
          return;
        }
        api.initialize({
          startOnLoad: false,
          theme: 'neutral',
          securityLevel: 'strict',
          fontFamily: 'inherit',
        });
        resolve(api);
      };
      script.onerror = () => reject(new Error('mermaid script failed to load'));
      document.head.appendChild(script);
    });
  }

  return mermaidLoaderPromise;
}

export default function MermaidDiagram({ source }: { source: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reactId = useId();
  const diagramId = `mermaid-${reactId.replace(/:/g, '')}`;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const trimmed = source.trim();
    if (trimmed.length === 0) {
      return;
    }

    setFailed(false);

    void loadMermaid()
      .then(async (mermaid) => {
        if (cancelled) {
          return;
        }

        const { svg } = await mermaid.render(diagramId, trimmed);
        if (cancelled) {
          return;
        }
        container.innerHTML = svg;
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        console.warn('[mermaid] diagram render failed', error);
        setFailed(true);
      });

    return () => {
      cancelled = true;
      container.innerHTML = '';
    };
  }, [diagramId, source]);

  if (failed) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Diagram could not be rendered. The description is still available in the message text.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="mermaid-diagram overflow-x-auto rounded-lg border border-gray-200 bg-white p-3 [&_svg]:mx-auto [&_svg]:max-w-full"
      data-testid="mermaid-diagram"
    />
  );
}
