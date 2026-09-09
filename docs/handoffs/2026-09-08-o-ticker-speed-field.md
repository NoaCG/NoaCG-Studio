# Session O - the speed field the tickers never got

**Branch** `claude/o-ticker-speed-field`, from `e7eecdcf` (main after PR #160). Four commits: the
field and its wiring, the id collision the review found, the live speed change the owner walk
found, and the metadata fix CI found. Queued through `/queue-merge`.

Each of the three defects came from a different instrument, and none of them from the build being
green - which is the argument for running all three.

The owner asked on 2026-08-28 that "anything with scrolling graphics should have a speed setting
in the control panel". End credits got it on 2026-09-06 and the tickers never did. They have it
now, and the receipt is closed: `docs/backlog/scrolling-speed-and-through.md` is deleted in the
first commit, so `owner-receipts.mjs --closed` will find it there.

## What `motionSpeed()` turned out to be, which is what the row turned on

The brief warned that the backlog file said to "multiply tickerMarquee()'s 140 px/s by it" while
`tickerMotion.ts:64` already read `140 * motionSpeed()`. Both are right, because they are talking
about different knobs.

`motionSpeed()` is the **author's**. It comes from the `NOACG_ANIM` data block
(`src/templates/shared/base.ts`, `motionSpeedJs`), the Animation panel writes it, and it is baked
into the template when the graphic is made. An operator with a control page in front of them
cannot reach it. The end-credits work introduced `creditsSpeed()` as a separate read from a named
field for exactly that reason, and this does the same: `tickerSpeed()` reads the operator's field,
and `tickerMotionSpeed()` is the product of the two. Every builder now reads that one function, so
the two knobs can never disagree.

So the hook that existed was never the thing the owner asked for, and the backlog file's
instruction was right for the wrong reason.

## Which designs got the field, and which did not

**Fifteen of twenty-two.** The fourteen marquees (tk01, tk02, tk04, tk05, tk06, tk11, tk12, tk13,
tk14, tk15, tk16, tk17, tk20, tk22) get `Scroll speed (%)`; tk03 Glass Flip gets
`Item speed (%)`. tk04 offers both presets and gets whichever title matches. `number`, default
`100`, clamped 10-400, in a hidden `.noacg-data-source` holder, appended last.

**The seven rotators get none** - tk07, tk08, tk09, tk10, tk18, tk19, tk21. This is the same
carve-out the static credits board has, and the reason is mechanical rather than stylistic: their
cadence is a state-machine timer (`after: HOLD` in `src/templates/types/ticker.ts`), armed by the
shared runtime as `gsap.delayedCall(edge.after / (NOACG_ANIM.speed || 1), …)` in
`src/templates/shared/animRuntime.ts` `noacgArmTimer`. Nothing the ticker assembler emits touches
it. A percentage typed on a rotator's control page would move only the strip's fade-in while the
stories kept swapping at exactly 3.2 s, which is the field-that-lies the credits comment forbids.
Giving them a real one means teaching the machine runtime to read an operator field, which is a
change for every machine graphic in the product - filed as
`docs/backlog/a-rotating-ticker-holds-at-a-rate-nobody-can-change.md`.

## The numbers

Measured off the emitted builders by `scripts/ticker-speed.test.mjs` (new, tier `build`, so it
runs on every `npm run build`). It bundles the real module with Rolldown and runs the generated
JavaScript against a GSAP stub that records the tween, so these are durations the builder
produced, not durations reasoned about.

| | 50% | 100% | 200% | 10% | 400% |
|---|---|---|---|---|---|
| Marquee, one 1400px set | 20.0 s | 10.0 s | 5.0 s | 100.0 s | 2.5 s |
| Flip, hold per item | 6.4 s | 3.2 s | 1.6 s | - | - |

Blank, `0`, `fast` and `-40` all come back as the 10.0 s timing. `5` clamps to the `10` timing and
`9000` to the `400` timing. With the author's knob at 2x and the operator's at 50% the strip runs
at exactly the designed 10.0 s, which is the "multiply, never replace" property. A design with no
field returns 1 whatever is in the DOM.

And in a real browser, on the real generated tk01 with real GSAP, driving `play()` then `update()`
exactly as the dashboard does: **139.8 px/s** at 100%, **560.8 px/s** the instant
`update({f2:'400'})` reaches the running strip, **69.9 px/s** at 50%. 140 times the percentage,
each time, with no restart.

## The bug the review caught, which is the most useful thing here

Deriving the appended field's id from `fields.length` was wrong, and wrong in a way that bit
exactly the case the field exists to serve.

The seven three-line marquee designs draw their second cap **unconditionally** - tk11 emits
`<span id="f2">Newsdesk</span>` with its own fallback sample - while the `f2` FIELD is pushed only
when `o.lines[2]` exists. Build one of them from two lines and the html carried `id="f2"` twice.
`update()` resolves `getElementById('f2')` to the visible cap, which comes first in document
order, so an operator typing 150 into "Scroll speed (%)" printed **150 across the strip**; and
`tickerSpeed()` then parsed "Newsdesk", got NaN, and fell back to 100, so the control did nothing.
Reachable rather than theoretical: `src/ai/spec/specDesign.ts` keeps a pinned three-line chassis
for a two-line spec, and `validateTemplate` only asks whether *some* element carries an id.

The end-credits precedent does not have this because there the `#f2` holder and the `f2` field are
gated on the same `hasLogo` boolean. The fix is `appendedFieldId(designHtml, fieldCount)` in
`src/templates/tickers/shared.ts`: scan what the design actually drew and start after its highest
id. Verified against the real assembler in Chromium - tk11 from two lines now emits f1, f2, f0, f3
with the speed on f3 and no duplicate; tk11 from three lines is unchanged; tk01 keeps f2. Every
shipped design is byte-identical, so the baseline recorded before the fix still passes.

It is deliberately **not** `blocks/edit.ts` `nextFieldId(fields)`, which reads the field list -
the source that is wrong here. The deeper fix (emit the cap's field whenever the design draws the
cap) is a real behaviour change and is named in the comment for whoever wants it.

## The second thing the walk found, which is why the field now acts on air

Opening the graphic in the studio was meant to be a five-minute confirmation of the acceptance
route. It turned up a surface I had not accounted for: the production dashboard's **± LIVE
NUMBERS** row. `ProductionPage.tsx` builds it from the template alone - every operator-visible
`number` field that no event carries as payload - and tells the operator that one press "changes
the figure on the live graphic and keeps this cue in step, no ✎ Update needed".

That is true of a score. It was not true of a speed: `bumpLive` sends `{t:'update'}`, the ticker's
`update()` wrote the holder and rebuilt the items, and the running tween kept the duration it was
given at `play()`. So the field would have shipped with a pair of buttons beside it that did
nothing - the exact failure this row exists to refuse, on the loudest surface in the product.

The fix is `tickerApplySpeed()`: the builders keep a handle on what they returned and the speed
they built it at, and `update()` sets `timeScale(now / builtAt)` on it. A timeScale rather than a
rebuild is the whole point - rebuilding would honour the number and snap a half-scrolled strip
back to its start, which is worse than ignoring it. Measured above: the pace changes under the
operator's finger and the strip never moves.

**End credits has the same over-promise and still has it.** Its `Scroll speed (%)` is a `number`
too, so twelve credits designs sit in that row today with buttons that do nothing until the next
take. Fixing it is about fifteen lines of the same shape, with one judgement the ticker did not
have to make (whether scaling mid-roll should also pull the closing beat forward - probably yes).
Outside this branch's files, so it is filed as
`docs/backlog/a-live-number-that-does-not-move-a-credit-roll.md` rather than done here.

## The third thing, which CI found: a speed control is not content

The first full CI run went red on one factory-tier assertion:
`tk20: positional semantics length 3 != schema length 4`. That gate is right and it was telling
me something real. `positionalSemantics` in `src/templates/meta.ts` says what each emitted field
MEANS, and nine ticker designs declare it; appending a field left them one short, and the
fallback would have called an operator control a `description`.

Following it down found a wider version of the same thing. `deriveFieldCounts` counts every
`number` field as operator-facing content, so a two-line marquee would browse as **"3 fields"**
and its Browse card would list a speed control beside the words the operator writes. End credits
already ships that way on main for twelve designs, because it landed the same field first and
declares no positional semantics, so nothing fired.

Fixed at the level the mistake is at rather than by padding nine arrays:

- `FieldSemantic` gains **`speed`**, the one member that is not content: an instruction to the
  graphic, not something the graphic says. The nine ticker declarations name it.
- `SPEED_FIELD_TITLES` in `meta.ts` is now the one place the four titles exist
  (`Scroll speed (%)`, `Crawl speed (%)`, `Page speed (%)`, `Item speed (%)`) and **both**
  assemblers read it, so a rename cannot leave the metadata layer behind.
- `deriveFieldCounts` leaves a speed field out of the visible buckets, exactly as
  `HIDDEN_CONFIG_FIELDS` does for a game timer's minutes. That could not be expressed as an id,
  because an appended field lands on `f2` or `f3`; the title is the fixed thing about it. This
  corrects the twelve credits designs at the same time, since they emit the same titles.

`scripts/use-case-search.test.mjs` (the gate that caught it) and the whole factory tier pass
locally, and `check-catalog-emit` confirms the metadata work changed no emitted template.

## Check

- `review: delegated` - the code-review skill (high) returned three findings into this
  conversation. Finding 1 (the id collision) was reproduced and fixed. Findings 2 and 3 are below.
- `simplify: inline` - the skill returned fan-out instructions, so the four angles were done here.
  Renamed the new helper to `appendedFieldId` because `blocks/edit.ts` already exports
  `nextFieldId` and a reader would assume they were the same rule; replaced a condition that could
  never be false with a plain `if`; bundled the test's two modules concurrently; corrected the
  test header after it grew a second module. Reported, not done: `tickerSpeed()` and
  `creditsSpeed()` now emit the same clamp with different names, and folding them into one
  `shared/base.ts` helper would move the emit of twelve credits designs - a cleanup that ripples
  into unchanged code, so it stays a report.
- `verify: build green (exit 0, read directly, never through a pipe)`, plus the graphic driven in
  the studio and in Chromium, which is where the live-numbers gap came from. Local e2e was NOT
  run: the affected planner escalates this diff to the full suite, nine shards of ~12 minutes on a
  RAM-bound laptop, so it went to CI, which does strictly more on a clean checkout.

  **Which jobs ran, since a colour is not a verdict.** Run `34285254590` (workflow_dispatch, so a
  FULL plan) on the first source state: Build, Catalog calibration and all nine `E2E n/9 (full)`
  shards green, Factory gates red on the taxonomy assertion - that is the failure written up two
  sections above, and it is the only thing that has gone red on this branch. Run `34287962005`
  after the fix: Factory gates, Build, Catalog calibration, nine E2E shards, Combined E2E report
  and CI gate all green. The final run is named below.

  One thing to know if you read the run list: the first two pushes each cancelled the run before
  them through the concurrency group, so two runs show `cancelled`. Those are not verdicts. Every
  delta on this branch has a run that FINISHED over it.
- `taste: not applicable` - nothing here moves what a graphic looks like at rest. The change adds
  an input-only hidden holder, one field in the SPX definition, and a timeScale on a tween; the
  strip's geometry, type and colour are untouched, and `check-catalog-emit` confirms every
  design's html and css are byte-identical to before the live-speed commit (only the 22 ticker
  `js` hashes moved).

### The two findings not fixed here

**A preset swap leaves the field's title stale.** Re-point a marquee at Item flip in the Inspector
and the control page still says "Scroll speed (%)" while the field now sets the hold. The value
keeps working; only the word is stale. Titles are baked into the definition at create time and a
swap rewrites only the marked region. Every category with more than one titled preset has this,
end credits included, so the fix belongs to the swap and not to the ticker assembler. Recorded in
`src/templates/tickers/AGENTS.md`.

**A rotate-built ticker can still be swapped to Marquee loop.** `structural: true` withholds
`ticker-rotate` as a swap TARGET but nothing withholds the other two from a template built as a
rotator. That swap is already inert before any of this: `TICKER_ROTATE` sits outside the marked
region, so `rebuildTicker()` short-circuits and the strip holds one item that never travels. The
speed field only adds a second symptom. Pre-existing and outside this diff, so it is written into
the rotator backlog file with the one-predicate fix named.

## Files

- `src/templates/tickers/tickerMotion.ts` - `TICKER_MOTION_JS` is now `tickerMotionJs(fieldId)`;
  `tickerSpeed()` / `tickerMotionSpeed()` / `tickerApplySpeed()`; both builders scale and both
  register themselves as the live motion.
- `src/templates/tickers/shared.ts` - `SPEED_FIELD_TITLE`, `appendedFieldId`, the field, the
  hidden holder, `update()` calling `tickerApplySpeed()`, and `lineCount` now counting content
  fields so no preset choreographs the holder.
- `src/model/taxonomy.ts`, `src/templates/meta.ts`, `src/templates/templateMeta.ts`,
  `src/templates/endCredits/shared.ts` - the `speed` semantic, the canonical titles, and the
  field-count exclusion. The credits file changes only to read the shared titles.
- `scripts/ticker-speed.test.mjs` - ten tests, the numbers above.
- `scripts/rolldown-raw.mjs` - the `?raw` plugin lifted out of `catalog-emit.mjs`, now that two
  scripts bundle that graph.
- `e2e/catalog-baseline.json` - all 22 tickers, nothing else. Fifteen html hashes for the field
  and holder; twenty-two js hashes because every ticker's builders now read `tickerMotionSpeed()`.
  Rotator behaviour is unchanged: their `tickerSpeed()` is a constant 1.
- `docs/acceptance/owner-queue/2026-09-09-a-ticker-you-can-slow-down.md` - the walk, with the
  route and the question about the rotators.
- `docs/OWNER_RULINGS.md` - the pointer at the deleted receipt now names what served it.

## What is left of the owner's ask

Nothing, on the reading that "scrolling graphics" means graphics that scroll. Credits roll, crawl,
reel and pages all carry a speed; ticker marquees and the flip now do too; the run-through half
was always inapplicable to an endless strip. What remains is the rotators, which do not scroll -
they hold and swap - and whether their hold should be an operator control too is a question for
the owner, put to him in the walk file rather than assumed.
