import { Download, ExternalLink } from 'lucide-react';
import React from 'react';

interface ArtifactUnsupportedPreviewProps {
  message: string;
  previewUrl: string | null;
  fileName: string;
}

export default function ArtifactUnsupportedPreview({
  message,
  previewUrl,
  fileName,
}: ArtifactUnsupportedPreviewProps) {
  return (
    <div
      className="flex h-full min-h-0 flex-col items-center justify-center gap-4 p-8 text-center"
      data-testid="chat-artifact-unsupported-preview"
    >
      <p className="max-w-md text-sm text-gray-600">{message}</p>
      {previewUrl ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <a
            href={previewUrl}
            download={fileName}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </a>
          <a
            href={previewUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open externally
          </a>
        </div>
      ) : null}
    </div>
  );
}
