#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { parse as parseYaml } from 'yaml';

/**
 * Resolve .env files for control-plane dev/desktop processes.
 * Order: harness .env → project app/.env → host repo root .env → git worktree root .env
 */
export function resolvePrimaryRepoRoot(worktreeRoot) {
  const gitPath = path.join(worktreeRoot, '.git');
  if (!existsSync(gitPath)) {
    return null;
  }

  try {
    const content = readFileSync(gitPath, 'utf8').trim();
    const match = content.match(/^gitdir:\s*(.+)$/m);
    if (!match) {
      return null;
    }
    const gitdir = path.resolve(worktreeRoot, match[1].trim());
    return path.dirname(path.dirname(path.dirname(gitdir)));
  } catch {
    return null;
  }
}

export function resolveEnvFilePaths(appRoot) {
  const files = [];
  const seen = new Set();

  function add(pathValue) {
    if (!pathValue || seen.has(pathValue)) {
      return;
    }
    seen.add(pathValue);
    files.push(pathValue);
  }

  const localEnv = path.join(appRoot, '.env');
  add(existsSync(localEnv) ? localEnv : null);

  const projectRoot = process.env.CONTROL_PLANE_PROJECT_ROOT?.trim();
  if (projectRoot) {
    const resolvedProject = path.resolve(projectRoot);
    const projectEnv = path.join(resolvedProject, '.env');
    add(existsSync(projectEnv) ? projectEnv : null);

    const parentEnv = path.join(resolvedProject, '..', '.env');
    add(existsSync(parentEnv) ? parentEnv : null);
  }

  const hostRepo = process.env.CONTROL_PLANE_HOST_REPO?.trim();
  if (hostRepo) {
    const hostEnv = path.join(path.resolve(hostRepo), '.env');
    add(existsSync(hostEnv) ? hostEnv : null);
  }

  const repoRoot = resolvePrimaryRepoRoot(path.join(appRoot, '..'));
  if (repoRoot) {
    const primaryEnv = path.join(repoRoot, '.env');
    add(existsSync(primaryEnv) ? primaryEnv : null);
  }

  return files;
}

export function applyEnvFilesToRecord(env, envFiles) {
  for (const envPath of envFiles) {
    if (!existsSync(envPath)) {
      continue;
    }
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      const separator = trimmed.indexOf('=');
      if (separator <= 0) {
        continue;
      }
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim();
      if (key && !(key in env)) {
        env[key] = value;
      }
    }
  }
  return env;
}

export function resolveDesktopBundleIdentifier(projectRoot) {
  if (!projectRoot?.trim()) {
    return null;
  }

  const configPath = path.join(path.resolve(projectRoot), 'ui.config.yaml');
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const doc = parseYaml(readFileSync(configPath, 'utf8'));
    const identifier = doc?.distribution?.desktop?.identifier?.trim();
    return identifier || null;
  } catch {
    return null;
  }
}

export function applyDesktopBundleEnv(env, projectRoot) {
  const bundleId = resolveDesktopBundleIdentifier(projectRoot);
  if (!bundleId) {
    return env;
  }
  return {
    ...env,
    TAURI_BUNDLE_IDENTIFIER: bundleId,
    JAMBU_HOST_BUNDLE_ID: bundleId,
  };
}
