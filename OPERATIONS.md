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

Before an update, record `docker compose images` and run `proxyhub backup`.
Use fixed image tags:

```sh
proxyhub update --proxyhub-image ghcr.io/vonzhen/proxyhub:<version>
proxyhub update --substore-image xream/sub-store:<version> --confirm-substore
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

`proxyhub uninstall` removes containers but retains `.env`, backups and volumes.
Permanent deletion requires:

```sh
PROXYHUB_PURGE_CONFIRM=DELETE proxyhub uninstall --purge
```

After recovery verify `/healthz`, owner login, configuration generation, Sub-Store
UI/API, sync history and volume persistence. Never paste secrets or subscription
URLs into logs or public issues.
