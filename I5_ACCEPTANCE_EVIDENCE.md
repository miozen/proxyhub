# I5 ProxyHub 管理资产独立更新验收证据

## 验收范围

I5 实现 ProxyHub 官方 Release 管理资产的独立、可回滚更新，并保持
Sub-Store 生命周期独立。实现基线为 `dev` 提交
`699b6af0a0098a8ab076dd6f471fcd2a42a34fa2`。

本阶段自动化验收覆盖：

- 部署资产包精确包含 `.env.example`、`VERSION`、
  `compatibility.json`、`compose.yaml` 和 `proxyhub`；
- 安装器校验并安装兼容性清单；
- 官方 `v*` 更新下载同一 Release 资产与校验和；
- 候选 CLI 语法、Compose 渲染和兼容性清单均先于切换验证；
- 资产按文件原子替换，环境模板只增加缺失键；
- ProxyHub 更新点包含镜像、数据、完整环境和管理资产；
- 成功更新只重建 ProxyHub；
- 资产切换故障和更新后健康故障均恢复完整更新点；
- 不兼容组合在变更前阻断，且不自动更新 Sub-Store；
- Sub-Store 更新路径不调用 ProxyHub 资产暂存或切换函数。

## 自动化结果

- GitHub Actions：[`check` #159](https://github.com/miozen/proxyhub/actions/runs/30231299588)
- 结果：全部成功。
- 关键测试：`test/operations-i5.test.js` 的部署包契约、安装布局事务、
  成功切换、资产应用故障注入和健康故障注入场景。
- Shell 语法、现有应用测试和部署资产契约由同一工作流验证。
- Docker/Compose 主机作业因本次没有运行时或 Compose 服务定义变更而
  跳过。
- 本阶段构建 ProxyHub 运行时镜像：`0`。
- 本阶段没有执行多架构发布。

## 独立性结论

ProxyHub 官方版本更新可以更新自己的镜像、数据备份和发布管理资产，
但不得改变 `SUBSTORE_IMAGE`、Sub-Store 数据卷或重建 Sub-Store。
兼容性不满足时事务停止并给出先行操作命令，不做跨组件更新。

Sub-Store 更新只操作自己的镜像、备份、容器和状态；不下载、不替换、
不备份或回滚 ProxyHub CLI、Compose、环境模板、`VERSION` 与兼容性
清单。

## 留给 I6 的真实主机门禁

CI 使用受控 Docker/网络替身验证事务与故障注入，不能替代真实宿主机
证据。合并 `master` 前仍需在 I6 对最终 `dev` 提交完成：

- 记录更新前后两个真实容器 ID，确认只改变目标组件；
- 使用真实 GitHub Release 部署资产完成 ProxyHub 更新和回滚；
- 分别确认 ProxyHub 与 Sub-Store 数据持久化；
- 验证不兼容版本的实际阻断提示；
- 记录镜像 digest、主机平台、命令输出和最终健康状态。

因此 I5 标记为 `CODE_COMPLETE`，不宣称真实主机验收已经完成。
