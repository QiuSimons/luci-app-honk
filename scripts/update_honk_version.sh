#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec bash "$REPO_DIR/scripts/update_core_version.sh" \
    "$REPO_DIR/honk/Makefile" \
    "HONK_SRC_URL" \
    "HONK_SRC_VERSION" \
    "${UPSTREAM_REPO:-daeuniverse/honk}" \
    "${TARGET_BRANCH:-main}" \
    "$@"
