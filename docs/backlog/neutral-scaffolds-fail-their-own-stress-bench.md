---
v: 2
source: derived
kind: finding
raised: 2026-09-09
state: unstarted
found: "three of six neutral scaffolds hand the author a bench WARNING they did not cause - the
  scaffold's own plate does not follow its text under the doubled-text stress it will be judged by"
size: standard
touches: src/templates/neutral/, src/bridge/bridgeApi.ts
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

Every warning found is the same shape: a **fixed-width surface with text that can outgrow it**.
The bench doubles every text value and asks whether text still sits on the plate painted behind
it. The fix per scaffold is the one the finding already recommends - let the surface follow the
content (`width: fit-content` + padding) instead of pinning it - plus breathing room where two
elements can meet (`match-board`'s `#f1` and `.scoreboard-clock`).

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
