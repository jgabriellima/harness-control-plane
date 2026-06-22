---
name: run:browser
description: Execute browser automation through the user's Chrome with active sessions. Local mode uses Playwright Extension on the same machine. Remote mode connects to Chrome on another machine via SSH tunnel + MCP HTTP or CDP.
---

# /run:browser — Authenticated Browser Automation

Automates tasks in the user's real Chrome browser (sessions, cookies, SSO) via the Playwright Extension MCP. Use this instead of the internal Cursor browser when the task requires logged-in state.

## Usage

```
/run:browser <prompt>
/run:browser --remote <connection-spec> <prompt>
```

| Mode | When |
|---|---|
| Local (default) | Chrome and Cursor run on the same machine |
| `--remote` | Chrome runs on another machine (laptop, workstation, CI runner with display) |

**Examples**

```
/run:browser Open Plane and create a ticket in the current sprint
/run:browser --remote mcp+ext://alice@workstation.local:8931 Check GitHub PR checks for jambu/ai-blog
/run:browser --remote cdp://bob@192.168.1.50:9222 Navigate to Cloudflare Pages and confirm latest deployment
/run:browser --remote profile:home-laptop Take a screenshot of PostHog errors dashboard
```

---

## Execution Protocol

Read and follow [`.cursor/skills/run:browser/SKILL.md`](../skills/run:browser/SKILL.md) for tool usage, verification steps, and constraints.

### Step 1 — Resolve connection mode

| Flag | MCP server | Pre-flight |
|---|---|---|
| (none) | `user-playwright` | `browser_tabs` on `user-playwright` |
| `--remote` | `user-playwright-remote` (or profile-defined name) | Parse spec → establish bridge → health check → `browser_tabs` |

If `--remote` is present, read [`.cursor/skills/run:browser/remote.md`](../skills/run:browser/remote.md) and execute its connection protocol before any browser action.

### Step 2 — Pre-flight

```
CallMcpTool → server: "<resolved-server>" → tool: "browser_tabs" → arguments: {}
```

On failure, stop and report the connection mode, spec, and remediation from the remote or local troubleshooting table. Do not fall back to the internal Cursor browser without explicit user approval.

### Step 3 — Execute task

Follow the browser-user workflow: navigate → screenshot → act → verify → report.

### Step 4 — Remote cleanup (remote mode only)

If this session started an SSH tunnel via `.sdlc/bin/browser-remote-bridge.sh`, leave the tunnel running unless the user asked for a one-shot task. Report the tunnel PID and how to stop it (`kill <pid>` or `.sdlc/bin/browser-remote-bridge.sh --stop <name>`).

---

## Connection spec grammar (`--remote`)

```
<spec> ::= profile:<name>
         | mcp+ext://[<user>@]<host>[:<port>]
         | cdp://[<user>@]<host>[:<port>]
         | direct://<host>:<port>/mcp
```

| Spec | Meaning | Bridge |
|---|---|---|
| `profile:<name>` | Load from `.sdlc/integrations/browser-remote.yaml` | Per profile `mode` field |
| `mcp+ext://user@host:8931` | Remote machine runs MCP with `--extension`; tunnel MCP HTTP port | SSH `-L 8931:127.0.0.1:8931` |
| `cdp://user@host:9222` | Remote Chrome with CDP; tunnel debugging port | SSH `-L 9222:127.0.0.1:9222` |
| `direct://host:8931/mcp` | MCP already reachable (VPN/LAN); no SSH | None |

Default ports: MCP `8931`, CDP `9222`.

---

## One-time setup (user)

### Local mode

1. Install [Playwright Extension](https://chromewebstore.google.com/detail/playwright-extension/mmlmfjhmonkocbjadbfplnigmagldckm) in Chrome.
2. Copy `PLAYWRIGHT_MCP_EXTENSION_TOKEN` from the extension UI into `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--extension"],
      "env": {
        "PLAYWRIGHT_MCP_EXTENSION_TOKEN": "<token-from-extension>"
      }
    }
  }
}
```

3. Reload MCP servers in Cursor Settings.

### Remote mode — on the machine that has Chrome

**Extension mode (preserves SSO / cookies / existing tabs):**

```bash
# Run on the remote machine where Chrome is open
npx @playwright/mcp@latest --extension --port 8931
# Optional: auto-approve extension connections
# PLAYWRIGHT_MCP_EXTENSION_TOKEN=<token> npx @playwright/mcp@latest --extension --port 8931
```

**CDP mode (connect to running Chrome without extension):**

1. In Chrome: `chrome://inspect/#remote-debugging` → enable "Allow remote debugging for this browser instance".
2. Or launch: `google-chrome --remote-debugging-port=9222`

### Remote mode — on the Cursor machine

Add a second MCP entry (keep local `playwright` unchanged):

```json
{
  "mcpServers": {
    "user-playwright-remote": {
      "url": "http://127.0.0.1:8931/mcp"
    }
  }
}
```

Start the tunnel before invoking `/run:browser --remote`:

```bash
./.sdlc/bin/browser-remote-bridge.sh mcp+ext://user@remote-host:8931
```

Reload MCP servers after the tunnel is up.

---

## Aliases

`/run:browser` is an alias for `/run:browser`. Both invoke the same skill and protocol.
