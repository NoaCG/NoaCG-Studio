# AC-10 receipt: the benchmark ran, judged from frames (2026-10-02)

Row 2026-10-02d-CJ-1, branch `claude/cj-plugin-benchmark`, from `main` at `1ee6a2cb9`. The full
receipt is `docs/research/plugin-benchmark-2026-10-02/README.md`; this file records why AC-10 is
met and what it does not prove.

## AC-10, clause by clause

| AC-10 asks | Observed |
|---|---|
| The four 2026-10-02 briefs plus a ticker and a full-frame result board | Six briefs, `harness/briefs.md` (b5 news ticker, b6 ski result board are new) |
| Re-run by fresh sessions; `claude -p` when logged in, otherwise the documented subagent method | 18 fresh Opus subagents, one per cell, one at a time. Terminal Claude is still not logged in on this machine, so the subagent method; said in the receipt's limits. No API key |
| Three arms: default, critique asked for, guidelines on | D the brief; C "critique and improve" on a copy of the D package; G the brief plus "Please use NoaCG's design guidelines". All 6 x 3 cells ran; none skipped |
| A reviewer who did not build them judges each from its frames and studio panel against a written rubric | Two reviewer sessions that built nothing, rubric `harness/rubric.md`: a blind quality review of all 18 (`reviews/quality-blind.md`) and an opt-in review of the 12 opt-in cells plus a check of the 6 defaults (`reviews/opt-in.md`) |
| Would it air on a paid channel | Per cell in `reviews/quality-blind.md`. D 2 yes / 4 borderline / 0 no; C 3 / 2 / 1; G 0 / 6 / 0 |
| Live operator reaches every live action without scrolling or typing a label | Per cell, from `studio/reach.json` and the page at load. Pass in 3 of 6 per arm; hockey and quiz fail on actions below the fold, ticker on a typed label, in every arm |
| Did the opt-in arm change what it claims to | Per claim in `reviews/opt-in.md`. Critique: claims visible except motion-only ones, better than D in 5 of 6 by that review and best of three in 4 of 6 by the blind review, one regression (b4 clipped long question). Guidelines: cited rules followed in CSS and frames, exit band missed in 5 of 6, plainer than D |
| (row) Did the default arm open neither opt-in file | By transcript scan (`cells/*/opened.json`): D 6 of 6 opened neither; C opened only `critique.md`; G only `design-notes.md` |
| The receipt records frames, panel shots and the verdict per brief and arm | `cells/<brief>-<arm>/` (CLI frames, studio PROGRAM frames per step, Playout page shots, inspect, validate) and the verdict table in the receipt README |

## Limits

One run per cell; a near-stranger, not a stranger; this machine's command guards cost builders
time; stills only, so motion is judged where a still catches it; the opt-in reviewer was not
blind. AC-10 passing means the benchmark ran and was judged as specified. It does not mean the
plugin passes the bar: the verdicts feed AC-4, AC-5, AC-6, AC-7, AC-12 and AC-13, and those stay
open here. The next run is scheduled in [issue #770](https://github.com/NoaCG/NoaCG-Studio/issues/770).
