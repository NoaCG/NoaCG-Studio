---
v: 2
source: derived
kind: finding
raised: 2026-09-06
state: unstarted
serves: NOW
found: "surfaced by the bracket walk (docs/SVG_BEHAVIOUR_SHOWS.md §4f): a text layer named
  `Champion` whose sample text reads `Champion` arrives labelled after its parent group, because
  the importer reads a name equal to the content as an editor's default naming."
touches: src/assets/svgImport.ts
covered-by: import-svg.spec.ts, import-svg-behaviour.spec.ts
---
# A text layer named after its own sample text loses its name to its parent group

**Found on the bracket walk, 2026-09-06**, while importing `e2e/fixtures/svg-shows/bracket.svg`
through the wizard. Recorded in `docs/SVG_BEHAVIOUR_PLAN.md` §13 as an import trap; filed here as
the work.

## What happens

`namesItsOwnCopy` in `src/assets/svgImport.ts` treats a layer whose name equals its text content as
UNNAMED and climbs to the nearest named ancestor. The rule exists for Figma, which auto-names every
text layer after the words in it, so a quiz board's `<text id="Amsterdam">` inside `<g id="Answer
A">` is labelled "Answer A" rather than "Amsterdam" - the right call there.

A student who deliberately names a slot after its placeholder ("Champion" reading "Champion",
"Title" reading "TITLE" once case is ignored) gets the group's name instead, or no name at all when
the group is unnamed. On the bracket the champion slot arrived labelled after its plate group, and
nothing in the wizard says why.

## What would settle it

The rule cannot tell a Figma auto-name from a deliberate one by the name alone. Two honest
directions, either of which is a small change:

- Keep the climb only when the ancestor's name is BETTER evidence - a named group that holds
  exactly this text layer - and keep the layer's own name when the group holds several text
  layers, since a group of five slots cannot be the name of one of them.
- Or accept the layer's own name whenever the file is not Figma's (the generator comment and the
  `data-name` attribute say which app wrote it) and keep the climb for Figma exports only.

Either way the mapping step should say "named after its own text, so the group's name was used"
under the box, the way it already explains an unfilled picker.

## Where it is pinned

`e2e/import-svg.spec.ts` carries the Figma case that the rule protects; a fix adds the bracket's
case beside it so the two cannot trade places.
