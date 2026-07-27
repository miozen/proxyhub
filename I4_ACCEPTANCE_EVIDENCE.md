# I4 SSH terminal management menu evidence

Status: CODE_COMPLETE on `dev`

Accepted code commit: `95483b97910551fd11dd2758a62a9fc791f12d03`

GitHub Actions:

- workflow: `check`
- run: `30230125326` (`#127`)
- conclusion: success
- Linux PTY menu snapshot and invalid-input no-mutation test: success
- bare non-TTY help and explicit non-TTY menu refusal: success
- full Node 22 suite and npm audit: success
- deployment asset checksum/help validation: success
- Ubuntu 22.04, Ubuntu 24.04 and Debian 12 shell/runtime validation: success
- Compose job: skipped
- ProxyHub runtime Docker image build: skipped
- multi-architecture publication: not triggered

## Implemented contract

- Bare `proxyhub` opens the menu only when stdin and stdout are TTYs.
- `proxyhub menu` is the explicit terminal entry; non-TTY use fails quickly.
- The home screen reads local container/image state and does not check remote
  versions until requested.
- ProxyHub and Sub-Store menus use the same lifecycle vocabulary.
- Backup/restore, logs and read-only `doctor` diagnostics have dedicated
  entries.
- Every menu action displays and invokes the public `proxyhub ...` command in
  a child process, preserving direct-command locks, confirmation and exits.
- Invalid selections and rejected version/path input perform no mutation.
- EOF returns safely; HUP, INT and TERM exit the menu without a mutation.
- Output is line-oriented plain text and remains suitable for `NO_COLOR`,
  narrow and non-ANSI terminals.
- Menu output reads only component image keys and never prints secrets,
  tokens, subscription URLs or the complete environment file.

## Local evidence

- `sh -n ops/proxyhub`
- `node scripts/check-syntax.js`
- targeted I2/I3/I4 operation contract tests
- non-TTY explicit-menu refusal
- `git diff --check`

Windows skipped the three POSIX behavior cases locally. CI executed all three
on Linux, including the pseudo-terminal snapshot, and they passed.

## Remaining host gates

The automated PTY test proves the menu routing and no-mutation input contract.
The real SSH walkthrough, interactive update/rollback and real container ID
isolation remain part of I6. No `dev -> master` merge is authorized by this
checkpoint.
