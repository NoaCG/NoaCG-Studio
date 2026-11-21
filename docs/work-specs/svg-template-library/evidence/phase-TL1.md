# Phase TL1 evidence: audience pilot

Base: `main` at `fba398c20eba8d875a256472dd30cda3761c93c3`. Acceptance for this phase: AC-4 for
Join card, Vote results and Message; AC-10 for the pickers; AC-3 for the four pilot templates;
AC-9 for saved targets. Illustrator round trips are the owner's (TL1o) and are not counted here.

## AC-3: the four pilot templates

Join card, Live vote, Vote results and Message are hand-written SVG in the Clean Studio family
(Manrope, white plates, blue accent) in `docs/tutorials/svg-templates/SVG/`, listed in
`templates.json` with their recipe or contract, their package (`audience`), a described default
preview and their named states.

- Recognition is automatic for all four: Live vote and Vote results propose the vote recipe (their
  bars), the Join card's `QR` group gives the Join link field, and Message and the Join card propose
  no recipe. `e2e/svg-templates.spec.ts` imports each through the real door and asserts the
  proposed behaviour (`poll` or none) before putting it in a production.
- Controls: the same case drives each template on air. Vote: typed counts move the bars, Vote
  badge on while voting, Close voting takes it off, Show result prints 75%, Call the winner marks
  row 1 only. Join card: a phone reading the QR on air (decoded by `e2e/_qr.ts`) gets the Join link
  the cue holds. Message and Join card: retyped and long translated values update on air.
- One visual family and clean frames: `airProblems` finds no overlap, cut or frame overflow in any
  checked state.
- Previews: each template's default preview plus named states (Live vote: Result, Winner called;
  Vote results: Closed with result, Winner called), each with alt text, rendered by a one-off
  script on the house grey. `scripts/svg-files.test.mjs` holds the Audience package section to a
  described default preview and every named state, with no empty alt.
- Layer names follow `src/templates/behaviours/layer-names.json` (`npm run check:example-layers`).

Run: `npm run test:e2e -- e2e/svg-templates.spec.ts -g "(Join card|Live vote|Vote results|Message) template"`:
4 passed.

## AC-4: Join card, Vote results and Message in their pickers

- `e2e/production-audience.spec.ts` "saved Vote results and Message templates are offered in
  their pickers and each pick stages one working cue": both templates imported unchanged into one
  production (so saved to the library), then a second production's Interaction.
  - Results: the picker lists Saved designs before Built-in; a keyboard pick copies Vote results in
    (linked to the saved record) and adds one result cue. Stop finalises that cue; staging the same
    round again reports the final counts on the same cue. The copy holds exactly one cue (the
    seeded cue was filled, no blank one beside it) with the question, `Yes | 2` and `No | 1`,
    `3 votes · voting closed` and the `closed` token. Take shows Yes and No, the count line, no
    Vote badge; Show result prints 66.7%; Call the winner marks row 1.
  - Message: the Vote results copy is not offered (a vote board); the saved Message design is; a
    keyboard pick stages one cue with the body and the name, and Take airs both.
- Not met as worded, ruling needed: "results show row counts". On air the Vote results template
  shows each row's share of the staged counts (66.7%) and the total count line
  (`3 votes · voting closed`). The raw count per row is in the cue (`Yes | 2`, `No | 1`) but the
  artwork has no per-row count readout. Adding one needs a new derived value in the
  imported-design runtime, which belongs with TL2's compatibility check. The coordinator decides:
  accept the cue data plus share and total, or schedule a per-row count readout for TL5 or TL6.
- Retry without a duplicate: `scripts/audience-pickers.test.mjs` "a retry after a failed staging
  write fills the copy's leftover seeded cue". A built-in's leftover cue on retry is pre-existing
  (issue #2683).
- Join card: the browser journey needs a published link (the configured suite). Its rules are
  pinned in Node (`scripts/audience-pickers.test.mjs`): none offers the picker, one is used,
  several ask once and the pick is remembered, one Join cue per card (labelled Join card, else one with no link) is updated with the link, a stale pick asks again, an operator cue holding a link is kept,
  a copied design's seeded cue is the one filled. The QR encoding the link is the AC-3 case above.
  With no Join card and nothing saved, Add Join card adds the built-in as before.

Run: `npm run test:e2e -- e2e/production-audience.spec.ts -g "saved Vote results and Message templates"`: 1 passed.

## AC-10: pickers

- Every picker is plain buttons in tab order inside named groups; each button's accessible name
  says what it does, the design and where it comes from ("Results on Vote results, saved
  design"), made distinct even for designs sharing a name (`pickerItems`, Node test). The journey
  focuses a saved design by that name and presses Enter.
- Long names: picker buttons wrap inside their row (`.pd-aud-choose button`). Long translated
  samples fit the templates: German Label and Call to action on the Join card, a long name and
  message on Message, each checked clean on air.
- Alert level is TL5's (its recipe extension); not in this phase.

## AC-9: saved targets and earlier work

- `Show.joinTarget` is additive and optional, and like `resultTarget` and `wordTarget` it is
  not part of a publish. A show without it behaves as before. Node tests: a deleted remembered
  card falls back to the only card or asks; a card replaced by name keeps its id and stays the
  target unless it lost its Join link; a synced record's `joinTarget` decides with no question.
- Message targets: quiz boards are no longer offered, a Question-only card still is, and a
  remembered `messageTarget` on a quiz board keeps working (Node test).
- Result and word targets, field titles, recipe ids and persisted keys are unchanged. The
  existing audience journeys ran unchanged (below).

## Commands

- `node --test scripts/audience-pickers.test.mjs`: 11 pass.
- `npm run gates -- run --changed origin/main`: see the PR for the final run.
- `node scripts/template-coverage.mjs`: 101 rows, 38 covered (join-card, result-board,
  viewer-question, community-request, and the join-link, message and vote-results contracts).

## Owner checklist for TL1o (the Illustrator round trip)

1. Open https://noacg.studio/svg-templates#audience and download the four SVGs: Join card, Live
   vote, Vote results, Message (or the whole templates zip on the same page).
2. Install Manrope if Illustrator shows pink text. Open each SVG in Illustrator.
3. Change colours, fonts and shapes as you like. Keep the layer names (Text, Moments, Board and
   names such as `QR`, `Option 1`, `Bar 1`, `Vote badge`, `From`, `Message`). Keep text live.
   Moments stay hidden.
4. Save a Copy as SVG (Use Artboards, Font: SVG).
5. In NoaCG, Import graphic and drop each file. Check: Live vote and Vote results show the live
   vote behaviour; Join card and Message show none. Put each in a production (this saves it).
6. In a different production, open Interaction:
   - Publish, then Add Join card to rundown: pick your Join card under "Add a saved design". Take
     it and scan the code with a phone: it opens the production's join page.
   - Put a multiple-choice question live, vote from a phone, Add results to rundown: pick your Vote
     results. Take it, then Close voting, Show result and Call the winner.
   - Paste a message with a name and Prepare: pick your Message. Take it.
7. Check each looks like your edit, nothing is cut off, and no blank or second cue appeared.
