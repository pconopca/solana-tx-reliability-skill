#!/usr/bin/env bash
# Interactive installer: choose personal vs project scope and whether to add
# the slash commands. For full control over where the skill lands.
set -euo pipefail

SKILL_NAME="solana-tx-reliability"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Install '$SKILL_NAME'"
echo "  1) Personal  (~/.claude/skills/$SKILL_NAME) — available in every project"
echo "  2) Project   (./.claude/skills/$SKILL_NAME) — this repo only"
read -rp "Choose [1/2] (default 2): " choice
case "${choice:-2}" in
  1) BASE="$HOME/.claude" ;;
  *) BASE="./.claude" ;;
esac

DEST="$BASE/skills/$SKILL_NAME"
mkdir -p "$DEST"
cp -R "$SRC_DIR/skill/." "$DEST/"
echo "✅ Skill installed → $DEST"

read -rp "Also install slash commands (/send-robust, /tx-doctor)? [y/N]: " c
if [[ "${c:-N}" =~ ^[Yy]$ ]]; then
  mkdir -p "$BASE/commands"
  cp -R "$SRC_DIR/commands/." "$BASE/commands/"
  echo "✅ Commands installed → $BASE/commands"
fi

echo "Done. Tip: skills load progressively — only when a task matches the description in SKILL.md."
