# Writing templates that survive the playout browser

Audience: anyone adding or editing a template in `src/templates/`, and anyone reviewing one.
This is the authoring contract. `docs/PLAYOUT_INTEGRATION.md` is the OPERATOR's guide to the same
subject — what to do when a graphic is already on air and looks wrong. Read that one for "my
server shows nothing"; read this one before you write CSS.

**The short version: keep every template renderable on Chromium 117, and the build gate will tell
you when you don't.** The catalogue clears that today with six versions to spare, so in practice
this document is about three CSS features and one JavaScript rule.

## 1. Why a playout browser is not your browser

**A playout application does not use the machine's browser. It builds a copy of Chromium inside
itself, and that copy is frozen at the version the application shipped with.**

Updating Chrome on the playout machine changes nothing. Updating the playout application is the
only thing that moves it. This is the Chromium Embedded Framework (CEF), and CasparCG, OBS Studio
and vMix all work this way. SPX Graphics is the exception: it renders in the operator's own
installed browser, which auto-updates.

| Playout system | Engine | How we know |
|---|---|---|
| CasparCG 2.3.0–2.3.2 | Chromium 71 | measured 2026-09-10 — **unsupported**, see §2 |
| CasparCG 2.3.3+ | Chromium 88 | inferred — **unsupported**, see §2 |
| OBS Studio 30.x | Chromium 103 | an OBS not updated since 2023 — below the floor |
| vMix 27+ | Chromium 103 | changelog only, never measured here |
| **CasparCG 2.4.x** | **Chromium 117** | **THE SUPPORTED FLOOR** |
| OBS Studio (current) | Chromium 127 | measured 2026-08-07 |
| CasparCG 2.5.x | Chromium 142 | measured 2026-08-07 |
| SPX Graphics | the operator's own | current, auto-updating |

`PLAYOUT_ENGINES` and `SUPPORTED_FLOOR` in `src/validation/engineSupport.ts` are the source of
truth; this table is a copy for reading. If they disagree, the code is right.

**How to measure a machine rather than trust this table:** load a production's output URL with
`&debug=1` and read the `engine:` line. That is the browser doing the rendering, reporting
itself. A CasparCG version string does not settle it — one machine here reported `2.3.2 ... Dev`
while its build was named `casparcg-server-v2.3.3-lts-stable`. Rows marked *measured* were read
that way; the rest come from changelogs.

## 2. The floor is a machine, not an audience guess

**Chromium 117, because that is CasparCG 2.4 — the server the school runs productions on.**

Every other target measured sits above it, so the oldest machine anyone here actually has to
satisfy is the one that sets the line. That is a firmer basis than estimating what version of OBS
strangers are running.

What is deliberately excluded, and why:

- **CasparCG 2.3.x (75 / 88).** Unsupported. Clearing Chromium 75 would mean rewriting flex
  `gap` (272 designs), `backdrop-filter` (178) and the `inset` shorthand (138) out of the
  catalogue — load-bearing layout, not decoration. The 2.3.0–2.3.2 number is no longer an
  inference: on 2026-09-10 a 2.3.2 build (`4de6d18f Dev`) reported **Chromium 71** on the output
  page's `&debug=1` line, and the house scorebug aired on it with its flex gaps collapsed — the
  same production on 2.5.0 has them. That settles a contradiction this section used to carry: a
  2.3.2 server could not *parse* optional chaining (below 80), yet a "2.3.x" server was once seen
  rendering `inset` (87) and `gap` (84), which must have been a different machine. `vite.config.ts`
  still says "~Chromium 63", which is now merely conservative rather than unreconciled. **2.3.3+
  remains an inference** — nothing here has run a genuine 2.3.3.
- **OBS 30.x and vMix 27 (103).** Below the floor, so a design using `color-mix()` (111) loses
  its fills there. A current OBS is fine; vMix has never been measured here. Left as a known,
  recorded gap rather than a reason to migrate 189 declarations speculatively — revisit if a real
  vMix user appears.

The catalogue's own ceiling is **111** (`color-mix()`), so it clears the floor with room. The
floor's value is not what it forbids today; it is what it catches tomorrow.

## 3. The three CSS features above the floor

These are the ones that will break the school's server. Everything else in the feature table
(`ENGINE_FEATURES` in `src/validation/engineSupport.ts`) shipped at or below 117 and is free.

```
rgb(from …) relative colour syntax   119
the unprefixed mask shorthand        120   <- already put designs on air wrong
light-dark()                         123
```

Not banned — a feature here is fine as long as nothing *depends* on it. Give it a fallback (§5) or
accept a degradation you have actually looked at. What is forbidden is reaching for one and
leaving the graphic broken on 2.4.

`text-wrap: balance` (114) and `text-decoration-thickness` (87) are classed **cosmetic**: they are
listed by the scanner but never raise a design's required engine, because losing them rebalances a
line wrap or changes an underline by a pixel.

## 4. How failure looks

Three modes. The third is the one that gets missed.

**CSS, direct: the declaration is discarded, silently.** A value the engine cannot parse causes
that entire declaration to be dropped. No console warning. The element keeps whatever an earlier
declaration set, or the property's initial value — for `background` that is transparent, so a
tinted panel renders as nothing and it reads as a design mistake rather than an engine limit. Two
catalogue designs went to air this way on 2026-08-06: the Arena Quiz board showed "just the blue
line and the numbers", because every answer chip's background was a `color-mix()`.

**CSS, through `var()`: the property is UNSET, and an earlier fallback is destroyed.** Per CSS
Variables Level 1 §3.3, a property whose value contains a syntactically valid `var()` **must be
assumed valid at parse time** and is only syntax-checked *after* substitution. A declaration that
turns out invalid then is "invalid at computed-value time" and the property takes its inherited or
initial value — it does **not** fall back to the previously cascaded declaration.

```css
:root { --accent-glow: 0 0 22px light-dark(#e08a2a, #f6a623); }

.chip {
  box-shadow: 0 0 22px rgba(224, 138, 42, 0.6);  /* an earlier "fallback" */
  box-shadow: var(--accent-glow);                /* parses fine, WINS, then unsets */
}
```

The second declaration parses, so it wins; substitution then yields an invalid `box-shadow`, so it
computes to `none` and the fallback above it is gone. Writing the pair on the custom property
instead fails identically — custom properties are raw token streams, both are accepted, the later
one wins, and the use site dies the same way.

**JavaScript: a syntax error kills the whole file.** No partial parse. One `?.` and nothing in
that file runs — no entrance, no data binding, no clock — so the layer goes to air blank. See §6.

## 5. The fallback idiom, and its one hard limit

Write the old value first, the modern one second, in the same rule:

```css
max-width: 1680px;                                    /* fallback */
max-width: min(calc(720px * var(--scale)), 1680px);
```

An engine that cannot parse the second discards it and keeps the first. That is `maxTextWidthCss`
(`src/templates/shared/base.ts`), where `min()` needs Chromium 79.

The fallback must be a value the old engine can genuinely use, not a placeholder: independent of
anything the user can retint or resize, and leaving the element usable on its own. If you cannot
write one that would be acceptable *permanently*, you do not have a fallback — pick a different
declaration.

**HARD LIMIT: never rely on a fallback pair where the modern value reaches the property through
`var()`** (§4). It silently does not work. If a custom property must carry a modern value, fix the
token's own value, never the use site.

### 5.1 Vendor prefixes

A prefixed spelling is only a fallback when it is genuinely **older** than the standard property.
True of `-webkit-mask-image` (Chromium 1 versus 120 for the unprefixed shorthand). **Not** true of
`-webkit-backdrop-filter`, which Chromium shipped alongside the standard property at 76 — writing
it first buys nothing.

So do **not** reorder existing prefixed declarations to put the prefix first. The catalogue writes
`backdrop-filter` before `-webkit-backdrop-filter` in 141 places; that order is correct.

The mask twin is emitted through one helper so a category adding a mask cannot forget it:

```css
-webkit-mask-image: linear-gradient(90deg, #000, transparent 74%);
mask-image: linear-gradient(90deg, #000, transparent 74%);
```

Both values come from the same argument, so nothing can drift. `maskImageCss` in
`src/templates/shared/base.ts`; applied in commit `a2a6f3ba`, which took 25 designs from failing
on CasparCG 2.4 to zero. That commit is the reason the floor is holdable at all.

### 5.2 What the scanner credits

`hasFallback` in `src/validation/engineSupport.ts` recognises a pair when the immediately
preceding declaration in the same block names the same property — or a genuinely older prefixed
spelling of it, from an explicit list — and does not itself use anything modern. Deliberately
narrow, because that is the only pattern the cascade guarantees.

Two rules it enforces, both learned the hard way:

- **A custom property is never covered.** `--x: <old>` then `--x: <modern>` looks exactly like the
  idiom and is not it (§4). Crediting it would let the scanner certify a design that goes to air
  dark.
- **A prefix only counts when it is actually older**, from `OLDER_WHEN_PREFIXED`. A blanket
  prefix-strip credited `-webkit-backdrop-filter` and would have blinded the scanner across 178
  designs.

## 6. JavaScript: stricter, because the failure is total

**Never use, in any template JS:** optional chaining `?.` (80), nullish coalescing `??` (80),
logical assignment `&&=` `||=` `??=` (85), numeric separators `1_000` (75), private class fields
`#name` (74), top-level `await` (89), `Array.toSorted` / `toReversed` / `toSpliced` (110).

Every one is a **syntax** error on an engine that lacks it, and a syntax error means the file does
not run at all. There is no fallback idiom for syntax. Write `a && a.b` and
`x !== undefined ? x : y`.

All of those are below the current floor, so nothing in the catalogue trips them today. The rule
stands anyway: it costs nothing, and it is the failure mode with no visible symptom short of a
black layer.

Runtime APIs are a softer failure — the call throws where it is made, so surrounding code can
survive. Prefer the older spelling regardless; there is no benefit to the newer one in a template.

The studio application itself is compiled to `es2017` (`vite.config.ts`), so the browser-output
page and everything it loads clear the bar automatically. **Template code is not compiled.** What
you write is what ships, in the export and on air.

## 7. Checking your work

```bash
node scripts/engine-floor.mjs
```

Builds every design and reports, per design and per declaration, what an engine cannot render.
With no arguments it runs at `SUPPORTED_FLOOR` — the bar that actually has to hold. Needs the dev
server running.

- `--engine <id>` or `--chromium <n>` to ask about a different engine (below the floor is a fair
  question; it just does not gate).
- `--fail` exits non-zero. This is what the nightly catalog job runs.
- `--json out.json` for a machine-readable report.

The export screen carries the same verdict for a single graphic, from the same scanner — one
measurement, two surfaces, so a gate and a user-facing warning cannot disagree.

Both MEASURE the emitted code rather than consulting a list of designs known to be broken. A list
is wrong the day after it is written. Its honest limits are stated at the top of
`engineSupport.ts`: it is a lexical scan, not a CSSOM, so a feature spelled unusually can be
missed.

### 7.1 A clean scan is not proof

The scanner proves a design does not *use* something unsupported. The pixel baseline
(`e2e/catalog-render-baseline.json`, all 430 designs) proves a change did not alter *modern*
rendering. **Neither proves the graphic looks right on an old engine**, because no machine that
develops this catalogue runs one.

For a change that is specifically about compatibility, look at it on a real renderer before
calling it done — the school's CasparCG 2.4 first, since that is the floor. Check a graphic whose
accent has been **retinted**, not just a default one: theme drift is the failure mode static
scanning cannot see at all. Record what was looked at and on which engine version. "The gate is
green" is not a verification.

## 8. The gate

`node scripts/engine-floor.mjs --fail` runs nightly, at the floor, alongside the other catalog
gates (`.github/workflows/nightly.yml`). It is not in `npm run build` for the same reason
`type-floor.mjs` and `numerals.mjs` are not: it needs a dev server and a browser.

A guideline nobody can accidentally violate beats a guideline everyone must remember. Same
doctrine as the other four: measure the emitted output, gate on the measurement, never maintain a
list of known-bad designs.

**It covers JavaScript as well as CSS.** `ENGINE_FEATURES` carries `where: 'js'` rows with
`effect: 'kills-the-file'`, and `engineReports` returns a distinct `blank` verdict that outranks
any number of dropped declarations — because a template with perfectly compatible CSS and one `?.`
in its JS still puts an empty layer on air.

## 9. If the floor ever has to drop

Nothing below requires action today. It is written down because the reasoning cost two review
rounds and should not be re-derived from scratch.

Should a supported machine ever land below Chromium 111, the blocker is `color-mix()`: 189 uses
across 95 files, meaning "this user-editable colour at N% alpha". Plus two application-code sites
that are easy to miss — `src/model/themeTokens.ts` emits `--accent-glow` with a `color-mix()`, and
`src/model/styleVocabulary.ts` offers that same value as a Style panel option a user can pick.

**The fallback pair cannot solve it**, because `--accent-glow` reaches `box-shadow` through
`var()` (§4). The workable answer is channel twins emitted beside the colour they derive from:

```css
:root {
  --accent: #e08a2a;
  --accent-rgb: 224, 138, 42;
  --accent-a: 1;
}
.chip { background: rgba(var(--accent-rgb), calc(var(--accent-a) * 0.25)); }
```

`rgba()` with comma channels works on Chromium 49+. The translation is mechanical, because
`color-mix()` in `srgb` interpolates with premultiplied alpha and `transparent` is
`rgba(0,0,0,0)`: the result preserves the source RGB and scales only its alpha.

```
color-mix(in srgb, var(--X) N%, transparent)  →  rgba(var(--X-rgb), calc(var(--X-a) * N))
```

Three things that would need deciding again:

- **The alpha twin is not optional.** `--panel-bg` (0.10–0.96) and `--text-dim` (0.62–0.95) are
  translucent in every built-in palette (`src/model/wizard.ts`); only `--accent` and
  `--text-color` are opaque hex. Emit `-rgb` and `-a` uniformly, never conditionally.
- **It is duplicated state, honestly.** `--accent` and its twins are the same colour written
  twice. Controlled by one emitter (`rootVarsCss`), emitted only when read, written together by
  the Style panel, and it would need a drift gate on the model of `scripts/numerals.mjs` to be a
  contract rather than an intention. Making the channels canonical instead
  (`--accent: rgb(var(--accent-rgb))`) was tested and rejected: `parseCssColor` cannot read it,
  and imported and hand-written templates carry plain hex forever, so the parser would have to
  support both forms anyway.
- **Classify before migrating.** ~101 opaque→transparent and ~13 translucent→transparent convert
  mechanically; ~3 are colour literals; **~8 blend two real colours** and need individual review —
  the premultiplied simplification does not apply to those, and alpha-over-background is only
  equivalent when that background is genuinely behind the element.
