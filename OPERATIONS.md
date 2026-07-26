# Operations and recovery

```sh
proxyhub status
proxyhub status proxyhub
proxyhub status sub-store
proxyhub logs
proxyhub logs proxyhub --tail=100
proxyhub logs sub-store -f
proxyhub start proxyhub
proxyhub stop sub-store
proxyhub restart sub-store
proxyhub backup
proxyhub restore /path/to/backup
```

Check both components or only one:

```sh
proxyhub check-updates
proxyhub check-updates proxyhub
proxyhub check-updates sub-store
```

Update to the newest stable release:

```sh
proxyhub update proxyhub
proxyhub update sub-store
```

The command shows the current image and resolved target digest, then asks for
confirmation. For non-interactive operation use `--yes`. Select a version or an
approved image explicitly when needed:

```sh
proxyhub update proxyhub --version 0.1.4
proxyhub update sub-store --version 2.36.21
proxyhub update proxyhub --image ghcr.io/miozen/proxyhub:<tag-or-digest>
proxyhub update sub-store --image xream/sub-store:<tag-or-digest>
```

Each update snapshots, pulls and recreates only the selected component. Updating
ProxyHub does not pull, stop or recreate Sub-Store, and vice versa. Updates create
independent rollback points and automatically restore the selected component when
pull, recreate or health checks fail. Manual recovery uses:

```sh
proxyhub rollback proxyhub
proxyhub rollback sub-store
```

`rollback` requires a component. Full `backup` and `restore` continue to stop and
recover both services together.

ProxyHub discovers stable versions from this repository's latest GitHub Release.
Sub-Store resolves the official `xream/sub-store:latest` image. Before applying
an update, both are pinned to an immutable digest. No scheduled update is
enabled.

For a packaged installation, `proxyhub uninstall` removes containers, the
network, `/opt/proxyhub` deployment files and the CLI link. It retains
`/etc/proxyhub`, `/var/lib/proxyhub`, logs and both Docker volumes so a later
installer run restores the same users and data.

Permanent deletion first lists the exact targets and requires:

```sh
PROXYHUB_PURGE_CONFIRM=DELETE proxyhub uninstall --purge
```

Without the environment variable, an interactive terminal must type `DELETE`.
ProxyHub never uninstalls Docker.

After recovery verify `/healthz`, owner login, configuration generation, Sub-Store
UI/API, sync history and volume persistence. Never paste secrets or subscription
URLs into logs or public issues.
