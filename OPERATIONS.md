# Operations and recovery

```sh
proxyhub status
proxyhub logs
proxyhub backup
proxyhub restore /path/to/backup
```

Before an update, record `docker compose images` and run `proxyhub backup`.
Use fixed image tags:

```sh
proxyhub update --proxyhub-image ghcr.io/vonzhen/proxyhub:<version>
proxyhub update --substore-image xream/sub-store:<version> --confirm-substore
```

Updates create a rollback point and automatically restore it when pull, recreate or
health checks fail. Manual recovery uses `proxyhub rollback`.

`proxyhub uninstall` removes containers but retains `.env`, backups and volumes.
Permanent deletion requires:

```sh
PROXYHUB_PURGE_CONFIRM=DELETE proxyhub uninstall --purge
```

After recovery verify `/healthz`, owner login, configuration generation, Sub-Store
UI/API, sync history and volume persistence. Never paste secrets or subscription
URLs into logs or public issues.
