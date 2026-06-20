// @ts-check
import node from '@astrojs/node';
import react from '@astrojs/react';
import sentry from '@sentry/astro';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  devToolbar: { enabled: false },
  envDir: path.resolve(rootDir, '..'),
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [
    react(),
    sentry({
      dsn: process.env.SENTRY_DSN ?? '',
      enabled: Boolean(process.env.SENTRY_DSN),
    }),
  ],
  vite: {
    // @ts-expect-error Tailwind Vite plugin types differ across bundled Vite versions.
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(rootDir, 'src'),
      },
    },
    server: {
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
