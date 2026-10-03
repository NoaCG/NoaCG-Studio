# R1.2b.3: images, assets and file/drop import

Base: fetched `origin/main` `70214bb06`, 2026-10-03. PR #638 merged R1.2b.2 as
`94177d561c23f2a1f0045bb7301b3bb6ddeb997a`; it is an ancestor of the base.
Production `/version.json` reports the base (built 2026-10-03T12:35:56.242Z).

## Why and goal

E06/B04 need image creation, logo replacement and chooser/drop parity in the open
graphic. The new editor currently lists assets without its existing import or
management controls. Bring the existing asset reader, panel, source writers and
export bundling into the shared operation registry, with one undo per completed
action and unchanged source outside the edited region.

## Boundaries

One graphic's assets, not a new project format. Reuse AssetsPanel, imageImport,
assetOps, placed image slots and field defaults. Created image layers retain real
source, selection, timeline bars and ordinary artwork transforms. HTML image slots
use contain; SVG image replacement uses preserveAspectRatio meet. Refuse driven or
ambiguous sources with the reason at the control. An SVG file imported here is an
image asset; editable SVG artwork continues through the wizard.

No Pen, alignment/distribution, grouping, bins, loops, canvas typing, video
authoring or backlog work. Existing asset formats remain supported as resources;
only images can be placed through this phase.

## Decisions

- Owner decision, 2026-10-03: center a newly dropped image at the pointer, cap natural
  dimensions to one quarter of the frame without distortion, always create a new
  layer even above an existing image. Replacement is explicit in Properties.
  A new shape's anchor starts at its center; image slots explicitly use 50% 50%.
- Asset import stores files without placing them. All files validate/read before
  one transaction; failure, cancellation or changed document/revision writes nothing.
- Deduplicate identical bytes, settle filename collisions through uniqueAssetPath,
  and preserve relative references on rename. Refuse removal of referenced assets.
- Image opens the reused Assets picker. A selected asset can be placed or used for
  explicit replacement. Files can also be chosen directly to add or replace an image.

## Observable acceptance

1. On a catalog design opened through template search, imported SVG/raster artwork,
   and created layers: Image, file chooser, canvas OS drop and asset drag all work
   or show a specific refusal. Chooser and drop share validation and source edits.
2. Import multiple assets without placing; same bytes store once, different bytes
   with equal names receive distinct paths. Invalid files, failed reads, Escape and
   stale revisions leave source, assets, selection and history unchanged.
3. Add an image at the agreed position/size, select its real layer/bar, move it,
   replace it with portrait/landscape art while retaining the box and aspect fit.
   Replace a catalog logo, imported SVG image and created image through Properties.
4. Rename/move assets updates defaults and HTML/CSS/JS references. Used removal
   refuses visibly; unused removal succeeds. Each action is one undo/redo.
5. Save and reopen through the real UI. SPX, CasparCG and OGraf packages contain and
   execute the same edited artwork and operator image bindings without local paths.
6. Baseline browser probe and written-first spec run on an unmodified-main snapshot;
   pure helpers have Node checks, guards are mutation-tested in Node/browser.
   Run all editor regressions as one queued job, E2E_WORKERS=3 affected suite, build,
   /check and /queue-merge. Verify deployed version and a real UI catalog/created
   layer walk before adding a desktop owner judgment item.

## Evidence

Baseline probe j-3066 passed on the unmodified-main snapshot (one test, 16.2 s).
Catalog, imported SVG and F4 each showed zero Image tools, file inputs and
AssetsPanel instances. Project only lists resources; an external file drop did
not add an asset. SVG's Artwork and Crest are recognized image parts.

The first probe (j-3064) recorded catalog/SVG but used a nonexistent stress fixture
name; it is superseded by j-3066. The first acceptance run (j-3065) lost its reused
server during teardown of the preceding run, so it is not a product verdict.
The written-first run j-3067 fails on the absent Image tool and image-add input
for catalog, SVG and F4. Its template-search test had an incorrect Finish selector,
corrected before the final baseline job j-3073.

The complete probe in j-3073 passes (one test, 15.5 s) on catalog, imported SVG,
F4, imported raster, a created rectangle and a catalog logo. All have zero Image
tools, file inputs and AssetsPanel instances; raster/SVG artwork and the catalog
logo have zero replacement controls. Each external file drop leaves assets
unchanged. The corrected template-search acceptance test fails on the missing
Image tool after reaching Hairline's new editor through the real Finish door.
Raw output: [baseline.log](baseline.log), [written-first.log](written-first.log).
An independent snapshot holds application source at unmodified main throughout.

The owner's drop decision above is implemented. The initial complete acceptance
run j-3078 passed 12 checks, including decoded replacement, undo, save/reopen and
executed SPX, CasparCG and OGraf operator image updates. CasparCG's existing
single-file picker sends embedded bytes; SPX and OGraf folder packages use paths.
j-3081 passed 15 checks (46.4 s), adding the real template-search Hairline task,
SVG, font and Lottie resource import and cancellation during existing-asset decode.

Guard mutations j-3080 and j-3083 killed 31/31 mutants. The unmodified controls
passed first. Each mutation runs alone through the queue, waits two seconds after
each source write, and restores its source before the next. Both jobs reported
all mutated sources restored byte-for-byte. Reproduce with
`npm run queue -- "node docs/research/editor-r1-2b-3/mutations.mjs" --cost 0.5 --cap 30`.
j-3082 matched zero cases because Windows quoting truncated its command; it is
not counted as evidence, and the harness now refuses an empty named selection.

The held In endpoint uses the timeline format's last stored millisecond for the
new image's arriving visibility span. This keeps it visible at the hold while
preserving the existing motion data and its millisecond precision. Image bindings
carry the chosen extension and asset folder, including SVG files.

Final regression, affected-suite, build and landing evidence follows below once
those checks complete. Physical host and owner judgment are not claimed.
