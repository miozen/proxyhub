# Release completion plan

Status: ACTIVE
Branch policy: dev first; master/tag/release require explicit approval

## Decisions

- no release-candidate series;
- dev keeps CI, while dev image publishing becomes manual;
- ordinary master pushes do not publish images;
- `v*` tags publish multi-architecture images and GitHub Release assets;
- the first accepted release is `v0.1.0`;
- no web Docker controls, Docker Socket, or scheduled automatic update.

## S1 - Evidence closure

- record O1 ARM64 acceptance;
- update O1/P8/progress documents;
- remove stale candidate-release wording.

## S2 - Required business acceptance

- owner/member registration and approval;
- subscription testing and generation diagnostics;
- token URL persistence/reset;
- template version activation/rollback;
- Sub-Store UI, data and backup/restore;
- full ProxyHub backup/restore and restart persistence.

Only missing evidence is executed; already accepted gates are not repeated
without a defect or artifact change.

## S3 - Actions simplification

- dev/PR: tests and targeted Docker integration;
- docs-only changes: no Docker build;
- dev multi-architecture image: `workflow_dispatch` only;
- master push: CI only;
- `v*` tag: release build only.

## S4 - Direct formal release

1. dry-run release packaging on dev;
2. user approves `dev -> master` PR;
3. required checks pass and user approves merge;
4. create `v0.1.0` without an RC;
5. publish amd64/arm64 GHCR tags and `latest`;
6. publish `install.sh`, deployment archive and `SHA256SUMS`;
7. verify the stable one-command install and component update path.

No PR, merge, tag, stable image or Release is created before explicit approval.
