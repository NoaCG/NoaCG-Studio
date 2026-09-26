# AC-2 - a from-scratch graphic with an authored machine passes the agent road end to end

**Verdict: pass.** Reviewed at `dfac5b9cf230532565f57d6988517bb25cdbf94d` on 2026-09-16.

## What was run

From `C:\claude\noacg-hj-walk`, an empty folder outside the repository, with the SHIPPED package and
no local build. `noacg doctor` reports the deployment the gates actually ran against:

```
deployment   https://noacg.studio
bridge       v1 (main@dfac5b9cf2)
```

That sha is this branch's own base, so the validator, the bench and the panel generator that judged
these graphics are the integrated tree's, deployed.

The two proof-case graphics of the plan's §3a and §3b were taken from
`e2e/fixtures/agent-made/vote-show.noacgpack.json`, written into two scaffolded packages, and
put back through the shipped gates. Wall clock, each verb timed by a stopwatch wrapper:

| Verb | Votes board | Totals board |
|---|---|---|
| `scaffold --fields … --out` | 7.181 s (cold) | 3.027 s |
| `validate <dir>` | 5.791 s | 7.534 s |
| `inspect <dir>` | 2.955 s | 3.076 s |
| `pack <both> --out …` | 3.054 s (one call) | |

`doctor` 2.886 s, `docs contract` 1.740 s, and the warm `npx` floor measured on `--help` is 1.739 s,
which every row above pays before the tool starts. Every verb exited 0.

## What was observed

- **`validate` passed both with 0 errors and 0 warnings**, every readiness line PASS, and
  "Renders on every supported playout engine." The votes board's reported `Shown` field raises no
  `bench-field-unpainted` any more - HC's narrow exemption is live in the deployed validator, which
  is worth recording because HA's handoff told the next rows to expect that warning.
- **`inspect` prints the panel with its section and payload words.** The totals board:
  eleven buttons, `plus1 … minus5` each under its own `Panelist N` section with the payload word
  `f5+1` and so on, and `newGame` under `Game`. The votes board: one button,
  `reveal / Reveal performer / Song / f15`, `Steps: 2 (» Next advances)`, state groups
  `main [Off, Votes, Revealed, Out]`. That is §3a and §3b as designed, read off the shipped tool.
- `pack` wrote one production file carrying both graphics on layers 7 and 8.
- Through the queue, `e2e/agent-made-graphics.spec.ts` (job `j-1136`): **3 passed**, exit 0 -
  including "the totals board declares eleven controls and every one of them renders in its own
  section".

## Limitations

- **The graphics were not re-authored here.** They are HB's authored sources, re-derived through the
  shipped gates by this review rather than re-written. AC-2 is HB's criterion and the authoring is
  recorded in `docs/handoffs/2026-09-15-hb-release-and-first-walk.md`; what this receipt adds is
  that the same sources still pass the SHIPPED 0.3.2 against the INTEGRATED tree, which is the half
  a later chain can break.
- **`cli/test/smoke.test.mjs` cannot cover this on a bare machine.** It ran 6 tests, 1 passed and
  **5 skipped** - "no NoaCG bridge at NOACG_URL=(unset)". The skipped five include
  `scaffold -> validate -> inspect -> screenshot` and `save`. So the smoke suite is not evidence
  here; the hand walk above and `e2e/agent-made-graphics.spec.ts` are.
- **`save` was not exercised.** This machine holds a valid key for `https://noacg.studio`
  (`noacg_ak_8b18c7…`), so the refusal HB met is gone, but writing into the owner's live library
  from an unattended review session is a remote account write and was not made. The Import door
  carried the production instead, which is the alternative the criterion allows.
