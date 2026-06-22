# ADR-019: Vercel to Cloudflare Pages Deployment Migration

Date: 2026-06-02
Status: ACCEPTED

## Context

The Starlight documentation site at `app/` is a pure SSG build (`output: 'static'`). Vercel was the initial deploy provider. Cloudflare Pages offers:

- Global CDN with unlimited bandwidth on the free tier
- No adapter required for static Astro builds
- Direct `wrangler pages deploy dist` from GitHub Actions
- Custom domain support for `ai-native-sdlc.org`

Astro 6 + `@astrojs/cloudflare` v13 dropped official Cloudflare Pages adapter support for SSR/hybrid apps in favor of Workers. This project does not use SSR — static output only — so Pages Direct Upload via Wrangler is the correct path without adding `@astrojs/cloudflare`.

## Decision

Replace the `deploy` slot integration from `vercel` to `cloudflare-pages`.

### Deployment mechanism

| Stage | Command |
|---|---|
| Staging | `npx wrangler pages deploy dist --project-name=$PROJECT --branch=staging` |
| Production | `npx wrangler pages deploy dist --project-name=$PROJECT --branch=main` |

Build runs in GitHub Actions (`app/` root). No `vercel.json`, no Cloudflare adapter in `astro.config.mjs`.

### CI secrets contract

| Secret | Purpose |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Wrangler authentication (Pages Edit permission) |
| `CLOUDFLARE_ACCOUNT_ID` | Account scope for Wrangler |
| `CLOUDFLARE_PAGES_PROJECT_NAME` | Target Pages project |
| `ASTRO_SITE` | Canonical URL for build + production smoke |
| `PRODUCTION_URL` | Optional alias for post-deploy smoke |

Remove: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.

### Rollback

Post-deploy smoke failure triggers `wrangler pages deployment rollback` to the previous production deployment ID. No one-command equivalent to `vercel rollback --yes` — deployment ID lookup required.

### Feature parity

| Vercel capability | Cloudflare Pages equivalent |
|---|---|
| Preview URLs per branch | Branch deployments (`*.pages.dev`) |
| Zero-config Astro static | Yes — upload `dist/` only |
| CLI rollback | `wrangler pages deployment rollback` (requires deployment ID) |
| Git integration | Optional — we use GitHub Actions + Direct Upload |
| Serverless functions | Not needed (SSG only) |

## Consequences

- `.github/workflows/deploy.yaml` rewritten for Wrangler
- `.sdlc/integrations/vercel/` removed; `cloudflare-pages/` materialized
- Agents and deployment rules updated
- DNS for `ai-native-sdlc.org` must point to Cloudflare (not Hostinger/Vercel)
- Integration status remains `pending_credentials` until GitHub Secrets are configured

## Verification

1. `cd app && npm run build` exits 0
2. `cd .sdlc && npm run doctor:operational` passes integration check for `cloudflare-pages`
3. Manual deploy with configured secrets produces a reachable `*.pages.dev` URL
4. Post-deploy smoke against production custom domain returns HTTP 200
