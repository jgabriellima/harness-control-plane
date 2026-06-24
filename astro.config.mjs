// @ts-check
import node from '@astrojs/node';
import react from '@astrojs/react';
import sentry from '@sentry/astro';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import topLevelAwait from 'vite-plugin-top-level-await';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const devPort = Number(process.env.CONTROL_PLANE_PORT ?? process.env.PORT ?? 4321);
const devHost = process.env.CONTROL_PLANE_HOST ?? '127.0.0.1';
const desktopDev = process.env.CONTROL_PLANE_DESKTOP === '1';

/** @see https://github.com/withastro/astro/pull/16191 — @tailwindcss/vite can suffix `.js` on reload. */
function fixAstroServerAppReload() {
  return {
    name: 'fix-astro-server-app-reload',
    enforce: 'pre',
    resolveId(source) {
      if (source === 'astro:server-app.js') {
        return 'astro:server-app';
      }
      return null;
    },
  };
}

export default defineConfig({
  devToolbar: { enabled: false },
  envDir: path.resolve(rootDir, '..'),
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  server: {
    host: devHost,
    port: devPort,
    strictPort: true,
  },
  integrations: [
    react(),
    sentry({
      dsn: process.env.SENTRY_DSN ?? '',
      enabled: Boolean(process.env.SENTRY_DSN),
    }),
  ],
  vite: {
    // @ts-expect-error Tailwind Vite plugin types differ across bundled Vite versions.
    plugins: [
      fixAstroServerAppReload(),
      topLevelAwait({
        promiseExportName: '__tla',
        promiseImportName: (index) => `__tla_${index}`,
      }),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(rootDir, 'src'),
      },
    },
    server: {
      host: devHost,
      port: devPort,
      strictPort: true,
      // Desktop webview attach triggers Vite full-reload; HMR off keeps first paint stable.
      hmr: desktopDev
        ? false
        : {
            host: devHost,
            protocol: 'ws',
          },
      watch: {
        // Runtime API writes (panel manifest, session registry) must not trigger full reload.
        ignored: [
          '**/.business/ui/**',
          '**/.business/runtime-sessions/**',
          '**/.business/handoffs/**',
          '**/.business/traces/**',
        ],
      },
    },
  },
});
