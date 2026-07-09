import { PptxViewer } from '@aiden0z/pptx-renderer';
import React, { useEffect, useRef, useState } from 'react';

interface ArtifactPptxPreviewProps {
  previewUrl: string;
  fileName: string;
}

export default function ArtifactPptxPreview({ previewUrl, fileName }: ArtifactPptxPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<PptxViewer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [slideIndex, setSlideIndex] = useState(0);
  const [slideCount, setSlideCount] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    let cancelled = false;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(previewUrl);
        if (!response.ok) {
          throw new Error(`Failed to load presentation (${response.status})`);
        }

        const buffer = await response.arrayBuffer();
        if (cancelled) {
          return;
        }

        const viewer = await PptxViewer.open(buffer, container, {
          renderMode: 'slide',
          lazySlides: true,
          lazyMedia: true,
          fitMode: 'contain',
          onSlideChange: (index) => {
            if (!cancelled) {
              setSlideIndex(index);
            }
          },
        });

        if (cancelled) {
          viewer.destroy();
          return;
        }

        viewerRef.current = viewer;
        setSlideCount(viewer.slideCount);
        setSlideIndex(viewer.currentSlideIndex);
      } catch (loadError) {
        if (!cancelled) {
          const message =
            loadError instanceof Error ? loadError.message : 'Failed to render presentation';
          setError(message);
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
      viewerRef.current?.destroy();
      viewerRef.current = null;
      container.replaceChildren();
    };
  }, [previewUrl]);

  const goToSlide = (index: number): void => {
    const viewer = viewerRef.current;
    if (!viewer || slideCount === 0) {
      return;
    }
    void viewer.goToSlide(index);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-100" data-testid="chat-artifact-pptx-preview">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 py-2">
        <p className="truncate text-xs font-medium text-gray-700">{fileName}</p>
        {slideCount > 0 ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              disabled={slideIndex <= 0}
              onClick={() => goToSlide(slideIndex - 1)}
            >
              Previous
            </button>
            <span className="text-xs text-gray-500">
              {slideIndex + 1} / {slideCount}
            </span>
            <button
              type="button"
              className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              disabled={slideIndex >= slideCount - 1}
              onClick={() => goToSlide(slideIndex + 1)}
            >
              Next
            </button>
          </div>
        ) : null}
      </div>

      {loading ? <p className="p-4 text-sm text-gray-500">Loading presentation…</p> : null}
      {error ? (
        <p className="p-4 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <div
        ref={containerRef}
        className="relative min-h-0 flex-1 overflow-auto p-4"
        aria-label={`PowerPoint preview: ${fileName}`}
      />
    </div>
  );
}
