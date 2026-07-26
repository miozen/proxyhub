# L6.4 真机验收

状态：`PENDING_HOST_ACCEPTANCE`

目标主机：

- Alpine `amd64`
- Ubuntu `arm64`

两台主机分别执行同一流程。测试会永久删除现有 ProxyHub 与 Sub-Store
数据；需要保留的备份必须先复制到管理目录之外。

## 1. 准备

以 root 身份执行：

```sh
uname -m
cat /etc/os-release
docker version
docker compose version
```

先等待 `dev` 的 `check` 全绿，再手动运行 `images` 工作流构建当前提交
的多架构开发镜像。将 `<FULL_SHA>` 和 `<SHORT_SHA>` 替换为工作流显示
的完整提交 SHA 与 7 位短 SHA：

```sh
accept_sha='<FULL_SHA>'
accept_short_sha='<SHORT_SHA>'
accept_image="ghcr.io/miozen/proxyhub:dev-${accept_short_sha}"
curl -fsSLo /tmp/proxyhub-install.sh \
  "https://raw.githubusercontent.com/miozen/proxyhub/${accept_sha}/install.sh"
chmod +x /tmp/proxyhub-install.sh
```

此方式直接验收尚未发布的确切 `dev` 提交和镜像，验收通过前不创建正式
Release。

## 2. 清理旧安装并全新安装

仅在已安装 ProxyHub 时执行：

```sh
PROXYHUB_UNINSTALL_CONFIRM=DELETE proxyhub uninstall
```

全新安装：

```sh
/tmp/proxyhub-install.sh \
  --channel dev \
  --ref "$accept_sha" \
  --image "$accept_image" \
  --yes
proxyhub status
curl -fsS http://127.0.0.1:3000/healthz
```

验证安装环境固定了 Sub-Store digest：

```sh
grep '^SUBSTORE_IMAGE=xream/sub-store@sha256:' \
  /etc/proxyhub/proxyhub.env
```

预期：两个容器运行，ProxyHub healthy，Sub-Store reachable。

## 3. 拒绝重复安装

```sh
if /tmp/proxyhub-install.sh \
  --channel dev \
  --ref "$accept_sha" \
  --image "$accept_image" \
  --yes; then
  echo 'FAIL: repeated install was accepted'
else
  echo 'PASS: repeated install refused'
fi
curl -fsS http://127.0.0.1:3000/healthz
```

预期：重复安装失败，现有实例保持健康。

## 4. Sub-Store 原生数据

在网页完成：

1. 注册首位 owner。
2. 打开 Sub-Store。
3. 创建一条测试订阅。
4. 使用 Sub-Store 原生备份导出。
5. 删除测试订阅，再用原生备份恢复。
6. 确认订阅恢复且前后端访问正常。

不要把真实订阅地址写入公开日志。

## 5. 重启、日志和客户端生成

在网页创建 ProxyHub 订阅源并成功生成配置，然后设置地址：

```sh
client_url='<CLIENT_URL>'
proxyhub restart
for i in $(seq 1 45); do
  result="$(curl -fsS http://127.0.0.1:3000/healthz 2>/dev/null || true)"
  echo "$result"
  echo "$result" | grep -q '"status":"ok"' &&
    echo "$result" | grep -q '"reachable":true' && break
  sleep 2
done
curl -fsS "$client_url" -o /tmp/proxyhub-acceptance.json
docker exec -i proxyhub-proxyhub-1 node -e '
let data = "";
process.stdin.on("data", chunk => data += chunk);
process.stdin.on("end", () => {
  const value = JSON.parse(data);
  console.log("PASS: valid client JSON");
  console.log("outbounds:", value.outbounds?.length || 0);
});
' < /tmp/proxyhub-acceptance.json
```

验证日志配置：

```sh
for container in proxyhub-proxyhub-1 proxyhub-sub-store-1; do
  docker inspect "$container" \
    --format '{{.Name}} {{.HostConfig.LogConfig.Type}} {{json .HostConfig.LogConfig.Config}}'
done
```

预期两个容器均显示 `json-file`、`max-size=5m`、`max-file=3`。

## 6. 独立更新和同 digest 空操作

```sh
proxyhub_before="$(docker inspect proxyhub-proxyhub-1 --format '{{.Id}}')"
substore_before="$(docker inspect proxyhub-sub-store-1 --format '{{.Id}}')"
proxyhub update sub-store --yes
proxyhub_after="$(docker inspect proxyhub-proxyhub-1 --format '{{.Id}}')"
substore_after="$(docker inspect proxyhub-sub-store-1 --format '{{.Id}}')"
test "$proxyhub_before" = "$proxyhub_after" &&
  echo 'PASS: ProxyHub unchanged'
test "$substore_before" = "$substore_after" &&
  echo 'PASS: same Sub-Store digest is a no-op'
```

ProxyHub 使用当前同版本镜像验证同 digest：

```sh
proxyhub_before="$proxyhub_after"
substore_before="$substore_after"
proxyhub update proxyhub --image "$accept_image" --yes
test "$proxyhub_before" = \
  "$(docker inspect proxyhub-proxyhub-1 --format '{{.Id}}')" &&
  echo 'PASS: same ProxyHub digest is a no-op'
test "$substore_before" = \
  "$(docker inspect proxyhub-sub-store-1 --format '{{.Id}}')" &&
  echo 'PASS: Sub-Store unchanged'
```

实际跨版本更新与 `rollback proxyhub|sub-store` 已在先前真机阶段验证；若本次
Release 没有另一个安全版本，不为制造差异而降级。

## 7. 干净覆盖安装

记录旧密钥 hash：

```sh
old_secret_hash="$(sha256sum /etc/proxyhub/proxyhub.env | awk '{print $1}')"
PROXYHUB_REPLACE_CONFIRM=DELETE \
  /tmp/proxyhub-install.sh \
    --channel dev \
    --ref "$accept_sha" \
    --image "$accept_image" \
    --replace \
    --yes
new_secret_hash="$(sha256sum /etc/proxyhub/proxyhub.env | awk '{print $1}')"
test "$old_secret_hash" != "$new_secret_hash" &&
  echo 'PASS: replacement generated a fresh environment'
proxyhub status
curl -fsS http://127.0.0.1:3000/healthz
```

网页预期：旧 owner、ProxyHub 订阅和 Sub-Store 数据均不存在，首位注册
重新成为 owner。

## 8. 彻底卸载

先验证未确认卸载不改变状态：

```sh
if env -u PROXYHUB_UNINSTALL_CONFIRM proxyhub uninstall </dev/null; then
  echo 'FAIL: unconfirmed uninstall succeeded'
else
  echo 'PASS: unconfirmed uninstall refused'
fi
curl -fsS http://127.0.0.1:3000/healthz
```

确认卸载：

```sh
PROXYHUB_UNINSTALL_CONFIRM=DELETE proxyhub uninstall
test ! -e /opt/proxyhub &&
test ! -e /etc/proxyhub &&
test ! -e /var/lib/proxyhub &&
test ! -e /var/log/proxyhub &&
test ! -e /usr/local/bin/proxyhub &&
test -z "$(docker volume ls -q --filter name='^proxyhub-data$')" &&
test -z "$(docker volume ls -q --filter name='^proxyhub-substore-data$')" &&
  echo 'PASS: all managed state removed'
docker version >/dev/null &&
  echo 'PASS: Docker retained'
```

## 9. 通过条件

两台主机都必须满足：

- 全新安装成功且 Sub-Store 固定为 digest；
- 重复安装拒绝且不影响运行实例；
- Sub-Store 原生备份恢复成功；
- 重启后健康、登录、数据和客户端配置正常；
- 日志轮转参数正确；
- 同 digest 更新不重建容器；
- 覆盖安装生成全新环境且旧数据消失；
- 未确认卸载无变化，确认卸载无受管状态残留；
- Docker 仍可使用。

两台主机结果确认后，将本文状态改为 `ACCEPTED`，才进入正式发布。
