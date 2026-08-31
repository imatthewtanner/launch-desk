#!/usr/bin/env bash
set -euo pipefail

plugin_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_root="${LAUNCH_DESK_REPO:-$(cd "$plugin_dir/../.." && pwd)}"
mcp_dir="$repo_root/mcp-app"

if [[ ! -f "$mcp_dir/package.json" ]]; then
  echo "Launch Desk MCP package not found at $mcp_dir." >&2
  echo "Set LAUNCH_DESK_REPO to the root of your launch-desk clone." >&2
  exit 1
fi

if [[ ! -d "$mcp_dir/node_modules" ]]; then
  echo "Launch Desk MCP dependencies are not installed." >&2
  echo "Run: npm --prefix \"$mcp_dir\" install" >&2
  exit 1
fi

exec npm --prefix "$mcp_dir" start
