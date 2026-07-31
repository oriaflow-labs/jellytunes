#!/usr/bin/env bash
# Verifies that a packaged macOS .app carries a valid, fully-sealed code
# signature.
#
# Background (ORAIN-0665): with `build.mac.identity` set to `null`,
# electron-builder skipped signing entirely. The bundle electron-builder
# repacks after unpacking native modules (better-sqlite3, @ffmpeg-installer)
# never gets resealed, so it keeps Electron's own ad-hoc, linker-signed
# signature: `codesign --verify --deep --strict` then fails with "code has no
# resources but signature indicates they must be present" on arm64, and the
# x64 bundle comes out `not signed at all`. On Apple Silicon this surfaces to
# users as "app is damaged".
#
# This script is the single source of truth for that check. It is invoked
# from both build-test.yml and release.yml via the
# .github/actions/verify-mac-codesign composite action — do not duplicate
# this logic inline in a workflow.
#
# Usage: scripts/verify-mac-codesign.sh [path-to-.dmg-or-.app]
#   With no argument, the first *.dmg found under release/ is used.

set -euo pipefail

expected_identifier="com.jellytunes.app"

target="${1:-}"
if [ -z "$target" ]; then
  target="$(find release -maxdepth 1 -name '*.dmg' 2>/dev/null | head -n1)"
fi

if [ -z "$target" ]; then
  echo "::error::No .dmg found in release/ and no path given to scripts/verify-mac-codesign.sh."
  exit 1
fi

if [ ! -e "$target" ]; then
  echo "::error::scripts/verify-mac-codesign.sh: '$target' does not exist."
  exit 1
fi

mount_point=""

cleanup() {
  if [ -n "$mount_point" ] && [ -d "$mount_point" ]; then
    hdiutil detach "$mount_point" -quiet || true
  fi
}
trap cleanup EXIT

app_path=""

case "$target" in
  *.dmg)
    mount_point="$(mktemp -d)"
    hdiutil attach "$target" -mountpoint "$mount_point" -nobrowse -quiet
    app_path="$(find "$mount_point" -maxdepth 1 -name '*.app' | head -n1)"
    ;;
  *.app)
    app_path="$target"
    ;;
  *)
    echo "::error::scripts/verify-mac-codesign.sh: '$target' is neither a .dmg nor a .app."
    exit 1
    ;;
esac

if [ -z "$app_path" ] || [ ! -d "$app_path" ]; then
  echo "::error::Could not find a .app bundle inside '$target'."
  exit 1
fi

echo "Verifying code signature for: $app_path"

if ! codesign --verify --deep --strict "$app_path"; then
  echo "::error::codesign --verify --deep --strict failed for $app_path — the bundle is unsigned or its resources are not sealed (see ORAIN-0665)."
  exit 1
fi

info="$(codesign -dvvv "$app_path" 2>&1)"
echo "$info"

identifier_line="$(echo "$info" | grep '^Identifier=' || true)"
if [ "$identifier_line" != "Identifier=$expected_identifier" ]; then
  echo "::error::Unexpected code signature identifier for $app_path. Expected 'Identifier=$expected_identifier', got '$identifier_line'."
  exit 1
fi

if echo "$info" | grep -qi 'Sealed Resources=none'; then
  echo "::error::Sealed Resources=none for $app_path — the bundle was repacked without resealing (see ORAIN-0665)."
  exit 1
fi

echo "Code signature OK: identifier and sealed resources verified for $app_path."
