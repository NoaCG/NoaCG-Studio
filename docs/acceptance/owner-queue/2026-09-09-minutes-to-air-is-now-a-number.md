---
kind: agent
date: 2026-09-09
serves: now
---
# "In minutes" is now a number: 25 seconds of tool time from nothing to a graphic on air

Your bar for this door is *"create graphics in your own Codex or Claude Code and, in minutes, play
them out in the NoaCG CG player system."* Nobody had ever timed it. I walked the terminal entrance
by hand from an empty folder on 2026-09-09 with a stopwatch on every verb, took the result to a
player, and wrote the table into `docs/AGENT_CLI.md` under **"Time to air, measured"**. The
headline: **the seven authoring verbs cost 24.8 seconds together**, and `validate` is 43% of that
because it is the only one that opens a browser. Branch `claude/a-cli-minutes-to-air`.

The walk also found one thing that was silently wrong, and it is fixed on the same branch.

## The route, under a minute

In any terminal, in an empty folder outside the repo:

```
node <checkout>/cli/dist/index.js scaffold --type scoreboard --design neutral --name Football scoreboard --out ./x
```

Note the MISSING QUOTES around `Football scoreboard` - the mistake anyone makes once.

- **Before this branch** it worked, and gave you a graphic called "Football". The word
  "scoreboard" was dropped on the floor without a word, and the name it did not take was in the
  package's `<title>`, its SPX description and its file names.
- **Now** it refuses, in one line, and tells you which word to quote:
  *"scaffold takes no arguments outside its flags, but got "scoreboard". A value containing a
  space needs quotes: --name "Football scoreboard"."*

**What to look at.** Read that refusal as if you had just typed it. Does it tell you what to do
next, or does it tell you what you did wrong? That is the only judgement in it - the fix itself
is four lines and a test.

Then, if you want the numbers rather than the fix: `docs/AGENT_CLI.md`, "Time to air, measured".
The two rows worth your eye are `validate` at **10.7 s** (the verb an author runs most, so it is
the one worth making faster) and `save` at **0.3 s, refused** - because `save` cannot be walked
against a local dev server at all, and the README's own example ends on that line.

## What the same walk found and did NOT fix

Both are filed rather than fixed, because the measurement was the deliverable and these two want
design decisions rather than typing:

- **`noacg types` prints 67 rows up to 354 characters wide.** It is the second command in the
  README and no terminal can show it.
  `docs/backlog/noacg-types-prints-a-table-no-terminal-can-show.md`.
- **Three of six neutral scaffolds warn on their own bench** before anybody edits them - a plate
  that does not follow its text under the doubled-text stress. A newcomer's first `validate` is
  therefore not clean, which teaches exactly the wrong reflex.
  `docs/backlog/neutral-scaffolds-fail-their-own-stress-bench.md`.
