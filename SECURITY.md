# Security

- Expose only ProxyHub port 3000. Never publish Sub-Store ports.
- Use HTTPS and set `COOKIE_SECURE=true` behind a trusted reverse proxy.
- Set `TRUST_PROXY=true` only when requests always pass through that proxy.
- Keep `.env`, backups and named volumes readable only by administrators.
- Client tokens are stored as SHA-256 hashes; subscription URLs use AES-256-GCM.
- Cookie mutations require CSRF tokens; owner routes enforce backend authorization.
- Subscription/template fetches reject private targets, redirects and oversized bodies.
- Sub-Store proxy text responses are bounded and request bodies are limited to 5 MiB.
- The web container has no Docker socket and exposes no shell execution endpoint.

Report vulnerabilities privately to the repository owner. Do not include credentials,
subscription URLs, tokens, `.env` files or backup archives in an issue.
