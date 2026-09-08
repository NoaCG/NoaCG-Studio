# Session O - the speed field the tickers never got

**Branch** `claude/o-ticker-speed-field`, from `e7eecdcf` (main after PR #160). Two commits: the
field and its wiring, then the id collision the review found. Queued through `/queue-merge`.

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
- `verify: build green (exit 0, read directly, never through a pipe)`. Local e2e was NOT run: the
  affected planner escalates this diff to the full suite, nine shards of ~12 minutes on a
  RAM-bound laptop, so it went to CI, which does strictly more on a clean checkout. See below for
  what CI ran.
- `taste: not applicable` - nothing here moves what a graphic looks like. The change adds an
  input-only hidden holder and one field to the SPX definition; the strip's geometry, type and
  colour are untouched, and `check-catalog-emit` confirms every design's css is byte-identical.

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
  `tickerSpeed()` / `tickerMotionSpeed()`; both builders scale.
- `src/templates/tickers/shared.ts` - `SPEED_FIELD_TITLE`, `appendedFieldId`, the field, the
  hidden holder, and `lineCount` now counting content fields so no preset choreographs the holder.
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
