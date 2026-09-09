---
kind: agent
date: 2026-09-09
serves: now
---
# `noacg types` fits a terminal, and two more silent name-drops are refused (0.3.1)

0.3.0 has been on npm since 2026-09-05. The time-to-air walk four days later ran the door as a
stranger would and found three faults; the two that live in the CLI are fixed here, and
`cli/package.json` is 0.3.1. Nothing about the package's shape, its verbs or its `--json` contract
changed, so it is a drop-in.

The third finding - three of six neutral scaffolds warn on their own stress bench - is a studio
template fault rather than a CLI one and is still open in the backlog. I did not get to it.

## The route, under a minute

Once per machine, because `cli/dist/` is built rather than committed:

```
npm --prefix <checkout>/cli install
npm --prefix <checkout>/cli run build
```

**One.** Ask the tool what it can make:

```
node <checkout>/cli/dist/index.js types
```

**Two.** Make the mistake anyone makes once, on the command that stores a credential:

```
node <checkout>/cli/dist/index.js login --name My Laptop
```

Note the missing quotes around `My Laptop`.

## What to look at

**The table.** It used to be 67 rows whose widest line was 354 characters, so every long row
wrapped two or three times and the columns stopped lining up - which is the entire information a
table carries. Now it fits whatever your window is: `type` and `neutral` stay whole because those
are the columns you choose by, and `fields`, `events` and `designs` share what is left, cut at a
whole item with the count they dropped (`+7`), never mid-key. **Resize the window and run it
again** - narrow it to something silly and it still lines up.

The judgement I would like your eye on is which column gives ground first. I split the three lists
in proportion to how wide they naturally are rather than picking a favourite, so at 80 columns you
see about two fields, two designs and two events per row, and at 160 you see most of everything.
The alternative was to keep `events` whole and squeeze `fields`, which would have been a claim
that events matter more when choosing a type. I do not think they do.

**The refusal.** Before this, `--name My Laptop` gave the flag "My" and threw "Laptop" away
without a word, so the browser asked you to authorise a key called "My" and that is the name that
sat in Settings -> Account -> Agent access. The name is the only thing telling one machine's key
from another's when you come to revoke one, so half a name is close to no name. Now it refuses and
shows the quoting that fixes it.

The same fault was open on `caspar play`, and there it is worse than a bad name:
`caspar play --url … 1 20` reads as "channel 1, layer 20", the two words were dropped, and the
production went out on the DEFAULT channel and layer with nothing said. That one reaches live
playout hardware. Both are refused now, along with the same hole on `doctor`, `docs`, `logout` and
`whoami`.

## What needs you

Nothing, unless you disagree with the column split above. Publishing 0.3.1 is session AH's job
once this branch lands, under your 2026-09-05 ruling that a session may run `npm run release:cli`
without asking.
