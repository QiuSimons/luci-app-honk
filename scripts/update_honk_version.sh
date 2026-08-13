#!/usr/bin/env bash
set -euo pipefail

# Update honk's package version and per-arch release hashes from the latest
# daeuniverse/honk release.
#
# Primary source: GitHub API /releases/latest.
# Fallback: git ls-remote --tags + sort -V (works when the API is rate-limited).
# Hashes are computed from the release tarballs with sha256sum.
#
# Offline testing hooks:
#   HONK_RELEASE_JSON   - feed a fake GitHub API response
#   HONK_RELEASE_TAG    - force a specific raw tag
#   HONK_HASH_X86_64    - force the x86_64 tarball sha256
#   HONK_HASH_AARCH64   - force the aarch64 tarball sha256

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MAKEFILE="$REPO_DIR/honk/Makefile"
UPSTREAM_REPO="daeuniverse/honk"

git_ls_remote() {
    local attempt
    for attempt in 1 2 3 4 5; do
        if git ls-remote --tags "https://github.com/${UPSTREAM_REPO}.git" 2>/dev/null; then
            return 0
        fi
        sleep 3
    done
    return 1
}

derive_version() {
    local tag="$1"
    local v="${tag#v}"
    v="${v#V}"
    local prefix
    local suffix

    prefix="$(printf '%s' "$v" | sed -E 's/^([0-9]+(\.[0-9]+)*).*/\1/')"
    suffix="$(printf '%s' "$v" | sed -E 's/^[0-9]+(\.[0-9]+)*//' | tr -cd 'A-Za-z0-9')"

    if [ -n "$suffix" ]; then
        printf '%s_%s\n' "$prefix" "$suffix"
    else
        printf '%s\n' "$prefix"
    fi
}

resolve_tag() {
    if [ -n "${HONK_RELEASE_TAG:-}" ]; then
        printf '%s\n' "$HONK_RELEASE_TAG"
        return 0
    fi

    local json="${HONK_RELEASE_JSON:-}"
    if [ -z "$json" ]; then
        json="$(curl -fsSL --retry 3 --connect-timeout 15 \
            "https://api.github.com/repos/${UPSTREAM_REPO}/releases/latest" 2>/dev/null || true)"
    fi

    if [ -n "$json" ]; then
        local tag
        tag="$(printf '%s' "$json" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
        if [ -n "$tag" ]; then
            printf '%s\n' "$tag"
            return 0
        fi
    fi

    git_ls_remote | awk '{print $2}' | sed 's|refs/tags/||' | grep -v '\^{}' | sort -V | tail -n 1
}

resolve_hash() {
    local var_name="$1"
    local target="$2"
    local suffix="$3"
    local tag="$4"
    local asset="honk-core-${tag}-${target}${suffix}.tar.gz"

    # Offline testing hook: force a hash without downloading.
    if [ -n "${!var_name:-}" ]; then
        printf '%s\n' "${!var_name}"
        return 0
    fi

    local tmp hash
    tmp="$(mktemp)"
    if ! curl -fsSL --retry 3 --connect-timeout 20 \
        "https://github.com/daeuniverse/honk/releases/download/${tag}/${asset}" -o "$tmp" 2>/dev/null; then
        rm -f "$tmp"
        echo "error: unable to download ${asset}" >&2
        return 1
    fi

    if ! hash="$(sha256sum "$tmp" | awk '{print $1}')"; then
        rm -f "$tmp"
        echo "error: unable to hash ${asset}" >&2
        return 1
    fi
    rm -f "$tmp"

    printf '%s\n' "$hash"
}

main() {
    local tag version suffix hash_x86_64 hash_aarch64
    tag="$(resolve_tag)"
    [ -n "$tag" ] || { echo "error: unable to resolve honk release tag" >&2; exit 1; }
    version="$(derive_version "$tag")"

    suffix="$(grep '^HONK_SUFFIX:=' "$MAKEFILE" | head -n 1 | cut -d= -f2)"
    [ -n "$suffix" ] || suffix="-stock"

    hash_x86_64="$(resolve_hash HONK_HASH_X86_64 "x86_64-unknown-linux-musl" "$suffix" "$tag")"
    hash_aarch64="$(resolve_hash HONK_HASH_AARCH64 "aarch64-unknown-linux-musl" "$suffix" "$tag")"

    sed -i -E "s/^PKG_VERSION:=.*/PKG_VERSION:=${version}/" "$MAKEFILE"
    sed -i -E "s/^HONK_RELEASE_TAG:=.*/HONK_RELEASE_TAG:=${tag}/" "$MAKEFILE"
    sed -i -E "s/^HONK_HASH_X86_64:=.*/HONK_HASH_X86_64:=${hash_x86_64}/" "$MAKEFILE"
    sed -i -E "s/^HONK_HASH_AARCH64:=.*/HONK_HASH_AARCH64:=${hash_aarch64}/" "$MAKEFILE"

    echo "honk updated to ${tag} (PKG_VERSION=${version})"
    echo "HONK_HASH_X86_64=${hash_x86_64}"
    echo "HONK_HASH_AARCH64=${hash_aarch64}"
}

main "$@"
