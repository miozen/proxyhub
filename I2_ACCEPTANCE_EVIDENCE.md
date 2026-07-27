# I2 lifecycle foundation evidence

Status: CODE_COMPLETE

Branch: `dev`

Implementation commits:

```text
3853f7af37b8ad6836411afaaacaaece4f0fc303
a6fac069a383d7d29a3c176118934bec5d4b1b86
```

Pull request: [#11](https://github.com/miozen/proxyhub/pull/11)

## Scope

- I2.1 allow-listed operation lock;
- I2.2 atomic operation and component state;
- I2.3 `all|proxyhub|sub-store` backup scopes;
- I2.4 backup metadata, image validation and SHA256 verification;
- I2.5 component update/restore isolation invariants;
- I2.6 separate container, self-health, dependency-health and readiness status.

## Local evidence

```text
PASS  Git diff whitespace validation
PASS  POSIX shell syntax: ops/proxyhub
PASS  JavaScript syntax check
PASS  Static operations contract tests
SKIP  Linux-only shell behavior tests on the Windows development host
```

The Linux-only cases were not represented as local passes. They were executed
by the Node 22 GitHub Actions test job.

## GitHub Actions evidence

Workflow:

```text
check #103
run id 30228980928
commit a6fac069a383d7d29a3c176118934bec5d4b1b86
conclusion success
```

Jobs:

```text
PASS  changes
PASS  deployment-assets
PASS  test (Node.js 22)
PASS  npm audit --audit-level=high
PASS  operations shell validation
PASS  platforms / Ubuntu 22.04
PASS  platforms / Ubuntu 24.04
PASS  Debian 12 runtime validation in both platform jobs
SKIP  compose
SKIP  docker
```

Runtime ProxyHub image builds: `0`.

Multi-architecture image publications: `0`.

## Behavior evidence

The Linux test job proves:

- a lock owned by a live PID refuses a concurrent mutation;
- a lock is reclaimed only after its PID is proven absent;
- a ProxyHub-only backup stops ProxyHub and does not stop Sub-Store;
- a component backup contains metadata and a SHA256 manifest;
- a modified component archive is rejected before the target service stops.

Static and shell tests also enforce:

- lock paths are allow-listed and symbolic-link lock directories are refused;
- lock cleanup does not use recursive deletion;
- state writes use mode `0600`, a same-directory temporary file and atomic
  rename;
- no `eval` is used;
- full backup restore validates both approved image repositories;
- update and component restore continue to use `--no-deps`;
- Sub-Store health checks the verified backend endpoint and official frontend
  instead of accepting every response below HTTP 500;
- update operation state records the failed phase and rollback result.

## Remaining acceptance

I2 is code-complete, not host-accepted.

The following evidence remains assigned to I6:

- real managed-container IDs prove component backup/restore and update never
  recreate the other component;
- real-volume full and component restore;
- interruption during update/restore;
- Alpine amd64 and Ubuntu arm64 host walkthroughs;
- user acceptance before merge to `master`.

PR #11 remains draft until those release gates are intentionally addressed.
