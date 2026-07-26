# S2 business acceptance evidence

Status: ACTIVE
Target: Ubuntu ARM64 production-like host
Evidence date: 2026-07-26
Secrets, public addresses and subscription contents are intentionally omitted.

## S2.1 - Identity and permissions

Status: PASS

- owner/member registration and approval operate normally;
- disabled registration reports a visible reason;
- subscriptions and generated configuration remain user-scoped;
- token reset invalidates the old URL and activates the new URL;
- generated JSON is valid and human-readable.

## S2.2 - Subscriptions and generation

Status: PASS

- saved-source and draft-source tests report raw/valid nodes and regions;
- generation diagnostics cover template, fetch, cleaning, grouping, injection
  and final output;
- Sub-Store-backed HTTP subscriptions load successfully;
- ProxyHub excludes structural outbounds but preserves AnyTLS and unknown future
  proxy protocols without maintaining a protocol allow-list;
- full client configuration is valid formatted JSON;
- ProxyHub restart preserves access and generated configuration behavior;
- stopping Sub-Store causes HTTP 200 with `X-ProxyHub-Cache: stale`;
- stale output hash equals the immediately preceding successful output hash;
- stale output remains valid JSON;
- restarting Sub-Store restores live generation and removes the stale header.

Implementation commit: `9eadef5`
Automated regression: 51/51 tests pass.

## S2.3 - Template lifecycle

Status: IN_PROGRESS

Required evidence:

- create or save a new immutable template version;
- invalid templates cannot be activated;
- exactly one valid version is active;
- client generation uses the active version;
- activating an older version rolls generation back to that version;
- remote refresh/cache behavior does not overwrite an immutable version.

## S2.4 - Sub-Store native workflow

Status: PENDING

## S2.5 - Full backup and persistence

Status: PENDING
