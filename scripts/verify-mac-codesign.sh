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
quarantine_dir=""

cleanup() {
  if [ -n "$mount_point" ] && [ -d "$mount_point" ]; then
    hdiutil detach "$mount_point" -quiet || true
  fi
  if [ -n "$quarantine_dir" ] && [ -d "$quarantine_dir" ]; then
    rm -rf "$quarantine_dir"
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

# Informational only — never changes the exit code.
#
# The checks above prove the bundle is well formed. They say nothing about what
# a user actually sees on first launch, which is Gatekeeper's call. An ad-hoc
# signature is valid but not notarized, so `spctl` reports "rejected" for as
# long as JellyTunes ships without a Developer ID certificate. The useful
# signal is the reason it gives: that is what decides whether a user meets the
# hard "app is damaged" error or the ordinary "unidentified developer" prompt
# they can dismiss from System Settings. Gating on this would mean the job
# could never go green without a paid certificate (ORAIN-0665).
echo
echo "Gatekeeper assessment (informational — does not affect the exit code):"

quarantine_dir="$(mktemp -d)"
app_copy="$quarantine_dir/$(basename "$app_path")"

# ditto rather than cp -R: it preserves the extended attributes and symlinks
# inside the bundle, so the signature survives the copy off the disk image.
if ditto "$app_path" "$app_copy" 2>/dev/null; then
  # Without com.apple.quarantine, Gatekeeper waves the bundle straight
  # through and the assessment tells us nothing. This is the attribute a
  # browser download would have attached.
  xattr -w com.apple.quarantine \
    "0083;$(printf '%x' "$(date +%s)");Safari;$(uuidgen)" \
    "$app_copy" 2>/dev/null || true

  spctl -a -vvv -t exec "$app_copy" 2>&1 || true
else
  echo "  Could not copy the bundle out of the image; skipping the assessment."
fi
