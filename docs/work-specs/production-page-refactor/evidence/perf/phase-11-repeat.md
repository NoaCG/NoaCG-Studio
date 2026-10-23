# Row 22 (parent phase 11) speed repeat (merge `08389cfc1`)

The repeat spec.md §7 asks for after parent phase 11 (`airState` and `sessionWire`, the liveCue
move), measured by the laptop helper on 2026-10-23 on that phase's merge SHA and compared with
[phase 1's baseline 1](phase-1-baselines.md) by the comparison rule.

## Setup

As the baselines: the owner's Windows 10 laptop, the app at `08389cfc1` built with `vite build` and
served by `npm run dev:worktree -- --preview`, the local Supabase stack at this revision's
migrations (to 0100) with a throwaway user, the bench's own "Lag Bench" fixture (3 graphics,
6 cues) seeded unpublished and published, `--measure --rounds 12 --headless` once each. The bench
at this revision already carries the published-path repair from the baselines' change. Free
memory was 1.9 GB (local) and 2.4 GB (published) against about 4 GB for the baselines, because the
owner's own applications were open; the numbers held anyway. Files:
`phase-11-08389cf-{local,published}-repeat.json`.

## Result

Every gesture is within the rule on both roads, so there is no regression to attribute and no
24-round rerun was needed. `wsRow` stays empty on the local stack, as in the baselines. Times are
milliseconds from the verb's click; `rpc` is `rpcSent` to `rpcDone`; "first" is baseline 1,
"second" this repeat.

### Local (unpublished)

| gesture | metric | first median | second median | first p90 | second p90 | within rule |
|---|---|---|---|---|---|---|
| select-rebuild | froze | - | - | 20.6 | 18.7 | yes |
| select-no-rebuild | froze | - | - | 18.7 | 18.3 | yes |
| take-idle | cmd | 2.5 | 2.9 | 2.7 | 5.5 | yes |
| take-idle | played | 15.4 | 15.7 | 15.9 | 21.1 | yes |
| take-idle | painted | 29.7 | 29.3 | 30.8 | 30.2 | yes |
| take-idle | froze | - | - | 18.6 | 19.8 | yes |
| out-idle | played | 16.3 | 16.3 | 17.3 | 16.5 | yes |
| out-idle | painted | 30.2 | 30.1 | 31.3 | 31.1 | yes |
| out-idle | froze | - | - | 18.6 | 19.1 | yes |
| take-after-rebuild | cmd | 2.6 | 3.0 | 2.7 | 4.0 | yes |
| take-after-rebuild | played | 14.6 | 13.8 | 15.6 | 16.4 | yes |
| take-after-rebuild | painted | 28.6 | 28.3 | 30.1 | 29.1 | yes |
| take-after-rebuild | froze | - | - | 20.3 | 21.2 | yes |
| take-after-no-rebuild | cmd | 2.5 | 2.8 | 2.6 | 3.0 | yes |
| take-after-no-rebuild | played | 14.6 | 13.9 | 14.9 | 14.6 | yes |
| take-after-no-rebuild | painted | 28.3 | 27.4 | 29.8 | 28.6 | yes |
| take-after-no-rebuild | froze | - | - | 18.6 | 18.8 | yes |

Within the rule: yes.

### Published (local stack)

| gesture | metric | first median | second median | first p90 | second p90 | within rule |
|---|---|---|---|---|---|---|
| select-rebuild | froze | - | - | 19.8 | 19.9 | yes |
| select-no-rebuild | froze | - | - | 18.6 | 22.8 | yes |
| take-idle | cmd | 3.9 | 4.4 | 4.2 | 5.4 | yes |
| take-idle | played | 15.7 | 15.5 | 16.1 | 16.2 | yes |
| take-idle | painted | 29.6 | 29.7 | 30.4 | 30.4 | yes |
| take-idle | rpc | 53.0 | 52.8 | - | - | yes |
| take-idle | froze | - | - | 20.8 | 20.4 | yes |
| out-idle | played | 16.0 | 16.3 | 17.6 | 16.5 | yes |
| out-idle | painted | 30.5 | 30.3 | 31.7 | 30.9 | yes |
| out-idle | rpc | 51.9 | 51.4 | - | - | yes |
| out-idle | froze | - | - | 19.5 | 19.5 | yes |
| take-after-rebuild | cmd | 4.0 | 4.2 | 4.8 | 4.6 | yes |
| take-after-rebuild | played | 14.5 | 14.4 | 15.6 | 15.6 | yes |
| take-after-rebuild | painted | 28.9 | 28.4 | 29.8 | 29.1 | yes |
| take-after-rebuild | rpc | 53.4 | 52.7 | - | - | yes |
| take-after-rebuild | froze | - | - | 20.7 | 21.0 | yes |
| take-after-no-rebuild | cmd | 3.9 | 4.4 | 4.2 | 4.9 | yes |
| take-after-no-rebuild | played | 14.3 | 14.5 | 14.7 | 15.6 | yes |
| take-after-no-rebuild | painted | 28.0 | 28.3 | 28.9 | 29.0 | yes |
| take-after-no-rebuild | rpc | 54.1 | 52.7 | - | - | yes |
| take-after-no-rebuild | froze | - | - | 18.6 | 18.6 | yes |

Within the rule: yes.
