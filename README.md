# ProxyHub

ProxyHub 用于在 VPS 或内网虚拟机上管理用户、模板和 sing-box 配置，
并通过独立的 Sub-Store 容器管理节点订阅。

当前稳定版本：`v0.1.8`

## 安装要求

- 使用 root 身份执行命令。Alpine 通常没有 `sudo`，直接执行即可。
- 支持 Alpine、Debian、Ubuntu。
- 支持 `amd64` 和 `arm64`。
- 需要 Docker Engine 和 Docker Compose v2；缺少时安装器会询问是否安装。
- 默认使用宿主机 `3000` 端口，Sub-Store 不直接开放宿主机端口。
- 至少需要 512 MiB 可用磁盘空间。

## 全新安装

交互安装：

```sh
curl -fsSLo /tmp/proxyhub-install.sh \
  https://github.com/miozen/proxyhub/releases/latest/download/install.sh
chmod +x /tmp/proxyhub-install.sh
/tmp/proxyhub-install.sh
```

按回车使用默认端口 `3000`。确认前，安装器会显示最终端口、镜像、
容器、数据卷和安装路径。

自动化安装：

```sh
/tmp/proxyhub-install.sh --yes
```

使用其他端口：

```sh
/tmp/proxyhub-install.sh --port 3100 --yes
```

指定版本时使用：

```sh
/tmp/proxyhub-install.sh --version <VERSION> --yes
```

`<VERSION>` 可以写成 `0.1.8` 或 `v0.1.8`。通常不需要指定 Sub-Store
版本；安装器会从官方 `xream/sub-store:latest` 发现当前稳定镜像，再将
不可变 digest 写入配置。确实需要固定旧版本时才使用：

```sh
/tmp/proxyhub-install.sh \
  --substore-version <SUBSTORE_VERSION> \
  --yes
```

安装完成后访问：

```text
http://服务器IP:3000/
```

第一个注册用户自动成为 owner。

## 首次使用

1. 注册第一个用户并登录。
2. 进入 Sub-Store，创建或恢复节点订阅。
3. 从 Sub-Store 取得处理后的订阅地址。
4. 在 ProxyHub“我的订阅”中添加该地址。
5. 选择允许使用的地区并启用订阅源。
6. 在“模板管理”中确认需要使用的模板已激活。
7. 在“配置生成”中执行测试，检查订阅拉取、节点清洗、区域分组和策略注入。
8. 复制客户端订阅地址，在 sing-box 客户端中使用。

客户端订阅地址只会在手动重置 Token 后变化。

## 已有安装该怎么处理

不要通过再次运行安装器完成日常升级。

| 目标 | 应执行 |
| --- | --- |
| 查看当前状态 | `proxyhub status` |
| 更新 ProxyHub 并保留数据 | `proxyhub update proxyhub` |
| 更新 Sub-Store 并保留数据 | `proxyhub update sub-store` |
| 重启 ProxyHub | `proxyhub restart proxyhub` |
| 重启 Sub-Store | `proxyhub restart sub-store` |
| 删除全部旧数据并重新安装 | 使用下面的 `--replace` 命令 |

安装器发现任何受管目录、CLI、容器、网络或数据卷时都会停止，避免覆盖
数据。以下提示不代表镜像下载失败：

```text
ProxyHub is already installed
```

如果现有服务正常，应使用 `proxyhub update`，不要使用覆盖安装。

### 提示已安装，但 `proxyhub` 命令不存在

这通常表示早期版本卸载后保留了配置或 Docker 数据卷。可执行只读检查：

```sh
for target in \
  /opt/proxyhub \
  /etc/proxyhub \
  /var/lib/proxyhub \
  /var/log/proxyhub \
  /usr/local/bin/proxyhub
do
  if [ -e "$target" ] || [ -L "$target" ]; then
    echo "[FOUND] $target"
  fi
done

for volume in proxyhub-data proxyhub-substore-data; do
  docker volume inspect "$volume" >/dev/null 2>&1 &&
    echo "[FOUND] $volume"
done
```

如果 `/opt/proxyhub/proxyhub` 仍存在，可先尝试：

```sh
/opt/proxyhub/proxyhub status
```

如果旧数据不需要，执行干净覆盖安装：

```sh
PROXYHUB_REPLACE_CONFIRM=DELETE \
  /tmp/proxyhub-install.sh \
  --replace \
  --yes
```

该命令会永久删除：

- ProxyHub 用户、订阅、模板、Token 和密钥；
- Sub-Store 数据；
- 内部备份和日志；
- 两个 ProxyHub Docker 数据卷；
- 旧部署目录和 CLI。

它不会删除 Docker、其他容器、镜像缓存或管理目录之外的外部备份。
覆盖安装不是升级，也没有数据回滚保证。

## 日常命令

SSH 登录宿主机后，运行 `proxyhub` 或 `proxyhub menu` 可打开文本管理菜单。

| 操作 | 命令 |
| --- | --- |
| 管理菜单 | `proxyhub` |
| 查看全部状态 | `proxyhub status` |
| 查看 ProxyHub 状态 | `proxyhub status proxyhub` |
| 查看 Sub-Store 状态 | `proxyhub status sub-store` |
| 只读诊断 | `proxyhub doctor` |
| 启动全部 | `proxyhub start` |
| 停止全部 | `proxyhub stop` |
| 重启全部 | `proxyhub restart` |
| 重启 ProxyHub | `proxyhub restart proxyhub` |
| 重启 Sub-Store | `proxyhub restart sub-store` |
| 查看全部日志 | `proxyhub logs` |
| 查看 ProxyHub 最近 100 行 | `proxyhub logs proxyhub --tail=100` |
| 持续查看 Sub-Store 日志 | `proxyhub logs sub-store -f` |
| 检查更新 | `proxyhub check-updates` |
| 更新 ProxyHub | `proxyhub update proxyhub` |
| 更新 Sub-Store | `proxyhub update sub-store` |
| 回滚 ProxyHub | `proxyhub rollback proxyhub` |
| 回滚 Sub-Store | `proxyhub rollback sub-store` |
| 完整备份 | `proxyhub backup` |
| 彻底卸载 | `proxyhub uninstall` |

两个容器的日志均限制为每份 `5MB`、最多 `3` 份。配置生成记录为每用户
保留最近 `10` 次；每个组件保留最近 `5` 份自动更新前备份。

## 更新与回滚

只检查更新，不修改服务：

```sh
proxyhub check-updates
```

更新到最新稳定版：

```sh
proxyhub update proxyhub
proxyhub update sub-store
```

自动化确认：

```sh
proxyhub update proxyhub --yes
proxyhub update sub-store --yes
```

指定版本或镜像：

```sh
proxyhub update proxyhub --version <VERSION>
proxyhub update sub-store --version <SUBSTORE_VERSION>
proxyhub update proxyhub \
  --image ghcr.io/miozen/proxyhub:<TAG_OR_DIGEST>
proxyhub update sub-store \
  --image xream/sub-store:<TAG_OR_DIGEST>
```

更新只备份并重建所选组件。更新 ProxyHub 不会重建 Sub-Store，反之亦然。
目标 digest 未变化时不会重启容器；失败时会恢复所选组件。

手动回滚最近一次对应组件更新：

```sh
proxyhub rollback proxyhub
proxyhub rollback sub-store
```

## 备份与恢复

完整备份：

```sh
proxyhub backup
proxyhub backup before-change
```

单组件备份：

```sh
proxyhub backup proxyhub before-proxyhub-change
proxyhub backup sub-store before-substore-change
```

恢复：

```sh
proxyhub restore \
  /var/lib/proxyhub/backups/full/before-change

proxyhub restore \
  /var/lib/proxyhub/backups/components/sub-store/before-substore-change
```

完整恢复会操作两个组件；单组件恢复只操作对应容器。恢复前会验证备份
元数据和 SHA256。

内部备份保存在 `/var/lib/proxyhub/backups/`，会在覆盖安装或彻底卸载时
一起删除。需要长期保留的备份必须提前复制到 `/var/lib/proxyhub` 之外。

Sub-Store 网页导出的备份应在 Sub-Store 网页中恢复；它与 ProxyHub CLI
创建的完整备份不是同一种格式。

## 彻底卸载

交互执行，按提示输入 `DELETE`：

```sh
proxyhub uninstall
```

自动化执行：

```sh
PROXYHUB_UNINSTALL_CONFIRM=DELETE \
  proxyhub uninstall
```

卸载会永久删除两个组件的数据、配置、密钥、内部备份、日志、容器、网络、
数据卷、部署目录和 CLI。不会卸载 Docker、删除其他容器、镜像缓存或外部
备份。

早期版本的普通卸载可能保留配置和数据卷。此时重新安装会提示已经安装；
旧数据不需要时，应使用前文的 `--replace` 命令完成全新安装。

## 常见问题

### 3000 端口已占用

交互安装时输入其他端口，或执行：

```sh
/tmp/proxyhub-install.sh --port 3100 --yes
```

### 页面打不开

```sh
proxyhub status
curl -fsS http://127.0.0.1:3000/healthz
proxyhub logs proxyhub --tail=100
```

如果本机健康但其他设备打不开，检查宿主机防火墙、云安全组和访问 IP。

### Sub-Store 不可达

```sh
proxyhub status sub-store
proxyhub logs sub-store --tail=100
proxyhub restart sub-store
curl -fsS http://127.0.0.1:3000/healthz
```

### HTTPS 反向代理后登录状态异常

编辑 `/etc/proxyhub/proxyhub.env`：

```env
COOKIE_SECURE=true
TRUST_PROXY=true
```

然后执行：

```sh
proxyhub restart proxyhub
```

## 数据位置

```text
/opt/proxyhub                    部署文件和 CLI 实体
/etc/proxyhub/proxyhub.env       配置、密钥和镜像 digest
/var/lib/proxyhub                状态与内部备份
/var/log/proxyhub                日志目录
/usr/local/bin/proxyhub          CLI 入口
proxyhub-data                    ProxyHub Docker 数据卷
proxyhub-substore-data           Sub-Store Docker 数据卷
```

不要公开环境文件、客户端 Token、订阅地址或备份。

## 相关文档

- [详细运维与恢复](OPERATIONS.md)
- [真机验收](HOST_ACCEPTANCE.md)
- [安全说明](SECURITY.md)
- [GitHub Releases](https://github.com/miozen/proxyhub/releases)

正式镜像由 `v*` 标签触发发布。`dev` 镜像只在手动运行 `images` 工作流时
构建。
