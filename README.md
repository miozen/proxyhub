# ProxyHub

ProxyHub 是面向 VPS 和内网虚拟机的 sing-box 配置与 Sub-Store 统一管理平台。它将原 `singbox-center` 的用户、订阅、模板和配置生成功能，与官方 Sub-Store 的订阅管理能力整合到同一套登录系统中。

当前稳定版本：`v0.1.1`

## 主要功能

- Node.js 22、SQLite、Docker Compose 部署。
- 支持 Linux `amd64` 和 `arm64`。
- 支持 Alpine、Debian、Ubuntu。
- 默认只开放 ProxyHub 的 `3000` 端口；Sub-Store 不映射宿主机端口。
- ProxyHub 与 Sub-Store 使用两个独立容器，可分别启停、更新和回滚。
- 首位注册用户自动成为 owner；后续注册用户需 owner 审核。
- 用户登录、退出、修改用户名和密码、禁用/恢复、注册开关及配置生成开关。
- 每位用户拥有独立客户端订阅地址；地址保持不变，只有手动重置 Token 才会变化。
- 管理多个订阅源，支持启用/停用、区域授权和单源测试。
- 保留 Sub-Store 处理后的任意 sing-box 协议，不使用写死的协议白名单。
- 区域关键字匹配、节点清洗、机场 × 区域分组、策略注入和 sing-box JSON 生成。
- 配置生成测试可分步显示模板、订阅拉取、节点清洗、区域分组、策略注入和最终配置结果。
- 生成失败时可返回最近一次成功配置，并通过 `X-ProxyHub-Cache: stale` 标识。
- 本地和远程模板、JSON/引用校验、缓存、版本历史、激活和回滚。
- owner 可进入官方 Sub-Store 前端；后端使用可重置随机路径。
- Sub-Store 的订阅、转换、同步及备份恢复继续使用官方原生逻辑。
- 完整备份、恢复、一键安装、保留数据卸载和彻底清除。
- ProxyHub 与 Sub-Store 均支持独立检查更新、固定版本更新和失败自动回滚。

## 部署结构

```text
浏览器 / sing-box 客户端
          |
      宿主机 :3000
          |
      ProxyHub 容器
          |
     Docker 私有网络
          |
     Sub-Store 容器
```

ProxyHub 不挂载 Docker Socket。容器维护只能通过宿主机上的 `proxyhub` 命令执行。

## 一键安装

需要 root 权限。安装器会校验系统和架构、下载 Release 资产并核对 SHA256；如果缺少 Docker，会先询问是否安装。

```sh
curl -fsSLo /tmp/proxyhub-install.sh \
  https://github.com/miozen/proxyhub/releases/latest/download/install.sh
chmod +x /tmp/proxyhub-install.sh
sudo /tmp/proxyhub-install.sh
```

安装完成后访问：

```text
http://服务器IP:3000/
```

首次注册的用户自动成为 owner。

### 安装指定版本或端口

```sh
# 安装指定 ProxyHub 版本
sudo /tmp/proxyhub-install.sh --version 0.1.1

# 使用其他宿主机端口
sudo /tmp/proxyhub-install.sh --port 3100

# 同时指定 Sub-Store 版本
sudo /tmp/proxyhub-install.sh \
  --version 0.1.1 \
  --substore-version 2.36.21 \
  --port 3000

# 非交互安装
sudo /tmp/proxyhub-install.sh --yes
```

安装位置：

```text
/opt/proxyhub                 部署文件和维护命令
/etc/proxyhub/proxyhub.env    环境配置
/var/lib/proxyhub             备份和维护状态
/var/log/proxyhub             日志目录
/usr/local/bin/proxyhub       命令入口
```

## 日常维护命令

以下命令通常需要 root 权限。

### 查看状态

```sh
proxyhub status
proxyhub status proxyhub
proxyhub status sub-store
```

### 启动、停止和重启

不指定组件时同时操作两个容器：

```sh
proxyhub start
proxyhub stop
proxyhub restart
```

只操作其中一个容器：

```sh
proxyhub start proxyhub
proxyhub stop proxyhub
proxyhub restart proxyhub

proxyhub start sub-store
proxyhub stop sub-store
proxyhub restart sub-store
```

更新或重启 ProxyHub 不会重建 Sub-Store，反之亦然。

### 查看日志

```sh
# 两个组件的日志
proxyhub logs

# 指定组件
proxyhub logs proxyhub
proxyhub logs sub-store

# 最近 100 行
proxyhub logs proxyhub --tail=100

# 持续跟踪
proxyhub logs sub-store -f
```

### 检查更新

只检查并显示当前镜像、候选标签和目标 digest，不会自动更新：

```sh
proxyhub check-updates
proxyhub check-updates proxyhub
proxyhub check-updates sub-store
```

ProxyHub 默认查询本仓库最新 GitHub Release；Sub-Store 默认查询官方 `xream/sub-store:latest`。

### 更新 ProxyHub

更新到最新稳定版本：

```sh
proxyhub update proxyhub
```

更新到指定版本：

```sh
proxyhub update proxyhub --version 0.1.1
```

使用指定镜像标签或 digest：

```sh
proxyhub update proxyhub \
  --image ghcr.io/miozen/proxyhub:v0.1.1
```

非交互确认：

```sh
proxyhub update proxyhub --version 0.1.1 --yes
```

### 更新 Sub-Store

更新到官方最新版本：

```sh
proxyhub update sub-store
```

更新到指定版本：

```sh
proxyhub update sub-store --version 2.36.21
```

使用指定镜像：

```sh
proxyhub update sub-store \
  --image xream/sub-store:2.36.21
```

非交互确认：

```sh
proxyhub update sub-store --version 2.36.21 --yes
```

更新流程会先备份所选组件，将镜像解析为不可变 digest，然后只重建该组件。拉取、启动或健康检查失败时会自动恢复更新前备份。

### 回滚

回滚到该组件最近一次更新前的状态：

```sh
proxyhub rollback proxyhub
proxyhub rollback sub-store
```

ProxyHub 和 Sub-Store 的回滚点彼此独立。

### 完整备份

完整备份同时包含：

- ProxyHub SQLite 数据及用户配置；
- Sub-Store 数据；
- 当前环境配置。

```sh
# 自动使用时间命名
proxyhub backup

# 自定义备份名称
proxyhub backup before-upgrade
```

命令会输出备份目录。标准安装默认保存在：

```text
/var/lib/proxyhub/backups/
```

备份期间两个容器会短暂停止，完成后自动启动并检查健康状态。

### 完整恢复

```sh
proxyhub restore \
  /var/lib/proxyhub/backups/before-upgrade
```

恢复会停止两个容器、还原两个数据卷和环境配置，然后重新启动。该操作会覆盖当前数据，执行前建议先创建新备份。

### 普通卸载（保留数据）

```sh
proxyhub uninstall
```

普通卸载会移除：

- 两个容器和 Compose 网络；
- `/opt/proxyhub` 中的部署文件；
- `/usr/local/bin/proxyhub` 命令链接。

它会保留配置、备份、日志、维护状态以及两个 Docker 数据卷。以后重新执行一键安装，可以继续使用原有用户和数据。

### 彻底卸载（永久删除数据）

交互执行：

```sh
proxyhub uninstall --purge
```

出现提示后必须准确输入 `DELETE`。

非交互执行：

```sh
PROXYHUB_PURGE_CONFIRM=DELETE \
  proxyhub uninstall --purge
```

彻底卸载会删除配置、备份、日志和两个 Docker 数据卷，无法通过 ProxyHub 恢复。Docker 本身不会被卸载。

## 配置和反向代理

主要配置文件：

```text
/etc/proxyhub/proxyhub.env
```

默认值包括：

```env
PORT=3000
COOKIE_SECURE=false
TRUST_PROXY=false
REGISTRATION_ENABLED=true
SUBSTORE_IMAGE=xream/sub-store:2.36.21
AUTO_UPDATE_ENABLED=false
```

如果通过 HTTPS 反向代理访问，建议设置：

```env
COOKIE_SECURE=true
TRUST_PROXY=true
```

修改配置后重启 ProxyHub：

```sh
proxyhub restart proxyhub
```

不要公开环境配置、客户端 Token、订阅地址或备份文件。

## 健康检查

```sh
curl -fsS http://127.0.0.1:3000/healthz
```

正常结果应包含：

```json
{
  "status": "ok",
  "service": "proxyhub"
}
```

## 镜像与发布

- 稳定镜像：`ghcr.io/miozen/proxyhub:v0.1.1`
- 最新稳定镜像：`ghcr.io/miozen/proxyhub:latest`
- 支持平台：`linux/amd64`、`linux/arm64`
- Sub-Store：官方 `xream/sub-store`
- Release：[GitHub Releases](https://github.com/miozen/proxyhub/releases)

正式镜像和一键安装资产由 `v*` 标签触发发布。`dev` 分支只在手动运行 `images` 工作流时发布开发镜像。

## 数据与安全边界

- 用户数据按用户 ID 隔离。
- Session、Token、CSRF、登录限流和安全 Cookie 由 ProxyHub 管理。
- Sub-Store 仅在 Compose 私有网络中运行，不开放宿主机端口。
- ProxyHub 只代理 owner 使用的 Sub-Store 前端和随机后端路径。
- ProxyHub 不重复实现 Sub-Store 的订阅转换、同步和备份恢复逻辑。
- ProxyHub 不使用写死的代理协议过滤列表。
- 自动更新默认关闭；所有更新均由宿主机命令明确执行。

## 相关文档

- [运维和恢复](OPERATIONS.md)
- [安全说明](SECURITY.md)
- [完整实施计划](IMPLEMENTATION_PLAN.md)
- [发布收尾计划](RELEASE_COMPLETION_PLAN.md)
