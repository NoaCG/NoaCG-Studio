# Phase 1 speed baselines (row 3, merge `0ca774269`)

The two baselines spec.md §7 asks for, measured by the laptop helper on 2026-10-22 on phase 1's
merge SHA. Every later repeat (rows 22, 24 and 25) is compared against baseline 1 here.

## Setup

- **Machine:** the owner's laptop, Windows 10, 15.9 GB memory with about 4 GB free during the runs.
- **App:** `0ca774269` built with `vite build` and served by `npm run dev:worktree -- --preview` on
  port 5216. The full `npm run build` stopped at its test gate on one test unrelated to the page
  (`recovery commits have a machine identity even when the host has none`, which reads this
  machine's git identity), so the app's own build steps were run directly.
- **Backend:** the local Supabase stack, at this revision's migrations (0001 to 0095), with a
  throwaway user. Never production or the owner's productions.
- **Fixture:** the bench's own "Lag Bench" production, 3 graphics and 6 cues, seeded once
  unpublished (`--seed`) and once published (`--seed --published`).
- **Runs:** `--measure --rounds 12 --headless`, twice per fixture. Files:
  `phase-1-0ca7742-{local,published}-baseline-{1,2}.json`.

## The instrument, repaired for the published path

The bench at this revision (identical to main's copy before this change) had two faults on a
published production, both fixed in `scripts/playout-lag-bench.mjs` in the same change as this
receipt and used for the published runs:

- It timed only `control_send_many` and `control_send`, but the page has sent its verbs through
  `control_send_seq` since migration 0070 (2026-09-30), so `toRpcSentMs` and `toRpcDoneMs` were
  empty on every published run since then.
- Its closing local-control round imports `/src/...` modules, which only the dev server serves; on
  the built app it threw before writing `playout-lag.json`. It now skips that round on the built app
  and says to run `--cleanup` against the dev server.

The local runs do not touch either path. One column stays empty on this setup: `toWsRowMs`. The
socket probe saw no frame on the `log-<show id>` topic during the published runs, although the
local database received every verb (239 rows in the first, discarded run). So the `wsRow` part of
the comparison rule cannot be applied from these baselines; the RPC round trip and everything the
operator sees can.

## Baseline validity

The two baselines agree within the §7 thresholds on every gesture and metric, so the thresholds
apply as written (no 1.5 times spread tolerance). Times are milliseconds from the verb's click;
`rpc` is `rpcSent` to `rpcDone`.

### Local (unpublished)

| gesture | metric | first median | second median | first p90 | second p90 | within rule |
|---|---|---|---|---|---|---|
| select-rebuild | froze | - | - | 20.6 | 20.5 | yes |
| select-no-rebuild | froze | - | - | 18.7 | 18.6 | yes |
| take-idle | cmd | 2.5 | 2.5 | 2.7 | 2.7 | yes |
| take-idle | played | 15.4 | 15.6 | 15.9 | 16.1 | yes |
| take-idle | painted | 29.7 | 29.6 | 30.8 | 30.7 | yes |
| take-idle | froze | - | - | 18.6 | 19.2 | yes |
| out-idle | played | 16.3 | 16.3 | 17.3 | 16.9 | yes |
| out-idle | painted | 30.2 | 30.3 | 31.3 | 31.3 | yes |
| out-idle | froze | - | - | 18.6 | 18.6 | yes |
| take-after-rebuild | cmd | 2.6 | 2.5 | 2.7 | 2.9 | yes |
| take-after-rebuild | played | 14.6 | 14.6 | 15.6 | 15.5 | yes |
| take-after-rebuild | painted | 28.6 | 28.9 | 30.1 | 30.1 | yes |
| take-after-rebuild | froze | - | - | 20.3 | 20.3 | yes |
| take-after-no-rebuild | cmd | 2.5 | 2.4 | 2.6 | 2.7 | yes |
| take-after-no-rebuild | played | 14.6 | 14.0 | 14.9 | 15.4 | yes |
| take-after-no-rebuild | painted | 28.3 | 28.1 | 29.8 | 29.4 | yes |
| take-after-no-rebuild | froze | - | - | 18.6 | 18.6 | yes |

Both baselines within the rule: yes.

### Published (local stack)

| gesture | metric | first median | second median | first p90 | second p90 | within rule |
|---|---|---|---|---|---|---|
| select-rebuild | froze | - | - | 19.8 | 19.7 | yes |
| select-no-rebuild | froze | - | - | 18.6 | 18.7 | yes |
| take-idle | cmd | 3.9 | 3.9 | 4.2 | 4.3 | yes |
| take-idle | played | 15.7 | 15.2 | 16.1 | 16.0 | yes |
| take-idle | painted | 29.6 | 29.7 | 30.4 | 30.3 | yes |
| take-idle | rpc | 53.0 | 52.8 | - | - | yes |
| take-idle | froze | - | - | 20.8 | 18.8 | yes |
| out-idle | played | 16.0 | 16.9 | 17.6 | 17.5 | yes |
| out-idle | painted | 30.5 | 30.7 | 31.7 | 31.4 | yes |
| out-idle | rpc | 51.9 | 52.8 | - | - | yes |
| out-idle | froze | - | - | 19.5 | 18.7 | yes |
| take-after-rebuild | cmd | 4.0 | 4.0 | 4.8 | 4.5 | yes |
| take-after-rebuild | played | 14.5 | 15.3 | 15.6 | 15.7 | yes |
| take-after-rebuild | painted | 28.9 | 29.0 | 29.8 | 29.2 | yes |
| take-after-rebuild | rpc | 53.4 | 52.3 | - | - | yes |
| take-after-rebuild | froze | - | - | 20.7 | 20.5 | yes |
| take-after-no-rebuild | cmd | 3.9 | 3.9 | 4.2 | 4.1 | yes |
| take-after-no-rebuild | played | 14.3 | 14.3 | 14.7 | 14.6 | yes |
| take-after-no-rebuild | painted | 28.0 | 27.9 | 28.9 | 29.2 | yes |
| take-after-no-rebuild | rpc | 54.1 | 53.5 | - | - | yes |
| take-after-no-rebuild | froze | - | - | 18.6 | 19.0 | yes |

Both baselines within the rule: yes.
