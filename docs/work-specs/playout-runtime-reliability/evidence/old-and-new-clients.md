# Old pages and old outputs on the migrated schema, beside new ones (AC-17)

2026-09-30, preview branch B (migrated with 0069, the live- read policy and 0070). Never production.
"Old" is the bundle built from origin/main before Step 2 (the harness worktree at 971fcb270, whose
`src/` is identical to it); "new" is this branch.

## What ran

1. Job j-2459 (`migration-under-traffic.md`): an old hosted page pressing Take/Out every 700 ms and
   an old output following, before, during and after the migration, then the old page reloaded.
2. Job j-2462, scenario `mixed` of the scratch script `step2/verify-b.mjs`: on `p6-harness main`,
   an old output, a new output, a new hosted page and an old hosted page, all open at once:
   - the NEW page takes the cue (`control_send_seq`, which writes `live_cue` only to the head);
   - the old page is reloaded (its `live_cue` comes from `control_show_by_slug`), then the old
     output is reloaded (its recovery comes from `control_output_by_slug`'s reports);
   - the OLD page takes the graphic out (`control_send_many`, unchanged body, numbered by the
     trigger).

## What was observed

- Sends: the old page's 32 presses through the migration all answered 204 (`control_send_many`);
  in the mixed run the old page sent through `control_send_many` (204) and the new page through
  `control_send_seq` (200). Nothing failed.
- Follow: the old output applied 16 entrances for 16 Takes through the migration and ended on the
  last press; its debug line kept "realtime: following" and "commands: fast road joined", so both
  the per-row `log-` broadcast and the `cmd-` frame still reach it after 0070.
- A new page's Take reached the OLD output (one entrance, graphic up) and the NEW output (one
  entrance).
- `live_cue` after a reload: the new send left the column untouched (`{v:2, layers:{}}`), and the
  old page read "on air: ● House Scorebug" both before and after its reload: the redefined
  `control_show_by_slug` answers the head's cue for that layer.
- Reports and recovery: the reloaded old output came back with the graphic up (104,430 opaque
  pixels), recovered from the merged reports.
- The old page's Out reached both outputs (both at 0 pixels) and the new page's chip read
  "nothing on air": an old writer's rows are numbered and framed for new followers.
- The global-id path is intact: the old clients above use only `control_send_many`,
  `control_show_by_slug`, `control_output_by_slug`, `control_output_tail`, `control_output_report`
  and the `log-`/`cmd-` topics, all unchanged in shape.
- A new page against the UNMIGRATED branch A falls back to today's protocol: see
  `configured-specs.md` (the existing hosted-control and playout specs run with this branch's app
  against branch A).

## Limitations

- One production; the old output's reports during the mixed run were not read back field by field,
  only through the recovery they feed.
- The old page's Out was pressed after its reload, so it knew the cue was live; an old page
  pressing on a graphic a new page changed without its knowledge airs as it always did (old pages
  send no revision), which is today's behaviour and ends when they reload.
- Exported HTML graphics carrying the old hosted receiver were not run; they read the same
  `control_show_by_slug` columns and `log-` rows as the old page.
