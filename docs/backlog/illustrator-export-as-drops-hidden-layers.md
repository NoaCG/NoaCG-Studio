# The app's export hint and the authoring guide still teach Illustrator's Export As

**Filed:** 2026-09-21. **Source:** measurement, row F (`docs/handoffs/2026-09-21-f-docs-student-follows.md`)

## Why

Measured on Adobe Illustrator 30.1 (2026), driven through COM so the real exporters ran: File >
Export > Export As > SVG writes no hidden layer and no hidden group at all. A quiz drawn with
twelve hidden moment groups and a hidden Full time layer arrived with none of them, the wizard
still picked Quiz from the answers alone, and nothing said a thing. The legacy File > Save a Copy >
SVG keeps hidden layers as `.stN{display:none}` classes, which `svgImport.ts` already reads.

The public docs (`docs.html`, `#svg-export` and `#svg-layers`) now teach Save a Copy and say what
Export As does. Three places in the repo still teach the opposite, so a student who follows the
app rather than the docs loses every drawn moment:

- `src/components/wizard/import/ImportDesignStep.tsx` around line 344, the "Exporting the SVG"
  panel on the drop step, which the docs' own `svg-drop.png` shows open: it says Export As.
- `docs/SVG_AUTHORING.md` section 6 (Adobe Illustrator) and 6b "Export it": both teach Export As
  and say "Do not use Save As > SVG".
- `e2e/fixtures/svg-corpus/student-illustrator-quiz.expect.json` and
  `illustrator-four-team-scoreboard.expect.json` name "Export As" as the exporter of files whose
  shape (the "SVG Export Plug-In" generator comment, `.stN` classes, `xml:space="preserve"`) is
  the legacy exporter's.

## What it would take

The same sentences the docs carry: Save a Copy, Use Artboards, Fonts Type SVG with Subsetting
None (Use System Fonts), Image Location Embed, Preserve Illustrator Editing Capabilities off, CSS
Properties Style Elements, and one line saying Export As leaves hidden layers out. In the wizard
hint keep it to two lines; re-shoot `svg-drop.png` through the job queue afterwards. In the
sidecars only the `exporter` field changes. The importer does not change.

## Evidence

The handoff above lists every variant exported and what the real importer plus `bestProposal`
made of each. The two shipped examples `public/docs/examples/quiz-lower-third.svg` and
`scoreboard-lower-third.svg` are the legacy exporter's own output with the fonts renamed.
