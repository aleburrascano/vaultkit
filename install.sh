#!/usr/bin/env bash
# Install vaultkit via npm (requires Node.js 22+).
# Usage: bash <(curl -fsSL https://raw.githubusercontent.com/aleburrascano/vaultkit/main/install.sh)
set -euo pipefail

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js 22+ is required. Install from https://nodejs.org"
  exit 1
fi

echo "Installing vaultkit..."
npm install -g @aleburrascano/vaultkit

echo ""
echo "vaultkit installed. Run 'vaultkit help' to get started."
