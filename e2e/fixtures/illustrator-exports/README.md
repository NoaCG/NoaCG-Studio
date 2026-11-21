# Illustrator exports

The SVG files Illustrator 30 wrote for the SVG examples (File > Save a Copy > SVG), archived
byte for byte before the Template Library moves or replaces those folders
(docs/work-specs/svg-template-library/spec.md, D2). They are the only real Illustrator output in
the repository that carries look-wrapped text lines (`unwrapLookWrappers` in
`src/assets/svgImport.ts`; `end-credits.svg` holds them), so they stay importer fixtures whatever
the downloads become.

`scripts/illustrator-exports.test.mjs` keeps the set whole: every file is an Illustrator export,
the look-wrapped lines are still here, and while the examples inventory still lists an
Illustrator example, its download and this copy are the same bytes.
