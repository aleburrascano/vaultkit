#!/usr/bin/env bash
# Permanently delete a vault: local directory, GitHub repo, and MCP registration.
#
# Usage: vault-destroy <vault-name>
set -euo pipefail

if [ $# -eq 0 ]; then
  echo "Usage: vaultkit destroy <vault-name>"
  exit 1
fi

VAULT_NAME="$1"

if ! [[ "$VAULT_NAME" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo "Error: vault name must contain only letters, numbers, hyphens, and underscores."
  exit 1
fi

if command -v cygpath >/dev/null 2>&1; then
  CLAUDE_JSON=$(cygpath -m "$HOME/.claude.json")
else
  CLAUDE_JSON="$HOME/.claude.json"
fi

# Look up vault path from MCP registry first
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
" "$CLAUDE_JSON" "$VAULT_NAME" 2>/dev/null) || VAULT_DIR=""

if [ -z "$VAULT_DIR" ]; then
  VAULT_DIR="${VAULTKIT_HOME:-$HOME/vaults}/$VAULT_NAME"
fi

# Convert Windows path to POSIX for bash file operations
if command -v cygpath >/dev/null 2>&1 && [[ "$VAULT_DIR" =~ ^[A-Za-z]: ]]; then
  VAULT_DIR_POSIX=$(cygpath -u "$VAULT_DIR")
else
  VAULT_DIR_POSIX="$VAULT_DIR"
fi

# Refuse to destroy anything that doesn't look like an Obsidian vault.
if [ -d "$VAULT_DIR_POSIX" ]; then
  if ! [ -d "$VAULT_DIR_POSIX/.obsidian" ] && \
     ! { [ -f "$VAULT_DIR_POSIX/CLAUDE.md" ] && [ -d "$VAULT_DIR_POSIX/raw" ] && [ -d "$VAULT_DIR_POSIX/wiki" ]; }; then
    echo "Error: $VAULT_DIR does not look like an Obsidian vault — aborting."
    exit 1
  fi
fi

GITHUB_USER=$(gh api user --jq '.login' 2>/dev/null || true)

if [ -n "$GITHUB_USER" ]; then
  if ! gh auth status 2>&1 | grep -q 'delete_repo'; then
    echo "Requesting delete_repo permission from GitHub..."
    gh auth refresh -h github.com -s delete_repo
  fi
fi

echo ""
echo "This will permanently delete:"
[ -d "$VAULT_DIR_POSIX" ] && echo "  Local:  $VAULT_DIR" \
                           || echo "  Local:  $VAULT_DIR (not found — will skip)"
[ -n "$GITHUB_USER" ] && echo "  GitHub: https://github.com/$GITHUB_USER/$VAULT_NAME" \
                      || echo "  GitHub: (not authenticated — will skip)"
echo "  MCP:    $VAULT_NAME server registration"
echo ""
read -r -p "Type the vault name to confirm deletion: " CONFIRM
if [ "$CONFIRM" != "$VAULT_NAME" ]; then
  echo "Aborted."
  exit 0
fi
echo ""

# Delete GitHub repo
if [ -n "$GITHUB_USER" ]; then
  if gh repo view "$GITHUB_USER/$VAULT_NAME" >/dev/null 2>&1; then
    echo "Deleting GitHub repo..."
    gh repo delete "$GITHUB_USER/$VAULT_NAME" --yes
  else
    echo "GitHub repo not found — skipping."
  fi
fi

# Remove MCP registration
if command -v claude >/dev/null 2>&1; then
  echo "Removing MCP server..."
  claude mcp remove "$VAULT_NAME" --scope user 2>/dev/null \
    && true || echo "  (not registered — skipping)"
else
  echo "Claude Code not found — MCP cleanup skipped."
  echo "  If registered, run: claude mcp remove $VAULT_NAME --scope user"
fi

# Delete local directory last (safest order: remote first, local last)
if [ -d "$VAULT_DIR_POSIX" ]; then
  echo "Deleting local vault..."
  rm -rf "$VAULT_DIR_POSIX"
else
  echo "Local directory not found — skipping."
fi

echo ""
echo "Done. $VAULT_NAME has been fully removed."
