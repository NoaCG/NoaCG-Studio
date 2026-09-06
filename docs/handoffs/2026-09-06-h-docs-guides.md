# Row H: three more /docs guides, and the four claims the review caught me getting wrong

Branch `claude/h-docs-guides`, from `main` at `8c1b39ba`. Five commits. It serves
`docs/backlog/docs-guides-to-write.md` (the owner's 2026-08-26 walk, "I like the new docs"),
writing items 2, 3 and 4 of that list and deliberately not writing item 1.

## What is true now

Three new guides on `/docs`, all in the voice `src/docs/AGENTS.md` sets, no new CSS, and no
em-dashes:

- **`#countdowns`**, a fifth kind guide inside the `#graphics` shelf. The length is data in
  minutes, decimals allowed; reading stops at a colon so `2:30` is two minutes; blank or unusable
  counts five; the length lives in a `noacg-data-source` holder and why that class rather than an
  inline `display:none`; Update re-arms a running count and only when the clock's OWN fields
  changed; pause holds where a re-take restarts; the optional wall-clock start time and its
  tomorrow rule; and the two clocks that work the other way round (the scorebug's typed match
  clock, the speaking timer's two-sided one). The shelf intro dropped "countdown" from its
  needs-no-guide list and went from four entries to five.
- **`#artwork`**, a new section beside `#svg` under "Make a graphic". Routes in, what is copied
  and downscaled, folder versus single-file packaging, that the exported operator page only
  switches between the pictures the graphic already carries, that a Lottie autoplays and loops
  from load, and that a missing font is silent.
- **`#export`**, now the first entry under "Connect playout". Six rows, led by the question of
  whether you need a package at all and closed by the fact that a wrong pick is cheap.

`e2e/docs.spec.ts` pins the load-bearing line of each. The nav went from ten entries to twelve;
that is the cost, and the owner-queue item asks him to judge it.

## The method, which is the transferable part

**Every claim came from the code, and half of what I first believed was wrong.** The prompt said
run the claim down before writing it, and the yield was high enough to repeat:

- `src/templates/shared/clock.ts` is the whole countdown contract in one file, header comments
  included. It also disproved a sentence I had already drafted: `clockDurationSeconds` uses
  `parseFloat`, so `2:30` is **two minutes**, not the five-minute fallback I was about to
  document. The fallback is for a blank, a zero or a non-number.
- Its own header comment says an overnight hold at 23:50 for a 00:15 start "shows 0:25:00".
  `formatClock` only reaches `H:MM:SS` past an hour, so it shows `25:00`. **A comment is not a
  measurement either** - I wrote "twenty-five minutes" instead of a format I had not derived.
- Which designs carry Pause is not a category fact: `types/clocks.ts` gives the clock group to
  four countdowns and four holding screens, so `gt03`, `gt04` and every `ss` past `ss04` run from
  the take to zero. The guide names the eight.
- `check-copy` (em-dashes, exact count baseline) and `check-client-neutral` (SPX may be a target,
  never the vocabulary) both fired on this branch. The second one is worth knowing before writing
  an export page: naming SPX in a target list needs an entry in `scripts/check-client-neutral.mjs`
  ALLOWED, keyed on the **trimmed line**, which is why the chooser's SPX row is one long line.

## What the review caught, and what it says about writing docs from code

`/code-review high` came back with four findings and every one was real. All four were places
where a fact was true of the package I had read and false of a package I had not:

1. `js/` is the engine folder in an SPX-shaped package. `ograf.ts` `DEFAULT_LIB` is `lib/`, and
   both the OGraf and LiveOS packages take the default, so half of readers would look in a
   directory that is not there. The guide now says "a folder of its own" and keeps `images/` and
   `fonts/`, which are identical in both shapes.
2. "In a folder package the animation stays a file next to the template" is true and misleading:
   `templateHtmlForModule` also inlines the Lottie JSON into `graphic.mjs`, because the host
   page's base URL is the renderer's. So the file in an OGraf folder is not always the copy that
   plays.
3. The chooser spec's comment, and the backlog entry recording it, both claimed the host list is
   derived from `EXPORT_TARGETS`. It cannot be: `src/export/common.ts` imports
   `../assets/gsap.min.js?raw`, a Vite-only specifier a Playwright spec cannot resolve. The list
   is hand-kept and both places now say so, with what that does and does not catch.
4. The Take column did not carry the labels the export list actually shows (`H2R Graphics
   export`, `HTML overlay (OBS / vMix)`). Fixed to the `label` fields verbatim.

The lesson under all four: **reading one implementation of a contract is not reading the
contract.** Six export targets share `addSharedAssets` and two of them override it.

## Check

- `review: delegated` - `/code-review high`, 4 findings, 4 confirmed against the code and fixed.
- `simplify: inline` - the skill returned fan-out instructions, so the four angles were done in
  this context. Two findings, both fixed: a holding screen was described rather than named (it is
  **Please Stand By**), and the client-neutral allowlist was keyed on a generic wrapped fragment.
- `verify: build green` on `22f90e02`. **`e2e: not run`** - this container has no Playwright
  browsers (`~/.cache/ms-playwright` does not exist), which the prompt said to expect. The five
  assertions the specs add were verified against `docs.html` by extracting the section bodies and
  matching each string and `href`, and the markup's tag balance was checked; that is not a run.
- `taste: not applicable` - no design file, template machinery or fit code is in the diff.
- Stamp at `.git/noacg-jobs/checks/claude-h-docs-guides.json`, verdict `pass-with-gap`.

## What is left, and one thing not to do

- **Item 1, the creation wizard, is still open and is the one a first-time reader most needs.**
  It was skipped because rows A and C were changing the wizard the same night. Write it when the
  steps have settled, and open the wizard rather than working from the backlog paragraph, which
  was written before this week's changes.
- **The three new sections have never been rendered.** The first person with a browser should
  open `/docs` and run `npm run test:e2e:focus` over `e2e/docs.spec.ts` before anything else on
  this page is trusted.
- Nothing here needed `src/docs/docs.ts` or `docs.css`. The page content lives in `docs.html` at
  the repository root; the prompt's TOUCHES list named the module and the stylesheet, and a
  session that believes that will look in the wrong file for ten minutes.
