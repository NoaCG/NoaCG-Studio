# 0069 and 0070 applied under traffic from the old bundle (AC-18 migration half, AC-10 shape)

2026-09-30 (UTC 2026-09-29 23:14), temporary preview branch B (`vtuceehslknhtenwdyvu`, a branch of
the production project, deleted the same night). Never production.

## What ran

Job j-2459 through the machine's job queue: a scratch script (session scratchpad,
`step2/apply-under-traffic.mjs`) run through the preview-branch wrapper with `branch-b.env`.

- The app under traffic was the OLD bundle: the harness worktree at 971fcb270, whose `src/` is
  identical to origin/main before Step 2 (`git diff --stat 971fcb270 origin/main -- src/` is empty).
  Vite from that worktree, Chromium from its Playwright.
- An old `/output?production=...&debug=1` followed the harness production `p6-harness main`
  (House Scorebug and Hairline); an old hosted control page pressed Take and Out alternately every
  700 ms: 6 presses before, 18 during and 8 after the applies (32 sends).
- Applied through the Management API SQL endpoint for the branch ref, 2.5 s apart, mid-traffic:
  `0069_control_heads.sql`, then the `live-` read policy standing in for Step 1's 0068 (not written
  yet; only its SELECT policy, the 0056/0064 shape, and no Presence insert policy), then
  `0070_command_sequence.sql`.
- Before the applies, a second production was created with the same payload ("p6-step2 legacy
  probe") and sent a Take through `control_send_many` as anon with no renderer open (answer 204),
  for the legacy-path check after the migration (`legacy-boot.md`).
- Before this run, the whole sequence (0069, the policy, 0070) had also run inside a transaction
  that rolled back on the same branch, to prove the self-check before the real apply. The first
  dry run caught a defect in `control_live_seq` (a report with only `event` was never mapped to a
  seq, because `jsonb_typeof(missing) <> 'number'` is NULL); fixed with `is distinct from` before
  anything was applied or committed.

## What was observed

- 0069: 201 in 201 ms. The policy: 201 in 122 ms. 0070: 201 in 266 ms. Each file runs in one
  transaction and ends in its self-check, so 201 means the self-check passed. Realtime had
  partitions on the branch (5), so 0070's exact per-topic counts (3 log-, 1 cmd-, 1 live- for a
  Take through the old body; one live- frame per new send) were asserted, not skipped.
- Sends: 32 of 32 answered 204. Slowest 191 ms. The 18 sends during the applies took 68 to 191 ms;
  the sends overlapping each apply took 69 and 103 ms (0069), 83 ms (policy), 88 and 86 ms (0070).
  No send failed.
- The old output applied 16 entrances for 16 Takes and ended on the last press (Out: 0 opaque
  pixels). Its debug line still read "realtime: following (SUBSCRIBED)" and "commands: fast road
  joined": the per-row `log-` broadcast and the `cmd-` frame kept working through and after 0070.
- The old page's chip read "nothing on air" before and after a reload (`live_cue` read through the
  redefined `control_show_by_slug`, head-or-column).
- The log of the production after the run: 46 pre-migration rows (seq null) and 35 numbered rows,
  seq 1 to 35, 35 distinct (no gap, no repeat), head seq 35. The head's summary for House Scorebug
  was `{rev: 21, on: false, cue: null, by: "legacy", press: 0}`: kept by the trigger for every old
  writer. The column `live_cue` was `{v:2, layers:{}}`, still written by the old body.
- Triggers on control_events after the run: control_events_broadcast (0064), control_events_frame,
  control_events_seq.

## Limitations

- One run, one production, at one press every 700 ms: the lock windows were short and nothing
  else was writing. It shows no send failed and no deadlock under this traffic; it does not bound
  the chance of a 55P03 on a busier production (db-push retries that, and nothing in the file
  applies then).
- The applies went through the Management API as `postgres`, not through `db-push` and the CLI's
  login role; the ledger on the branch does not record them. The file's `set` lines and one
  transaction per file are the same on both routes.
- 0068 is Step 1's; only its read policy was stood in. The Presence insert policy it will also
  carry was not present, and 0070's check that any client insert policy is Presence-only was
  exercised only in the no-policy case.
- No renderer report from an old output landed inside the ACCESS EXCLUSIVE window of 0070 in this
  run (the reports trail a Take by 800 ms), so the in-flight-report interleaving the design's lock
  order rules out was not provoked here; it is argued in step-2-design.md and the 0070 header.
