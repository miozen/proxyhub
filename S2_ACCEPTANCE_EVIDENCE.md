# S2 business acceptance evidence

Status: COMPLETE
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

Status: PASS

- editing saved a distinct immutable version while retaining the original;
- exactly one valid template version remained active;
- invalid references were rejected without changing the active version;
- client generation used the newly activated version;
- switching back to the original version restored its generated setting;
- automated coverage confirms remote refresh creates a child version and a
  failed refresh leaves the cached immutable content usable.

## S2.4 - Sub-Store native workflow

Status: PASS

- owner opens the official Sub-Store frontend through ProxyHub;
- the frontend reaches the resettable random backend path without exposing a
  Sub-Store host port;
- native subscription management operates normally in the browser;
- native backup export and restore complete successfully;
- restore data reaches the upstream byte-for-byte through the raw proxy;
- ProxyHub does not duplicate Sub-Store subscription, conversion, sync or
  backup business logic.

Existing browser evidence and F6R.2/F6S regression evidence were reused; no
duplicate real-host test was required.

## S2.5 - Full backup and persistence

Status: PASS

- the environment file and both named volumes were archived successfully;
- both volume archives passed integrity inspection;
- full restore recreated the stack and restored the environment byte-for-byte;
- the restored client token generated valid JSON with expected outbounds;
- ProxyHub database and Sub-Store health returned `ok`/HTTP 200;
- a full stack restart retained data and restored live client generation.

S2.1 through S2.5 are accepted. No business-acceptance gate remains open.
