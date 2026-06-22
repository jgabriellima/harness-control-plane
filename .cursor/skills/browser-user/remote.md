# browser-user — Remote Connection Protocol

Use when `/browser-use --remote <spec>` is invoked or when the task explicitly states the browser is on another machine.

## Architecture constraint

The Playwright Extension talks to the MCP server over localhost on the **same machine as Chrome**. Remote access therefore requires one of:

| Strategy | Auth sessions | Complexity |
|---|---|---|
| **A. Remote MCP + extension + SSH tunnel** | Full (extension) | Medium — recommended |
| **B. Remote CDP + SSH tunnel** | Partial (CDP reuses browser, no extension UI) | Low |
| **C. Direct MCP HTTP (VPN/LAN)** | Full if extension on remote | Low on trusted network |

Strategy A is the default when the user needs logged-in sessions on a machine that is not running Cursor.

---

## Step 1 — Parse connection spec

Extract from the command argument:

| Pattern | Variables |
|---|---|
| `profile:<name>` | Load `~/.sdlc/integrations/browser-remote.yaml` or `.sdlc/integrations/browser-remote.yaml` (project overrides user) |
| `mcp+ext://[<user>@]<host>[:port]` | `user`, `host`, `port=8931` |
| `cdp://[<user>@]<host>[:port]` | `user`, `host`, `port=9222` |
| `direct://<host>:<port>/mcp` | No tunnel; MCP server name from profile or `user-playwright-remote` |

For `profile:<name>`, read the profile block:

```yaml
profiles:
  home-laptop:
    mode: mcp+ext
    host: workstation.local
    user: alice
    port: 8931
    mcp_server: user-playwright-remote
    ssh_key: ~/.ssh/id_ed25519
```

---

## Step 2 — Establish bridge

Run the bridge script (preferred):

```bash
./.sdlc/bin/browser-remote-bridge.sh <spec>
```

Or manually:

**MCP + extension (Strategy A):**

```bash
# Terminal 1 — on remote (once, or via systemd/launchd)
npx @playwright/mcp@latest --extension --port 8931

# Terminal 2 — on Cursor machine
ssh -N -L 8931:127.0.0.1:8931 user@remote-host
curl -sf http://127.0.0.1:8931/health && echo "MCP reachable"
```

**CDP (Strategy B):**

```bash
ssh -N -L 9222:127.0.0.1:9222 user@remote-host
# Local MCP must use CDP — user adds temporary mcp.json entry or profile switches args:
# "args": ["@playwright/mcp@latest", "--cdp-endpoint=http://127.0.0.1:9222"]
```

If the bridge script exits non-zero, stop and surface its stderr. Do not proceed to browser actions.

---

## Step 3 — Resolve MCP server name

| Mode | CallMcpTool `server` value |
|---|---|
| Local | `user-playwright` |
| Remote (default) | `user-playwright-remote` |
| Profile override | Value of `mcp_server` in profile |

Verify the server appears in the MCP tool descriptor path:
`~/.cursor/projects/<project>/mcps/<server-name>/tools/browser_tabs.json`

If missing, instruct the user to add the MCP entry from [`.cursor/skills/browser-user/remote-mcp.example.json`](remote-mcp.example.json) and reload MCP servers.

---

## Step 4 — Pre-flight on remote server

```
CallMcpTool → server: "<resolved-server>" → tool: "browser_tabs" → arguments: {}
```

| Result | Action |
|---|---|
| Tabs listed | Proceed with task |
| Extension not connected | Ask user to open Chrome on **remote** machine and confirm Playwright Extension is enabled |
| Connection refused | Tunnel down or remote MCP not running — re-run bridge |
| 401 / token error | Set `PLAYWRIGHT_MCP_EXTENSION_TOKEN` on **remote** MCP process (same token as remote extension UI) |

---

## Step 5 — Execute

Same workflow as local browser-user: navigate → screenshot → act → verify → report.

All `CallMcpTool` calls use the resolved remote server name, not `user-playwright`.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ECONNREFUSED 127.0.0.1:8931` | SSH tunnel not running | `./.sdlc/bin/browser-remote-bridge.sh <spec>` |
| Extension not found (remote) | MCP `--extension` not started on remote | Start MCP on remote with `--extension` |
| Empty tab list | Chrome closed on remote | Open Chrome on remote |
| Session expired | Cookies stale on remote browser | User re-authenticates on remote Chrome |
| MCP server name unknown | Missing `user-playwright-remote` in mcp.json | Add HTTP URL entry, reload MCP |
| Slow interactions | High-latency SSH | Expected; increase `browser_wait_for` timeouts |

---

## Security

- SSH tunnels bind to localhost on the Cursor machine; do not expose MCP on `0.0.0.0` without a firewall.
- Never commit `browser-remote.yaml` with tokens or passwords — file is gitignored.
- Do not log `PLAYWRIGHT_MCP_EXTENSION_TOKEN` or SSH credentials in chat output.
