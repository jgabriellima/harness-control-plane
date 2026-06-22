#!/usr/bin/env bash
# Establish SSH tunnel to a remote Playwright MCP or Chrome CDP endpoint.
# Usage:
#   ./.sdlc/bin/browser-remote-bridge.sh mcp+ext://user@host[:8931]
#   ./.sdlc/bin/browser-remote-bridge.sh cdp://user@host[:9222]
#   ./.sdlc/bin/browser-remote-bridge.sh profile:home-laptop
#   ./.sdlc/bin/browser-remote-bridge.sh --stop mcp+ext://user@host
#   ./.sdlc/bin/browser-remote-bridge.sh --status
set -euo pipefail

PID_DIR="${XDG_RUNTIME_DIR:-/tmp}/browser-remote-bridge"
mkdir -p "$PID_DIR"

usage() {
  cat <<'EOF'
Usage:
  browser-remote-bridge.sh <connection-spec>
  browser-remote-bridge.sh --stop <connection-spec>
  browser-remote-bridge.sh --status

Connection specs:
  mcp+ext://[<user>@]<host>[:port]   SSH tunnel for remote MCP+extension (default port 8931)
  cdp://[<user>@]<host>[:port]       SSH tunnel for remote Chrome CDP (default port 9222)
  profile:<name>                      Load host/user/port from browser-remote.yaml

Requires: ssh, curl
EOF
}

slugify() {
  echo "$1" | tr ':/@' '___'
}

find_profile_file() {
  local name="$1"
  local candidates=(
    ".sdlc/integrations/browser-remote.yaml"
    "$HOME/.sdlc/integrations/browser-remote.yaml"
  )
  for f in "${candidates[@]}"; do
    if [[ -f "$f" ]]; then
      echo "$f"
      return 0
    fi
  done
  echo "No browser-remote.yaml found. Copy .sdlc/integrations/browser-remote.example.yaml" >&2
  return 1
}

parse_yaml_profile() {
  local file="$1" profile="$2"
  python3 - "$file" "$profile" <<'PY'
import sys, yaml
path, name = sys.argv[1], sys.argv[2]
with open(path) as f:
    data = yaml.safe_load(f)
profiles = data.get("profiles") or {}
if name not in profiles:
    sys.exit(f"Profile '{name}' not found in {path}")
p = profiles[name]
mode = p.get("mode", "mcp+ext")
if mode == "direct":
    print(f"direct://{p['url'].replace('http://', '').replace('https://', '')}")
else:
    user = p.get("user", "")
    host = p["host"]
    port = p.get("port", 8931 if mode == "mcp+ext" else 9222)
    auth = f"{user}@" if user else ""
    print(f"{mode}://{auth}{host}:{port}")
PY
}

parse_spec() {
  local spec="$1"
  local mode user host port local_port

  if [[ "$spec" == profile:* ]]; then
    local profile_name="${spec#profile:}"
    local profile_file
    profile_file="$(find_profile_file "$profile_name")"
    spec="$(parse_yaml_profile "$profile_file" "$profile_name")"
  fi

  if [[ "$spec" == direct://* ]]; then
    echo "DIRECT ${spec#direct://}"
    return 0
  fi

  if [[ "$spec" =~ ^mcp\+ext://([^@]+@)?([^:/]+)(:([0-9]+))?$ ]]; then
    mode="mcp+ext"
    user="${BASH_REMATCH[1]%%@}"
    host="${BASH_REMATCH[2]}"
    port="${BASH_REMATCH[4]:-8931}"
    local_port="$port"
  elif [[ "$spec" =~ ^cdp://([^@]+@)?([^:/]+)(:([0-9]+))?$ ]]; then
    mode="cdp"
    user="${BASH_REMATCH[1]%%@}"
    host="${BASH_REMATCH[2]}"
    port="${BASH_REMATCH[4]:-9222}"
    local_port="$port"
  else
    echo "Invalid spec: $spec" >&2
    usage >&2
    exit 1
  fi

  echo "TUNNEL $mode $user $host $port $local_port"
}

start_tunnel() {
  local mode="$1" user="$2" host="$3" remote_port="$4" local_port="$5"
  local slug pid_file ssh_target

  slug="$(slugify "${mode}-${user}-${host}-${local_port}")"
  pid_file="$PID_DIR/${slug}.pid"

  if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    echo "Tunnel already running (PID $(cat "$pid_file")) for $mode://$user@$host:$remote_port"
    return 0
  fi

  ssh_target="$host"
  [[ -n "$user" ]] && ssh_target="${user}@${host}"

  echo "Starting SSH tunnel: localhost:${local_port} -> ${ssh_target}:127.0.0.1:${remote_port}"
  ssh -N -L "${local_port}:127.0.0.1:${remote_port}" "$ssh_target" &
  echo $! > "$pid_file"
  sleep 1

  if ! kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    rm -f "$pid_file"
    echo "SSH tunnel failed to start" >&2
    exit 1
  fi

  if [[ "$mode" == "mcp+ext" ]]; then
    if curl -sf "http://127.0.0.1:${local_port}/health" >/dev/null 2>&1; then
      echo "Remote MCP health OK at http://127.0.0.1:${local_port}/health"
    else
      echo "Tunnel up (PID $(cat "$pid_file")) but MCP health check failed."
      echo "On remote machine, run: npx @playwright/mcp@latest --extension --port ${remote_port}"
    fi
    echo ""
    echo "Cursor mcp.json entry:"
    echo '  "user-playwright-remote": { "url": "http://127.0.0.1:'"${local_port}"'/mcp" }'
  else
    echo "CDP tunnel up (PID $(cat "$pid_file")). Local endpoint: http://127.0.0.1:${local_port}"
    echo 'Use MCP args: ["@playwright/mcp@latest", "--cdp-endpoint=http://127.0.0.1:'"${local_port}"'"]'
  fi
}

stop_tunnel() {
  local spec="$1"
  local parsed mode user host port local_port slug pid_file

  parsed="$(parse_spec "$spec")"
  read -r kind mode user host port local_port <<< "$parsed"

  if [[ "$kind" == "DIRECT" ]]; then
    echo "Direct mode has no tunnel to stop."
    return 0
  fi

  slug="$(slugify "${mode}-${user}-${host}-${local_port}")"
  pid_file="$PID_DIR/${slug}.pid"

  if [[ -f "$pid_file" ]]; then
    kill "$(cat "$pid_file")" 2>/dev/null || true
    rm -f "$pid_file"
    echo "Stopped tunnel $slug"
  else
    echo "No tunnel found for $spec"
  fi
}

status_tunnels() {
  shopt -s nullglob
  local found=0
  for pid_file in "$PID_DIR"/*.pid; do
    found=1
    local pid name
    pid="$(cat "$pid_file")"
    name="$(basename "$pid_file" .pid)"
    if kill -0 "$pid" 2>/dev/null; then
      echo "RUNNING $name PID=$pid"
    else
      echo "STALE   $name (PID $pid dead)"
      rm -f "$pid_file"
    fi
  done
  [[ "$found" -eq 0 ]] && echo "No active tunnels."
}

main() {
  local action="start"
  local spec=""

  if [[ $# -lt 1 ]]; then
    usage
    exit 1
  fi

  case "$1" in
    -h|--help) usage; exit 0 ;;
    --stop) action="stop"; shift; spec="${1:-}" ;;
    --status) status_tunnels; exit 0 ;;
    *) spec="$1" ;;
  esac

  [[ -z "$spec" ]] && { usage; exit 1; }

  if [[ "$action" == "stop" ]]; then
    stop_tunnel "$spec"
    exit 0
  fi

  local parsed kind mode user host port local_port
  parsed="$(parse_spec "$spec")"
  read -r kind mode user host port local_port <<< "$parsed"

  if [[ "$kind" == "DIRECT" ]]; then
    local url="http://${mode}"
    if curl -sf "${url%/mcp}/health" >/dev/null 2>&1; then
      echo "Direct MCP reachable at $url"
    else
      echo "Direct MCP not reachable at $url" >&2
      exit 1
    fi
    exit 0
  fi

  start_tunnel "$mode" "$user" "$host" "$port" "$local_port"
}

main "$@"
