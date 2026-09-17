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
    local v="${tag#[vV]}"
    local prefix
    local rest
    local stage=""
    local stage_num=""
    local patch_num=""

    # 1. 提取主版本号 (如 0.0.1)
    prefix="$(printf '%s' "$v" | sed -E 's/^([0-9]+(\.[0-9]+)*).*/\1/')"
    [ -n "$prefix" ] || prefix="0.0.0"

    # 2. 提取剩余后缀并去除起始分隔符
    rest="${v#"$prefix"}"
    rest="$(printf '%s' "$rest" | sed -E 's/^[-_.]+//')"

    if [ -z "$rest" ]; then
        printf '%s\n' "$prefix"
        return 0
    fi

    # 3. 提取 Alpine 合法的预发布阶段及版本号 (alpha, beta, pre, rc 等)
    if printf '%s' "$rest" | grep -qiE '^(alpha|beta|pre|rc|cvs|git|hg|svn)'; then
        stage="$(printf '%s' "$rest" | sed -E -n 's/^(alpha|beta|pre|rc|cvs|git|hg|svn).*/\1/Ip' | tr '[:upper:]' '[:lower:]')"
        rest="$(printf '%s' "$rest" | sed -E 's/^(alpha|beta|pre|rc|cvs|git|hg|svn)//I' | sed -E 's/^[-_.]+//')"

        # 匹配阶段后紧跟的数字 (例如 beta79 中的 79)
        stage_num="$(printf '%s' "$rest" | sed -E -n 's/^([0-9]+).*/\1/p')"
        if [ -n "$stage_num" ]; then
            rest="${rest#"$stage_num"}"
            rest="$(printf '%s' "$rest" | sed -E 's/^[-_.]+//')"
        fi
    fi

    # 4. 解析 fix/patch，映射为 Alpine 标准的 _p{N}
    if [ -n "$rest" ]; then
        if printf '%s' "$rest" | grep -qiE '^(fix)+$'; then
            # 统计连续出现的 fix 次数 (fix -> 1, fixfix -> 2)
            patch_num="$(printf '%s' "$rest" | grep -o -i 'fix' | wc -l | tr -d '[:space:]')"
        elif printf '%s' "$rest" | grep -qiE '^(fix|patch|hotfix|p)[-_.]?[0-9]+'; then
            # 显式带有数字编号的修补 (如 fix2, patch1)
            patch_num="$(printf '%s' "$rest" | sed -E -n 's/^(fix|patch|hotfix|p)[-_.]?([0-9]+).*/\2/Ip')"
        elif printf '%s' "$rest" | grep -qiE '^(fix|patch|hotfix|p)$'; then
            patch_num="1"
        fi
    fi

    # 5. 组合符合 apk-tools 规范的最终版本
    local result="$prefix"
    if [ -n "$stage" ]; then
        result="${result}_${stage}${stage_num}"
    fi
    if [ -n "$patch_num" ]; then
        result="${result}_p${patch_num}"
    fi

    printf '%s\n' "$result"
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

    suffix="$(grep '^HONK_SUFFIX:=' "$MAKEFILE" | head -n 1 | cut -d= -f2-)"

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
