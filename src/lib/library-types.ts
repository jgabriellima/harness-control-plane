export type LibraryItemSource = 'upload' | 'output' | 'workflow-output' | 'playbook-artifact';
export type LibraryItemKind = 'image' | 'file';
export type LibraryKindFilter = 'all' | 'images' | 'files';

export interface LibraryItem {
  id: string;
  name: string;
  path: string;
  projectId: string;
  projectName: string;
  source: LibraryItemSource;
  mime: string;
  size: number;
  modifiedAt: string;
  kind: LibraryItemKind;
}

export function libraryPreviewUrl(projectId: string, path: string): string {
  const params = new URLSearchParams({
    path,
    raw: '1',
    project_id: projectId,
  });
  return `/api/workspace/file?${params.toString()}`;
}

export function libraryDownloadUrl(projectId: string, path: string): string {
  return libraryPreviewUrl(projectId, path);
}
