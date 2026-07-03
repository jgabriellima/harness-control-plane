export interface ChatArtifactSelection {
  path: string;
  content: string | null;
  mime: string;
  size: number;
  loading: boolean;
  error: string | null;
  encoding: 'utf8' | 'binary';
  previewUrl: string | null;
}

export function emptyArtifactSelection(path: string): ChatArtifactSelection {
  return {
    path,
    content: null,
    mime: 'text/plain',
    size: 0,
    loading: true,
    error: null,
    encoding: 'utf8',
    previewUrl: null,
  };
}
