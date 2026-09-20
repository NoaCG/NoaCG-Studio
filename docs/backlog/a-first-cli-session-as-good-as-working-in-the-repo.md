---
v: 2
source: owner
kind: ask
raised: 2026-09-20
state: advanced
note: "Landed: the stress frame cuts at a word and stresses the last of equal options (PR 337), and validate no longer reads its own screenshots and thumbnail back in, CLI 0.3.4 (PR 338). Still stands: the seven items below, and 0.3.4 is not on npm until the owner pushes the cli-v0.3.4 tag."
asked: "This experience I had with creating graphics through Claude Code here with you and getting them into NOA CG, I want everyone to be able to have this great experience I just had. Is the CLI tool and the MCP server working this well? I want everyone to be able to create complicated graphics this easily."
serves: P7
size: standard
touches: cli/, src/bridge/bridgeApi.ts, src/templates/types/
needs-owner: none
---

# A first CLI session as good as working inside the repository

## What was measured

A cold-start trial on 2026-09-20: a fresh agent with no knowledge of this repository, given only
`@noacg/cli` 0.3.3 and a student's brief (a two-player chalkboard score bug with point and reset
buttons). It reached a clean validate and a graphic worth airing in 20 CLI calls and 7 validate
runs, wrote no state-machine code because `noacg types` offered `duel-score`, and rated the first
session 6 out of 10. The MCP entrance was probed separately and answers `docs` and `types`.

Two faults it found are fixed: `validate --screenshots` inside the package showed stale frames
under a green result (CLI 0.3.4), and the stress frame cut doubled text mid-word (the bridge).

## What is left, in the order the trial ranked it

1. **No way to SEE a machine state.** `noacg screenshot --state final` answers `--state is off,
   onair or stress.` The Final look, the leader mark, a quiz's picked and revealed rows are what
   these types are for, and the agent had to copy the package and hack a variable to judge them.
   Wanted: `screenshot --event <name>` (repeatable, dispatched in order after the entrance), which
   the bridge can already do because the bench dispatches authored events.
2. **The stress frame doubles the DEFAULT, so a short default stresses nothing.** "ALEX ALEX" fits
   where "ALEXANDRA-MARIE" lost its first row, and validate stayed green. Wanted: a name-shaped
   field stressed with a long realistic value, not only with its own words twice.
3. **Screenshots are transparent and viewers show that as white.** A chalk-white or cream graphic
   cannot be judged. Wanted: `--background <colour|checker|video-grey>` on `screenshot` and
   `validate --screenshots`.
4. **`quiz-show` and `duel-score` have no neutral scaffold** (`neutral: no` in `noacg types`), so
   an agent must start from one of three looks it picks blind and then discards. Every type a
   student is likely to start from should offer `--design neutral`.
5. **Fonts.** The contract says a Google font is downloaded and shipped under `fonts/`, and the CLI
   offers no way to do it; the scaffold copies one of the seventeen bundled faces and no command
   lists or adds the others. Wanted: `noacg fonts` (list, add, with the licence line written).
6. **Docs a CLI user cannot follow.** `docs contract` points at `references/package.md`,
   `SKILL.md` and `docs/OGRAF_STATE_IN_FIELDS.md`; there is no `screenshot --help`; nothing
   describes the 450-line text-fit runtime whose inline `height` and `font-size` fought the
   agent's CSS twice; the colour rule does not say whether extra `:root` variables are allowed.
7. **Small ones.** `inspect` prints `-` for New game's payload although the control carries
   `set f1=0, f3=0`; the "generated half was stale" note appears after every ordinary edit and
   reads as a fault; validate rewrites source mtimes on every run; design ids come with names and
   descriptions only in a 189 KB `types --json`.

## Done when

The same cold-start trial, run again with a different brief, reports no moment where the tool
showed something untrue, can see every state its type has, and rates the first session 8 or more.
