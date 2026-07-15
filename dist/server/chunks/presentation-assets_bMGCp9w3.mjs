import { existsSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';

function resolveProjectAssetPath(projectRoot, assetPath) {
  const trimmed = assetPath.trim();
  if (!trimmed || trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return null;
  }
  const absolute = trimmed.startsWith("/") ? trimmed : resolve(projectRoot, trimmed);
  const workspaceRoot = resolve(projectRoot, "..");
  const rel = relative(workspaceRoot, absolute);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    return null;
  }
  return existsSync(absolute) ? absolute : null;
}
function presentationAssetUrl(assetPath) {
  if (!assetPath?.trim()) {
    return void 0;
  }
  const trimmed = assetPath.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("/")) {
    return trimmed;
  }
  return `/api/ui/brand-asset?path=${encodeURIComponent(trimmed)}`;
}
function resolvePresentationAssets(raw) {
  if (!raw) {
    return void 0;
  }
  return {
    icon_light: presentationAssetUrl(raw.icon_light) ?? raw.icon_light,
    icon_dark: presentationAssetUrl(raw.icon_dark) ?? raw.icon_dark,
    wordmark_light: presentationAssetUrl(raw.wordmark_light) ?? raw.wordmark_light,
    wordmark_dark: presentationAssetUrl(raw.wordmark_dark) ?? raw.wordmark_dark
  };
}

export { resolvePresentationAssets as a, resolveProjectAssetPath as r };
