---
v: 1
scope: public/docs/examples/**, docs/tutorials/**, docs/svg-samples/**, scripts/illustrator/**, cli/skill/noacg-graphic/**, src/templates/behaviours/layer-names.json, docs/SVG_AUTHORING.md
kind: rule
fires: contract
status: active
since: 2026-09-24
record: contracts/records/templates/2026-09-24-name-every-layer-svg-you-draw.md
---
Name every layer of an SVG you draw or generate by the one system in `src/templates/behaviours/layer-names.json`, whose five lines open `docs.html#svg-layers`: `Text`, then `Moments` only when there is a moment, then `Board`, with the background `Panel`, a plate named for its text plus `box` and fixed words `static:`. Put an example under `public/docs/examples/` or a tutorial's `import-ready/` or `SVG/`, where `npm run check:example-layers` fails the build on any name that breaks the system, and change the examples, never the importer's vocabulary.
