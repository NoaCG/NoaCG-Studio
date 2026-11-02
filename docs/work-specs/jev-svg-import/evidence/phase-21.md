# Phase 21: Qualify continuous roll playback

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset, verbatim:

- AC-13: "Imported credits styling supports roles above/beside, multiple names and
  static/roll/cards, with defined overflow and source/animation identity. Fixed artwork remains
  compatible."
- Row 21: "Both editable layouts enter/exit fully, measure after fonts settle and replay
  consistently. The separate exact-artwork roll retains its existing bounds and motion
  assertions."

## Pinned main

Worktree from `ca4d037d2ce2bfe7202eea822184da4c1039f43e` (PR #1962, fix #1958). Previous verified
main: that SHA. CI (push and merge group), configured-suite, Post-landing, Quarantine and Push on
main all succeeded on it.

## What was found first

A browser probe built both styled layouts (credits-1 role above, credits-2 role beside) with the
Drop, Rise and Pop entrances, took each twice, and read where the rows stood at the start and the
end of the roll against the frame.

- With faces that are already there, both layouts entered from the frame's bottom and left at
  its top to the pixel, and a second take measured the same roll (Pop within 0.7 units, from the
  glyph metrics of the scale in flight).
- With the design's own face still loading at the take, the take measured the rows in the
  fallback face and never measured again. When the face landed, the rows grew, so on air:
  - role above: the first row started 6 px inside the frame, the last row ended 5 px inside it;
  - role beside: 9 px at the start, 4 px at the end.
  The second take measured in the face, so the two takes also differed (1165 against 1176 units).
- The fixed-artwork roll already waits for the entrance and the faces (row 16), and its
  multi-layer block (#1962) entered and left the output whole after every entrance.

## What changed

- `creditsRoll.ts`:
  - `styledCreditsConfig` sets `faces` when the design ships faces of its own (a bundled or
    custom face in `svg.fonts`, the ones `svgFontCss` declares). These are the faces the
    template itself loads; a family it does not ship is whatever the playout machine has
    installed, which does not load late.
  - With `faces`, the styled take carries `creditsSettle`: if the faces are still loading at the
    take, when they land the take is measured again in them and carries on from the share of the
    roll it had reached, paused if it was. A new take or Out in between leaves it alone.
  - `faces` only chooses lines; it is kept out of the emitted spacing table. Without it the
    runtime is byte for byte what it was, so the editable roll, the artwork roll, the plain
    imports and row 19's five role-above builds keep their pins, and so does every saved styled
    graphic whose drawing ships no face.
- `creditsArtwork.ts`: unchanged. Its bounds and motion are now asserted for the block too.

## Evidence per criterion

| Criterion | Evidence |
|---|---|
| Both editable layouts enter fully | e2e "styled credits, role above and role beside, enter and leave the whole frame…": credits-1 (role above) and credits-2 (role beside) in Anton, after Drop, Rise and Pop. At progress 0 the rows' top is at the frame's bottom, within 0.5 px, and not above it |
| Both editable layouts exit fully | Same test: at progress 1 the rows' bottom is at the frame's top, within 0.5 px, and not below it. Halfway is halfway |
| Measure after fonts settle | Same test: the face is held until the take has measured in the fallback, then released. The take measures again (`noacgCreditsLast.distance` changes), keeps its progress, and the bounds above are read after that. Mutations: settle disabled, and settle restarting from 0, each fail (j-0007, j-0008) |
| Replay consistently | Same test: Out, then Take again, in each layout and entrance: the same distance within 1 unit, and the same bounds |
| Exact-artwork roll keeps its bounds and motion assertions | The row-16 tests (single text: Drop, Rise and Pop bounds, the font-wait cancel, the whole-frame roll and replay) pass unchanged. New: "fixed-artwork credits drawn as separate layers enter and leave the whole frame as one block…": credits-1 and credits-2 kept as artwork (#1962), after each entrance, twice: the block's top starts at the output's bottom and its bottom leaves at the output's top, within 0.5 px, every layer travelling the same distance |
| Fixed artwork and saved graphics compatible | `imported-credits-model` pins (editable, artwork, three plain drawings) and `ROLE_ABOVE_PINS` pass unchanged. No catalog design is touched |

## #1937, inline opacity on a source in its own group

Not reachable, a documented safe limit with a test. The import moves every inline style onto a
class before anything reads the markup (`svgImport.ts`, `hoistInlineStyles`), so no source layer
of an imported drawing carries an inline `opacity` or `text-decoration` for its copies to keep.
The class it gets is a single-class rule, which the roll's own row rule outranks. Test "a source
layer drawn with its own inline opacity, in a group of its own, rolls at both opacities
multiplied": a role drawn `style="opacity:0.8;text-decoration:underline"` in a group at 0.5 rolls
at 0.4, underlined. A fix in the runtime was written and removed, since nothing reaches it.

## Decisions

- **Measure again when the faces land, rather than hold the take for them.** The take is called
  at the start of the entrance. Holding it would leave the rows at rest, on air, until the faces
  land; measuring again keeps the roll moving from its cue and puts the list where it belongs as
  soon as its real size is known. The artwork roll keeps its own wait, which hides the drawing.
- **Only where a face can arrive late.** A design that ships no face has nothing to wait for, so
  its build is unchanged; this keeps every pin, as the brief requires.
- **The export does not wait for faces at build** (#1937's second question). The build reads the
  binding to choose styled or editable; on air every row is placed after the faces land (load,
  `document.fonts.ready`, and now the take). Phase 16's limit stands.
- **Ordinary review scenario.** One measured call added to the take; no state rule changes.

## Verification on this worker

- Browser, through the job queue: the three new tests (j-0006), the mutation runs (j-0007,
  j-0008, each failing as expected), and the whole `e2e/import-svg-credits.spec.ts`, 13/13 (j-0009).
- `node --test scripts/imported-credits-model.test.mjs scripts/imported-credits-source.test.mjs`:
  57/57, pins unchanged.
- `npx tsc --noEmit -p .`, `npx eslint` on the changed files: pass.
- `npm run gates -- run --changed origin/main`: pass. `check-e2e-protection --changed origin/main`: OK.

## Review rounds

- `/check` on the head before `3ecdf53` (delegated review, 9 findings; 3 fixed, 6 kept):
  - Fixed: the test's held font kept one resolver and could release before this document's
    request arrived (now every request is held and the release waits for this one); a paused roll
    resumed when the faces landed (now it stays paused); these notes overstated what can arrive
    late (worded into Known limits).
  - Kept: settling on every styled roll and in the legacy editable roll would move the pinned
    bytes the brief keeps fixed (#1965 for the legacy roll); the second render when the faces land
    is the load-time hook's, harmless; a second measure with nothing to measure stops the roll,
    as any take does.

## Known limits

- A face that starts loading only after the take (none in practice: the rows are laid out at
  load, which requests it) is not waited for.
- A face loaded by something other than the template (a playout page injecting a web font the
  drawing names) is not watched: the design's build does not know of it.
- The legacy editable roll (saved credits from before the original-artwork marker, and a stale
  styled binding's fallback) shares the take but not the second measure: its bytes are pinned
  and its builder (`creditsRollRuntimeJs(prefix)`) receives no design. Follow-up: #1965 (P3).
- If the second measure finds nothing to measure (the list emptied at that moment), the roll
  stops where it is, as a take that cannot measure does.
- Row 19's and 20's limits stand.

## Follow-ups

- Rows 22 and 23 (#1937): static and cards; row 24, live Sheet updates.
- #1955 (P3): the editable roll's list holder through the formatter.
- #1965 (P3): the legacy editable roll does not measure again when a face lands after the take.

## Revert

On a fresh branch from `origin/main`, landed through the merge queue:

    git revert -m 1 "$(git log origin/main --merges --format=%H -1 --grep='claude/plan-jev-svg-import-21-build')"

A revert removes the second measure: a styled roll whose face lands after the take again starts
and ends a few pixels inside the frame. Nothing saved changes.
