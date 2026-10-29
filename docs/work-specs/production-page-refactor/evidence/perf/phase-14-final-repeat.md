# Row 25 (parent phase 14) final speed repeat (merge `dda88db51`)

The final repeat spec.md §7 asks for, on phase 14's merge SHA (PR #1653), measured by the laptop
helper on 2026-10-24 and compared with [phase 1's baseline 1](phase-1-baselines.md) by the
comparison rule.

## Setup

As [the phase 13b repeat](phase-13b-repeat.md): the app at `dda88db51` built with `vite build` and
served by `npm run dev:worktree -- --preview`, the same local Supabase stack (no migration, `api` or
`src/output` change between the two merges), a fresh throwaway-user seed of the "Lag Bench"
fixture unpublished and published, `--measure --rounds 12 --headless` once each. Free memory was
3.5 to 3.8 GB. Files: `phase-14-dda88db-{local,published}-repeat.json`.

## Result

Every gesture is within the rule on both roads, so there is no regression to attribute and no
24-round rerun was needed. With phase 11's and phase 13b's repeats, every comparison §7 asks for
has now been measured and is within the rule. `wsRow` stays empty on the local stack.

### Local (unpublished)

| gesture | metric | first median | second median | first p90 | second p90 | within rule |
|---|---|---|---|---|---|---|
| select-rebuild | froze | - | - | 20.6 | 19.7 | yes |
| select-no-rebuild | froze | - | - | 18.7 | 18.3 | yes |
| take-idle | cmd | 2.5 | 2.8 | 2.7 | 3 | yes |
| take-idle | played | 15.4 | 15.7 | 15.9 | 16.4 | yes |
| take-idle | painted | 29.7 | 29.6 | 30.8 | 30.7 | yes |
| take-idle | froze | - | - | 18.6 | 18.2 | yes |
| out-idle | played | 16.1 | 16.1 | 17.3 | 17.5 | yes |
| out-idle | painted | 30.1 | 30.9 | 31.3 | 31.6 | yes |
| out-idle | froze | - | - | 18.6 | 18.6 | yes |
| take-after-rebuild | cmd | 2.5 | 2.9 | 2.7 | 3.1 | yes |
| take-after-rebuild | played | 14.4 | 13.9 | 15.6 | 15.5 | yes |
| take-after-rebuild | painted | 28.3 | 27.9 | 30.1 | 29.7 | yes |
| take-after-rebuild | froze | - | - | 20.3 | 21.2 | yes |
| take-after-no-rebuild | cmd | 2.5 | 2.8 | 2.6 | 2.9 | yes |
| take-after-no-rebuild | played | 14.6 | 13.6 | 14.9 | 15.1 | yes |
| take-after-no-rebuild | painted | 28.3 | 27.9 | 29.8 | 29 | yes |
| take-after-no-rebuild | froze | - | - | 18.6 | 18.2 | yes |

Within the rule: yes.

### Published (local stack)

| gesture | metric | first median | second median | first p90 | second p90 | within rule |
|---|---|---|---|---|---|---|
| select-rebuild | froze | - | - | 19.8 | 19.7 | yes |
| select-no-rebuild | froze | - | - | 18.6 | 18.9 | yes |
| take-idle | cmd | 3.8 | 4 | 4.2 | 5.9 | yes |
| take-idle | played | 15.6 | 15.1 | 16.1 | 16.2 | yes |
| take-idle | painted | 29.6 | 29.4 | 30.4 | 30.4 | yes |
| take-idle | froze | - | - | 20.6 | 21.2 | yes |
| take-idle | rpc | 52.8 | 54 | - | - | yes |
| out-idle | played | 15.8 | 16.4 | 17.5 | 17 | yes |
| out-idle | painted | 30.4 | 30.6 | 31.7 | 31.7 | yes |
| out-idle | froze | - | - | 19.5 | 19.8 | yes |
| out-idle | rpc | 51.9 | 53.9 | - | - | yes |
| take-after-rebuild | cmd | 4 | 4.3 | 4.8 | 5.9 | yes |
| take-after-rebuild | played | 14.2 | 13.6 | 15.6 | 14.5 | yes |
| take-after-rebuild | painted | 28.8 | 27.1 | 29.7 | 29 | yes |
| take-after-rebuild | froze | - | - | 20.7 | 20 | yes |
| take-after-rebuild | rpc | 52.6 | 54.5 | - | - | yes |
| take-after-no-rebuild | cmd | 3.8 | 4.3 | 4.2 | 4.6 | yes |
| take-after-no-rebuild | played | 14 | 14.4 | 14.7 | 15.4 | yes |
| take-after-no-rebuild | painted | 28 | 27.9 | 28.9 | 28.9 | yes |
| take-after-no-rebuild | froze | - | - | 18.6 | 19.1 | yes |
| take-after-no-rebuild | rpc | 53.9 | 54.8 | - | - | yes |

Within the rule: yes.
