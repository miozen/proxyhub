# ProxyHub

ProxyHub 是部署在 VPS 或内网虚拟机上的 sing-box 配置与 Sub-Store
统一管理平台。ProxyHub 负责用户、模板和 sing-box 配置组装；节点订阅、
转换、同步及其备份恢复继续使用 Sub-Store 原生能力。

当前稳定版本：`v0.1.6`

## 功能

- Node.js 22、SQLite、Docker Compose。
- 支持 Alpine、Debian、Ubuntu，以及 `amd64`、`arm64`。
- 宿主机默认只开放 `3000`；Sub-Store 不映射宿主机端口。
- ProxyHub 与 Sub-Store 使用独立容器，可分别启停、更新和回滚。
- 首位注册用户自动成为 owner；后续注册需要 owner 审核。
- 用户、注册开关、配置生成权限、用户名、密码和客户端 Token 管理。
- 用户订阅源启停、区域授权、单源测试和生成过程诊断。
- 区域匹配、节点清洗、机场 × 区域分组、策略注入及 sing-box JSON 生成。
- 不使用协议白名单，保留 Sub-Store 输出的 AnyTLS 及未来协议字段。
- 本地/远程模板、校验、缓存、不可变版本、激活和回滚。
- 生成失败时可返回最近成功配置，并设置 `X-ProxyHub-Cache: stale`。
- owner 可进入 Sub-Store 官方前端；后端使用可重置随机路径。
- 完整备份恢复、一键安装、干净覆盖安装和彻底卸载。
- 两个组件均支持稳定版检查、digest 固定、独立更新和失败回滚。

## 部署结构

```text
浏览器 / sing-box 客户端
            |
       宿主机:3000
            |
      ProxyHub 容器
            |
       Docker 私有网络
            |
      Sub-Store 容器
```

ProxyHub 不挂载 Docker Socket。容器运维只能在宿主机执行 `proxyhub`
命令。

## 一键安装

使用 root 身份执行：

```sh
curl -fsSLo /tmp/proxyhub-install.sh \
  https://github.com/miozen/proxyhub/releases/latest/download/install.sh
chmod +x /tmp/proxyhub-install.sh
/tmp/proxyhub-install.sh
```

TTY 中安装器采用默认优先的半交互流程：未传 `--port` 时询问端口（默认
`3000`），完成只读检查和镜像解析后展示最终摘要，干净安装以 `[Y/n]`
确认。它只询问端口、缺失的 Docker/Compose 或宿主机工具，以及最终确认。

安装器会校验系统、架构、Release SHA256、磁盘、端口和镜像架构。
ProxyHub 使用当前稳定 Release；Sub-Store 默认从官方
`xream/sub-store:latest` 发现稳定镜像，然后把两个组件的不可变 digest
写入配置。

安装完成后访问 `http://服务器IP:3000/`。首次注册用户成为 owner。

常用安装选项：

```sh
# 指定 ProxyHub 版本（可写 0.1.4 或 v0.1.4）
/tmp/proxyhub-install.sh --version 0.1.4

# 指定端口
/tmp/proxyhub-install.sh --port 3100

# 明确固定 Sub-Store 版本
/tmp/proxyhub-install.sh --substore-version 2.36.21

# 非交互/自动化：使用默认值且绝不等待输入
/tmp/proxyhub-install.sh --yes
```

非 TTY 执行不会读取输入。需要确认的干净安装若未传 `--yes` 会退出并提示
重新执行；默认端口被占用时会提示使用
`--port <available-port> --yes`。TTY 中可直接重新输入可用端口。最终确认
前不会创建 ProxyHub 的受管目录、配置或数据卷。

安装只接受干净主机。检测到现有 ProxyHub 状态时会拒绝覆盖，应使用
`proxyhub update`。若确实需要删除全部旧数据并重新安装：

```sh
PROXYHUB_REPLACE_CONFIRM=DELETE \
  /tmp/proxyhub-install.sh --replace --yes
```

`--replace` 会永久删除 ProxyHub、Sub-Store、内部备份、配置、密钥和
Docker 数据卷，再创建全新实例；它不是升级，也没有回滚保证。

安装位置：

```text
/opt/proxyhub
/etc/proxyhub/proxyhub.env
/var/lib/proxyhub
/var/log/proxyhub
/usr/local/bin/proxyhub
```

## 日常维护

SSH 登录宿主机后直接运行：

```sh
proxyhub
# 或
proxyhub menu
```

TTY 中会打开行式管理菜单；裸命令在非 TTY 中只打印帮助，绝不等待输入。
菜单打开时不会联网检查更新，只有选择“检查更新”后才访问上游。菜单中的
变更项会先显示等价的非交互命令，再调用同一 CLI 命令路由；它不会启动
额外的 SSH 服务、管理容器或挂载 Docker Socket。`NO_COLOR` 和非 ANSI
终端使用相同的纯文本输出，EOF 或 Ctrl+C 会安全退出。

```sh
# 状态
proxyhub status
proxyhub status proxyhub
proxyhub status sub-store

# 启停和重启
proxyhub start
proxyhub stop
proxyhub restart
proxyhub restart proxyhub
proxyhub restart sub-store

# 日志
proxyhub logs
proxyhub logs proxyhub --tail=100
proxyhub logs sub-store -f

# 只检查更新，不修改服务
proxyhub check-updates
proxyhub check-updates proxyhub
proxyhub check-updates sub-store

# 只读诊断
proxyhub doctor
```

两个容器日志均由 Docker 限制为每份 `5MB`、最多 `3` 份。配置生成记录
每用户保留最近 `10` 次。

## 独立更新与回滚

```sh
# 更新到最新稳定版
proxyhub update proxyhub
proxyhub update sub-store

# 指定版本
proxyhub update proxyhub --version 0.1.4
proxyhub update sub-store --version 2.36.21

# 指定镜像
proxyhub update proxyhub --image ghcr.io/miozen/proxyhub:v0.1.4
proxyhub update sub-store --image xream/sub-store:2.36.21

# 非交互确认
proxyhub update proxyhub --yes
proxyhub update sub-store --yes

# 回滚最近一次对应组件的更新
proxyhub rollback proxyhub
proxyhub rollback sub-store
```

更新前会备份所选组件，并只重建该组件；另一个容器保持不变。发现目标
digest 与当前相同会直接成功退出，不重启容器。每个组件自动保留最近
`5` 份更新前备份，手动命名的备份不会被自动清理。

## 备份与恢复

```sh
# 完整备份两个组件
proxyhub backup
proxyhub backup before-change

# 仅备份一个组件
proxyhub backup proxyhub before-proxyhub-change
proxyhub backup sub-store before-substore-change

# 完整恢复
proxyhub restore /var/lib/proxyhub/backups/full/before-change

# 恢复单组件备份时只重建对应组件
proxyhub restore \
  /var/lib/proxyhub/backups/components/sub-store/before-substore-change
```

内部备份位于 `/var/lib/proxyhub/backups/`。新备份包含类型、组件和
SHA256 校验信息，恢复前会验证。完整恢复会覆盖当前两个组件的数据；
组件恢复只停止、恢复并重建对应组件。为了防止路径替换，CLI 只恢复
受管备份目录内的备份。需要跨机器恢复时，应先把备份安全复制回该目录；
彻底卸载会删除内部备份。

Sub-Store 前端自身的备份/恢复仍使用 Sub-Store 原生格式和逻辑。

## 彻底卸载

`proxyhub uninstall` 只有彻底卸载一种语义，不提供保留受管数据的
卸载模式：

```sh
# 交互执行，按提示输入 DELETE
proxyhub uninstall

# 自动化执行
PROXYHUB_UNINSTALL_CONFIRM=DELETE proxyhub uninstall
```

它会删除两个容器、私有网络、两个数据卷、配置、密钥、内部备份、日志、
部署目录和 CLI。不会卸载 Docker、删除宿主机软件包、外部备份或镜像
缓存。重复执行卸载按已删除状态处理。

## 配置、健康和安全

主配置文件：

```text
/etc/proxyhub/proxyhub.env
```

通过 HTTPS 反向代理时建议设置：

```env
COOKIE_SECURE=true
TRUST_PROXY=true
```

修改后执行 `proxyhub restart proxyhub`。不要公开环境配置、客户端
Token、订阅地址或备份文件。

健康检查：

```sh
curl -fsS http://127.0.0.1:3000/healthz
```

正常结果包含 `"status":"ok"`、数据库正常以及 Sub-Store
`"reachable":true`。

## 镜像与文档

- 稳定镜像：`ghcr.io/miozen/proxyhub:v0.1.4`
- 最新稳定镜像：`ghcr.io/miozen/proxyhub:latest`
- 平台：`linux/amd64`、`linux/arm64`
- Sub-Store：`xream/sub-store`
- [GitHub Releases](https://github.com/miozen/proxyhub/releases)
- [运维与恢复](OPERATIONS.md)
- [真机验收](HOST_ACCEPTANCE.md)
- [安全说明](SECURITY.md)
- [稳定生命周期设计](STABILITY_LIFECYCLE_DESIGN.md)
- [交互式生命周期升级设计](INTERACTIVE_LIFECYCLE_UPGRADE_DESIGN.md)
- [I2 生命周期基础验收证据](I2_ACCEPTANCE_EVIDENCE.md)
- [I3 半交互安装验收证据](I3_ACCEPTANCE_EVIDENCE.md)
- [I4 SSH 终端菜单验收证据](I4_ACCEPTANCE_EVIDENCE.md)

正式镜像和安装资产仅由 `v*` 标签触发发布。`dev` 分支的镜像工作流只
允许手动触发。
