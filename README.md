# luci-app-daeuniverse

OpenWrt 下的双核心透明代理 LuCI 插件与软件包套件，支持切换与管理 **honk**（`honk-core`，默认）和 **dae**（`olicesx/dae` `kdae` 分支）核心，共享同一套 UCI 配置与内置 Doona 面板。

## 软件包

| 包 | 内容 |
| --- | --- |
| `luci-app-daeuniverse` | LuCI 界面、`/etc/init.d/daeuniverse` 服务脚本、`98-daeuniverse` 热插拔、RPCD 服务、`honk`/`dae` 默认配置与共享 Doona 面板静态资源（提供 `DAEU_WITH_HONK` / `DAEU_WITH_DAE` 条件依赖，默认均启用） |
| `honk` | 从 `daeuniverse/honk` `main` 指定 commit 编译的 `/usr/bin/honk-core` |
| `dae` | 从 `olicesx/dae` `kdae` 指定 commit 编译的 `/usr/bin/dae` |

目前支持 **`x86_64`** 与 **`aarch64_generic`** 架构。OpenWrt 包版本采用 `YYYY.MM.DD~<commit>` 以保证升级顺序，两个核心二进制内部版本号均统一为 7 位短 commit hash。

## 配置文件结构

两个核心共用 UCI 配置 `/etc/config/daeuniverse`、服务 `/etc/init.d/daeuniverse`、日志 `/var/log/daeuniverse/daeuniverse.log` 与面板目录 `/etc/daeuniverse/doona/`，配置目录各自独立：

```text
/etc/daeuniverse/
├── doona/                        # 共享 Doona 面板静态资源（honk 与 dae 共用）
├── honk/                         # honk 核心原生配置
│   ├── config.dae                # 主配置（含 global、data_dir、assets 与 include）
│   ├── config.d/
│   │   ├── node.dae              # 节点、订阅与分组（默认 policy: score）
│   │   ├── route.dae             # 分流规则
│   │   ├── dns.dae               # DNS（含 client_subnet: auto）
│   │   └── api.dae               # experimental.native_api
│   └── state/                    # 运行状态与 honk.db
└── dae/                          # dae (kdae) 托管布局（6+1）
    ├── config.dae                # 纯入口文件（include config.d/*.dae + api.dae）
    ├── api.dae                   # 根段 api { ... }（满足 kdae config_write）
    └── config.d/
        ├── global.dae
        ├── subscription.dae
        ├── node.dae
        ├── group.dae
        ├── routing.dae
        └── dns.dae
```

## 内核需求

- **honk** 运行依赖：`kmod-sched-core`、`kmod-sched-bpf`、`kmod-veth`、`kmod-nft-queue`、`v2ray-geoip`、`v2ray-geosite`、`ca-bundle`，以及内核 BTF（或 `vmlinux-btf`）。
- **dae (kdae)** 运行依赖：`kmod-sched-core`、`kmod-sched-bpf`、`kmod-veth`、`v2ray-geoip`、`v2ray-geosite`、`ca-bundle`，以及内核 BTF（或 `vmlinux-btf`）。`kdae` 不再使用 `AF_XDP`（不需要 `KERNEL_XDP_SOCKETS`），也不依赖 `kmod-nft-queue`。
- 自编译 OpenWrt 固件内核建议开启：`CONFIG_KERNEL_CGROUP_BPF=y`、`CONFIG_KERNEL_BPF_EVENTS=y`、`CONFIG_KERNEL_KPROBES=y`、`CONFIG_KERNEL_KPROBE_EVENTS=y`、`CONFIG_KERNEL_DEBUG_INFO_BTF=y`。

## 编译

### 1. 预编译 `honk-core`

需要 Rust、`zig`、`bpf-linker`、`cargo-zigbuild`、`clang`、`llvm` 与 `file`（`honk/honk_toolchain.sh` 会自动读取对应 commit 的工具链版本）：

```bash
./honk/build_honk_core.sh x86_64
./honk/build_honk_core.sh aarch64_generic
```

### 2. 预编译 `dae`（kdae）

需要 Go `1.26.10+`（或开启 `GOTOOLCHAIN=auto`）、`clang`、`llvm-strip` 与 `file`：

```bash
./dae/build_dae_core.sh x86_64
./dae/build_dae_core.sh aarch64_generic
```

当 `dae/files/dae.bin` 已存在时，`dae/Makefile` 直接打包预编译二进制；若不存在，则自动回退到 OpenWrt 原生 `GoBinPackage` 源码编译路径（PGO 使用上游自带的 `default.pgo`）。

### 3. 编译 OpenWrt 包

```bash
git clone https://github.com/QiuSimons/luci-app-daeuniverse package/daeuniverse
make menuconfig   # Network -> Web Servers/Proxies -> luci-app-daeuniverse
make package/honk/compile V=s
make package/dae/compile V=s
make package/luci-app-daeuniverse/compile V=s
```

可在 `menuconfig` 中按需取消 `DAEU_WITH_HONK` 或 `DAEU_WITH_DAE` 以只打包单个核心。

## Doona 控制面板

![Doona 控制面板](PIC/PIC.jpg)

Doona 的静态资源随 `luci-app-daeuniverse` 预置安装在 `/etc/daeuniverse/doona`，两个核心的原生 API 默认均已指向该目录。

## 更新上游版本

```bash
./scripts/update_honk_version.sh
./scripts/update_dae_version.sh
./scripts/update_doona.sh
```
