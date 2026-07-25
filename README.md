# ProxyHub

Unified sing-box and Sub-Store management.

Current status: P0-P5 re-baseline on `dev`; see `IMPLEMENTATION_PLAN.md`.

```sh
cp .env.example .env
docker compose up -d --build
curl http://127.0.0.1:3000/healthz
```

Only ProxyHub is published on the host. Sub-Store stays on the private Compose
network and its native UI is available to the owner through `/substore/`.

The current code includes a partial P5: owner-only Sub-Store health,
manual/interval sync, sync history and same-origin management UI. Phase
acceptance follows `IMPLEMENTATION_PLAN.md`; green CI alone does not close a
phase. Container lifecycle remains Compose-controlled and ProxyHub does not
mount the Docker socket.







