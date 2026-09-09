---
kind: agent
date: 2026-09-09
serves: now
---
# "In minutes" is now a number: the CLI's seven verbs cost 25 seconds

Your bar for this door is *"create graphics in your own Codex or Claude Code and, in minutes, play
them out in the NoaCG CG player system."* Nobody had ever timed it. I walked the terminal entrance
by hand from an empty folder on 2026-09-09 with a stopwatch on every verb, took the result to a
player, and wrote the table into `docs/AGENT_CLI.md` under **"Time to air, measured"**. The
headline: **the seven authoring verbs cost 24.8 seconds of tool time together**, and `validate` is
43% of that. (Corrected 2026-09-09: this file first said `validate` was the only verb that opens a
browser. All seven authoring verbs do - they reach the studio through `BridgeClient.connect()`,
which launches one - so the browser start is the floor under all of them, not something `validate`
alone pays for. `validate` is the slow one for what it does inside that browser: the gate, the
bench and three 1920x1080 frames. The two rows that are not authoring verbs are the exceptions:
`whoami` opens no browser, and `save` refused in 0.3 s because it checks for a key before it
connects.) The rest of the wall clock is
whatever the agent spends designing, plus the hop to a player. Branch
`claude/a-cli-minutes-to-air`.

The walk also found one thing that was silently wrong, and it is fixed on the same branch.

## The route, under a minute

Once per machine, because `cli/dist/` is built rather than committed (8.7 s, measured):

```
npm --prefix <checkout>/cli install
npm --prefix <checkout>/cli run build
```

Then, in any terminal, in an empty folder outside the repo:

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
is a dozen lines and a test. `save`, `validate`, `inspect` and `screenshot` now refuse the same
way, and `save` is the one that mattered: its `--name` is what lands in your library.

Then, if you want the numbers rather than the fix: `docs/AGENT_CLI.md`, "Time to air, measured".
The two rows worth your eye are `validate` at **10.7 s** (the verb an author runs most, so it is
the one worth making faster) and `save` at **0.3 s, refused** - because `save` cannot be walked
against a local dev server at all, and the README's own example ends on that line.

## What the same walk found and did NOT fix

Both are filed rather than fixed, because the measurement was the deliverable and these two want
design decisions rather than typing:

- **`noacg types` prints 67 rows up to 354 characters wide.** It is the second command in the
  README and no terminal can show it. **Fixed in 0.3.1** (branch `claude/ae-cli-0-3-1`), so the
  backlog file this line used to name is gone; the route to look at it is
  `docs/acceptance/owner-queue/2026-09-09-ae-the-cli-one-version-better.md`.
- **Three of six neutral scaffolds warn on their own bench** before anybody edits them - a plate
  that does not follow its text under the doubled-text stress. A newcomer's first `validate` is
  therefore not clean, which teaches exactly the wrong reflex.
  `docs/backlog/neutral-scaffolds-fail-their-own-stress-bench.md`.
