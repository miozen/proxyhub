# ProxyHub

Unified sing-box and Sub-Store management.

Current status: P4 implementation on `dev`.

```sh
cp .env.example .env
docker compose up -d --build
curl http://127.0.0.1:3000/healthz
```

Only ProxyHub is published on the host. Sub-Store stays on the private Compose
network and its native UI is available to the owner through `/substore/`.

P4 includes owner-only Sub-Store health, manual/interval sync, sync history and
same-origin management UI. Container start, stop and restart remain Compose
operator actions; ProxyHub does not mount the Docker socket.






