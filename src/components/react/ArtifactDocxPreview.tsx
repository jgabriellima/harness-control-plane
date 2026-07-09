import mammoth from 'mammoth';
import React, { useEffect, useState } from 'react';

interface ArtifactDocxPreviewProps {
  previewUrl: string;
}

export default function ArtifactDocxPreview({ previewUrl }: ArtifactDocxPreviewProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(previewUrl);
        if (!response.ok) {
          throw new Error(`Failed to load document (${response.status})`);
        }

        const buffer = await response.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
        if (!cancelled) {
          setHtml(result.value);
        }
      } catch (loadError) {
        if (!cancelled) {
          const message = loadError instanceof Error ? loadError.message : 'Failed to render document';
          setError(message);
          setHtml(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [previewUrl]);

  if (loading) {
    return <p className="p-4 text-sm text-gray-500">Loading document…</p>;
  }

  if (error) {
    return (
      <p className="p-4 text-sm text-red-600" role="alert">
        {error}
      </p>
    );
  }

  return (
    <div
      className="h-full min-h-0 overflow-y-auto bg-white p-6"
      data-testid="chat-artifact-docx-preview"
    >
      <article
        className="prose prose-sm max-w-none text-gray-900 [&_table]:border-collapse [&_td]:border [&_td]:border-gray-200 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-gray-200 [&_th]:bg-gray-50 [&_th]:px-2 [&_th]:py-1"
        dangerouslySetInnerHTML={{ __html: html ?? '' }}
      />
    </div>
  );
}
