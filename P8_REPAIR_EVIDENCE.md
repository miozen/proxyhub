# P8 Repair Evidence

Plan: `P8_REPAIR_PLAN.md`
Baseline runtime: `dev-b4ca063`
Target: Alpine 3.24.1 amd64, Docker 29.5.3, Compose 5.1.4

## F1

### F1.1 P8.2 separation

Owner registration, login, owner navigation and session refresh work on the
Alpine target. Sub-Store browser failures are tracked under P8.5/F2 rather than
P8.2. Final browser-warning cleanup remains F5.

### F1.2 pinned upstream assets

`baseline/substore-2.36.21-assets.json` records the root CSS, JavaScript and
manifest requests observed from the pinned official UI. These requests bypass
the `/substore/` body rewrite and currently hit ProxyHub routes.

### F1.3-F1.5 reproduction

Run:

```sh
node --test baseline/p8-repair-baseline.test.js
```

Expected result on `dev-b4ca063`: three failures.

1. Owner-authenticated `/css/main.css` returns ProxyHub JSON 404 rather than
   upstream `text/css`.
2. `/api/me` has no persistent `client_token`.
3. `ops/proxyhub` uses whole-stack `dc pull` rather than component pulls.

Observed result on 2026-07-25: 0 passed, 3 failed with the exact expected
assertions above.

The default `npm test` entry is explicitly limited to `test/`; the baseline
suite runs only through the command above. F2-F4 must make each case pass and
move the corresponding assertion into the enforced test/CI suite.

### F1 exit

- baseline reproduction: PASS, expected 0/3 with all three defects reproduced;
- enforced local suite: PASS, 22/22;
- syntax and `git diff --check`: PASS;
- F1.1-F1.5: complete;
- next phase: F2.1-F2.6 only after explicit user start.
