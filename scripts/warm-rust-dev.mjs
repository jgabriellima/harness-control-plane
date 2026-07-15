#!/usr/bin/env node
/**
 * Pre-compile the Tauri Rust shell in dev profile so `tauri dev` links instead of
 * compiling from scratch while the operator waits for the window.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const harnessRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(harnessRoot, 'src-tauri', 'Cargo.toml');

/**
 * @param {{ logPrefix?: string, harnessRoot?: string }} [options]
 * @returns {Promise<number>}
 */
export function warmRustDevBuild(options = {}) {
  const root = options.harnessRoot ?? harnessRoot;
  const logPrefix = options.logPrefix ?? '[warm-rust-dev]';

  if (process.env.TAURI_SKIP_RUST_WARM === '1') {
    console.log(`${logPrefix} skipped (TAURI_SKIP_RUST_WARM=1)`);
    return Promise.resolve(0);
  }

  console.log(`${logPrefix} compiling Tauri shell (dev profile)…`);

  return new Promise((resolve) => {
    const child = spawn(
      'cargo',
      [
        'build',
        '--manifest-path',
        manifestPath,
        '--bin',
        'business-runtime',
        '--no-default-features',
      ],
      {
        cwd: root,
        stdio: 'inherit',
        env: process.env,
      },
    );

    child.on('error', (error) => {
      console.warn(`${logPrefix} cargo unavailable: ${error.message}`);
      resolve(1);
    });

    child.on('exit', (code) => {
      if (code === 0) {
        console.log(`${logPrefix} ready`);
      } else {
        console.warn(`${logPrefix} cargo build exited ${code ?? 'unknown'} — tauri dev will retry`);
      }
      resolve(code ?? 1);
    });
  });
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  const code = await warmRustDevBuild();
  process.exit(code === 0 ? 0 : 0);
}
