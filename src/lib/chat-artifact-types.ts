export interface ChatArtifactSelection {
  path: string;
  content: string | null;
  mime: string;
  loading: boolean;
  error: string | null;
}

export function emptyArtifactSelection(path: string): ChatArtifactSelection {
  return {
    path,
    content: null,
    mime: 'text/plain',
    loading: true,
    error: null,
  };
}
