/** Client-safe workspace ids — keep free of Node imports for browser bundles. */

/** Canonical default project — always provisioned under `{repo}/workspaces/default/`. */
export const DEFAULT_WORKSPACE_ID = 'default';

/** Prior default workspace folder id (renamed to {@link DEFAULT_WORKSPACE_ID} on boot). */
export const LEGACY_DEFAULT_WORKSPACE_ID = 'business-workflows';
