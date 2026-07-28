# 运维与恢复

README 提供常用操作，本文件补充宿主机维护边界和故障处理。

## SSH 管理菜单

```sh
proxyhub
proxyhub menu
```

菜单与命令行使用同一套操作、锁、备份和回滚逻辑。非交互脚本应使用后续
明确命令，不要依赖菜单输入。

## 状态、诊断和日志

```sh
proxyhub status
proxyhub status proxyhub
proxyhub status sub-store
proxyhub doctor
proxyhub logs
proxyhub logs proxyhub --tail=100
proxyhub logs sub-store -f
```

状态分别报告容器、组件健康、依赖健康和整体就绪状态。Sub-Store 健康检查
同时检查后端和官方前端。

## 组件控制

```sh
proxyhub start
proxyhub stop
proxyhub restart

proxyhub start proxyhub
proxyhub stop proxyhub
proxyhub restart proxyhub

proxyhub start sub-store
proxyhub stop sub-store
proxyhub restart sub-store
```

指定组件时只操作对应容器。

## 更新与回滚

```sh
proxyhub check-updates
proxyhub check-updates proxyhub
proxyhub check-updates sub-store

proxyhub update proxyhub
proxyhub update sub-store

proxyhub update proxyhub --version <VERSION>
proxyhub update sub-store --version <SUBSTORE_VERSION>

proxyhub rollback proxyhub
proxyhub rollback sub-store
```

自动化更新增加 `--yes`。更新只备份、切换资产并重建所选组件。目标 digest
未变化时不重启；拉取、切换、启动或健康检查失败时恢复该组件。

每个组件保留最近 `5` 份自动更新前备份。手动命名备份不参与自动清理。

## 备份与恢复

```sh
# 完整备份
proxyhub backup
proxyhub backup all before-full-change

# 单组件备份
proxyhub backup proxyhub before-proxyhub-change
proxyhub backup sub-store before-substore-change

# 恢复
proxyhub restore \
  /var/lib/proxyhub/backups/full/before-full-change
proxyhub restore \
  /var/lib/proxyhub/backups/components/sub-store/before-substore-change
```

完整备份与恢复会操作两个组件；单组件操作不会重建另一个容器。恢复前验证
备份类型、组件和 SHA256。CLI 只接受 `/var/lib/proxyhub/backups/` 内的
恢复路径。

跨机器恢复时，先把备份复制回受管备份目录。卸载前需要长期保存的备份，
必须先复制到 `/var/lib/proxyhub` 之外。

## 并发操作

有状态运维命令使用 `/run/lock/proxyhub.lock` 串行执行。仍在运行的操作会
阻止第二个变更命令；确认原进程已结束后，CLI 才清理陈旧锁。

`status`、`logs`、`doctor` 和 `check-updates` 是只读操作。

## 已安装、残留与覆盖安装

安装器检测以下任意状态：

```text
/opt/proxyhub
/etc/proxyhub
/var/lib/proxyhub
/var/log/proxyhub
/usr/local/bin/proxyhub
proxyhub-proxyhub-1
proxyhub-sub-store-1
proxyhub_internal
proxyhub-data
proxyhub-substore-data
```

任何一项存在都会阻止普通安装。

- 完整安装正常运行：使用 `proxyhub update`。
- CLI 链接丢失但 `/opt/proxyhub/proxyhub` 存在：可先使用完整路径检查。
- 旧版卸载仅留下配置或数据卷：保留数据时不要覆盖；不需要数据时使用
  干净覆盖安装。

```sh
PROXYHUB_REPLACE_CONFIRM=DELETE \
  /tmp/proxyhub-install.sh \
  --replace \
  --yes
```

覆盖安装会永久删除全部受管状态并重新生成密钥，不是升级。

## 彻底卸载

```sh
# 交互输入 DELETE
proxyhub uninstall

# 自动化
PROXYHUB_UNINSTALL_CONFIRM=DELETE \
  proxyhub uninstall
```

卸载永久删除 ProxyHub、Sub-Store、配置、密钥、内部备份、日志、容器、
网络和两个 Docker 数据卷，不提供保留受管数据的模式。Docker、宿主机
软件包、其他容器、镜像缓存和外部备份不在删除范围。

## 容量边界

- 每个容器日志：`5MB × 3`。
- 每用户生成记录：保留最近 `10` 次。
- 每组件自动更新备份：保留最近 `5` 份。
- 最近成功配置缓存独立保存，不受生成记录清理影响。

## 恢复后检查

```sh
proxyhub status
proxyhub doctor
curl -fsS http://127.0.0.1:3000/healthz
```

随后验证 owner 登录、Sub-Store 前端、订阅测试和客户端配置生成。
