---
v: 2
source: owner
kind: finding
raised: 2026-08-29
state: advanced
note: >-
  2026-09-10 evening: the mechanism half is FIXED, in a601a68b (the callers and the guard tests)
  and 392c3e0f (banding both warnings to the widths the topbar was measured at), on
  claude/cc-validate-project-format. validateProjectFormat now has callers at both ends - a derived
  mark on the live format label and a word on the save status - and two tests in
  e2e/project-format.spec.ts pin all three call sites. What stays open is only how a template came
  to hold 1880: the import road is named below as a measured candidate, but proving it needs the
  graphic and the owner does not remember which one it was.
found: "screenshot of the failing editor showing `headline · 1920x1880 · 25 fps` in the header and in the resolution chip (owner's machine, not a paraphrase - the number is off the screenshot)"
---
# A graphic came up in the editor at 1920x1880

**Filed:** 2026-09-02. **Source:** owner screenshot 2026-08-29, split out of
`editor-blank-stage.md` when that report's actual cause was found and fixed.

## Why

1880 is not a project format this app offers. A design composed for a 1080-tall frame inside an
1880-tall canvas is a layout nothing here has ever been measured against, and the number reached
both the header and the resolution chip, so whatever produced it produced a *persisted* value, not
a display glitch. If a resolution can drift by roundtrip, saved graphics can drift silently, and
the 2026-09-12 student production is a room full of saved graphics.

The reason it is filed rather than chased: it was the leading hypothesis for the blank editor
stage, and it was wrong. The blank stage reproduced on the deployed site at an ordinary 1920x1080,
on a plain catalog House Strap made through the wizard, and its cause was a minified-name mismatch
in `preview/composeDocument.ts` (fixed 2026-09-02, `claude/a-play-in-production`). So 1880 is now
an unexplained observation with no known symptom attached to it, which is exactly what the shelf
is for.

## Traced 2026-09-10, and half of it is now explained

Walking the receipts with the owner, he could not place this one and wondered whether dictation
had mangled it. **It had not**: this receipt was written off a screenshot, so the app really did
display 1880 on his machine on 2026-08-29.

Three things fell out of tracing where the header gets its number.

1. **The header renders `template.resolution` raw** - `src/components/AppShell.tsx:340`,
   `{template.resolution.width}×{template.resolution.height} · {template.fps} fps`. It is not a
   second source that can disagree with the record, which was one of the two hypotheses below.
   Whatever the header showed, the template really carried.
2. **The wizard cannot produce 1880.** Every resolution it hands a new graphic comes from
   `resolutionForSelection` in `src/model/projectFormat.ts`, which resolves an id against a fixed
   catalog of project formats and falls back to the first format of the chosen aspect when the id
   does not match. There is no arithmetic in that path and no user-entered number. So the value
   arrived on an already-persisted template rather than being chosen in the wizard.
3. **Nothing ever checks a resolution against that catalog.** `validateProjectFormat()` exists in
   the same file, and its whole job is to answer this: it returns
   `Unsupported project resolution 1920×1880.` for exactly this input. **It has no callers
   anywhere in `src/`.** It is dead code. That is why a resolution nobody offers reaches the
   header, the chip and a saved record without one word of complaint.

**Point 3 is worth fixing whether or not the original graphic is ever found**, and it is the part
that protects the 2026-09-12 student production: a room full of saved graphics with no check that
any of them carries a format the app supports. Calling the validator where a template is loaded and
where one is saved turns a silent wrong number into a stated one.

What is still unexplained is how a template came to hold 1880 in the first place. The candidates
are an imported or converted graphic carrying its artboard size, a hand edit of the code, which is
canonical and editable by design, or a record predating the current format catalog. Naming which
one needs the graphic.

## Fixed 2026-09-10 evening: the validator has callers

Point 3 landed on `claude/cc-validate-project-format`. The reproduction came first - seeding the
autosave slot with 1920x1880 and reloading put `1920×1880 · 25 fps` in the header and in the chip
with nothing complaining, which is exactly the owner's screenshot reached from a spec.

**Nothing refuses**, and that was the call worth making. Refusing to open loses the reader's work
and refusing to save strands it; what the catalogue can detect is that a format is UNKNOWN, not
that the document is broken. The graphic still opens, renders, saves and exports. So:

- **The load half is ONE derived call.** `src/components/ProjectFormatMeta.tsx` reads the LIVE
  working template and is rendered by both surfaces that already print the format - the topbar meta
  (`AppShell.tsx`) and the canvas chip (`PreviewFrame.tsx`). Deriving it covers boot restore,
  opening from the library, an import, a cloud pull and a hand edit of the code at once, instead of
  instrumenting the ten-odd load doors and missing the eleventh.
- **The save half is a word, not a refusal.** `store/saveActions.ts` validates in BOTH save doors
  (`saveCurrentGraphic` and `saveGraphicAs`) and the status beside the Save button reads
  `⚠ Saved · unsupported format`, with the validator's sentence in its title. It gets its own
  class rather than reusing the dirty one, because `save-status-dirty` wears the ● that means
  "your work is not written" and the record here IS written.
- **The topbar is width-banded, and the first attempt got that wrong.** The header's format line
  is hidden below 1400px because the bar's widths were measured element by element, and a
  signed-in 1366 bar has about 70px of slack against a 140px line. The first version overrode that
  hide on the grounds that a warning is not decoration - which would have put the account avatar
  back off the right edge, in the one state `configured/signed-in-ux.spec.ts` never reaches. The
  code review caught it. So the header line stays hidden below 1400 and the save word drops its
  reason there too, keeping the ⚠; the canvas chip carries the full warning at every width.
- **Three call sites, three mutation tests.** The two tests at the end of
  `e2e/project-format.spec.ts` were each run with one call removed on purpose: the load one fails
  as `Expected "⚠ 1920×1880 · 25 fps" / Received "1920×1880 · 25 fps"` - the reproduction's own
  signature - and each save one fails as `Expected "Saved · unsupported format" / Received "Saved"`.

Not done, deliberately: nothing OFFERS to fix the format. There is no format control for an
existing graphic (`ProjectFormatPicker` appears only in the creation wizard and in video settings),
so the tooltip says what the number costs rather than sending the reader to a door that is not
there. "Put this on 1920×1080 for me" is a real feature and it is not this change. The VIDEO
shell's own format line (`VideoAppShell.tsx`) is unguarded the same way and was left alone: a video
project is a different record with its own picker, and widening the row to cover it would have
mixed two subjects in one branch.

## The IMPORT road is a live candidate, measured 2026-09-10

Tracing on 2026-09-10 said the wizard cannot produce 1880, which is true, and left the origin open.
Measured in the page that evening, the import road CAN carry it. `detectAuthoredFormat`
(`src/model/importTemplate.ts`) reads an unambiguous root canvas straight out of the source, and
`importedResolution` a few lines above it deliberately KEEPS a size the catalogue does not offer
rather than snapping it, labelling it `Imported (1920×1880)`. Fed
`body { width: 1920px; height: 1880px }` it answers exactly `1920x1880`, `certain: false`.

That is a road, not a verdict. In the same probe `importHtmlTemplate` alone still produced a
1920x1080 template, because the source stated no frame rate and the uncertain path falls back to
the selected project format; whether 1880 survives depends on what the reader accepts at the
import step, which was not walked end to end. Worth walking if the origin ever matters again -
and much less urgent now that such a graphic announces itself on screen.

## What it would take

Only the unexplained half is left, and it needs a graphic with that resolution to look at. Two
cheap reads when one turns up:

- Does `1920x1880` survive a save/load roundtrip, or is it produced by one? `model/layout.ts`
  carries the versioned format and its migration-on-read, so a roundtrip test is a few lines.
- Is the header/chip reading `template.resolution` or a project-format record that can disagree
  with it? Two sources that can differ is the shape that produces a number nobody chose.

Otherwise: ask the owner for the graphic. A screenshot names a value; the saved record explains it.
Asked on 2026-09-10; he does not remember which graphic it was, so that road is probably closed.
The validator call was the whole remaining FIX and it has landed, which means the next graphic that
carries an off-catalogue format announces itself on screen rather than being noticed in a
screenshot a fortnight later. That is the road this receipt now waits on.

## Evidence

The owner's 2026-08-29 screenshot: header `headline · 1920x1880 · 25 fps`, the resolution chip
repeating it, zoom 100%, backdrop `Trans`, document `Saved` and `Synced`. Everything else in that
screenshot is accounted for by the composeDocument bug and is not evidence of anything here.
