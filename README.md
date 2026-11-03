# luci-app-honk

OpenWrt 上的 honk（eBPF 透明代理，兼容 dae）LuCI 界面与安装包。

## 软件包

| 包 | 内容 |
| --- | --- |
| `luci-app-honk` | LuCI 页面、rpcd 服务、Doona 静态资源 |
| `honk` | 从 daeuniverse/honk 指定 commit 编译的 `honk-core`，以及 init.d 脚本和默认配置 |

`honk-core` 目前支持 x86_64 和 aarch64_generic，构建脚本在 `honk/` 内。

## 编译

### 宿主机依赖

构建 `honk-core` 需要 Rust、Zig 和 bpf-linker。以下命令以 Ubuntu/Debian x86_64 为例：

```bash
sudo apt-get update
sudo apt-get install -y clang llvm libbpf-dev cmake libclang-dev zstd \
  make perl file binutils git curl xz-utils pkg-config ca-certificates

curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --no-modify-path
. "$HOME/.cargo/env"

# 从 honk/Makefile 的 pin 解析版本
eval "$(./honk/honk_toolchain.sh)"

curl -fsSL -o /tmp/bpf-linker.tar.zst \
  "https://github.com/aya-rs/bpf-linker/releases/download/v${BPF_LINKER_VERSION}/bpf-linker-x86_64-unknown-linux-musl.tar.zst"
echo "${BPF_LINKER_SHA256}  /tmp/bpf-linker.tar.zst" | sha256sum -c -
sudo tar --zstd -xf /tmp/bpf-linker.tar.zst -C /usr/local/bin

curl -fsSL -o /tmp/zig.tar.xz \
  "https://ziglang.org/download/${ZIG_VERSION}/zig-x86_64-linux-${ZIG_VERSION}.tar.xz"
sudo tar -xJf /tmp/zig.tar.xz -C /usr/local
sudo ln -sf "/usr/local/zig-x86_64-linux-${ZIG_VERSION}/zig" /usr/local/bin/zig
```

Zig 的下载包按宿主机架构选择，上面是 x86_64。`rustup` 用 `-y` 免交互；`sudo` 没有 NOPASSWD 时需要密码。

### 编译 honk-core

`honk/Makefile` 在 `honk/files/honk-core.bin` 不存在时调用同目录的 `build_honk_core.sh`。CI 和 OpenWrt-Add 的 prebuild 会提前生成二进制，构建时跳过。

手动生成：

```bash
./honk/build_honk_core.sh x86_64
./honk/build_honk_core.sh aarch64_generic
```

脚本会检查产物是目标架构的 ELF 且静态链接；目标架构变化时按 `honk-core.bin.stamp` 自动重建。构建脚本随 `honk/` 一起复制，单独放进 OpenWrt 也能构建。离线环境把 `honk-core.bin` 放到 `honk/files/` 即可。

### 编译 OpenWrt 包

```bash
git clone https://github.com/QiuSimons/luci-app-honk package/honk
make menuconfig   # Network -> Web Servers/Proxies -> luci-app-honk
make package/honk/compile V=s
make package/luci-app-honk/compile V=s
```

## 配置文件

honk 的配置在 `/etc/honk/`：

```text
/etc/honk/
├── config.dae          # 主配置
├── config.d/
│   ├── node.dae        # 节点与订阅
│   ├── route.dae       # 分流规则
│   ├── dns.dae         # DNS
│   └── api.dae         # Native API 与控制面板
└── state/              # 运行状态与 honk.db
```

首次使用前编辑 `/etc/honk/config.d/node.dae`，填入节点和订阅。

## Doona

![Doona 控制面板](PIC/PIC.jpg)

Doona 的静态资源随 `luci-app-honk` 安装，`honk-core` 包含 `native-api`，不需要替换 debug 版核心。

## 更新

更新 upstream 版本：

```bash
./scripts/update_honk_version.sh
```
