# Re-measured 2026-09-07, after `src/components` migrated

The fourth area, and the first read under the owner's question from
`docs/backlog/are-the-big-contracts-still-worth-loading.md`: not only "is this paragraph true", but
"is it still worth anybody's first tokens". `src/components/AGENTS.md` was chosen for its
multiplier: ten instruction chains load it, the largest one left after `src/ai`.

| Metric | After `src/components/wizard` | After `src/components` |
|---|---|---|
| Contract corpus | 521,467 B / 105 files | **514,392 B / 104** |
| Hand-written bytes | 467,883 B / 102 files | **441,613 B / 100** |
| `src/components/AGENTS.md` | 26,225 B | **19,195 B** |
| Chains loading it | 10, each paying 26,225 B | **10, each paying 19,195 B** |
| Its own tightest chain (`wizard/`) | 75,604 B, 34,396 free | **68,574 B, 41,426 free** |
| Compiled layer | 632 B launch, 114,281 B scoped | 632 B launch, **138,965 B scoped** |

The `src/ai` chains are untouched and remain the tightest in the repository; that row is running
in another session.

## What a session actually pays now

For Codex, which reads `AGENTS.md` directly, the saving is the table above: 7,030 bytes off each of
ten chains, 70,300 bytes across the tree.

For Claude Code the shape of the cost changed rather than only its size. Opening any file under
`src/components` used to load the whole 26,225-byte contract through the directory's `CLAUDE.md`.
It now loads `.claude/rules/src-components.md` - **2,775 bytes, seven rules** that genuinely bind
every component - and the rest of the area's 24,684 compiled bytes arrive only with the file they
name. Thirty-seven of the forty-four rules name one component or two.

## The three outcomes

**44 rules written. 4 claims found false. 17 units true but not migrated.** The ratio the backlog
note asked for is roughly 2.6 rules kept per unit retired - this file was denser than
`src/components/wizard`, but a sixth of it was navigation rather than content.

### False - checked against the code, not migrated as written

1. **"Default: code left, Inspector + the tool panels right."** `DEFAULT_LAYOUT` in
   `src/model/layout.ts` opens with the LEFT and BOTTOM docks empty and the `code` panel closed;
   the comment above it says why (the view is optional, and a Monaco pane across a third of the
   window says the opposite to a first-time reader). The rule
   `components/open-inspector-tool-panels-right-dock` states the shipped default.
2. **"loadLayout migrates any non-v2 layout to the default."** The layout format is at version 3.
   `loadLayout` accepts version 2 AND version 3, and migrates a v2 layout by adding the `assets`
   panel rather than discarding it; only some other version falls back to the default.
3. **"Long text, images off-design, and off-shape templates keep the definition-only add."**
   There is no definition-only add any more. `SampleDataPanel.addField` tries `addPlacedLine` /
   `addPlacedImageSlot`, then `addCatalogLine`, and REFUSES with an explanation if neither can
   land a real element - the fallback was removed because a field nothing on screen answers is
   exactly the defect `scripts/field-coverage.mjs` exists to catch.
4. **"render/RenderPanel takes the same three props."** It takes `template`, `sampleData` and
   `validation`. It has no `graphicId`; that prop is `ExportSurface`'s, and `ExportSurface` takes
   six props, not three. The store-free part of the claim is true and is now a rule.

A fifth was stale by counting: the opening paragraph said **eight** subdirectories own their own
contract and listed them, when there are nine - `teams/` was never added - and said each has a thin
`CLAUDE.md`, which stopped being true of `wizard/` the day that area compiled. That is the
retirement argument for the whole paragraph, below, rather than a claim worth correcting.

One paragraph was **incomplete rather than false** and was corrected on the way in: the spaceKey
section said the pan takes Space from a focused button and "play never does". `StepTimeline` still
stands down for a focused button, but a Space TAP over the stage now plays from `PreviewFrame`
itself - a HOLD pans, a TAP plays - which the contract predates.

### True, but no longer worth loading - the owner decides these

Not deleted: all seventeen are in `contracts/records/components/2026-09-07-the-contract-this-replaced.md`
verbatim.

**Eight of them are pointers, and that is the finding.** One section each for `canvas/`,
`timeline/`, `fields/`, `style/`, `home/`, `video/`, `wizard/` and `auth/`, saying that the
directory has its own contract which loads when you work in it. Around 3.2 KB - a sixth of the file
with the preamble - spent on a table of contents. Claude Code loads a nested rule by scope whether
or not anything points at it, Codex is told by the root contract to read the nested `AGENTS.md`
before editing an area, and `docs/ARCHITECTURE.md` §8 is the map. A pointer is the one kind of
content that is pure overhead in a file every session in the area reads.

The rest:

- **The preamble's loading mechanics** - that Codex reads this file directly and Claude through a
  `CLAUDE.md` import, and where the store-side and patcher-side halves live. The compiler writes
  the header now, and which files load together is measured by `check:shared-instructions`, not
  described by each area.
- **The preamble's placement instruction** - "when the chain runs short, MOVE a section into the
  directory that owns the files it describes". A rule's `scope` decides which contract it lands in,
  and the compiler puts it there. Nobody relocates a section by hand again. (This is also the
  paragraph that went stale by one directory.)
- **The canvas restatement** - "every gesture commits as ONE undoable `applyTemplate`".
  `src/components/canvas/AGENTS.md` says it where the gestures are written. The other half of that
  section, selection being editor UI state only, IS migrated, because it binds every component.
- **Both timeline restatements** - the `blocks/animData.ts` splice as one undoable apply, and the
  dock picking its surface from the CODE rather than the category. Both are in
  `src/components/timeline/AGENTS.md`.
- **The pasteboard paragraph** in the PreviewFrame bullet. `src/components/canvas/pasteboard.ts`
  opens with a longer and better version of the same thing, including the catalog measurement
  behind the number. The reader who needs it is opening that module.
- **"CanvasGuides - the alignment guides drawn over the stage."** A name and a gloss, no rule.
- **"export is not a reward for opening the editor"** - the root `AGENTS.md` states it in the
  creation-flow section, which every session already loads.
- **The component roll-call** - CommunityGallery, ModerationQueue, SyncStatus, SettingsDialog
  listed with an emoji each and nothing binding attached. The analytics sentence beside them IS
  migrated.

## One rule that wants a mechanism

`components/keep-packages-out-they-retired-every` is a contract rule doing a gate's job. The
product retired packages in the student release, and three topbar tooltips were still offering
them a month later - which is exactly the failure a rule in a file cannot catch and a check can.
`docs/WORKFLOW_ARCHITECTURE.md` §5.3 already designs the mechanism, `contracts/retired.json` plus a
freshness check that refuses a retired name, but it names contracts and workflows rather than UI
copy, and neither the file nor the check exists yet. Building it is its own change; until then the
rule carries `fires: contract`, which is what puts it on the compiler's mechanism-wanted report.

## What this says about the question

The wizard row's retirements were mostly history. This file's are mostly **structural**: it had
become the index for the eight contracts beneath it, and an index is exactly what a machine-loaded
instruction chain does not need. Two of the four false claims were also structural - a default and
a migration path described from memory of an older shape.

If the next big area retires the same way, the answer to "did these files grow because the product
got more complicated, or because nothing ever left them" is neither: they grew because each one
took on the job of explaining the files around it.
