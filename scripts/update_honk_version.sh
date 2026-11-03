#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MAKEFILE="$REPO_DIR/honk/Makefile"

UPSTREAM_REPO="${UPSTREAM_REPO:-daeuniverse/honk}"
TARGET_BRANCH="${TARGET_BRANCH:-main}"

while [ $# -gt 0 ]; do
    case "$1" in
        --upstream) UPSTREAM_REPO="$2"; shift 2 ;;
        --branch)   TARGET_BRANCH="$2"; shift 2 ;;
        *) shift ;;
    esac
done

echo "Resolving latest commit for ${UPSTREAM_REPO} (${TARGET_BRANCH})..."

COMMIT=""
for _ in {1..3}; do
    COMMIT=$(git ls-remote "https://github.com/${UPSTREAM_REPO}.git" "refs/heads/${TARGET_BRANCH}" 2>/dev/null | awk '{print $1}' || true)
    [ -n "$COMMIT" ] && break
    sleep 2
done

if [ -z "$COMMIT" ]; then
    echo "Error: failed to resolve commit from https://github.com/${UPSTREAM_REPO}.git" >&2
    exit 1
fi

SHORT_COMMIT="${COMMIT:0:7}"
NEW_VERSION="$(date +%Y.%m.%d)~${SHORT_COMMIT}"

echo "Resolved: ${NEW_VERSION} (${COMMIT})"

sed -i -E "s|^PKG_VERSION:=.*|PKG_VERSION:=${NEW_VERSION}|" "$MAKEFILE"
sed -i -E "s|^HONK_SRC_VERSION:=.*|HONK_SRC_VERSION:=${COMMIT}|" "$MAKEFILE"
sed -i -E "s|^HONK_SRC_URL:=.*|HONK_SRC_URL:=https://github.com/${UPSTREAM_REPO}.git|" "$MAKEFILE"

echo "Updated $MAKEFILE successfully."
