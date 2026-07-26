# 运维与恢复

## 组件控制

```sh
proxyhub status
proxyhub status proxyhub
proxyhub status sub-store
proxyhub start proxyhub
proxyhub stop sub-store
proxyhub restart proxyhub
proxyhub logs proxyhub --tail=100
proxyhub logs sub-store -f
```

不指定组件的 `start`、`stop`、`restart`、`status` 和 `logs` 会操作或
显示两个组件。指定组件时只操作该容器。

## 更新

```sh
proxyhub check-updates
proxyhub update proxyhub
proxyhub update sub-store
proxyhub update proxyhub --version 0.1.5
proxyhub update sub-store --version 2.36.21
proxyhub update proxyhub --image ghcr.io/miozen/proxyhub:<tag-or-digest>
proxyhub update sub-store --image xream/sub-store:<tag-or-digest>
```

更新命令展示当前镜像、候选标签和目标 digest，并要求确认；自动化使用
`--yes`。ProxyHub 从本仓库最新 Release 发现稳定版本，Sub-Store 从官方
`xream/sub-store:latest` 发现稳定版本。解析后均固定为不可变 digest。

更新仅备份并重建所选组件。目标 digest 未变化时两个容器均不重启。
拉取、重建或健康检查失败时自动恢复所选组件。手动回滚：

```sh
proxyhub rollback proxyhub
proxyhub rollback sub-store
```

每个组件保留最近 5 份自动更新前备份；手动备份不参与此清理。

## 完整备份与恢复

```sh
proxyhub backup
proxyhub backup before-change
proxyhub restore /var/lib/proxyhub/backups/before-change
```

完整备份和恢复会短暂停止两个服务。恢复会覆盖当前环境和两个数据卷。
卸载前需把要保留的备份复制到 `/var/lib/proxyhub` 之外。

## 安装边界

- 安装器只执行全新安装；发现任何受管状态即拒绝。
- 数据保留升级只使用 `proxyhub update`。
- 干净覆盖安装需要：

```sh
PROXYHUB_REPLACE_CONFIRM=DELETE \
  /tmp/proxyhub-install.sh --replace --yes
```

覆盖安装会先校验资产和镜像，再永久删除全部受管状态并创建新实例。

## 卸载边界

```sh
# 交互输入 DELETE
proxyhub uninstall

# 非交互
PROXYHUB_UNINSTALL_CONFIRM=DELETE proxyhub uninstall
```

卸载永久删除 ProxyHub、Sub-Store、配置、密钥、内部备份、日志和两个
Docker 数据卷，不提供保留受管数据的卸载模式。Docker、宿主机软件包、
外部备份和镜像缓存不在删除范围。

## 容量边界

- 每个容器日志：`5MB × 3`。
- 每用户生成记录：最近 10 次。
- 每组件自动更新备份：最近 5 份。
- 最近成功配置缓存独立保存，不受生成记录清理影响。

恢复后应验证 `/healthz`、owner 登录、配置生成、Sub-Store 前端/后端、
备份恢复及重启后持久化。完整命令见 [HOST_ACCEPTANCE.md](HOST_ACCEPTANCE.md)。
