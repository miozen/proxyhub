# I3 semi-interactive installation evidence

Status: CODE_COMPLETE on `dev`

Accepted commit: `799c231b8f68892a1bad844329116d7a89f11785`

GitHub Actions:

- workflow: `check`
- run: `30229745011` (`#119`)
- conclusion: success
- deployment asset build/checksum/help smoke: success
- Node 22 syntax, full test suite and audit: success
- Ubuntu 22.04 host syntax and Debian 12 runtime validation: success
- Ubuntu 24.04 host syntax and Debian 12 runtime validation: success
- Compose job: skipped
- ProxyHub runtime Docker image build: skipped
- multi-architecture publication: not triggered

## Implemented contract

- TTY mode is selected only when stdin and stdout are terminals.
- An omitted port receives a default-first prompt; `--port` suppresses it.
- Clean installation uses `[Y/n]`; `--yes` remains automation-safe.
- Non-TTY execution never reads confirmation input and prints an exact
  `--yes` remediation.
- An occupied port receives TTY correction or
  `--port <available-port> --yes` automation guidance.
- Preflight uses `[OK]`, `[WARN]` and blocking installer errors.
- The final summary includes the host, URL, release, immutable image digests,
  container/network/volume names and managed paths.
- Clean-install cancellation occurs before managed paths are created.
- Installation state is written mode `0600` through a same-directory
  temporary file and atomic rename.
- Replacement retains the exact `DELETE` confirmation contract.

## Local evidence

- `sh -n install.sh`
- `node scripts/check-syntax.js`
- `node --test test/operations.test.js test/operations-i2.test.js test/operations-i3.test.js`
- deployment asset build, `sha256sum -c SHA256SUMS`, installer syntax and
  `install.sh --help`
- `git diff --check`

The local full application suite was not claimed because the Windows working
copy did not contain installed application dependencies. The GitHub test job
ran `npm ci`, the full suite and `npm audit` successfully.

## Remaining host gates

Automated checks prove command contracts and Linux shell compatibility. The
clean default-first TTY installation walkthrough, cancellation observation,
occupied-port correction on a real host and exact installed-state evidence
remain part of I6. No `dev -> master` merge is authorized by this checkpoint.
