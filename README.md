# luci-app-honk

OpenWrt 上的 honk（基于 eBPF 的高性能透明代理引擎，dae 兼容）LuCI 管理界面与安装包。

## 仓库组件

本仓库包含两个 OpenWrt 软件包：

| 包名 | 类型 | 说明 |
| :--- | :--- | :--- |
| **`luci-app-honk`** | 管理界面 | 基于 LuCI 与 Ucode 构建的 Web 控制界面与 rpcd 服务 |
| **`honk`** | 核心服务 | 从 [daeuniverse/honk](https://github.com/daeuniverse/honk) 源码原生编译静态 `honk-core`，并配置 init.d 守护进程 |

> [!NOTE]
> `honk-core` 不再从上游 Release 拉取，而是由本仓库 CI 在宿主机上原生编译（Rust + Zig + bpf-linker）。
> 当前覆盖 `x86_64` 与 `aarch64_generic`，产物为静态 musl 二进制。

## 编译与安装

### 1. 宿主机构建依赖 (Ubuntu/Debian)

以下命令在**宿主机**安装 `honk-core` 的构建工具；OpenWrt SDK/容器只消费第 2 步生成的二进制，不需要 Rust/Zig。

```bash
# 基础依赖与 LLVM/BPF 工具链
sudo apt-get update
sudo apt-get install -y clang llvm libbpf-dev cmake libclang-dev zstd \
  make perl file binutils git curl xz-utils pkg-config ca-certificates

# Rust（版本由 honk 源码内的 rust-toolchain.toml 固定；-y 免交互）
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --no-modify-path
. "$HOME/.cargo/env"

# 从 pinned honk commit 解析工具链版本
eval "$(./honk/honk_toolchain.sh)"
echo "bpf-linker ${BPF_LINKER_VERSION}, zig ${ZIG_VERSION}"

# bpf-linker (eBPF 字节码链接器)
curl -fsSL -o /tmp/bpf-linker.tar.zst "https://github.com/aya-rs/bpf-linker/releases/download/v${BPF_LINKER_VERSION}/bpf-linker-x86_64-unknown-linux-musl.tar.zst"
echo "${BPF_LINKER_SHA256}  /tmp/bpf-linker.tar.zst" | sha256sum -c -
sudo tar --zstd -xf /tmp/bpf-linker.tar.zst -C /usr/local/bin

# Zig（按宿主机架构；示例为 x86_64 宿主机）
curl -fsSL -o /tmp/zig.tar.xz "https://ziglang.org/download/${ZIG_VERSION}/zig-x86_64-linux-${ZIG_VERSION}.tar.xz"
sudo tar -xJf /tmp/zig.tar.xz -C /usr/local
sudo ln -sf "/usr/local/zig-x86_64-linux-${ZIG_VERSION}/zig" /usr/local/bin/zig
zig version
```

> `rustup` 已用 `-y` 免交互；`sudo` 若无 NOPASSWD 仍会要密码，无人值守环境请用 root 或配置 NOPASSWD。

### 2. 预编译核心二进制

`honk/Makefile` 在 `files/honk-core.bin` 缺失时会**自动调用**同目录的 `build_honk_core.sh`
（依赖第 1 节的宿主工具链与网络）；CI 的 prebuild job 和 OpenWrt-Add 的 prebuild 已在构建前提供二进制，
不会触发这段宿主构建。

构建脚本就在 `honk/` 包内，随包一起复制；单独把 `honk/` 放到任意 package 目录也能自动构建，
不满足宿主工具链/网络时预置 `honk/files/honk-core.bin` 即可。
也可以手动预编译（离线构建或预置产物时）：

```bash
# 编译 x86_64 二进制至 honk/files/honk-core.bin
./honk/build_honk_core.sh x86_64

# 或编译 aarch64 二进制
./honk/build_honk_core.sh aarch64_generic
```

自动/手动构建都会校验产物：必须是目标架构 ELF，且 musl 目标必须静态链接——否则直接失败，
避免把动态链接的二进制带进 OpenWrt 打包阶段（报 `libc.so.6` 缺失依赖）。
若构建环境禁止宿主网络/执行，先在有工具链的机器上生成二进制再放回 `honk/files/`。

> 脚本构建会写 `honk-core.bin.stamp`；目标架构变化时会自动重建。手动拷贝的二进制没有 stamp，会被视为预置产物直接使用。

### 3. OpenWrt 软件包编译

1. 拉取源码至 OpenWrt 源码树：

   ```bash
   git clone https://github.com/QiuSimons/luci-app-honk package/honk
   ```

2. 配置并编译：

   ```bash
   make menuconfig
   # 选择：Network -> Web Servers/Proxies -> luci-app-honk

   make package/honk/compile V=s
   make package/luci-app-honk/compile V=s
   ```

## 配置文件结构

honk 采用模块化拆分配置，主配置与子模块均位于 `/etc/honk/`：

```text
/etc/honk/
├── config.dae          # 主配置文件
├── config.d/           # 拆分模块目录
│   ├── node.dae        # 节点与订阅
│   ├── route.dae       # 分流路由规则
│   ├── dns.dae         # DNS 解析与分流
│   └── api.dae         # Native API 与控制面板鉴权
└── state/              # 运行状态与 SQLite 数据库 (honk.db)
```

> [!TIP]
> 首次使用前，请先编辑 `/etc/honk/config.d/node.dae` 替换示例中的节点与订阅。

## 控制面板 (Doona)

![Doona 控制面板](PIC/PIC.jpg)

> [!NOTE]
> **Doona** 静态资源随 `luci-app-honk` 安装，`honk-core` 已包含 `native-api`；不再需要手动替换 debug 版核心。

## 维护与版本更新

维护者可通过自带脚本自动获取 upstream 最新 commit 并更新 `PKG_VERSION` 与 `HONK_SRC_VERSION`：

```bash
./scripts/update_honk_version.sh
```
