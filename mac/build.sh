#!/bin/bash
# Builds Mongle.app into ./build  (run from anywhere)
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
APP="$ROOT/build/Mongle.app"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/web"

echo "▸ compiling"
xcrun swiftc -O -swift-version 5 -target "$(uname -m)-apple-macos13.0" \
  -o "$APP/Contents/MacOS/Mongle" mac/main.swift \
  -framework Cocoa -framework WebKit -framework ServiceManagement

echo "▸ copying resources"
cp mac/Info.plist "$APP/Contents/Info.plist"
cp play/index.html play/scenes.js play/app.js play/style.css "$APP/Contents/Resources/web/"

echo "▸ icon"
TMP="$(mktemp -d)"
xcrun swift mac/make_icon.swift "$TMP/icon.png"
ICONSET="$TMP/AppIcon.iconset"; mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s "$TMP/icon.png" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  sips -z $((s*2)) $((s*2)) "$TMP/icon.png" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"
rm -rf "$TMP"

echo "▸ signing (ad-hoc)"
codesign --force --deep --sign - "$APP"

echo "✓ built $APP"
