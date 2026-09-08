# `src/model` moved into the rule store, and cost more bytes than it saved

Branch `claude/a-model-contract`, from `origin/main` at `684e2bf2`, two commits ending `e13f968a`,
queued for landing. Phase 2b's row for `src/model`, the largest hand-written contract left in the
tree. Every measurement: `docs/metrics/2026-09-08-model-contract-migrated.md`. The replaced prose,
verbatim and annotated: `contracts/records/model/2026-09-08-the-contract-this-replaced.md`.

## What landed

`src/model/AGENTS.md` is now generated from **70 rules** under `contracts/rules/model/` - 25
invariants, 5 traps, 40 rules - with a record each. `src/model/CLAUDE.md` is gone, the directory
carries its own generated `.gitattributes` naming the `noacg-contracts` merge driver, and the audit
(`node scripts/contract-migrate.mjs audit --contract src/model/AGENTS.md --since origin/main --area
model`) reports all 173 of the contract's backticked tokens surviving in the 404 the store now
carries, with no written drops.

**Nothing was left as prose.** Every bullet in the file became rules plus a record, so there is no
half-migrated remainder for a later row. Six modules had no bullet to migrate - `googleFonts.ts`,
`googleFontsIndex.ts`, `storageHealth.ts`, `structuralIntent.ts`, `templateSet.ts` and
`templateVocabulary.ts` - and I did not invent rules for them; they are named in the metrics file as
the gap they are.

## The row's own headline is a negative number

`src/model/AGENTS.md` went **31,556 -> 32,502 bytes**. It got BIGGER. The chain (root + `src/` +
this file) came out 270 bytes ahead only because `src/AGENTS.md` lost 1,216 bytes to rules finding a
deeper owner, and `src/model` has no subdirectories, so there is no multiplier to collect.

The Claude-side number is the one that moved: opening any file in the directory used to load all
31,556 bytes through `CLAUDE.md`. It now loads **nothing directory-wide** - every one of the seventy
rules names exactly one module, so there is no `src-model.md` group at all - and the module's own
rules arrive with the file. Median **737 bytes**, worst 3,590 (`videoTypes.ts`).

Why it went this way, because it is the useful part: `src/blocks` shrank 27% because its contract had
become a changelog for itself. This one had not. It was 358 lines of dense present-tense rule kept
accurate by people who cared, and compiling it cost about what it saved - roughly 70 bytes per rule
of id and kind label, against the evidence I could honestly move into records. **A well-kept
contract does not shrink when you compile it. It stops being loaded by people who do not need it.**
If the plan's next rows are picked by size alone, that is the wrong sort: pick by how much of the
file is history, and by how many chains load it.

## Seven claims were false

All seven are quoted against the code in the replaced-contract record. The two worth knowing tonight:

1. **"`graphics` order IS the layer stack, in PAINT order."** False since a pool graphic gained a
   layer NUMBER the operator types. Every z-order consumer reads `graphicLayer(g)`; array position
   decides nothing. A session reaching for a way to restack a production would have reordered the
   array and watched nothing move. The neighbouring claims were false twice over - neither display
   surface reverses anything, and `moveShowGraphic` is dead code. Filed:
   `docs/backlog/dead-move-show-graphic-and-its-contract.md`.
2. **"every path that can retarget a typeface calls `ensureFontFace`: `templates/shared/base.ts` at
   build, ..."** `ensureFontFace` has no reference anywhere under `src/templates/`; `base.ts` emits
   the face CSS instead. The distinction is the whole rule: the guarantee is needed where a variable
   is retargeted AFTER the build.

The rest: the alias merge takes four tables, not three; `accentInk` resolves to the panel colour in
five of six families, not three of four; the occasion ceiling is gated in
`src/templates/templateMeta.ts`, not where the contract said; `mergeVideoInputs` cannot receive the
`null` the contract told providers to send, because that decision is at the call site; and the
legacy brand key IS still written, by the sync seam's put. Two smaller drifts: a conflict copy
strips five fields, not three, and `src/model/wizard.ts` has 620 importers under `src/`, not 619.

Three stale comments in the source were corrected on the way in - `shows.ts`'s "the graphic POOL, in
layer order", `themeTokens.ts`'s "the other three panel on a near-black", and `importTemplate.ts`'s
"Make SPX-ready" (the button says "Make it playout-ready", and there is no Motion panel either -
motion lives in the Inspector).

**How they were found**, because the method is the transferable part: every claim describing a
control, a default or a UI affordance went to a read-only agent with the instruction to answer
TRUE/FALSE with `file:line`, in two batches of a dozen. Twenty-seven claims checked, seven false.
Nothing about the false ones looked different from the true ones in the prose.

## Two things the next row should know

**A `fires:` declaration silently removes a rule from every loaded surface.** Four rules were written
with `fires: test:<spec>` because a spec genuinely pins them. The compiler treats a rule whose named
mechanism EXISTS as *carried* and prints it only in `contracts/index.md` - not in the directory
contract, not in `.claude/rules/`. That is the design (§5.3, "an executable rule's sentence has one
home"), and it assumes the mechanism prints the text through `rules.text(id)`. None of these specs
does. I caught it by diffing the rule files against the compiled contract, not by any gate. All four
were rewritten to `fires: contract`. **Until a mechanism actually carries the sentence, `fires:` is
a footgun; `src/blocks` used `contract` for all sixty-nine of its rules and that is the safe
default.** The gate worth building is the compiler refusing a carried rule whose mechanism file does
not contain `rules.text(<id>)`.

**A caller-facing rule has no good home.** `commitDurableWrites()` is a rule addressed to callers,
and every call site is under `src/components/**`, which never loads a `src/model` rule. Widening the
scope to include the callers would move the rule's owner up to `src/` - loaded by 51 chains - which
is the cost this whole phase exists to remove. Same shape for the cross-tab mirror trap and the
field-descriptor rule. This is pre-existing (the prose had the identical problem) and I did not
change it, but the owner model has no answer for a rule that binds two directories without landing
in their common ancestor. Worth a design row.

## `/check`

- `review: delegated` - the code-review skill at level `high` returned findings into this session
  and they matched this branch's scope. Four findings; three fixed in `e13f968a` (a rule naming two
  identifiers that are not exports, including `legacyBrandOffer`, which has NO callers anywhere; a
  rule duplicating `ai/let-preselect-only-require-user-choose` on the same scope, so both rendered
  as consecutive bullets in one loaded file; a wrong signature in the backlog row). The fourth is
  the caller-scope finding above, reported rather than fixed for the reason given.
- `simplify: inline` - the skill returned fan-out instructions, so the pass was done here. One
  finding, the duplicate rule, already fixed under review.
- `verify: build green`, read from its own exit code. **`e2e: not run`** - the only source edits are
  inside comments, so the emitted code is unchanged; the three `.ts` files are otherwise untouched.
- `taste: not applicable` - nothing here can move what a graphic looks like.

## Filed, not fixed

- `docs/backlog/dead-move-show-graphic-and-its-contract.md` - the dead reorder function, plus the
  design question it exposes: if a production IS reordered by dragging, the gesture has to write
  layer numbers, and the production page already shows the number and warns on a clash, which
  argues for typing instead.
- `legacyBrandOffer` and `dismissLegacyBrandOffer` in `src/model/brand.ts` have no callers. The
  brand creator's offer-the-old-look flow was designed and never wired. Not filed as its own row -
  it is one grep away from whoever next touches brand, and the rule now names the live path
  (`loadLegacyBrand`) instead.

## Nothing needs the owner

No question in this row was his: no money, no account, no identity, no alignment call. The one
judgement worth recording is that I did NOT invent rules for the six uncovered modules, because a
rule about a module nobody has read is worth less than an honest gap.

## Session

The branch is queued; nothing is left open in this worktree. `docs/metrics/` and the record hold
everything a later row would need to re-derive the numbers.
