---
description: Make a broadcast graphic for NoaCG Studio - design it, validate it, put it in the user's NoaCG library
argument-hint: [--guidelines | --critique <folder>] [what the graphic is, e.g. "a football scoreboard for our school channel"]
---

Make a NoaCG graphic: $ARGUMENTS

Follow the `noacg-graphic` skill installed with this plugin - it is the whole procedure: the
NoaCG CONTRACT the graphic must satisfy, the `noacg` tools (`types`, `scaffold`, `validate`,
`inspect`, `screenshot`, `save`, in a terminal or as the one `noacg` MCP tool), and the loop - start a
package, design it the way you normally design, validate and look at the screenshots until clean,
inspect the operator surface, save it to the user's library and report the link. If the brief
above is empty, ask what the graphic is before starting.

The skill teaches what the graphic must expose and satisfy, not how it should look. The look is
yours (or another design skill's, when one is active), unless one of the skill's opt-in tools is
switched on: by the user's words or project instructions (the skill lists them), or by one of
these two flags in the request above:

- `--guidelines`: the user wants NoaCG's design guidelines for this graphic. Read the skill's
  `references/design-notes.md` before designing and follow it.
- `--critique <folder>`: the user wants the graphic in that folder (or the one in the current
  folder) critiqued and improved rather than a new one made. Follow the skill's
  `references/critique.md` step by step and show the before and after frames.
