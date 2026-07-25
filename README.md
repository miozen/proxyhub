# ProxyHub

Unified sing-box and Sub-Store management.

Current status: P0 scaffold on `dev`.

```sh
cp .env.example .env
docker compose up -d --build
curl http://127.0.0.1:3000/healthz
```

Only ProxyHub is published on the host. Sub-Store stays on the private Compose
network.





