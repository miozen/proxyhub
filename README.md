# ProxyHub

Unified sing-box and Sub-Store management.

Current status: release acceptance complete on `dev`; see
`RELEASE_COMPLETION_PLAN.md`.

```sh
curl -fsSLo /tmp/proxyhub-install.sh \
  https://github.com/Vonzhen/proxyhub/releases/latest/download/install.sh
chmod +x /tmp/proxyhub-install.sh
sudo /tmp/proxyhub-install.sh
```

The stable installer supports Alpine, Debian and Ubuntu on amd64 and arm64. It
downloads checksummed deployment assets from the selected GitHub Release,
installs Docker when approved, and exposes ProxyHub on port 3000 by default.

Only ProxyHub is published on the host. Sub-Store stays on the private Compose
network. The ProxyHub dashboard is available at `/proxyhub/`; the official
Sub-Store frontend uses `/` with an owner-managed, resettable random backend
path.

Lifecycle commands:

```text
install start stop restart status logs
backup restore check-updates update rollback uninstall
```

`start`, `stop`, `restart`, `status` and `logs` accept an optional `proxyhub` or
`sub-store` component. Updates and rollbacks are always component-scoped; see
`OPERATIONS.md`.

`uninstall` retains volumes and configuration. Purging requires both
`uninstall --purge` and `PROXYHUB_PURGE_CONFIRM=DELETE`. Component updates show
the resolved digest and require confirmation; `--yes` enables non-interactive
operation. Automatic updates are disabled by default. Container lifecycle
remains host-controlled and ProxyHub does not mount the Docker socket.







