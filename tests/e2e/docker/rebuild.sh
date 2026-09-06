#!/usr/bin/env bash
# Provisions a throwaway Jellyfin over HTTP and freezes the result into a
# local image, so `docker compose up -d` is a seconds-long cold start.
# Re-run this after bumping JELLYFIN_IMAGE or changing the fixtures.
#
# Usage:
#   rebuild.sh           # default: v11 (10.10.3) — preserves current behavior
#   rebuild.sh v11       # 10.10.3  → jellytunes-e2e:1-v11
#   rebuild.sh v12       # 12.0-rc.7 → jellytunes-e2e:1-v12
set -euo pipefail

VERSION="${1:-v11}"
case "$VERSION" in
  v11) JELLYFIN_IMAGE="jellyfin/jellyfin:10.10.3"  ;;
  v12) JELLYFIN_IMAGE="jellyfin/jellyfin:12.0-rc7" ;;
  *) echo "Unknown version '$VERSION'. Expected: v11 | v12" >&2; exit 2 ;;
esac

BUILD_NAME="jellytunes-e2e-build-$VERSION"
TARGET_IMAGE="jellytunes-e2e:1-$VERSION"
COMPOSE_FILE="docker-compose.${VERSION}.yml"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DOCKER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MUSIC="$ROOT/tests/e2e/fixtures/music"

export JELLYFIN_VERSION="$VERSION"
export JELLYFIN_URL="http://127.0.0.1:8096"

echo "==> Building $TARGET_IMAGE from $JELLYFIN_IMAGE"
echo "==> Generating fixtures"
node "$ROOT/tests/e2e/fixtures/generate.mjs"

echo "==> Starting throwaway $JELLYFIN_IMAGE"
docker rm -f "$BUILD_NAME" >/dev/null 2>&1 || true
docker run -d --name "$BUILD_NAME" \
  -p 8096:8096 \
  -v "$MUSIC:/media/music:ro" \
  "$JELLYFIN_IMAGE" >/dev/null

cleanup() { docker rm -f "$BUILD_NAME" >/dev/null 2>&1 || true; rm -rf "$DOCKER_DIR/provisioned-config" "$DOCKER_DIR/provisioned-cache"; }
trap cleanup EXIT

echo "==> Provisioning over HTTP"
node "$ROOT/tests/e2e/docker/provision.mjs"

echo "==> Extracting provisioned state"
docker cp "$BUILD_NAME:/config" "$DOCKER_DIR/provisioned-config"
docker cp "$BUILD_NAME:/cache" "$DOCKER_DIR/provisioned-cache"

echo "==> Building final image with provisioned state"
docker build --build-arg JELLYFIN_IMAGE="$JELLYFIN_IMAGE" -t "$TARGET_IMAGE" "$DOCKER_DIR" >/dev/null

echo "==> Done."
echo "    Start it with:"
echo "      docker compose -f tests/e2e/$COMPOSE_FILE up -d"
echo "    Or run the suite (boots both versions automatically):"
echo "      pnpm test:e2e"
