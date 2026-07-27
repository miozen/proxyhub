# Post-v1 plan

## Web container control

Cancelled by user decision.

- Container lifecycle, update and rollback remain host CLI operations.
- ProxyHub and Sub-Store remain independently manageable.
- No host operations agent, web mutation API, extra recovery page or Docker
  Socket mount will be added.
- The dashboard may show read-only health and command guidance only.

## One-command installation

Promoted to O1. See `O1_INSTALL_PLAN.md`.

## Interactive lifecycle management

Approved for post-v0.1 implementation as I1-I6. See
`INTERACTIVE_LIFECYCLE_UPGRADE_DESIGN.md`.

- keep the current host CLI as the only mutation boundary;
- add default-first semi-interactive installation;
- add a line-oriented management menu for an existing SSH session;
- keep ProxyHub and Sub-Store update/rollback transactions independent;
- add lifecycle locking, component backup metadata and ProxyHub
  deployment-asset updates;
- do not add a custom SSH service, web lifecycle API, Docker Socket or
  scheduled updater.
