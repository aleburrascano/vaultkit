#!/usr/bin/env bash
# Remove a connected vault locally and from MCP — does NOT delete the GitHub repo.
#
# Usage: vaultkit disconnect <vault-name>
set -euo pipefail

if [ $# -eq 0 ]; then
  echo "Usage: vaultkit disconnect <vault-name>"
  exit 1
fi

VAULT_NAME="$1"

if [[ "$VAULT_NAME" =~ / ]]; then
  echo "Error: provide the vault name only (e.g. 'SystemDesign'), not owner/repo."
  exit 1
fi

if ! [[ "$VAULT_NAME" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo "Error: vault name must contain only letters, numbers, hyphens, and underscores."
  exit 1
fi

if command -v cygpath >/dev/null 2>&1; then
  CLAUDE_JSON=$(cygpath -m "$HOME/.claude.json")
else
  CLAUDE_JSON="$HOME/.claude.json"
fi

# Require the vault to be in the MCP registry — no CWD fallback (too dangerous)
VAULT_DIR=$(node -e "
const fs = require('fs');
const path = require('path');
const file = process.argv[1];
const name = process.argv[2];
if (!fs.existsSync(file)) process.exit(1);
let config;
try { config = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { process.exit(1); }
const s = (config.mcpServers || {})[name];
if (!s || !s.args) process.exit(1);
const scriptArg = s.args.find(a => String(a).endsWith('.mcp-start.js'));
if (!scriptArg) process.exit(1);
console.log(path.dirname(scriptArg));
" "$CLAUDE_JSON" "$VAULT_NAME" 2>/dev/null) || {
  echo "Error: '$VAULT_NAME' is not a registered vaultkit vault."
  echo "Run 'vaultkit list' to see what's registered."
  exit 1
}

# Convert Windows path to POSIX for bash file operations
if command -v cygpath >/dev/null 2>&1 && [[ "$VAULT_DIR" =~ ^[A-Za-z]: ]]; then
  VAULT_DIR_POSIX=$(cygpath -u "$VAULT_DIR")
else
  VAULT_DIR_POSIX="$VAULT_DIR"
fi

echo ""
echo "This will remove:"
[ -d "$VAULT_DIR_POSIX" ] && echo "  Local: $VAULT_DIR" \
                          || echo "  Local: $VAULT_DIR (not found — will skip)"
echo "  MCP:   $VAULT_NAME server registration"
echo ""
echo "The GitHub repo will NOT be deleted."
echo ""
read -r -p "Type the vault name to confirm: " CONFIRM
if [ "$CONFIRM" != "$VAULT_NAME" ]; then
  echo "Aborted."
  exit 0
fi
echo ""

if command -v claude >/dev/null 2>&1; then
  echo "Removing MCP server..."
  claude mcp remove "$VAULT_NAME" --scope user 2>/dev/null \
    && true || echo "  (not registered — skipping)"
else
  echo "Claude Code not found — MCP cleanup skipped."
  echo "  If registered, run: claude mcp remove $VAULT_NAME --scope user"
fi

if [ -d "$VAULT_DIR_POSIX" ]; then
  echo "Deleting local vault..."
  rm -rf "$VAULT_DIR_POSIX"
else
  echo "Local directory not found — skipping."
fi

echo ""
echo "Done. $VAULT_NAME disconnected."
echo "Reconnect anytime with: vaultkit connect <owner/$VAULT_NAME>"
