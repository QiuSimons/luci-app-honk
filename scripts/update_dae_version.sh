#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MAKEFILE="$REPO_DIR/dae/Makefile"

UPSTREAM_REPO="${UPSTREAM_REPO:-olicesx/dae}"
TARGET_BRANCH="${TARGET_BRANCH:-kdae}"

while [ $# -gt 0 ]; do
    case "$1" in
        --upstream) UPSTREAM_REPO="$2"; shift 2 ;;
        --branch)   TARGET_BRANCH="$2"; shift 2 ;;
        *) shift ;;
    esac
done

TARGET_URL="https://github.com/${UPSTREAM_REPO}.git"
CURRENT_COMMIT="$(grep -E '^DAE_SRC_VERSION:=' "$MAKEFILE" | cut -d= -f2)"
CURRENT_URL="$(grep -E '^DAE_SRC_URL:=' "$MAKEFILE" | cut -d= -f2)"
CURRENT_VERSION="$(grep -E '^PKG_VERSION:=' "$MAKEFILE" | cut -d= -f2)"

COMMIT="$(git ls-remote "$TARGET_URL" "refs/heads/${TARGET_BRANCH}" | awk '{print $1}')"
[ -n "$COMMIT" ] || { echo "Error: failed to resolve commit from $TARGET_URL ($TARGET_BRANCH)" >&2; exit 1; }

SHORT_COMMIT="${COMMIT:0:7}"

if [ "$COMMIT" = "$CURRENT_COMMIT" ] && [ "$TARGET_URL" = "$CURRENT_URL" ] && [[ "$CURRENT_VERSION" == *~${SHORT_COMMIT} ]]; then
    echo "dae is already up-to-date (${SHORT_COMMIT})."
    exit 0
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

git clone --bare --depth 1 --filter=blob:none -q --single-branch -b "${TARGET_BRANCH}" "$TARGET_URL" "$TMP_DIR"
COMMIT_DATE="$(git --git-dir="$TMP_DIR" log -1 --date=format:%Y.%m.%d --format="%cd")"
NEW_VERSION="${COMMIT_DATE}~${SHORT_COMMIT}"

sed -i -E "s|^PKG_VERSION:=.*|PKG_VERSION:=${NEW_VERSION}|" "$MAKEFILE"
sed -i -E "s|^DAE_SRC_VERSION:=.*|DAE_SRC_VERSION:=${COMMIT}|" "$MAKEFILE"
sed -i -E "s|^DAE_SRC_URL:=.*|DAE_SRC_URL:=${TARGET_URL}|" "$MAKEFILE"
sed -i -E "s|^DAE_BRANCH:=.*|DAE_BRANCH:=${TARGET_BRANCH}|" "$MAKEFILE"

if git --git-dir="$TMP_DIR" cat-file -e "${COMMIT}:default.pgo" 2>/dev/null; then
    mkdir -p "$REPO_DIR/dae/pprof"
    git --git-dir="$TMP_DIR" show "${COMMIT}:default.pgo" > "$REPO_DIR/dae/pprof/default.pgo"
fi

echo "Updated dae to ${NEW_VERSION} (${COMMIT})."
