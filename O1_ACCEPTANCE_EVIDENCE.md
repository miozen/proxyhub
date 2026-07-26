# O1 acceptance evidence

Status: ACCEPTED
Date: 2026-07-26
Branch: dev

## Artifacts

- installer source ref: `232768b`;
- ProxyHub image: `ghcr.io/miozen/proxyhub:dev-df73b34`;
- ProxyHub manifest digest:
  `sha256:f43cc2235fb054331330274ebf87936aa67af483861e22618b23a7555f1fe315`;
- Sub-Store image: `xream/sub-store:2.36.21`;
- Sub-Store manifest digest:
  `sha256:418d14ca751353707afc71fb66f45a82a87b1605740283c968f998e3f654bedb`.

## Native ARM64 host

- OS family: Ubuntu;
- architecture: `aarch64`;
- Docker Compose: `v5.3.1`;
- ProxyHub image runtime: `linux/arm64`;
- Sub-Store image runtime: `linux/arm64`;
- no platform emulation configured.

## Results

| Gate | Result | Evidence |
|---|---|---|
| dev one-command install | PASS | commit archive and explicit dev image installed successfully |
| fixed host layout | PASS | `/opt`, `/etc`, `/var/lib`, `/var/log` layout and CLI link created |
| secret file mode | PASS | `/etc/proxyhub/proxyhub.env` is mode `0600` |
| application health | PASS | database `ok`, Sub-Store reachable with status `200` |
| host exposure | PASS | only ProxyHub port 3000 published; Sub-Store bindings `0` |
| native ARM64 images | PASS | both image inspections report `linux/arm64` |
| ProxyHub update | PASS | tag resolved and deployed as immutable digest |
| ProxyHub isolation | PASS | Sub-Store container ID unchanged during update |
| ProxyHub rollback | PASS | original tag restored; health remained successful |
| Sub-Store update | PASS | tag resolved and deployed as immutable digest |
| Sub-Store isolation | PASS | ProxyHub container ID unchanged during update |
| Sub-Store rollback | PASS | original tag restored; health remained successful |
| backup | PASS | both volumes archived under retained host backup directory |
| normal uninstall | PASS | containers, network and deployment files removed |
| retained uninstall state | PASS | environment, backups and both named volumes remained |
| reinstall | PASS | installer recreated deployment and reused both named volumes |
| configuration preservation | PASS | environment SHA256 was unchanged after reinstall |
| post-reinstall health | PASS | ProxyHub healthy; database and Sub-Store checks successful |

The initial post-uninstall `command -v` check used the parent shell's cached
command path. The deployment directory was absent, and the subsequent reinstall
created a valid CLI link again. This was a test-command artifact, not an
uninstall failure.

## Deferred compatibility coverage

- disposable-host destructive purge;
- clean Alpine installation through the new installer;
- clean Debian installation through the new installer;
- Docker-missing host installation and installer fault injection.

Automated CI covers purge confirmation/refusal, retained reinstall, volume
deletion, shell syntax, archive checksum/content, Compose, update isolation and
failure rollback. The deferred real-host matrix is release compatibility work;
it does not invalidate the accepted Ubuntu ARM64 target used by the owner.

No host address, secret, subscription URL or user data is recorded here.
