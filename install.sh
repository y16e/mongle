#!/bin/bash
# Mongle installer — downloads the latest Mac app from GitHub and puts it in Applications.
#   curl -fsSL https://y16e.github.io/mongle/install.sh | bash
set -euo pipefail

URL="https://github.com/y16e/mongle/releases/latest/download/Mongle-mac.zip"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "☁︎ Mongle 내려받는 중..."
curl -fsSL "$URL" -o "$TMP/Mongle.zip"
ditto -x -k "$TMP/Mongle.zip" "$TMP"

DEST="/Applications"
[ -w "$DEST" ] || { DEST="$HOME/Applications"; mkdir -p "$DEST"; }

pkill -x Mongle 2>/dev/null && sleep 1 || true
rm -rf "$DEST/Mongle.app"
ditto "$TMP/Mongle.app" "$DEST/Mongle.app"
xattr -dr com.apple.quarantine "$DEST/Mongle.app" 2>/dev/null || true

open "$DEST/Mongle.app"
echo "✓ 설치 완료! ($DEST/Mongle.app)"
echo "  화면 맨 위 메뉴 막대의 ☁︎ 구름을 눌러 보세요."
