---
name: browser-user
description: Execute browser automation tasks using the user's Chrome browser with active sessions and authentication. Use when the user invokes /run:browser or /run:browser, with optional --remote for Chrome on another machine. Requires authenticated sessions, user cookies, logged-in state, or access to services that require prior login (e.g. Plane, Cloudflare, GitHub).
---

# browser-user

Executes browser tasks through the Playwright Extension MCP. Local mode uses `user-playwright` on the same machine as Cursor. Remote mode tunnels to an MCP server running alongside Chrome on another machine — see [remote.md](remote.md).

**Command entry point:** [`.cursor/commands/run-browser.md`](../../commands/run:browser.md)

## Connection modes

| Mode | Trigger | MCP server |
|---|---|---|
| Local | `/run:browser <prompt>` | `user-playwright` |
| Remote | `/run:browser --remote <spec> <prompt>` | `user-playwright-remote` (or profile override) |

For `--remote`, read and follow [remote.md](remote.md) before pre-flight.

## Pre-flight

Resolve the MCP server from connection mode, then verify the extension is connected:

```
CallMcpTool → server: "<resolved-server>" → tool: "browser_tabs" → arguments: {}
```

If the call returns an error about the extension not found, stop and instruct the user:

**Local:**
1. Open Chrome on this machine
2. Confirm the [Playwright Extension](https://chromewebstore.google.com/detail/playwright-extension/mmlmfjhmonkocbjadbfplnigmagldckm) is installed and enabled
3. Retry

**Remote:**
1. On the remote machine: `npx @playwright/mcp@latest --extension --port 8931`
2. On this machine: `./.sdlc/bin/browser-remote-bridge.sh mcp+ext://user@remote-host`
3. Add `user-playwright-remote` to `~/.cursor/mcp.json` (see [remote-mcp.example.json](remote-mcp.example.json))
4. Reload MCP servers and retry

## Execution workflow

Every task follows this sequence:

1. **Navigate** — go to the target URL via `browser_navigate`
2. **Inspect** — use `browser_take_screenshot` to confirm page state before acting
3. **Act** — use the appropriate tool for the interaction
4. **Verify** — take a screenshot after each meaningful action to confirm result
5. **Report** — summarize what was done and what the final state is

Never chain multiple actions without a verification step between them.

## Tool reference

All tools use `CallMcpTool` with the resolved MCP server (`user-playwright` or `user-playwright-remote`).

| Tool | Purpose |
|---|---|
| `browser_tabs` | List open tabs — use to check connection and find existing tabs |
| `browser_navigate` | Navigate to a URL |
| `browser_navigate_back` | Go back in browser history |
| `browser_take_screenshot` | Visual confirmation of current page state |
| `browser_click` | Click an element |
| `browser_fill_form` | Fill form fields |
| `browser_select_option` | Select a dropdown option |
| `browser_hover` | Hover to reveal tooltips or menus |
| `browser_press_key` | Press keyboard keys |
| `browser_evaluate` | Execute JavaScript in page context |
| `browser_console_messages` | Read browser console output |
| `browser_network_request` | Inspect network requests |
| `browser_wait_for` | Wait for element or condition |
| `browser_file_upload` | Upload a file |
| `browser_close` | Close a tab |

Read the tool descriptor at `~/.cursor/projects/home-administrator-workspaces-jambu-ai-blog/mcps/user-playwright/tools/<tool-name>.json` before using any tool for the first time to confirm the exact parameter schema.

## Error handling

| Error | Action |
|---|---|
| Extension not found | Stop. Ask user to open Chrome with the extension installed. |
| Element not found | Take a screenshot, re-inspect the page, adjust selector. |
| Navigation timeout | Retry once; if it fails again, report the URL and status. |
| Session expired / redirect to login | Report to user — do not attempt to log in automatically. |

## Constraints

- Do NOT attempt to log in on behalf of the user. If a session is expired, stop and report.
- Do NOT store, log, or output credentials observed in the browser.
- Do NOT navigate away from the domain the user specified without confirmation.
- Actions are performed in the user's live browser — changes are real and immediate.
