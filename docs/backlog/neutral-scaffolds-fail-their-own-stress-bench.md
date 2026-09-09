---
v: 2
source: derived
kind: finding
raised: 2026-09-09
state: unstarted
found: "three of six neutral scaffolds hand the author a bench WARNING they did not cause - the
  scaffold's own plate does not follow its text under the doubled-text stress it will be judged by"
size: standard
touches: src/templates/types/neutralDesign.ts, src/templates/scoreboards/shared.ts
---
# A neutral scaffold fails the bench it ships with

**Filed:** 2026-09-09. **Source:** the time-to-air walk (docs/AGENT_CLI.md, "Time to air,
measured").

## Why

The loop the door teaches is scaffold -> author -> `validate` until clean -> `save`. On the walk
the very first `validate` of an untouched scaffold came back with a warning:

```
OK - 0 error(s), 1 warning(s)
- WARN bench-stress: #f1 extends past .scoreboard-box, the nearest thing painted behind it, once
  every text value is doubled in length - part of the text reads straight against the video.
```

Nobody had edited anything. That is the wrong first impression twice over: it teaches a newcomer
that a warning is background noise to be scrolled past (which is exactly how a real one gets
missed later), and it hands an agent a finding to "fix" in code it did not write, which is how a
scaffold gets mangled in its first minute.

The scaffolds are the house's own work, benched by the house's own bench. If our starting point
cannot survive doubled text, we are asking authors to clear a bar we did not clear.

## What it would take

**Start by reproducing it, not by applying the finding's advice.** The bench's teaching line says
to let the surface follow its content (`width: fit-content` + padding), and on these designs it
already does: `src/templates/scoreboards/shared.ts` emits `width: fit-content` on
`.scoreboard-box` for any design that sets no `stageWidth`, and the neutral scoreboard
(`neutralScoreboardDesign`, `src/templates/types/neutralDesign.ts`) sets none. So the box is not
pinned, and the stock fix would change nothing. What it does carry is
`max-width: maxTextWidthCss(...)`, and one unverified candidate is `.scoreboard-mask`, which has
no `min-width: 0` - under `justify-content: space-between` with a gap, the row's min-content width
can exceed that cap and the content overflows the plate it is measured against. Reproduce with
`noacg scaffold --type scoreboard --design neutral` then `noacg validate --screenshots`, and read
`stress.png` before touching CSS.

Whatever the cause, `match-board` also needs breathing room between `#f1` and `.scoreboard-clock`,
which is a spacing decision rather than a width one.

Two decisions belong to whoever picks this up:

1. **Fix the scaffolds, or exempt them?** Fix them. An exemption would mean the bench does not
   run on the one package we ship, which is the wrong half to give up.
2. **How far does it reach?** Only the neutral scaffolds were measured. The catalog designs go
   through the same bench in the app and may be clean already; that is a second measurement, not
   an assumption.

`match-board` also warns `legibility-secondary-size` (its clock is 16px against the ~20px TV
reading floor), which is a different fault in the same file and worth fixing in the same pass.

## Evidence

Six neutral scaffolds, scaffolded and validated 2026-09-09 against this checkout's dev server
(`npm run dev:worktree`), each untouched between the two commands:

| Type | `validate` |
|---|---|
| `lower-third` | 0 errors, 0 warnings |
| `title-card` | 0 errors, 0 warnings |
| `social-bug` | 0 errors, 0 warnings |
| `scoreboard` | 0 errors, **1 warning** - `#f1` extends past `.scoreboard-box` under doubled text |
| `sponsor-bug` | 0 errors, **1 warning** - `#f0` extends past `.corner-bug-box` under doubled text |
| `match-board` | 0 errors, **2 warnings** - `#f1` and `.scoreboard-clock` overlap 25% under doubled text; supporting text is 16px |

Half of a six-type sample, and the three that warn are the ones with a plate. The remaining
neutral scaffolds were not measured.
