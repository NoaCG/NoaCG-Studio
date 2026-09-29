# A Take sent before the migration airs on a new renderer booting after it (the legacy path)

2026-09-30, preview branch B. Never production.

## What ran

- Before 0069/0070 were applied (job j-2459, `migration-under-traffic.md`): a production "p6-step2
  legacy probe" was created with the harness production's payload, and a Take (update, play, cue
  on House Scorebug) was sent to it through `control_send_many` as anon, the body an old page
  posts, with no renderer open. Answer 204. Those three rows carry no seq.
- After the migration (job j-2462, scenario `legacy` of `step2/verify-b.mjs`, this branch's app):
  `control_output_resolve` was called for the probe, then a new `/output?...&debug=1` booted on it
  and was read 4 s after following; it was closed 2.5 s later (its reports landed), and a second
  new renderer booted on the same production.

## What was observed

- First boot: the resolve answered `legacy: true`. The renderer's debug line read "protocol: row
  id (proto 1: older rows need it)" and "catch-up: 3 row(s) replayed, back on air"; the graphic
  was up (104,430 opaque pixels, 1 entrance). The pre-migration Take aired.
- Second boot: the resolve answered `legacy: false`, because the first renderer's report (through
  the id road's `control_output_report`) put the graphic's baseline past those rows. The renderer
  read "protocol: numbered log (proto 2)", "last row: 4 (id 510)", "commands: numbered log", and
  the graphic was up (recovered from the report).

## Limitations

- One production and one graphic with pre-migration rows. The rule that decides `legacy` (a
  seq-null COMMAND row of a graphic whose own baseline is below it) is exercised here only in its
  "yes" and "no longer" cases; the self-check covers `legacy: false` on a production with no such
  rows.
- The boot was read by pixels and the debug line, not frame by frame.
