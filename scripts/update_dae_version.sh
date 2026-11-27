#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec bash "$REPO_DIR/scripts/update_core_version.sh" \
    "$REPO_DIR/dae/Makefile" \
    "DAE_SRC_URL" \
    "DAE_SRC_VERSION" \
    "${UPSTREAM_REPO:-olicesx/dae}" \
    "${TARGET_BRANCH:-kdae}" \
    "$@"
