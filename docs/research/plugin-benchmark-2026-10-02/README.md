# Plugin benchmark, six briefs by three arms, 2026-10-02

**Question.** Under D1 the agent designs freely by default, with two opt-in tools: a critique
asked for in words, and NoaCG's design guidelines switched on in words. Does the default hold the
bar ("would it air on a paid channel"), is every live action reachable without scrolling or
typing a label, and does each opt-in tool do what it claims and nothing when not asked? This is
the benchmark of `docs/work-specs/plugin-design-quality/spec.md` AC-10, and its first full run.

**Short answer.** 18 of 18 cells built, validated with 0 errors, imported, played and walked in
the studio, and judged by two reviewers that built nothing.

- **Default (D):** holds the bar part of the time. 2 of 6 would air on a paid channel as they
  stand (gala, quiz), 4 are borderline (competent but generic), none fail.
- **Critique asked for (C):** does what it claims. Every change it claimed is visible in its
  frames, except the motion-only ones and one state the walk never showed (the ticker's
  TIEDOTE label). It produced the best variant in 4 of 6 briefs (blind
  rank) and 3 of 6 "yes" verdicts. It also made one regression. On the quiz it added a Next
  question button whose path clips a long question on air, and validate passed it.
- **Guidelines on (G):** followed faithfully. The cited numbers are in the CSS, and only exit
  timing drifts outside the guideline's band. But it does not raise the look: 0 of 6 "yes", last
  of three in 4 briefs, and never first. It steers toward a plainer "dark card, one accent, sans"
  answer.
- **Opt-in hygiene:** clean. By each builder's own transcript, all 6 D cells opened neither
  opt-in file, all 6 C cells opened `critique.md` and not `design-notes.md`, and all 6 G cells
  opened `design-notes.md` and not `critique.md`.
- **Operability:** the same in every arm, so the arm is not the cause. The 6 hockey and quiz
  cells fail: their action buttons and score/period steppers sit below the 900px fold on the
  Playout page. The 3 ticker cells fail on a typed label, because UUTISET/TIEDOTE is a free-text
  field. The 9 lower-third, gala and result-board cells pass.

## Method

| | |
|---|---|
| Date | 2026-10-02, 14:45-19:00 local, cells one at a time |
| Checkout | `claude/cj-plugin-benchmark` at `1ee6a2cb9` (main) |
| CLI | `@noacg/cli` 0.7.1 built from `cli/` in this checkout; a shim put it first on `PATH`. The machine's global `noacg` is 0.3.3, and one builder hit it once by mistake (help output only) |
| Plugin | a copy of `cli/plugin` (skill 0.7.1) taken at the start, in `C:\claude\cj-bench-2026-10-02\plugin\` |
| Deployment | this worktree's dev server, `NOACG_URL=http://localhost:5206`, no account backend |
| Builders | one fresh Opus subagent per cell, run blocking and one at a time, each in an empty folder outside the repository. The prompt is in `harness/builder-prompt.md` |
| Arms | **D** the brief verbatim. **G** the brief plus "Please use NoaCG's design guidelines for this one." **C** "Can you critique and improve the NoaCG graphic in .\<folder>?" on a copy of that brief's D package |
| Briefs | `harness/briefs.md`: the four of the 2026-10-02 walk, plus a news ticker (b5) and a full-frame ski result board (b6) |
| Evidence per cell | `harness/collect-cell.sh` collects `validate.txt` and `inspect.txt`, the on-air and stress frames from `noacg screenshot` over the CLI's `video` ground (`cli-*-video.jpg`), and the studio walk (`harness/walk-cell.mjs`). The walk does Import, a new production, then the Playout page. It records which live controls are on screen at load (`reach.json`), presses Take, runs the cell's steps (`harness/steps/`), presses every declared action once, presses Next, presses Out, and saves the PROGRAM monitor after each step and the page at load and after Take |
| Opened files | `harness/opened-files.mjs` reads each builder's own subagent transcript. It lists the plugin files the builder named in a tool call (`opened.json`), and flags Skill, Agent and browser use and any touch of the repository |
| Reviewers | Two fresh Opus subagents that built nothing, judging against the written rubric `harness/rubric.md`. The first judged quality blind to the arm, on folders anonymised by `harness/prepare-review.mjs` (`reviews/quality-blind.md`, key `reviews/blind-key.json`). The second judged the opt-in claims with the arm known (`reviews/opt-in.md`) |

**Limits, said first.**

- **Not a terminal `claude -p` stranger.** Terminal Claude Code is still not logged in on this
  machine, so every builder is the documented subagent method. It is a near-stranger: its system
  context carried this repository's instructions, which it was told to ignore. No API key was
  used. No builder touched the repository (transcript scan, 0 flags). One C builder made one
  accidental browser-pane call, a screenshot with no action taken.
- **The machine's command guards are not a stranger's.** This session's guard hooks refused
  some builder commands: non-ASCII or multi-line `--data`, loops, heredocs. 16 of 18 builders
  report routing around them (script files, PowerShell). A user's own terminal would not have
  those guards. The time and tokens below include that friction.
- **One run per cell.** Within a brief, D and C share a package, so the ranking turns on
  details (the blind reviewer says so). Treat a one-place rank difference as weak evidence. Treat
  the patterns across six briefs as the finding.
- **Stills only.** Entrance and exit motion, the ticker's crawl and the result board's row
  cascade are judged only where a still frame catches them.
- **The walk steps were written per cell by this session**, which built nothing. A step is a
  field key and a value from that cell's `inspect.txt`, such as the same long Finnish title or
  the same five result rows. The generic part of the walk pressed actions in panel order, which
  has one consequence for reading the hockey frames. Stop clock and Reset came before the power
  play, and all three hockey builders hold the power-play clock while the game clock is stopped,
  as hockey does. So "the power-play clock reads 2:00 in every tile" is the walk's order, not a
  defect. The "Next period still reads 1ST" finding is a real defect, confirmed in
  `cells/b2-hockey-D/studio/10-action-nextPeriod-program.png`.
- **Program frames are the studio's in-page PROGRAM monitor on black.** The CLI frames use its
  synthetic `video` ground. Neither is CasparCG, OBS or vMix.

## The verdict per brief and arm

Premium and operable verdicts are the blind reviewer's (`reviews/quality-blind.md`). The opt-in
column is the second reviewer's (`reviews/opt-in.md`). Reach is the walk's count of live controls
on screen at load.

| Brief | Arm | Premium (blind) | Rank | Operable | Reach | Behaviour | Opt-in check |
|---|---|---|---|---|---|---|---|
| b1 news lower third | D | borderline | 1 | pass | 4/4 | ok | opened neither |
| | C | borderline | 2 | pass | 4/4 | ok | 3 of 3 claims shown or partly; better than D (opt-in reviewer, not blind) |
| | G | borderline | 3 | pass | 4/4 | ok | rules followed except the plate hugging its text; hard to tell from D |
| b2 hockey scorebug | D | borderline | 3 | fail | 7/25 | Next period does not repaint the period (1ST) | opened neither |
| | C | borderline | 1 | fail | 7/25 | same period defect, inherited from D | 3 of 3 claims shown (dark club colours only partly); better than D |
| | G | borderline | 2 | fail | 7/25 | ok | rules followed; "same" as D |
| b3 gala title | D | **yes** | 2 | pass | 4/4 | ok | opened neither |
| | C | **yes** | 1 | pass | 4/4 | ok | 1 shown, 1 partly, 1 motion-only; slightly better |
| | G | borderline | 3 | pass | 4/4 | ok | rules followed (exit too fast); a boxed card over the stage centre |
| b4 pub quiz | D | **yes** | 1 | fail | 5/14 | ok | opened neither |
| | C | **no** | 3 | fail | 6/15 | long question clipped through the new Next question button | claims shown; **worse on air**; validate passed it |
| | G | borderline | 2 | fail | 5/13 | ok | rules followed; loses D's marquee identity |
| b5 news ticker | D | borderline | 2 | fail (label) | 6/6 | ok | opened neither |
| | C | **yes** | 1 | fail (label) | 6/6 | ok | 1 shown, 1 partly, 1 not shown (no TIEDOTE frame); slightly better |
| | G | borderline | 3 | fail (label) | 6/6 | ok | rules followed; equally generic, bulletin keeps the routine chip |
| b6 ski result board | D | borderline | 2 | pass | 4/4 | ok | opened neither |
| | C | **yes** | 1 | pass | 4/4 | ok | 3 of 4 shown, 1 motion-only; better; kept D's shrunken long club |
| | G | borderline | 3 | pass | 4/4 | ok | rules followed; plainer; best long-text handling |

**Totals.**

| Arm | Premium yes / borderline / no | First / middle / last in its brief | Operable pass | Opened its own opt-in file only | Mean builder time | Mean tokens |
|---|---|---|---|---|---|---|
| D default | 2 / 4 / 0 | 2 / 3 / 1 | 3 of 6 | 6 of 6 opened none | 11.5 min | 203k |
| C critique | 3 / 2 / 1 | 4 / 1 / 1 | 3 of 6 | 6 of 6 | 10.0 min | 180k |
| G guidelines | 0 / 6 / 0 | 0 / 2 / 4 | 3 of 6 | 6 of 6 | 12.3 min | 220k |

C's time is on top of the D build it started from. Every cell validated with 0 errors. The
warnings were on hockey only: 4 for D, 1 for C and 2 for G, all but three of them the known
`bench-field-unpainted` false positive on a clock or period field the runtime repaints.

| Cell | Tokens | Tool calls | Minutes |
|---|---|---|---|
| b1 D / C / G | 137k / 186k / 163k | 33 / 67 / 38 | 4.1 / 10.0 / 5.6 |
| b2 D / C / G | 220k / 152k / 311k | 66 / 42 / 117 | 13.3 / 14.2 / 23.6 |
| b3 D / C / G | 159k / 160k / 166k | 37 / 56 / 44 | 7.5 / 8.5 / 6.7 |
| b4 D / C / G | 252k / 199k / 203k | 64 / 54 / 55 | 13.8 / 8.1 / 11.0 |
| b5 D / C / G | 236k / 195k / 262k | 65 / 78 / 101 | 13.8 / 10.4 / 15.3 |
| b6 D / C / G | 214k / 185k / 213k | 74 / 72 / 66 | 16.5 / 8.9 / 11.3 |

**Where the two reviewers disagree.** On b1 the blind reviewer ranks D above C. The opt-in
reviewer, which knew C was the critique, calls C "better". The blind verdict stands as the
premium verdict. Both reviewers call b1-C borderline-to-better and not a defect.

## What this says, and what causes it

Ranked by how much each holds back "premium broadcast graphics with minimal friction". Each item
names the layer that causes it.

1. **The live operator still scrolls for action-heavy graphics, whatever the arm.** In the six
   hockey and quiz cells, 8 to 18 live controls sit below the fold at 1600x900. *Cause:* the
   control panel model, fields before actions. This is
   [`docs/backlog/operator-page-buries-live-actions-under-setup-fields.md`](https://github.com/NoaCG/NoaCG-Studio/blob/56f3b3f14146c2a40806f4326eac2e8b7c726f12/docs/backlog/operator-page-buries-live-actions-under-setup-fields.md) (AC-5, AC-6). No skill
   arm can fix it.
2. **The guidelines switch does what it says, and what it says does not lift the look.** Six
   faithful builds gave 0 "yes" and four last places. The guidelines enforce restraint and
   legibility floors and push toward a safe dark card. Two examples: b4 lost the marquee identity
   the default found, and b3 boxed the title over the stage. The exit band (30-60% faster than
   the entrance) was missed in 5 of 6. *Cause:* `references/design-notes.md` itself. This is
   evidence for D1's default (guidelines off), and a question for whoever owns the guidelines:
   is a switch that makes graphics plainer worth offering under the name "NoaCG's design
   guidelines"?
3. **The critique improves the look, and can break behaviour that no instrument sees.** It found
   the right defect each time: a generic plate, a weak power play, an empty band after a wrap,
   a flat ground, a DNF outshining the winner. In 4 of 6 briefs it produced the best variant.
   But on b4 it added a machine path (Next question) that clips a long question on air, and it
   missed b6's near-unreadable shrunken club. *Causes:* the critique allows behaviour changes
   with no check of the path they add, and the CLI cannot render a state reached through a
   button payload (`--data` applies only before Take). The b4 builder named the untested path,
   and validate passed it. That CLI gap is AC-4.
4. **Payload-driven state goes unseen.** On b2 D (and C, which inherited it), Next period adds 1
   to the period, and the period word does not repaint. The D builder wrote that it could not
   see this from a screenshot. The G builder found the same trap by reading the runtime and
   fixed it. *Cause:* the CLI (AC-4) and the contract, which does not say that action payloads
   bypass `update()` (AC-7).
5. **Fixed choices left as free text.** All three ticker cells made the UUTISET/TIEDOTE label a
   typed field, though the brief names its two values. *Cause:* the skill. It teaches "a counter
   is a number" but not "a named set of words is a select".
6. **The same CLI and contract frictions in nearly every cell.** All 18 builders hit
   `screenshot --at` reading a bare number as milliseconds, silently, often as 20 ms. This is not
   yet in a backlog item. Two other frictions are already filed. `scaffold --fields` rejects the
   `hidden` kind the skill recommends (b3-D, b6-G), filed as AC-9. There is no route to the
   bundled fonts from a typeless scaffold, so builders probed catalog designs for a serif
   (b3-D, b3-G, b6-D), filed as AC-3. Further frictions:
   - On b1-C and b1-G the bench refuses empty defaults that the skill allows.
   - Validate rewrites and "normalizes" sources without saying what changed (b6-D, b6-G, b4-G).
   - The ticker type has no crawl design (b5, all three arms).
   - The quiz types assume a contestant (b4, all three arms).
   - The neutral scorebug's clock never ticks (b2-D, b2-G). This is AC-2.
   - The stress frame does not lengthen a lines field, yet reports PASS (b6, all three arms).

**What worked, so the plan keeps it.** The contract, validator and Import door produced 18
packages that validate with 0 errors and play in the real studio. Apart from the two defects
above, every button the walk pressed showed its state on the program monitor. The opt-in routing behaves exactly as AC-12 and AC-13 describe for Claude
Code: no file opened unasked, the right one opened when asked. The default found a show-specific
idea on its own in 2 of 6 briefs (gala, quiz). The critique found one in 3 more (ticker echo
rings, gala star, result-board head).

## Files

- `harness/`: the briefs, the builder prompt, the walk (`walk-cell.mjs`), the collector
  (`collect-cell.sh`), the per-cell steps (`steps/`), the transcript scan (`opened-files.mjs`),
  the blind-review preparation (`prepare-review.mjs`) and the rubric. To rerun: build `cli/`
  (`npm ci && npm run build`), start the worktree's dev server, put a `noacg` shim for that build
  in `$BENCH/bin`, copy `cli/plugin` to `$BENCH/plugin`, and run each cell as above with
  `collect-cell.sh` after it (it needs ffmpeg). The C cells' `builder-before-after.jpg` were
  copied by hand from the builder's own folder.
- `cells/<brief>-<arm>/`: `cli-onair-video.jpg`, `cli-stress-video.jpg`, `inspect.txt`,
  `validate.txt`, `opened.json`, `builder-report.md` (condensed), `builder-before-after.jpg` for
  the C cells that made one, and `studio/`. The `studio/` folder holds the PROGRAM frame after
  each step (`NN-<step>-program.png`), the Playout page at load, after Take and after the action
  pass (`*-page.jpg`), `reach.json` and `walk-log.txt`.
- `reviews/quality-blind.md`, `reviews/blind-key.json`, `reviews/opt-in.md`: the two reviews,
  verbatim.
- The packages themselves stay outside the repository in `C:\claude\cj-bench-2026-10-02\cells\`
  on the run machine. They are not committed, the same as the 2026-10-02 walk, which kept one zip
  per brief.
