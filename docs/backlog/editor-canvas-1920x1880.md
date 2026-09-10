---
v: 2
source: owner
kind: finding
raised: 2026-08-29
state: advanced
note: >-
  2026-09-10: the owner could not place the report and guessed dictation had garbled it. It had
  not - the number was read off his screenshot. Tracing it found the mechanism half: nothing
  validates a template's resolution against the catalog, because validateProjectFormat has no
  callers. The graphic that showed 1880 is still unidentified.
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

## What it would take

Nothing until a graphic with that resolution exists to look at. Two cheap reads when one does:

- Does `1920x1880` survive a save/load roundtrip, or is it produced by one? `model/layout.ts`
  carries the versioned format and its migration-on-read, so a roundtrip test is a few lines.
- Is the header/chip reading `template.resolution` or a project-format record that can disagree
  with it? Two sources that can differ is the shape that produces a number nobody chose.

Otherwise: ask the owner for the graphic. A screenshot names a value; the saved record explains it.
Asked on 2026-09-10; he does not remember which graphic it was, so that road is probably closed and
the validator call is the whole remaining fix.

## Evidence

The owner's 2026-08-29 screenshot: header `headline · 1920x1880 · 25 fps`, the resolution chip
repeating it, zoom 100%, backdrop `Trans`, document `Saved` and `Synced`. Everything else in that
screenshot is accounted for by the composeDocument bug and is not evidence of anything here.
