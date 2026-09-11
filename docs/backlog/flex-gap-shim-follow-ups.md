---
v: 2
source: derived
kind: finding
raised: 2026-09-10
state: unstarted
found: "The flex-gap shim (PR 229, landed as 2115083a) left follow-ups nobody owns: traps from walking graphics on the real CasparCG 2.3 and 2.5 servers, a sweep that nothing schedules, three design comments the shim made wrong, engine numbers copied by hand, and a sweep memory lesson with no rule."
size: small
touches: scripts/flex-gap-sweep.mjs, src/templates/quiz/qz01.ts, src/templates/gameTimers/gt03.ts, src/templates/scoreboards/dc01.ts, src/validation/engineSupport.ts, cli/src/mcp.ts
needs-owner: none
---

# What the flex-gap shim left behind

**Filed:** 2026-09-11. **Source:** the flex-gap shim row, branch
`claude/bk-flex-gap-on-old-engines`, PR 229, landed as `2115083a` on 2026-09-10. The shim itself
and the open `inset` / `color-mix()` decision are in `docs/PLAYOUT_COMPATIBILITY.md` §2. This file
holds the rest, one paragraph per item, because none of it has another home.

## Why

Each item below either cost that row time on 2026-09-10 or will quietly undo part of what the shim
bought. The walk traps will bite the next session that airs graphics on the two CasparCG servers
on this laptop. The unscheduled sweep and the stale comments are how the shim stops being honest
without anyone noticing.

## What it would take

**Queue CasparCG server walks strictly one after another.** On 2026-09-10 two walks were queued
with no `--after` between them and started at the same moment. The second server could not bind
port 5250, its socket became a second client on the first server (the log shows every command
twice), and its cleanup's `taskkill` took the first server down under the other walk. The walk
script that row used was changed to refuse to start when 5250 answers, but it was never
committed, so the next walk has no guard at all and the queue itself does not know that two
walks share one port.

**`CG ADD` with no data throws inside every export.** The 2.3 server's log shows `Uncaught
SyntaxError: Unexpected end of JSON input` for every load, with and without the shim, because the
CasparCG data shim calls `update('')` when the command carries no payload and `JSON.parse('')`
throws. The graphic then airs its defaults, so nothing looks wrong on screen, but a guard for the
empty string is a small fix of its own.

**CasparCG 2.5.0 answers `PRINT` late and writes the PNG later still.** A walk that waits 2.5 s
gets "(no reply)" and no file. Poll the server's media folder for the new file instead of waiting
on the reply.

**The two servers read templates from different folders.** A 2.3 server reads
`C:\casparcg\templates`, and 2.5 reads its own install's `template\` folder. The 2026-09-10 walk
copied `giorno.jpg` into the 2.5 media folder so both walks composite over the same still; a new
walk has to do the same.

**The CLI build reports three TypeScript errors in `cli/src/mcp.ts` and still emits `dist/`.** On
2026-09-10 `npm --prefix cli run build` reported an implicit `any` and a `Record<string, unknown>`
argument passed where `Record<string, string>` is expected (line 200). It was already true on
`main` then. A build that reports errors and still succeeds hides the next real one.

**`scripts/flex-gap-sweep.mjs` runs only by hand.** It is not in CI or the nightly, and
`npm run catalog:affected` does not print it. It costs one browser for about eight minutes over
all 504 designs. Adding it with `--fail` to the catalog battery is the gate that keeps the shim
honest when a design starts doing something new with flex. The last run, on 2026-09-10, found 289
designs with 857 flex containers, 286 of them moving when the gap collapses, and 0 off native with
the shim.

**Three design comments still explain why they avoid flex `gap`, and the shim made them wrong.**
They are at `src/templates/quiz/qz01.ts:112`, `src/templates/gameTimers/gt03.ts:79` and
`src/templates/scoreboards/dc01.ts:144`. The AI adapt path reads design comments as reference
style, so it will go on turning `gap` into sibling margins for a reason the product now handles.
Rewording them is three comment edits plus a deliberate re-record of `e2e/catalog-baseline.json`,
because the emitted code is byte-compared.

**The engine numbers are copied by hand into about fourteen comments and doc tables.**
`PLAYOUT_ENGINES` in `src/validation/engineSupport.ts` is declared the single home, and the
CasparCG 2.3 number had been rewritten three times by 2026-09-10 (63, 65, 75 and 88 were all in
circulation before it was measured as 71). A check beside `scripts/check-client-neutral.mjs` that
reads `engineSupport.ts` and asserts the doc rows match would end the rewrites.

**A double-render sweep must collect garbage between batches.** The first flex-gap sweep rendered
two 1920x1080 documents per design in batches of ten, and Chromium kept the detached iframes until
a major GC. It reached 7.2 GB and ran 29 minutes with no output on a 16 GB laptop. The sweep now
launches with `--expose-gc`, collects after every batch of five, and prints one line per batch,
because the queue log shows nothing of a `\r` progress line until the run ends. That lesson
belongs in `contracts/rules/` with a `scripts/` scope, recorded through `npm run learn`.

**The sweep could be about a third faster.** It spends about five of its eight minutes in fixed
settle sleeps, and it walks every element's ancestors to decide whether it is painted. Polling
`gsap.globalTimeline.isActive()` with the sleep as a cap, and one top-down pass for painted, would
cut that. It was left alone because the run is a gate, not a hot path; it matters more once the
sweep runs on a schedule.

## Evidence

- `docs/PLAYOUT_COMPATIBILITY.md` §2 - the measured Chromium 71 number, the shim's rule for 2.3,
  and the feature counts from `scripts/engine-floor.mjs --chromium 71`.
- `src/assets/flexGapShim.js` and `src/assets/flexGapSupport.ts` - the shim and how it travels.
- `2115083a` - the landing of PR 229.
