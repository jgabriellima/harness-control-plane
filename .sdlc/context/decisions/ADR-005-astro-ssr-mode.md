# ADR-005 — Switch Astro Output Mode to SSR for SQLite Persistence

## Status

PROPOSED

Superseded by: N/A

---

## Context

The blog post CRUD feature (JAMBU-9) requires persisting posts in a local SQLite database using `better-sqlite3`. `better-sqlite3` is a native Node.js addon that performs synchronous I/O against a file on the local filesystem. It requires a persistent server-side process to hold the database connection and the in-process compiled module.

The Astro application's default `output` mode is `'static'`, which produces a fully pre-rendered site with no server process at runtime. In static mode, there is no request handler, no server process lifetime, and no mechanism to open or query a SQLite file at request time. Any attempt to use `better-sqlite3` in static output would fail at build time or produce an empty site with no runtime data path.

Additionally, the create-post form requires a POST handler at `/blog/new`. Astro's static mode has no support for server-side form POST handling; that is exclusively a server-rendered capability.

Without switching to SSR mode, neither the SQLite persistence layer nor the form submission route can be implemented.

---

## Decision

We will switch the Astro application's `output` configuration from the implicit static default to `'server'`, adding the `@astrojs/node` adapter in `standalone` mode, to enable server-side rendering and POST route handling required by the SQLite persistence layer.

> We will use `output: 'server'` with `@astrojs/node` instead of the static default because `better-sqlite3` requires a persistent server process and the POST `/blog/new` route requires server-side request handling.

---

## Rationale

### Alternatives considered

**1. Static output with client-side fetch to an external API**
Rejected: introduces a separate backend service not within the scope of this project. The architecture rule is "local SQLite database" — a separate API server contradicts that constraint.

**2. Astro hybrid mode (`output: 'hybrid'`) with selective SSR pages**
Viable but unnecessary complexity for this stage. Hybrid mode requires `export const prerender = false` on each server-rendered page. Given that all pages in this feature are SSR, and the existing static pages are few enough to add `export const prerender = true` explicitly, full `'server'` mode is simpler and more consistent.

**3. Use a different database that does not require a server process (e.g., in-memory store, flat JSON file)**
Rejected: the feature intent explicitly specifies SQLite. Substituting the storage backend changes the feature contract.

**4. Use a SQLite WASM binding that runs in the browser**
Rejected: browser-side storage is not persistent across users or page reloads in a shared blog context. The feature requires server-side persistence visible to all visitors.

### Why `@astrojs/node` in `standalone` mode

The Node adapter in `standalone` mode produces a self-contained server entry point (`dist/server/entry.mjs`) that can be executed directly with `node`. This satisfies local development (via `astro dev`) and local production testing without Vercel or Cloudflare dependencies. Deployment implications are deferred — SQLite is local-only and deployment is explicitly out of scope for JAMBU-9.

---

## Consequences

### Positive

- Enables `better-sqlite3` usage with a persistent connection and synchronous API
- Enables POST route handling at `/blog/new` without a separate backend
- Enables any future SSR feature (auth sessions, server-side search, dynamic OG images) without a second architectural switch

### Negative / Trade-offs

- Static pages must explicitly opt in to prerendering with `export const prerender = true` or accept being server-rendered per request (minor performance cost)
- The Astro build output changes from `dist/` containing static HTML files to a Node.js server entry point — incompatible with CDN-only deployment targets (Vercel static, Netlify static)
- `better-sqlite3` requires the SQLite database file to be present on the same filesystem as the Node process — not compatible with serverless or distributed deployments
- The `data/blog.db` file must be excluded from version control and managed as a runtime artifact

### Neutral

- Development workflow is unchanged: `astro dev` runs the SSR server on port 4321
- TypeScript strict mode, Tailwind, and Sentry constraints are unaffected by this change
- The Playwright E2E suite targets a running server, which remains the same as before

---

## Implementation Notes

This decision manifests in the following locations:

- `app/astro.config.mjs` — `output: 'server'` and `adapter: node({ mode: 'standalone' })`
- `app/package.json` — `@astrojs/node` added as a dependency
- `app/src/pages/` — existing static pages may require `export const prerender = true` to retain static rendering behavior
- `app/data/` — runtime directory for `blog.db`; must be added to `app/.gitignore`
- `app/src/lib/db.ts` — `better-sqlite3` singleton that opens `./data/blog.db`

---

## Review

| Field | Value |
|---|---|
| Author | AI-Native SDLC |
| Date | 2026-05-19 |
| Reviewed by | — |
| Ticket | JAMBU-9 |
