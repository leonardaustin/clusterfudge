#!/usr/bin/env bash
set -euo pipefail

# Package Clusterfudge as an AppImage for Linux distribution
#
# Prerequisites:
#   - appimagetool (https://github.com/AppImage/AppImageKit)
#   - A built binary at build/bin/clusterfudge

APP_NAME="Clusterfudge"
APP_ID="com.leonardaustin.clusterfudge"
BINARY="build/bin/clusterfudge"
APP_DIR="build/AppDir"
OUTPUT="build/${APP_NAME}-x86_64.AppImage"

if [ ! -f "$BINARY" ]; then
    echo "Error: Binary not found at $BINARY"
    echo "Run 'wails build' first."
    exit 1
fi

echo "Packaging ${APP_NAME} as AppImage..."

# Clean previous AppDir
rm -rf "$APP_DIR"

# Create AppDir structure
mkdir -p "${APP_DIR}/usr/bin"
mkdir -p "${APP_DIR}/usr/share/applications"
mkdir -p "${APP_DIR}/usr/share/icons/hicolor/256x256/apps"

# Copy binary
cp "$BINARY" "${APP_DIR}/usr/bin/clusterfudge"
chmod +x "${APP_DIR}/usr/bin/clusterfudge"

# Create desktop entry
cat > "${APP_DIR}/usr/share/applications/${APP_ID}.desktop" <<EOF
[Desktop Entry]
Name=${APP_NAME}
Exec=clusterfudge
Icon=clusterfudge
Type=Application
Categories=Development;Utility;
Comment=Kubernetes cluster viewer
Terminal=false
EOF

# Symlink desktop file and icon to AppDir root (required by AppImage)
ln -sf "usr/share/applications/${APP_ID}.desktop" "${APP_DIR}/${APP_ID}.desktop"

# Create AppRun
cat > "${APP_DIR}/AppRun" <<'APPRUN'
#!/bin/bash
SELF=$(readlink -f "$0")
HERE=${SELF%/*}
exec "${HERE}/usr/bin/clusterfudge" "$@"
APPRUN
chmod +x "${APP_DIR}/AppRun"

# Copy icon if available, otherwise create placeholder
if [ -f "build/appicon.png" ]; then
    cp "build/appicon.png" "${APP_DIR}/usr/share/icons/hicolor/256x256/apps/clusterfudge.png"
    ln -sf "usr/share/icons/hicolor/256x256/apps/clusterfudge.png" "${APP_DIR}/clusterfudge.png"
else
    echo "Warning: No icon found at build/appicon.png, AppImage will have no icon"
fi

# Build AppImage
if command -v appimagetool &> /dev/null; then
    ARCH=x86_64 appimagetool "$APP_DIR" "$OUTPUT"
    echo "AppImage created: $OUTPUT"
else
    echo "Error: appimagetool not found in PATH"
    echo "Install from: https://github.com/AppImage/AppImageKit/releases"
    exit 1
fi
