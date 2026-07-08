import { fileNameFromPath } from './file-reference';

/** Preview renderer selected by ChatArtifactPanel. */
export type ArtifactPreviewMode =
  | 'markdown'
  | 'code'
  | 'html'
  | 'pdf'
  | 'image'
  | 'spreadsheet'
  | 'document'
  | 'presentation'
  | 'model-3d'
  | 'unsupported-binary'
  | 'plaintext';

const SPREADSHEET_EXTENSIONS = new Set(['csv', 'tsv', 'xlsx', 'xls']);
const DOCUMENT_EXTENSIONS = new Set(['docx', 'doc', 'odt', 'rtf']);
const PRESENTATION_EXTENSIONS = new Set(['pptx', 'ppt', 'odp']);
const MODEL_3D_EXTENSIONS = new Set(['gltf', 'glb', 'obj', 'stl', 'fbx', 'usdz']);
const CAD_EXTENSIONS = new Set(['dxf', 'dwg', 'step', 'stp', 'iges', 'igs']);
const BLENDER_EXTENSIONS = new Set(['blend']);

export function extensionFromPath(filePath: string): string {
  return filePath.split('.').pop()?.toLowerCase() ?? '';
}

export function inferArtifactPreviewMode(filePath: string, mime: string): ArtifactPreviewMode {
  const extension = extensionFromPath(filePath);

  if (mime === 'text/markdown' || extension === 'md' || extension === 'mdx') {
    return 'markdown';
  }

  if (mime === 'text/html' || extension === 'html' || extension === 'htm') {
    return 'html';
  }

  if (mime === 'application/pdf' || extension === 'pdf') {
    return 'pdf';
  }

  if (mime.startsWith('image/')) {
    return 'image';
  }

  if (SPREADSHEET_EXTENSIONS.has(extension)) {
    return 'spreadsheet';
  }

  if (DOCUMENT_EXTENSIONS.has(extension)) {
    return 'document';
  }

  if (PRESENTATION_EXTENSIONS.has(extension)) {
    return 'presentation';
  }

  if (MODEL_3D_EXTENSIONS.has(extension)) {
    return 'model-3d';
  }

  if (BLENDER_EXTENSIONS.has(extension) || CAD_EXTENSIONS.has(extension)) {
    return 'unsupported-binary';
  }

  if (
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime === 'application/vnd.ms-excel' ||
    mime === 'text/csv'
  ) {
    return 'spreadsheet';
  }

  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'application/msword'
  ) {
    return 'document';
  }

  if (
    mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    mime === 'application/vnd.ms-powerpoint'
  ) {
    return 'presentation';
  }

  if (mime.startsWith('model/')) {
    return 'model-3d';
  }

  return 'plaintext';
}

export function unsupportedBinaryMessage(filePath: string): string {
  const extension = extensionFromPath(filePath);
  const name = fileNameFromPath(filePath);

  if (BLENDER_EXTENSIONS.has(extension)) {
    return `${name} is a Blender project file (.blend). Export to glTF/GLB from Blender for in-browser 3D preview, or download to open in Blender.`;
  }

  if (CAD_EXTENSIONS.has(extension)) {
    return `${name} is a CAD file (.${extension}). Convert to glTF, STL, or DXF for web preview, or download to open in your CAD application.`;
  }

  return `No inline preview is available for ${name}. Download or open in an external application.`;
}

/** Files parsed client-side from the raw workspace endpoint. */
export function isClientParsedBinaryPreview(mode: ArtifactPreviewMode): boolean {
  return mode === 'spreadsheet' || mode === 'document' || mode === 'presentation' || mode === 'model-3d';
}
