# ProxyHub

Unified sing-box and Sub-Store management.

Current status: P0-P5 re-baseline on `dev`; see `IMPLEMENTATION_PLAN.md`.

```sh
chmod +x ops/proxyhub
sudo ln -s "$(pwd)/ops/proxyhub" /usr/local/bin/proxyhub
proxyhub install
```

Only ProxyHub is published on the host. Sub-Store stays on the private Compose
network and its native UI is available to the owner through `/substore/`.

Lifecycle commands:

```text
install start stop restart status logs
backup restore check-updates update rollback uninstall
```

`start`, `stop`, `restart`, `status` and `logs` accept an optional `proxyhub` or
`sub-store` component. Updates and rollbacks are always component-scoped; see
`OPERATIONS.md`.

`uninstall` retains volumes and configuration. Purging requires both
`uninstall --purge` and `PROXYHUB_PURGE_CONFIRM=DELETE`. Sub-Store updates
require `--confirm-substore`. Automatic updates are disabled by default.
Container lifecycle remains host-controlled and ProxyHub does not mount the
Docker socket.







