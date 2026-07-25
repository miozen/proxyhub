# Post-v1 plan

## Web container control

Deferred until after first-version acceptance.

- Add a restricted host-side operations agent over a local Unix socket.
- Expose only fixed owner-approved actions: status, start, stop, restart,
  update and rollback for `proxyhub` or `sub-store`.
- Never mount the Docker socket into ProxyHub and never accept arbitrary shell
  commands.
- Require owner re-confirmation, signed short-lived requests, operation locks,
  image allowlists and audit logs.
- Keep the F4 command-line implementation as the underlying recovery path.
