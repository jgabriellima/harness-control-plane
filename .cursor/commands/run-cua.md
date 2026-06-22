---
name: run:cua
description: Computer-use runtime in Cursor — host desktop (Cua Driver MCP), isolated sandbox (Sandbox SDK / cua CLI), or Take Control noVNC handoff. User describes what to do; agent selects control plane and executes.
---

# /run:cua — Computer-Use Runtime (Cursor)

Cursor **is** the runtime. The user describes intent; the agent provisions Cua domain procedure, picks a control plane, executes, and reports.

This is **not** a feature ticket flow. It is operational computer-use — comparable to `/run:browser` for native desktop and sandboxes.

Playbooks (lazy-loaded): `pb.cua.sandbox-control`, `pb.cua.vnc-take-control`, `pb.cua.host-computer-use`

---

## Usage

```
/run:cua <intent>
/run:cua --host <intent>
/run:cua --sandbox [--fresh] <intent>
/run:cua --take-control [<sandbox-name>]
/run:cua --cloud <intent>
/run:cua --local <intent>
```

| Flag | Control plane | When |
|---|---|---|
| (none) | Agent infers from intent | Default — parse keywords below |
| `--host` | User machine via Cua Driver MCP or `localhost()` SDK | Drive native apps on the Cursor host without sandbox |
| `--sandbox` | Isolated Cua sandbox | GUI/shell task that must not touch host |
| `--fresh` | Ephemeral sandbox (with `--sandbox`) | One-shot task; auto-teardown when done |
| `--take-control` | noVNC web session for the user | Human takes over desktop; agent pauses or observes |
| `--cloud` | Cua Cloud sandbox | Requires `CUA_API_KEY` |
| `--local` | Docker/Lume sandbox on host | Requires Docker (Linux) or Lume (macOS VM) |

**Examples**

```
/run:cua abrir terminal no sandbox fresh e rodar uname -a
/run:cua --take-control
/run:cua --host clicar em Save no app Notes sem mover meu cursor
/run:cua --sandbox fresh instalar node e clonar repo X, depois /run:browser abrir PR no GitHub
/run:cua --cloud --sandbox abrir Chrome e pesquisar status do deploy
```

Nested slash commands in intent are **allowed** — execute sub-commands after sandbox/host prerequisites are satisfied.

---

## Execution Protocol

Read and follow [`.cursor/skills/cua/SKILL.md`](../skills/cua/SKILL.md) for transport details, pre-flight, and teardown.

### Step 0 — Provision domain procedure (internal)

At invocation, agent MUST load Cua playbooks — user never runs `sdlc_playbook.py` manually:

```bash
python3 .sdlc/bin/sdlc_playbook.py resolve --domain cua --json
python3 .sdlc/bin/sdlc_playbook.py provision --ids pb.cua.sandbox-control,pb.cua.vnc-take-control,pb.cua.host-computer-use --json
```

Then read procedure bodies from:

- `.sdlc/playbooks/domains/cua/sandbox-control.pb.yaml`
- `.sdlc/playbooks/domains/cua/vnc-take-control.pb.yaml`
- `.sdlc/playbooks/domains/cua/host-computer-use.pb.yaml`

If resolve returns `playbooks_missing`, stop and tell user to run `/sdlc:learn TryCUA sandbox Take Control host`.

### Step 1 — Parse intent → control plane

| Signal in intent | Plane |
|---|---|
| host, máquina, desktop, app nativo, cursor do usuário, background | `--host` |
| sandbox, isolado, fresh, efêmero, docker, VM | `--sandbox` (+ `--fresh` if one-shot) |
| take control, assumir, operador humano, VNC, noVNC, handoff | `--take-control` |
| cloud, cua.ai | `--cloud` |
| local, docker | `--local` |

Explicit flags override inference. Mixed intent (e.g. agent works then user takes over) → sequence: sandbox/host work first, then `--take-control`.

### Step 2 — Pre-flight

Run only checks for the selected plane(s). On failure, stop with remediation — do not guess.

| Plane | Check |
|---|---|
| Sandbox local | `docker ps` succeeds; `python3 -c "from cua import Sandbox, Image"` |
| Sandbox cloud | `CUA_API_KEY` set; `cua auth login` or key valid |
| Take Control | Named or fresh sandbox running; `command -v cua` |
| Host MCP | `cua-driver` on PATH; MCP server connected in Cursor |
| Host localhost SDK | User **explicitly** authorized foreground cursor control |

### Step 3 — Execute task

| Plane | Primary transport |
|---|---|
| Sandbox | Python Sandbox SDK via Shell one-shot scripts, or `cua sb exec/shell` |
| Take Control | `cua sb vnc <name> [--local]` or deliver `get_display_url()` URL (redact password in logs) |
| Host background | `CallMcpTool` → `cua-driver` tools (`list_windows`, `screenshot`, `click`, `type`, …) |
| Host foreground | `async with cua.localhost() as host:` — only after user consent |

After each meaningful action: screenshot or shell output as verification. Never chain blind clicks.

### Step 4 — Nested SDLC commands

When intent references another slash command (`/run:browser`, `/run:e2e`, …):

1. Complete Cua plane setup first (sandbox ready or host MCP connected).
2. Invoke nested command with its own protocol.
3. Return control to Cua plane if teardown still required.

### Step 5 — Teardown and report

| Plane | Teardown |
|---|---|
| `--fresh` sandbox | Exit ephemeral context or `cua sb delete` |
| Persistent sandbox | Keep running only if user asked; else delete |
| Take Control | User closes browser tab; revoke share URLs by deleting sandbox |
| Host MCP | Leave daemon running unless user asked to stop |

Report: control plane used, sandbox name (if any), artifacts (screenshot paths), VNC URL **redacted**, nested commands invoked, failures.

---

## Constraints

- MUST NOT use Sandbox SDK to control the host — use `--host` plane.
- MUST NOT log VNC URLs with password query params.
- MUST NOT run `localhost()` without explicit user authorization.
- MUST NOT skip Step 0 playbook provision — procedure lives in playbooks, not in agent memory.
- Prefer Cua Driver MCP over shell `cua-driver` for host tasks in Cursor (vision grounding).

---

## Aliases

`/cua` is an alias for `/run:cua`. Same protocol.

---

## User setup (one-time)

| Need | Setup |
|---|---|
| Sandbox SDK | `pip install cua` (Python 3.12+) |
| CLI | `curl -LsSf https://cua.ai/cli/install.sh \| sh` |
| Cloud | `export CUA_API_KEY=...` from cua.ai dashboard |
| Host MCP | `cua-driver mcp-config --client cursor` → `.cursor/mcp.json` → reload MCP |
| macOS TCC | Accessibility + Screen Recording for CuaDriver.app |
