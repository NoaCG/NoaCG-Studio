# Three layers that are one paragraph arrive as three fields, and the step never says so

**Filed:** 2026-09-08. **Source:** the 2026-09-01 one-field-per-item session (handoff since drained)

## Why
A `<text>` with several baselines is ONE operator field; two separate text objects are two fields
whatever they look like. So a paragraph drawn as three layers arrives as three fields and the
product is silent about why. That session argued AGAINST joining them: two objects is the
designer's own statement that they are two things, and joining them in the mapping step makes the
operator's field list depend on a choice nobody can see in the artwork afterwards. What is missing
is the step SAYING it, pointing at the file, where the fix survives a re-export.
`docs/SVG_AUTHORING.md` section 3 carries the rule for designers who read it; the importer carries
nothing for everyone else.

## What it would take
Detect the shape from the import measurements - two or more single-baseline text objects, same
face and size, stacked about one line-height apart, left edges aligned - and print one line under
the group: these look like one paragraph drawn as N layers, that is N fields, draw it as one
`<text>` with Return inside it. No new mechanism, no change to the one-field rule or the runtime.

## Evidence
`docs/SVG_AUTHORING.md:76`; the RUN PROBLEM comment in `src/assets/svgImport.ts`; the three sample
files `audience.svg`, `info-card.svg`, `public-info.svg`, each drawn a layer per line until
2026-09-01.
