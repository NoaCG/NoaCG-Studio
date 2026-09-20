---
kind: walk
date: 2026-09-16
because: taste
serves: now
---
# Is the agent door usable by a stranger? Walked tonight, and written down

You asked whether someone who is not us can install the plugin, connect an account, make a graphic
and get it on air, whether they can hand over an SVG, and whether they can just describe what they
want. `docs/AGENT_DOOR_AUDIT.md` answers that from commands run on this laptop tonight against the
published 0.3.3, not from reading our own documentation. Every claim carries the command behind it,
and the three things I could not witness say UNVERIFIED instead of being rounded up.

## Route, under a minute

1. Open `docs/AGENT_DOOR_AUDIT.md` and read the last paragraph, **The verdict** - one sentence.
2. Above it, the table **Defects filed**: three rows, each with the smallest fix and the backlog
   file it lives in.
3. If you want one number, the table in section 2: **8.4 s** from `save` returning to the graphic
   readable on a public output URL, driven end to end tonight against `noacg.studio`. The authoring
   chain before it is twenty seconds of tool time.
4. If you want one picture, section 4 - one sentence in, a broadcast-credible lower third out, in
   about twelve seconds.

## What is worth your attention

**One item needs you and nobody else** (section 1). `claude plugin install noacg` fails on a clean
machine - Claude Code only searches marketplaces already configured, so the marketplace-add line is
step one, not a footnote. Making the bare command work means being listed in
`anthropics/claude-plugins-official`, which is a pull request from an account. That is yours to
decide; nothing else in this audit is.

**One thing to do to this laptop.** It loads plugin **0.2.0**, nineteen days old,
from a marketplace checkout last refreshed on 2026-08-28. One command fixes it -
`claude plugin marketplace update noacg-studio` - and I deliberately did not run it tonight, because
it swaps the skill text under other sessions that were working while I measured.

**One judgement I made for you, argued rather than assumed** (end of section 2). The CLI stops at
the library: putting a graphic into a production and pressing TAKE are dashboard actions with no CLI
verb. I called that correct rather than a gap, because both are operator decisions with an audience
on the other end. If you disagree, that is the one call in the file most worth overturning.
