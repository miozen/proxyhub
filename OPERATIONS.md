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

## 备份与恢复

```sh
# 完整备份；省略 all 仍保持兼容
proxyhub backup
proxyhub backup before-change
proxyhub backup all before-full-change

# 单组件备份
proxyhub backup proxyhub before-proxyhub-change
proxyhub backup sub-store before-substore-change

# 恢复
proxyhub restore /var/lib/proxyhub/backups/full/before-change
proxyhub restore \
  /var/lib/proxyhub/backups/components/sub-store/before-substore-change
```

完整备份和恢复会短暂停止两个服务。单组件备份与恢复只操作指定服务，
不会重建另一个容器。新备份包含受限元数据和 SHA256 校验，校验失败时
恢复会在停止容器前拒绝。CLI 只接受 `/var/lib/proxyhub/backups/` 内的
恢复路径；跨机器恢复需先将备份复制回该目录。卸载前需把要保留的备份
复制到 `/var/lib/proxyhub` 之外。

所有有状态运维命令由 `/run/lock/proxyhub.lock` 串行化。锁会记录 PID、
命令和开始时间；仍存活的持有者会阻止并发操作，只在确认 PID 已不存在
后清理陈旧锁。`status`、`logs` 和 `check-updates` 保持只读且不获取锁。

`status` 现在分别报告容器状态、组件自身健康、依赖健康和总体就绪状态。
Sub-Store 自身健康同时验证后端 `/api/utils/env` 和官方前端。

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
