---
kind: walk
because: taste
date: 2026-09-24
serves: now
---

# One layer-naming system, settled and checked

## What changed

You asked for the final and easiest naming system, used by every example and every agent. It is
settled in `docs/OWNER_RULINGS.md` (2026-09-24), with how to revert each part, and its one source
is `src/templates/behaviours/layer-names.json`.

- **A five-line cheat sheet opens `/docs#svg-layers`**, and the same five lines open
  `docs/SVG_AUTHORING.md`, the noacg-graphic skill contract (the npm copy and the plugin copy)
  and the noacg-graphic-local skill in both Claude Code and Codex. One script writes all six from
  the JSON, and the build fails if one differs. The long version, the quiz tree and the words
  table stay below it.
- **The Board rule:** the background is `Panel`, a plate under a text is that text's name plus
  `box` (`Question box`, `Answer box A`, `Score box 1`), fixed words are `static:`, anything else
  is decoration with any name.
- **One field set per simple type:** a title is `Title`, `Subtitle`; a name tag is `Name`,
  `Role`; credits are `Heading`, `Credits`, with `Credits` one text holding the whole list.
- **No moments, no `Moments` layer.** Measured tonight through Illustrator 2026's own scripting:
  its SVG save (the one File > Save a Copy > SVG runs) dropped an empty `Moments` layer, and an
  empty hidden group inside it, although the `.ai` kept them. So a title, a name tag and credits
  have `Text` and `Board` only.
- **The examples follow it.** `quiz.svg` plates are `Answer box A` to `D` (were `Row A`),
  `ticker.svg` has `Panel` and `Kicker box` (were `Strip` and `Tag`), `end-credits.svg` is
  `Heading` plus one `Credits` text (was a field per name with `static:` role labels), and a new
  `name-tag.svg` (`Name`, `Role`) is what the "Import an SVG" walk and its Fields picture use.
  The docs trees and the Fields-step pictures were redrawn to match.
- **The check.** `npm run check:example-layers` runs inside `npm run build` and fails on any SVG
  under `public/docs/examples/`, `docs/tutorials/*/import-ready/` or `docs/tutorials/*/SVG/` that
  breaks the system, and names the file and the fix ("Row B sits under Answer B alone - name its
  plate Answer box B"). Its test breaks real files the ways agents broke them and checks each one
  is caught. The accepted behaviour words come from `words.json` as the build runs, so a new word
  counts the day it lands. `docs/tutorials/talk-show-set/` is exempt by name, untouched, until
  you remove it. `docs/svg-samples/` is a gallery and its README says so, with the measurement:
  all 24 files fail the check.

## Route in under a minute

`/docs#svg-layers`: the amber-edged "Layer names in 30 seconds" box is the first thing under the
heading, five bullets. Scroll to "Names on the Board" and "Titles, name tags and credits" just
below it, then the quiz tree (Board shows `Answer box D` and `Answer box C, B, A`). Then
`/docs#end-credits`: the tree is `Heading` and `Credits` over `Rule` and `Panel`, and the Fields
picture shows two fields. Then `/docs#tickers`: `Kicker box` and `Panel`.

## What to look at

- Read the five bullets as a student would, in 30 seconds. Too long, or a word you would change?
  Every word is one edit in `layer-names.json` plus `npm run write:layer-cheat-sheet`.
- Decided, and yours to overrule: the plate word is `box` (your example) rather than `plate`;
  the name tag is its own simple type with a docs example (`name-tag.svg`); the check requires
  the plate name only where a shape sits under ONE operator text, so a panel holding two texts,
  a shadow strip or a bar track stays free decoration.
- The earlier walk item `2026-09-21-l-one-naming-system.md` still says the quiz plates are
  `Row A`; they are `Answer box A` now.
