#!/usr/bin/env bash
# Install the solana-tx-reliability skill into a project's .claude/skills.
# Usage: ./install.sh [DEST_DIR]   (default: ./.claude/skills/solana-tx-reliability)
set -euo pipefail

SKILL_NAME="solana-tx-reliability"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${1:-./.claude/skills/$SKILL_NAME}"

mkdir -p "$DEST"
cp -R "$SRC_DIR/skill/." "$DEST/"

# Optionally install the slash commands alongside.
if [ -d "$SRC_DIR/commands" ]; then
  mkdir -p "./.claude/commands"
  cp -R "$SRC_DIR/commands/." "./.claude/commands/" 2>/dev/null || true
fi

echo "✅ Installed '$SKILL_NAME' → $DEST"
echo "   Your agent will load it automatically when a task matches its description."
echo "   To try the helpers: npm install && SOLANA_RPC_URL=https://api.devnet.solana.com npx tsx scripts/send-robust.ts"
