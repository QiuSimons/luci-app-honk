#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${1:-}"
UPSTREAM_REPO="Zakkaus/doona"

IS_LITE=0
if [ "$TARGET_DIR" = "--lite" ]; then
    IS_LITE=1
    TARGET_DIR="$REPO_DIR/luci-app-honk/root/etc/honk/doona-lite"
elif [ -z "$TARGET_DIR" ]; then
    TARGET_DIR="$REPO_DIR/luci-app-honk/root/etc/honk/doona"
elif case "$TARGET_DIR" in *lite*) true ;; *) false ;; esac; then
    IS_LITE=1
fi

REPO_REAL="$(cd "$REPO_DIR" && pwd -P)"
CANON_PARENT="$(cd "$(dirname "$TARGET_DIR")" 2>/dev/null && pwd -P)" || {
    echo "Error: cannot resolve the parent of ${TARGET_DIR}" >&2
    exit 1
}
TARGET_DIR="$CANON_PARENT/$(basename "$TARGET_DIR")"
if [ -L "$TARGET_DIR" ]; then
    echo "Error: refusing a symlinked target: ${TARGET_DIR}" >&2
    exit 1
fi
case "$TARGET_DIR" in
    "$REPO_REAL"/*) ;;
    *)
        echo "Error: refusing to deploy outside the repository: ${TARGET_DIR}" >&2
        exit 1
        ;;
esac

echo "==> Updating embedded Doona dashboard..."
echo "Target directory: $TARGET_DIR"

# Fetch latest release tag (no GitHub REST API)
LATEST_TAG=""
RELEASES_HTML="$(curl -fsSL -A "Mozilla/5.0 (X11; Linux x86_64)" --retry 3 --connect-timeout 10 "https://github.com/${UPSTREAM_REPO}/releases" 2>/dev/null || true)"
if [ -n "$RELEASES_HTML" ]; then
    LATEST_TAG="$(printf "%s" "$RELEASES_HTML" | grep -o 'releases/tag/[^"/]*' | head -n 1 | sed 's|releases/tag/||' || true)"
fi

if [ -z "$LATEST_TAG" ]; then
    echo "Warning: Could not detect latest tag from GitHub releases HTML. Trying git ls-remote..."
    LATEST_TAG="$(git ls-remote --tags "https://github.com/${UPSTREAM_REPO}.git" 2>/dev/null | awk '{print $2}' | sed 's|refs/tags/||' | grep -v '\^{}' | sort -V | tail -n 1 || true)"
fi

[ -n "$LATEST_TAG" ] || { echo "Error: Failed to resolve latest release tag for ${UPSTREAM_REPO}" >&2; exit 1; }
echo "Latest release tag: $LATEST_TAG"

# Resolve asset download URL
ASSETS_HTML="$(curl -fsSL -A "Mozilla/5.0 (X11; Linux x86_64)" --retry 3 --connect-timeout 10 "https://github.com/${UPSTREAM_REPO}/releases/expanded_assets/${LATEST_TAG}" 2>/dev/null || true)"
TAG_NO_V="${LATEST_TAG#[vV]}"
DOWNLOAD_URL=""

if [ "$IS_LITE" -eq 1 ]; then
    ASSET_PATH="$(printf "%s" "$ASSETS_HTML" | grep -o "/${UPSTREAM_REPO}/releases/download/[^\"]*/doona-lite-[^\"]*\\.tar\\.gz" | head -n 1 || true)"
    if [ -n "$ASSET_PATH" ]; then
        DOWNLOAD_URL="https://github.com${ASSET_PATH}"
        echo "Found upstream asset: $ASSET_PATH"
    else
        DOWNLOAD_URL="https://github.com/${UPSTREAM_REPO}/releases/download/${LATEST_TAG}/doona-lite-${TAG_NO_V}.tar.gz"
        echo "Inferred asset URL: $DOWNLOAD_URL"
    fi
else
    ASSET_PATH="$(printf "%s" "$ASSETS_HTML" | grep -o "/${UPSTREAM_REPO}/releases/download/[^\"]*/doona-[^\"]*\\.tar\\.gz" | grep -v 'fonts' | grep -v 'lite' | grep -v 'precompressed' | head -n 1 || true)"
    if [ -n "$ASSET_PATH" ]; then
        DOWNLOAD_URL="https://github.com${ASSET_PATH}"
        echo "Found upstream asset: $ASSET_PATH"
    else
        DOWNLOAD_URL="https://github.com/${UPSTREAM_REPO}/releases/download/${LATEST_TAG}/doona-${TAG_NO_V}.tar.gz"
        echo "Inferred asset URL: $DOWNLOAD_URL"
    fi
fi

# Download and extract
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

ARCHIVE_FILE="$TMP_DIR/doona.tar.gz"
echo "Downloading $DOWNLOAD_URL ..."

CURL_DOWN_OPTS=(-fsSL -A "Mozilla/5.0 (X11; Linux x86_64)" --retry 5 --retry-delay 2 --connect-timeout 15)

if ! curl "${CURL_DOWN_OPTS[@]}" -o "$ARCHIVE_FILE" "$DOWNLOAD_URL" || [ ! -s "$ARCHIVE_FILE" ]; then
    # Try alternative format ONLY if the asset URL was inferred (not confirmed by upstream assets HTML)
    if [ -z "$ASSET_PATH" ]; then
        ALT_URL=""
        if [ "$IS_LITE" -eq 1 ]; then
            case "$DOWNLOAD_URL" in
                *doona-lite-v*)
                    ALT_URL="$(echo "$DOWNLOAD_URL" | sed 's/doona-lite-v/doona-lite-/')"
                    ;;
                *doona-lite-[0-9]*)
                    ALT_URL="$(echo "$DOWNLOAD_URL" | sed 's/doona-lite-/doona-lite-v/')"
                    ;;
            esac
        else
            case "$DOWNLOAD_URL" in
                *doona-v*)
                    ALT_URL="$(echo "$DOWNLOAD_URL" | sed 's/doona-v/doona-/')"
                    ;;
                *doona-[0-9]*)
                    ALT_URL="$(echo "$DOWNLOAD_URL" | sed 's/doona-/doona-v/')"
                    ;;
            esac
        fi
        if [ -n "$ALT_URL" ] && [ "$ALT_URL" != "$DOWNLOAD_URL" ]; then
            echo "Retrying with alternative inferred asset name format: $ALT_URL"
            curl "${CURL_DOWN_OPTS[@]}" -o "$ARCHIVE_FILE" "$ALT_URL" || true
        fi
    fi
fi

[ -s "$ARCHIVE_FILE" ] || { echo "Error: Downloaded package is empty or failed to download." >&2; exit 1; }

EXTRACT_DIR="$TMP_DIR/extracted"
mkdir -p "$EXTRACT_DIR"
tar -xzf "$ARCHIVE_FILE" -C "$EXTRACT_DIR"

DEPLOY_SRC="$EXTRACT_DIR"
if [ ! -f "$DEPLOY_SRC/index.html" ] && [ -f "$EXTRACT_DIR/dist/index.html" ]; then
    DEPLOY_SRC="$EXTRACT_DIR/dist"
fi

[ -f "$DEPLOY_SRC/index.html" ] || { echo "Error: index.html not found in extracted archive." >&2; exit 1; }

# Deploy to target directory
mkdir -p "$TARGET_DIR"
rm -rf "${TARGET_DIR:?}"/* "${TARGET_DIR:?}"/.[!.]* 2>/dev/null || true
cp -rf "$DEPLOY_SRC/"* "$TARGET_DIR/"
rm -rf "$TARGET_DIR"/*.md "$TARGET_DIR"/LICENSE* "$TARGET_DIR"/NOTICE "$TARGET_DIR"/LICENSES 2>/dev/null || true
find "$TARGET_DIR" -type d -exec chmod 755 {} +
find "$TARGET_DIR" -type f -exec chmod 644 {} +

echo "==> Successfully embedded Doona dashboard (${LATEST_TAG}) into $TARGET_DIR"
ls -lh "$TARGET_DIR"
