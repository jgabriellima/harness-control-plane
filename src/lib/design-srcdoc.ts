import { injectDesignDeckBridge } from './design-deck-bridge';
import { looksLikeHtmlDocument } from './html-document';

export interface DesignSrcdocOptions {
  deck?: boolean;
}

/**
 * Wrap artifact HTML for a sandboxed iframe preview.
 * Full documents pass through unchanged; fragments get a minimal doctype shell.
 * When `deck` is set, injects the OD-compatible slide bridge for host navigation.
 */
export function buildDesignSrcdoc(html: string, options: DesignSrcdocOptions = {}): string {
  const wrapped = looksLikeHtmlDocument(html)
    ? html
    : `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>${html}</body>
</html>`;

  if (options.deck) {
    return injectDesignDeckBridge(wrapped, { clickNavigation: true });
  }

  return wrapped;
}
