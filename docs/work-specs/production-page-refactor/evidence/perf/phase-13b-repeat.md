# Row 24 (parent phase 13b) speed repeat (merge `a56e14119`)

The repeat spec.md §7 asks for after parent phase 13b (the cue draft moved into the session),
measured by the laptop helper on 2026-10-24 on that phase's merge SHA and compared with
[phase 1's baseline 1](phase-1-baselines.md) by the comparison rule.

## Setup

As the baselines: the owner's Windows 10 laptop, the app at `a56e14119` built with `vite build` and
served by `npm run dev:worktree -- --preview`, the local Supabase stack at this revision's
migrations (to 0100) with a throwaway user, the bench's own "Lag Bench" fixture (3 graphics,
6 cues) seeded unpublished and published, `--measure --rounds 12 --headless` once each. Free
memory was 3.6 to 3.9 GB. Files: `phase-13b-a56e141-{local,published}-repeat.json`, and
`phase-13b-a56e141-published-repeat-24.json` for the rerun below.

A first local run was discarded: the seed's dev server had outlived its launcher, so the
`--preview` server could not take the port and the bench measured the dev server (Take painted at
about 100 ms). The bench's header names what it measured; the kept runs say "serving dist (the
BUILT app)".

Medians and p90 here are computed the same way for both sides (linear interpolation over each
gesture's runs), so a baseline cell can differ from `phase-1-baselines.md` by a few tenths.

## Result

On the 12-round runs every gesture is within the rule except one: the published `take-idle` RPC
round trip, median 61.2 ms against 52.8 ms (limit +15%, 60.7 ms). As §7 says, it was repeated with
`--rounds 24` before judging. The rerun gives 53.8 ms (+1.9%), and every other gesture of the rerun
is within the rule too, so there is no regression to attribute. The RPC is answered by the local
database, which this phase did not change; the 12-round reading was noise. `wsRow` stays empty on
the local stack, as in the baselines.

Times are milliseconds from the verb's click; `rpc` is `rpcSent` to `rpcDone`; "first" is
baseline 1, "second" this repeat.

### Local (unpublished), 12 rounds

| gesture | metric | first median | second median | first p90 | second p90 | within rule |
|---|---|---|---|---|---|---|
| select-rebuild | froze | - | - | 20.6 | 18.7 | yes |
| select-no-rebuild | froze | - | - | 18.7 | 18.4 | yes |
| take-idle | cmd | 2.5 | 2.7 | 2.7 | 3.1 | yes |
| take-idle | played | 15.4 | 15 | 15.9 | 15.8 | yes |
| take-idle | painted | 29.7 | 30.1 | 30.8 | 30.6 | yes |
| take-idle | froze | - | - | 18.6 | 18.5 | yes |
| out-idle | played | 16.1 | 16.1 | 17.3 | 16.9 | yes |
| out-idle | painted | 30.1 | 30.6 | 31.3 | 31.4 | yes |
| out-idle | froze | - | - | 18.6 | 18.5 | yes |
| take-after-rebuild | cmd | 2.5 | 2.9 | 2.7 | 3.4 | yes |
| take-after-rebuild | played | 14.4 | 14.7 | 15.6 | 15.5 | yes |
| take-after-rebuild | painted | 28.3 | 28.8 | 30.1 | 30.3 | yes |
| take-after-rebuild | froze | - | - | 20.3 | 21 | yes |
| take-after-no-rebuild | cmd | 2.5 | 2.8 | 2.6 | 3 | yes |
| take-after-no-rebuild | played | 14.6 | 14.4 | 14.9 | 14.9 | yes |
| take-after-no-rebuild | painted | 28.3 | 28.4 | 29.8 | 28.9 | yes |
| take-after-no-rebuild | froze | - | - | 18.6 | 18.6 | yes |

Within the rule: yes.

### Published (local stack), 12 rounds

| gesture | metric | first median | second median | first p90 | second p90 | within rule |
|---|---|---|---|---|---|---|
| select-rebuild | froze | - | - | 19.8 | 18.9 | yes |
| select-no-rebuild | froze | - | - | 18.6 | 18.3 | yes |
| take-idle | cmd | 3.8 | 4.1 | 4.2 | 6.1 | yes |
| take-idle | played | 15.6 | 15.3 | 16.1 | 17.2 | yes |
| take-idle | painted | 29.6 | 29.6 | 30.4 | 30.7 | yes |
| take-idle | froze | - | - | 20.6 | 19.6 | yes |
| take-idle | rpc | 52.8 | 61.2 | - | - | **no** |
| out-idle | played | 15.8 | 16.1 | 17.5 | 17 | yes |
| out-idle | painted | 30.4 | 30.6 | 31.7 | 31.6 | yes |
| out-idle | froze | - | - | 19.5 | 18.8 | yes |
| out-idle | rpc | 51.9 | 54.4 | - | - | yes |
| take-after-rebuild | cmd | 4 | 4.2 | 4.8 | 4.8 | yes |
| take-after-rebuild | played | 14.2 | 14.3 | 15.6 | 15.2 | yes |
| take-after-rebuild | painted | 28.8 | 28 | 29.7 | 29 | yes |
| take-after-rebuild | froze | - | - | 20.7 | 20.5 | yes |
| take-after-rebuild | rpc | 52.6 | 54.2 | - | - | yes |
| take-after-no-rebuild | cmd | 3.8 | 4.1 | 4.2 | 4.4 | yes |
| take-after-no-rebuild | played | 14 | 14.2 | 14.7 | 15.3 | yes |
| take-after-no-rebuild | painted | 28 | 27.8 | 28.9 | 28.5 | yes |
| take-after-no-rebuild | froze | - | - | 18.6 | 18.9 | yes |
| take-after-no-rebuild | rpc | 53.9 | 56.3 | - | - | yes |

Within the rule: no (the one row marked no; rerun below).

### Published (local stack), 24-round rerun

| gesture | metric | first median | second median | first p90 | second p90 | within rule |
|---|---|---|---|---|---|---|
| select-rebuild | froze | - | - | 19.8 | 20 | yes |
| select-no-rebuild | froze | - | - | 18.6 | 18.9 | yes |
| take-idle | cmd | 3.8 | 4.3 | 4.2 | 6 | yes |
| take-idle | played | 15.6 | 15.5 | 16.1 | 17 | yes |
| take-idle | painted | 29.6 | 29.1 | 30.4 | 30.9 | yes |
| take-idle | froze | - | - | 20.6 | 19.7 | yes |
| take-idle | rpc | 52.8 | 53.8 | - | - | yes |
| out-idle | played | 15.8 | 16.3 | 17.5 | 16.7 | yes |
| out-idle | painted | 30.4 | 30.2 | 31.7 | 31.6 | yes |
| out-idle | froze | - | - | 19.5 | 19.1 | yes |
| out-idle | rpc | 51.9 | 52.9 | - | - | yes |
| take-after-rebuild | cmd | 4 | 4.4 | 4.8 | 5 | yes |
| take-after-rebuild | played | 14.2 | 14.2 | 15.6 | 15.6 | yes |
| take-after-rebuild | painted | 28.8 | 27.3 | 29.7 | 28.8 | yes |
| take-after-rebuild | froze | - | - | 20.7 | 21.2 | yes |
| take-after-rebuild | rpc | 52.6 | 52.9 | - | - | yes |
| take-after-no-rebuild | cmd | 3.8 | 4.3 | 4.2 | 4.9 | yes |
| take-after-no-rebuild | played | 14 | 14.1 | 14.7 | 15.3 | yes |
| take-after-no-rebuild | painted | 28 | 27.8 | 28.9 | 29.6 | yes |
| take-after-no-rebuild | froze | - | - | 18.6 | 19.6 | yes |
| take-after-no-rebuild | rpc | 53.9 | 55.4 | - | - | yes |

Within the rule: yes.
