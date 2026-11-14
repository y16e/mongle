#!/bin/bash
# Builds Mongle.app into ./build  (run from anywhere)
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
APP="$ROOT/build/Mongle.app"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/web"

echo "▸ compiling"
# universal binary: Apple Silicon + Intel
BIN="$(mktemp -d)"
for arch in arm64 x86_64; do
  xcrun swiftc -O -swift-version 5 -target "$arch-apple-macos13.0" \
    -o "$BIN/Mongle-$arch" mac/main.swift \
    -framework Cocoa -framework WebKit -framework ServiceManagement
done
lipo -create "$BIN/Mongle-arm64" "$BIN/Mongle-x86_64" -output "$APP/Contents/MacOS/Mongle"
rm -rf "$BIN"

echo "▸ copying resources"
cp mac/Info.plist "$APP/Contents/Info.plist"
cp play/index.html play/scenes.js play/app.js play/tools.js play/style.css "$APP/Contents/Resources/web/"

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
