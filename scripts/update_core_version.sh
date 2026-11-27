#!/usr/bin/env bash
set -euo pipefail

# Shared updater for Makefile-pinned upstream git cores (honk / dae).
# Usage: update_core_version.sh <makefile> <url_var> <rev_var> <default_repo> <default_branch> [extra args...]
MAKEFILE="${1:?missing makefile}"
URL_VAR="${2:?missing url_var}"
REV_VAR="${3:?missing rev_var}"
UPSTREAM_REPO="${4:?missing default_repo}"
TARGET_BRANCH="${5:?missing default_branch}"
shift 5

while [ $# -gt 0 ]; do
    case "$1" in
        --upstream) UPSTREAM_REPO="$2"; shift 2 ;;
        --branch)   TARGET_BRANCH="$2"; shift 2 ;;
        *) shift ;;
    esac
done

TARGET_URL="https://github.com/${UPSTREAM_REPO}.git"
CURRENT_COMMIT="$(grep -E "^${REV_VAR}:=" "$MAKEFILE" | cut -d= -f2)"
CURRENT_URL="$(grep -E "^${URL_VAR}:=" "$MAKEFILE" | cut -d= -f2)"
CURRENT_VERSION="$(grep -E '^PKG_VERSION:=' "$MAKEFILE" | cut -d= -f2)"

COMMIT="$(git ls-remote "$TARGET_URL" "refs/heads/${TARGET_BRANCH}" | awk '{print $1}')"
[ -n "$COMMIT" ] || { echo "Error: failed to resolve commit from $TARGET_URL ($TARGET_BRANCH)" >&2; exit 1; }

SHORT_COMMIT="${COMMIT:0:7}"

if [ "$COMMIT" = "$CURRENT_COMMIT" ] && [ "$TARGET_URL" = "$CURRENT_URL" ] && [[ "$CURRENT_VERSION" == *~${SHORT_COMMIT} ]]; then
    echo "$(basename "$(dirname "$MAKEFILE")") is already up-to-date (${SHORT_COMMIT})."
    exit 0
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

git clone --bare --depth 1 --filter=blob:none -q --single-branch -b "${TARGET_BRANCH}" "$TARGET_URL" "$TMP_DIR"
COMMIT_DATE="$(git --git-dir="$TMP_DIR" log -1 --date=format:%Y.%m.%d --format="%cd")"
NEW_VERSION="${COMMIT_DATE}~${SHORT_COMMIT}"

sed -i -E "s|^PKG_VERSION:=.*|PKG_VERSION:=${NEW_VERSION}|" "$MAKEFILE"
sed -i -E "s|^${REV_VAR}:=.*|${REV_VAR}:=${COMMIT}|" "$MAKEFILE"
sed -i -E "s|^${URL_VAR}:=.*|${URL_VAR}:=${TARGET_URL}|" "$MAKEFILE"

echo "Updated $(basename "$(dirname "$MAKEFILE")") to ${NEW_VERSION} (${COMMIT})."
