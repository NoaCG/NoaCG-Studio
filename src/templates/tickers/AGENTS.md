# src/templates/tickers - the travelling and rotating strips

Loaded alongside the root `AGENTS.md` and `src/templates/AGENTS.md` when working in this
directory (Claude reads it via this directory's `CLAUDE.md` import; Codex reads it directly).
Keep it accurate.

Split out of `src/templates/AGENTS.md` on 2026-09-02, which keeps the catalog-wide rules and
the category index. Add a RULE here; leave the reasoning in the code's own comments.

## tickers/ - the travelling and rotating strips

tk01…tk22 (prefix 'ticker') + tickerPresets.ts (ticker-marquee / ticker-flip /
ticker-rotate) + **tickerMotion.ts**; data-driven: #f0 lines -> #ticker-track items; marquee =
items rendered twice, slide one set width, linear repeat:-1 (seamless loop). DATA BLOCKS via
convertToDataRegion. f0 items + f1 label, plus an OPTIONAL f2 second cap (a topic, a source, a
fixed top story) emitted only when the variant declares a third suggested line - so every
two-line ticker emits byte-identically to before it existed. **A strip that neither travels
nor rotates does not belong here** (docs/PUBLIC_SERVICE_PACK.md §1): the static notices live
in alerts/ and publicInfo/.
**THE TEXT FORMAT IS `docs/TICKERS.md`** - one mark, `A COLON ENDS A KICKER`, and everything
else is the story. `parseTickerItems` emits `{ kicker, text }`; a kicker on its own line tags
every story beneath it until a blank line or the next kicker. Two rules differ from
end-credits, and both are earned by what ticker designs already do with those characters: the
colon must be **followed by a space or end the line** (tk13 writes "United 2:1 City", tk17
"close at 20:00" - a length guard alone made kickers of all of them), and **`|` is not a
separator** (tk17 splits an item at it into two LANGUAGES). The shared treatment is
`.ticker-kicker`, emitted before the design's CSS so a design can restate it; a design that
PLACES the tag itself defines `renderTickerKicked(kicker, text)` and is handed both halves
already escaped - tk18's service column is the worked example. `renderTickerItem(text)` is
unchanged and still the only builder a design must provide. Pinned by
`scripts/ticker-parser.test.mjs`, which runs the EMITTED JavaScript.
**The value axis is still per-design and not portable**: tk04, tk06, tk14 and tk22 parse a
price or a change out of the line by POSITION and tk13 an `n - n` score, each with its own
rule. Leave them; folding a value into the kicker's grammar mints a second mark to learn.
**THE SPEED IS THE OPERATOR'S on anything that moves.** A marquee or a
flip design emits one appended `number` field - `Scroll speed (%)` / `Item speed (%)`, default
`100` = the pace it ships at, clamped to 10-400 by `tickerSpeed()` - in a hidden
`.noacg-data-source` holder, never drawn. It is read at `play()`, when the travel is measured,
AND applied to a strip already running: `update()` calls `tickerApplySpeed()`, which sets a
`timeScale` on the live tween. That is not a nicety - the production dashboard's ± LIVE NUMBERS
row carries every `number` field and says one press acts on air, so the field has to mean it, and
a timeScale is the only way to honour it without snapping a half-scrolled strip back to its
start. It is appended AFTER the optional second cap, so every field id already in use stays
put (`f2` on a two-line design, `f3` on a three-line one). `motionSpeed()` is a DIFFERENT knob,
the author's, from the `NOACG_ANIM` block; `tickerMotionSpeed()` is the product of the two, and
the builders read that one function only. **A rotate design emits no speed field**: its cadence
is a machine timer (`edge.after / NOACG_ANIM.speed`, in `templates/shared/animRuntime.ts`), so a
percentage typed on the control page would move only the strip's fade-in, and a field the graphic
cannot honour is a promise broken in front of an operator. Do not "finish the set" by adding one -
`docs/backlog/a-rotating-ticker-holds-at-a-rate-nobody-can-change.md` says what has to change
first. **The field's id comes from the design's MARKUP, not from the field count**
(`nextFreeFieldId`): a `maxLines: 3` design draws its `id="f2"` cap whether or not a third line
was supplied, so counting fields hands the speed control an id that is already on screen and the
operator's number prints across the strip. Pinned by `scripts/ticker-speed.test.mjs`, which runs
the EMITTED builders. Known and accepted: the field's TITLE is baked at create time, so
re-pointing a marquee at Item flip in the Inspector leaves a control that still says "Scroll
speed" - the value keeps working and only the word is stale. Every category with more than one
titled preset has this; fix it in the swap, not here.
