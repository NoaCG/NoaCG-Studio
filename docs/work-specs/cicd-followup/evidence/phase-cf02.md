# Phase cf02: archive finished worker sessions in the plan-run workflow

Plan run #1967 (cicd-followup), phase cf02. Builder session on branch
`claude/plan-cicd-followup-cf02-build`, from `main` at d260583e. No new mechanism: the rule was
already on main, so this phase confirms its text and records the archive state the checker needs.
Not counted as new work in cf20.

## Phase notes

- **Previous verified main SHA:** bb527e5f73006834ae4fdddd4942a94f2b274436 (cf21's checked merge, #2348).
- **Revert:** `git revert -m 1 <merge commit of this PR on main>`. It removes this evidence file
  only; this phase archives and unarchives no session.
- **Decisions:**
  - The text meets cf02(a) as written, so it stays unchanged. "In the turn that records a PASS
    (or a fix's landing)" is the phase's result being recorded, and a PASS is recorded only once
    the checker has evidence for every criterion, which covers "required handoff evidence".
    "Never the coordinator or anything still running" is "without disrupting active work".
  - A phase that stops for the owner is not finished (the owner's answer can grant one more
    attempt), so the rule leaving its sessions open at that point is intended, not a gap.
  - The builder lists and reports; it archives and unarchives nothing. Archiving is the
    coordinator's step under the rule.
  - The list is read with `list_sessions` (`mine: true`, paged with `after_id` back past
    2026-11-02T00:00Z; the tags filter is not available) and filtered by parent: the
    coordinator's direct children, then the sessions those started. Only ids, titles, parents,
    times and states are recorded; no transcript content.
- **Traps met:** the local clone is shallow, so `78c1cd8` did not resolve until
  `git fetch --deepen`. A `list_sessions` page of 100 is too large to return inline; it is read
  from the saved result file. A shell heredoc containing the word "Codex" was refused by the
  commit-message hook even though it was not a commit; the file was written with the editor.

## (a) The text on main

`.agent-workflows/plan-run.md` line 60, under **launch check**, at main d260583e:

> In the turn that records a PASS (or a fix's landing), archive that phase's finished sessions:
> builder, repairer, checker, diagnose and every `/so` or review session they started. Archive
> qualification sessions once their receipt is recorded. Never the coordinator or anything still
> running.

Added by `78c1cd8a74ba1842ee6e4b300f3fcaf37d2b21bb` ("Plan runs archive each phase's finished
worker sessions", 2026-11-01, one line in that file), an ancestor of `origin/main`.
`git log -G archive 78c1cd8..origin/main -- .agent-workflows/plan-run.md` lists no later change
to it.

| cf02(a) asks | The text |
| --- | --- |
| builder, repairer, checker, diagnose and review sessions | "builder, repairer, checker, diagnose and every `/so` or review session they started" |
| once its result and required handoff evidence are recorded | "In the turn that records a PASS (or a fix's landing)"; a PASS needs evidence for every authorized criterion (line 58) |
| without disrupting active work | "Never the coordinator or anything still running" |

## (a) Archive state so far

Read 2026-11-10 around 14:05Z. 78 sessions: 47 started by the coordinator
`session_017SdbwPphatUYXtpZ9CHkPu` since 2026-11-02, and 31 `/so` sessions those workers
started. No session is three levels down. No session in the run is a repairer or diagnose
session by title; cf01 has three check sessions.

Phase results are from #1967's heartbeat comment (updated 2026-11-10T13:55Z): 14 phases passed
(cf01, cf07, cf09, cf08, cf05, cf04, cf06, cf03, cf12, cf11, cf10, cf14, cf13, cf21); cf02 is in
flight.

**Result: every session of a finished phase is archived (75 of 75), including the spec's ten
review rounds (#1960), the spec change review (#2028) and the fix for #2011 (#2012).** The three
not archived are the ones meant to stay open:

- `session_017SdbwPMaBaH6SDUhN2Z9qX`, cf21 follow-up (review rule at root), running: the owner's
  decision of 2026-11-10, in flight.
- `session_017SdbwQfGaKDTYKsFgzGxY6`, "Owner alarms (daily)", idle: the owner's session, not a
  phase worker.
- `session_017SdbwN7jhzhEi2sh6D8NcS`, this cf02 builder, running.

The checker re-reads the same list at its own time; a session that finished since then is the
coordinator's next step under the rule, not a gap in this record.

| Created (UTC) | Session | Phase | Role | Phase result | State |
| --- | --- | --- | --- | --- | --- |
| 2026-11-02 07:27 | `session_017SdbwNXE5n4MT171wnQgW2` | spec #1960 | /so review | spec landed `b6f59fb1` | archived |
| 2026-11-02 07:51 | `session_017SdbwN7Tqswmamj74ub9sY` | spec #1960 | /so review | spec landed `b6f59fb1` | archived |
| 2026-11-02 08:16 | `session_017SdbwLqsSqAX49adFuPike` | spec #1960 | /so review | spec landed `b6f59fb1` | archived |
| 2026-11-02 08:34 | `session_017SdbwPLcsuMKG4y9K1fp9K` | spec #1960 | /so review | spec landed `b6f59fb1` | archived |
| 2026-11-02 08:49 | `session_017SdbwMCa9PdXKwX3DaSrbP` | spec #1960 | /so review | spec landed `b6f59fb1` | archived |
| 2026-11-02 09:03 | `session_017SdbwLc3Vwd6wb6Ugob9qD` | spec #1960 | /so review | spec landed `b6f59fb1` | archived |
| 2026-11-02 09:24 | `session_017SdbwPsynK9DqeqscS1SwC` | spec #1960 | /so review | spec landed `b6f59fb1` | archived |
| 2026-11-02 09:41 | `session_017SdbwNBKkob6ieZ53Jyeav` | spec #1960 | /so review | spec landed `b6f59fb1` | archived |
| 2026-11-02 09:59 | `session_017SdbwM6ewkBSVhHCDSTN8b` | spec #1960 | /so review | spec landed `b6f59fb1` | archived |
| 2026-11-02 10:18 | `session_017SdbwPbWLWqvr3H4UV8hPW` | spec #1960 | /so review | spec landed `b6f59fb1` | archived |
| 2026-11-02 10:48 | `session_017SdbwN7t9AEigGsqEgFFGn` | cf01 | build | PASS #1970 `80759a01` | archived |
| 2026-11-02 11:12 | `session_017SdbwPRJAV9KQz6Q2JQpp5` | cf01 | /so review | PASS #1970 `80759a01` | archived |
| 2026-11-02 11:16 | `session_017SdbwQ6ohwMjaAT54uv19F` | cf01 | /so review | PASS #1970 `80759a01` | archived |
| 2026-11-02 11:43 | `session_017SdbwMKtRp3sQGjsmmqUEC` | cf01 | check | PASS #1970 `80759a01` | archived |
| 2026-11-02 21:23 | `session_017SdbwQfGaKDTYKsFgzGxY6` | none | owner alarms (daily), not a phase worker | n/a | idle |
| 2026-11-02 21:38 | `session_017SdbwNwX5gEgmpee6oBrkT` | cf01 | check | PASS #1970 `80759a01` | archived |
| 2026-11-02 21:42 | `session_017SdbwMH234MxQaTMzvcbRy` | cf01 | check | PASS #1970 `80759a01` | archived |
| 2026-11-02 21:46 | `session_017SdbwPLCaRK56zKEDHLRY6` | cf07 | build | PASS #1990 `27c737a2` | archived |
| 2026-11-03 00:24 | `session_017SdbwN5UGzaLkvXZaMMwTN` | cf07 | /so review | PASS #1990 `27c737a2` | archived |
| 2026-11-03 00:56 | `session_017SdbwPvMAdvKaa9sgSg1px` | cf07 | fix (early quarantine release) | PASS #1990 `27c737a2` | archived |
| 2026-11-03 00:59 | `session_017SdbwPHuAxZxX51MzrsCaN` | cf07 | /so review | PASS #1990 `27c737a2` | archived |
| 2026-11-03 01:07 | `session_017SdbwPDjQDJUMGBB7DcuKZ` | cf07 | /so review | PASS #1990 `27c737a2` | archived |
| 2026-11-03 01:24 | `session_017SdbwPC5Bii1qTCUMsiLZG` | cf07 | check | PASS #1990 `27c737a2` | archived |
| 2026-11-03 01:42 | `session_017SdbwPigSBPx27nb386xa8` | cf09 | build | PASS #1995 `0b73b488` | archived |
| 2026-11-03 01:51 | `session_017SdbwPyJm2edAqSHYxf2Ta` | cf09 | /so review | PASS #1995 `0b73b488` | archived |
| 2026-11-03 01:59 | `session_017SdbwMNGnk46xbFMKY8rzU` | cf09 | /so review | PASS #1995 `0b73b488` | archived |
| 2026-11-03 02:05 | `session_017SdbwPhK5rrqdK8hgVV1dR` | cf09 | /so review | PASS #1995 `0b73b488` | archived |
| 2026-11-03 02:21 | `session_017SdbwN8uuPAhkuP66cXd5e` | cf09 | check | PASS #1995 `0b73b488` | archived |
| 2026-11-03 02:38 | `session_017SdbwPLGoJeUd6QBJXvQcD` | cf08 | build | PASS #1998 `11efbcec` | archived |
| 2026-11-03 03:28 | `session_017SdbwQU6NMh7Cyrfn9rvuw` | cf08 | /so review | PASS #1998 `11efbcec` | archived |
| 2026-11-03 04:07 | `session_017SdbwRKP2vvdBcPewHxmnd` | cf08 | check | PASS #1998 `11efbcec` | archived |
| 2026-11-03 04:27 | `session_017SdbwQFcY1zd4tRRfUMjcv` | cf05 | build | PASS #2003 `b71d2bf4` | archived |
| 2026-11-03 06:55 | `session_017SdbwRJ5PXSx7kbpcN42oj` | cf05 | /so review | PASS #2003 `b71d2bf4` | archived |
| 2026-11-03 07:12 | `session_017SdbwN2zD5k5eA3u28Bhn4` | cf05 | /so review | PASS #2003 `b71d2bf4` | archived |
| 2026-11-03 07:44 | `session_017SdbwPT2rVVf697f4Ho8WN` | cf05 | check | PASS #2003 `b71d2bf4` | archived |
| 2026-11-03 08:08 | `session_017SdbwQNSntdLhES7vQhz7R` | cf04 | build | PASS #2014 `e6a3bc1c` | archived |
| 2026-11-03 08:22 | `session_017SdbwPaNNL9XoNvHecZXPB` | fix #2011 | fix build | fix landed #2012 | archived |
| 2026-11-03 09:04 | `session_017SdbwMDFKsRUqjDvsHsbtD` | cf04 | /so review | PASS #2014 `e6a3bc1c` | archived |
| 2026-11-03 09:18 | `session_017SdbwNNAsDiRizt9QyijnP` | cf04 | /so review | PASS #2014 `e6a3bc1c` | archived |
| 2026-11-03 09:51 | `session_017SdbwLtibgTmv5XVKzvWwN` | cf04 | check | PASS #2014 `e6a3bc1c` | archived |
| 2026-11-03 10:11 | `session_017SdbwPLcPhccHVucoqBX41` | cf06 | build | PASS #2016 `8b5dcb8d` | archived |
| 2026-11-03 12:23 | `session_017SdbwPfesThfxYXypiaNpo` | cf06 | /so review | PASS #2016 `8b5dcb8d` | archived |
| 2026-11-03 12:30 | `session_017SdbwMgNiTwFVXUoh2Sjsx` | cf06 | /so review | PASS #2016 `8b5dcb8d` | archived |
| 2026-11-03 13:04 | `session_017SdbwR19RFNhUmVVKo2LDQ` | cf06 | check | PASS #2016 `8b5dcb8d` | archived |
| 2026-11-03 13:25 | `session_017SdbwRMHsJ2J6JcwRNzeGy` | spec #2028 | /so review | spec change landed (#1964) | archived |
| 2026-11-03 13:38 | `session_017SdbwMBPwcWjxLeWiB72tT` | cf03 | build | PASS #2031 `d48b4725` | archived |
| 2026-11-03 17:07 | `session_017SdbwPT9oG1NHMzvEeQZSG` | cf03 | check | PASS #2031 `d48b4725` | archived |
| 2026-11-03 17:31 | `session_017SdbwN8SdEL7odXT23cwD9` | cf12 | build | PASS #2037 `e15e8d68` | archived |
| 2026-11-04 19:36 | `session_017SdbwRCG9ELgQ1zcFfYgcW` | cf12 | check | PASS #2037 `e15e8d68` | archived |
| 2026-11-04 19:55 | `session_017SdbwMqZdJrL7CPJW2AmxM` | cf11 | build | PASS #2142 `3ed797a6` | archived |
| 2026-11-04 21:02 | `session_017SdbwPvuA23YmqN6DQXnbd` | cf11 | check | PASS #2142 `3ed797a6` | archived |
| 2026-11-04 21:22 | `session_017SdbwQVzyMvFagukPqVTGi` | cf10 | build | PASS #2151 `314862e6` | archived |
| 2026-11-04 21:56 | `session_017SdbwMKHTwVVNQfcoLn6a1` | cf10 | /so review | PASS #2151 `314862e6` | archived |
| 2026-11-04 22:14 | `session_017SdbwQThZ6tjE8few79BFk` | cf10 | /so review | PASS #2151 `314862e6` | archived |
| 2026-11-04 22:30 | `session_017SdbwQhiRCXqRhmHmLg8Ai` | cf10 | /so review | PASS #2151 `314862e6` | archived |
| 2026-11-04 22:49 | `session_017SdbwQn85zf6EJNKjjq4qs` | cf10 | /so review | PASS #2151 `314862e6` | archived |
| 2026-11-04 23:16 | `session_017SdbwPi2FkMZnw3jbG9r1D` | cf10 | check | PASS #2151 `314862e6` | archived |
| 2026-11-04 23:48 | `session_017SdbwREVLoWMiAgKS7bvRu` | cf14 | build | PASS #2167 `86749ef1` | archived |
| 2026-11-05 01:10 | `session_017SdbwQkFy6NXW1KDZnmBfC` | cf14 | check | PASS #2167 `86749ef1` | archived |
| 2026-11-05 01:30 | `session_017SdbwPWmpzLswZbC4Bn9W5` | cf13 | build | PASS #2261 `f47aa360` | archived |
| 2026-11-05 02:02 | `session_017SdbwM3jak3naAf7H2WmoE` | cf13 | /so review | PASS #2261 `f47aa360` | archived |
| 2026-11-05 02:15 | `session_017SdbwNusc7bvZ1B9Az9r4e` | cf13 | /so review | PASS #2261 `f47aa360` | archived |
| 2026-11-05 14:31 | `session_017SdbwNqySqyp5CsFeTL6Sa` | cf13 | /so review | PASS #2261 `f47aa360` | archived |
| 2026-11-05 14:41 | `session_017SdbwMAVNWhngA9aJFC4wV` | cf13 | /so review | PASS #2261 `f47aa360` | archived |
| 2026-11-06 07:51 | `session_017SdbwNJFj5jSqvdG2gFx3p` | cf13 | /so review | PASS #2261 `f47aa360` | archived |
| 2026-11-06 19:50 | `session_017SdbwMLfp3nKSsZqoHsFLK` | cf13 | /so review | PASS #2261 `f47aa360` | archived |
| 2026-11-06 20:18 | `session_017SdbwQ73bXHWH7fMHf81Yr` | cf13 | /so review | PASS #2261 `f47aa360` | archived |
| 2026-11-06 20:28 | `session_017SdbwNT44KPDTNLcRLZf64` | cf13 | /so review | PASS #2261 `f47aa360` | archived |
| 2026-11-07 19:15 | `session_017SdbwNEZy1brgUyHTYuoyC` | cf21 | /so review | PASS #2348 `bb527e5f` | archived |
| 2026-11-09 19:55 | `session_017SdbwNnaodPyU4MFA81RaD` | cf13 | /so review | PASS #2261 `f47aa360` | archived |
| 2026-11-09 20:05 | `session_017SdbwLtwkBVL7cPVmDcDd5` | cf13 | /so review | PASS #2261 `f47aa360` | archived |
| 2026-11-09 20:13 | `session_017SdbwQB4SwcNG8sYxaQ1gG` | cf13 | /so review | PASS #2261 `f47aa360` | archived |
| 2026-11-09 20:19 | `session_017SdbwLjFLUdEG45dLzLFZg` | cf13 | /so review | PASS #2261 `f47aa360` | archived |
| 2026-11-09 20:37 | `session_017SdbwN5z31Lfup2ay6Wv4g` | cf13 | check | PASS #2261 `f47aa360` | archived |
| 2026-11-09 21:17 | `session_017SdbwPJuCYHVdLZ6JcYGqg` | cf21 | build | PASS #2348 `bb527e5f` | archived |
| 2026-11-10 13:31 | `session_017SdbwQAFa2h7S86mAm1MTs` | cf21 | check | PASS #2348 `bb527e5f` | archived |
| 2026-11-10 13:52 | `session_017SdbwPMaBaH6SDUhN2Z9qX` | cf21 | follow-up build | cf21 PASS #2348; this follow-up in flight | running |
| 2026-11-10 13:53 | `session_017SdbwN7jhzhEi2sh6D8NcS` | cf02 | build | in flight (this session) | running |
