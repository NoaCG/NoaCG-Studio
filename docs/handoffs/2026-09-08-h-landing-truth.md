# Session H - the page we can hand someone

**Branch** `claude/h-landing-truth`, from `032678a2` (main after PR #156). Three commits: the
audit and the page, the direction docs and the wording sweep, then the check's cleanup with this
handoff. Queued through `/queue-merge`.

The owner changed the positioning on 2026-09-07: NoaCG competes on being free and open source.
This row decided how a stranger meets that, and the rule it leaves behind is that the landing page
may not claim more than `docs/PROMISE_AUDIT.md` grades. The audit came first; the copy came from
it.

## The grade of every promise

| # | Promise | Grade |
|---|---|---|
| 1 | Free and open source, AGPL-3.0, no paid edition | WORKS NOW |
| 2 | No account to create, edit and export | WORKS NOW |
| 3 | Exports to SPX, CasparCG, OBS/vMix overlay, H2R, LiveOS, OGraf | LIMITATION: LiveOS is the OGraf package with instructions; OGraf and LiveOS need an http server |
| 4 | Validated before export; an invalid graphic cannot export or publish | WORKS NOW |
| 5 | Template catalog with live previews, filters, kits | WORKS NOW |
| 6 | Create with AI, Lite and Pro free, live playout check | LIMITATION: both hosted tiers need a free account; BYO key needs none |
| 7 | Your own SVG: text layers become fields, on air as drawn | LIMITATION: text must stay text; outlined type gets a stand-in line |
| 8 | Behaviour on your own artwork without code (quiz, scoreboard) | WORKS NOW (owner walk still owed) |
| 9 | Photos and flattened images with fields on top | WORKS NOW |
| 10 | Operator panel from the graphic's own fields and events | WORKS NOW |
| 11 | Graphic types with their own operator buttons | LIMITATION: 36 of 67 types today, the page said 16; a poll has no authored "open" button |
| 12 | Multi-step reveals on Continue | WORKS NOW |
| 13 | Productions: cues, one output URL, PVW/PGM dashboard | LIMITATION: publishing needs a free account; operating needs none |
| 14 | Point OBS, vMix or CasparCG at the output URL | LIMITATION: CasparCG through the local agent; Connect not yet run on real hardware |
| 15 | Drive it from another tab, a phone, a second laptop | WORKS NOW |
| 16 | Editable live data, staged then taken | WORKS NOW |
| 17 | Google Sheets feed | LIMITATION: the sheet must be published as CSV; a feed writes live |
| 18 | Audience send-in, moderated, with votes | LIMITATION: needs a published production |
| 19 | Live data API over HTTPS | LIMITATION: needs a published production and its key |
| 20 | No lock-in, runs from a local file | LIMITATION: true of the single-file targets and SPX; not of OGraf |
| 21 | Video to MP4 or WebM | LIMITATION: AI authoring needs an account; anonymous renders capped |
| 22 | The NoaCG CLI on npm, `npx @noacg/cli ...`, `mcp` | WORKS NOW (0.3.0 on the registry; built and tested here) |
| 23 | Claude Code and Codex plugin install lines | LIMITATION: last executed 2026-08-22 / 2026-08-27, not re-run tonight |
| 24 | An agent-made graphic imports with its type | WORKS NOW |
| 25 | NoaCG reads any OGraf package (validate, derive controls, drive) | WORKS NOW, through the CLI |
| 26 | A third-party OGraf graphic in the library, production, output URL, dashboard | NOT YET IMPLEMENTED |
| 27 | NoaCG controlling a production on an OGraf renderer; `/output` as OGraf Server API | NOT YET IMPLEMENTED |
| 28 | Every export is an OGraf v1 Graphic; the catalog conforms | WORKS NOW |
| 29 | `/ograf`: six starters, real exporter, schema-checked on download | LIMITATION: our transcription of the schema, checked weekly against the EBU's files |

The evidence column, one file, spec or run per row, is in `docs/PROMISE_AUDIT.md`.

## What the page claims now, against what it claimed

- **Free and open source.** Was a kicker phrase and a sentence at the end of the no-lock-in
  section. Now the hero lede ends on it, and a `#free` section before the product tour says no
  seat licence, no monthly bill, no edition, AGPL-3.0, and names the two places a free account is
  asked for (publishing a production, AI on our service).
- **Your own artwork.** "Import your own graphic" with "SVG import" language became "Bring your
  own artwork": text layers become fields, numbers become scores, pictures become slots, behaviour
  without code, and the one rule that decides whether a file imports well.
- **The agent door.** Twenty-seven mentions stayed roughly where they were; the section now says
  the CLI is on npm, that saving needs a free account, and that the Import door takes the zip
  without one. The plugin road is linked, not sold.
- **OGraf.** Was three mentions. Now leads both target strips, has a nav entry, and has a section
  with three solid cards (export, six starters, read any OGraf package) and three dashed cards
  marked DIRECTION (import a stranger's graphic, foreign packages on the output URL, the Server
  API). `ograf.html` lost its em dashes and its "EBU's published schema" overclaim.
- **Corrections.** The stale "16 graphic types" count is gone (36 today, and the number ages).
  "Open the vote" was not an authored button; the poll line names the three that are. The video
  note no longer claims to be the only place an account is needed. "Point CasparCG at the output
  URL" became "put it on a CasparCG channel from the same page". "Runs from a local file" is
  scoped to the targets it is true of.

## What the delegation returned, and how it was re-derived

Codex (`/rescue`, read-only, effort high, job `task-mtt45sfg-hi6epj`) returned a nineteen-row
table with file:line evidence. Every row was re-derived here before it reached the page: spec
titles read with grep, source lines read, and the runs below. Where the two disagreed, the run
here decided:

- **The CLI.** Codex reported 31 pass / 14 fail and `--help` failing, and could not reach the
  registry. Its environment had no `cli/node_modules`. Here: `npm --prefix cli ci`, build exit 0,
  `npm --prefix cli test` 60 tests, 55 pass, 0 fail, 5 skipped (the bridge smoke tier),
  `node cli/dist/index.js --version` 0.3.0, `npm view @noacg/cli version` 0.3.0. Grade WORKS NOW.
- **The type count.** Codex said 36; a Vite `ssrLoadModule` over the registry here said 36 of
  67. Agreed, and the page dropped the number anyway.
- **The live poll.** Codex's reading of `livePoll.ts` (close, result, call; no open) was
  confirmed by reading `LIVE_POLL_CONTROLS`.
- **Third-party OGraf import.** Codex's split (a, b, c yes; d, e, f no) was confirmed:
  `ografImport.ts` is consumed only by `src/bridge/bridgeApi.ts`, the Import door wants an
  `.html` entry, `noacg save` refuses a package without NoaCG sources.
- **Free.** Codex called it a limitation because of the `paid` render tier and three wording
  remnants. The tier is entitlement plumbing that no billing reaches; the three wordings were
  fixed (`src/render/limits.ts` header and `formatNeedsSignIn` comment, the `format-tier` message,
  the admin grant placeholder). Grade WORKS NOW, with the tier noted in the row.
- Codex's list of capabilities the page did not mention was checked against the page; two went
  on it (reading a stranger's OGraf package, the exported package's own controller), the rest are
  operator detail and are listed at the end of the audit as deliberately left off.

## The check

- review: `inline`. The code-review skill forked and returned "finder angles are running" with
  no findings; a launched session never receives that completion, so the diff was reviewed here
  against the landing contract (`src/landing/AGENTS.md`: roadmap features tagged, never shown as
  shipped), the copy gate, the client-neutral gate and the pinned specs. No defects found.
- simplify: `inline`. The simplify skill returned fan-out instructions. One cleanup applied: the
  new `.feat code` rule duplicated `.card code` and was merged into it.
- verify: `npm run build` exit 0 on the final tree (1325 tests across 100 gate files;
  `check:copy`, `check:client-neutral`, `check:docs-index` green after two fixes: an allowlist
  that followed the reworded target lists, and the audit's row in `docs/README.md`). The push ran
  CI `34276911124`: Build, Factory gates, E2E plan, E2E 1/1 (subset: `admin`, `landing`,
  `ograf-starters`, `render-schedule`, `render`, 55 passed), Combined E2E report and CI gate all
  green. No browser suite was run on the laptop; row G held the slot.
- taste: `not applicable` - nothing in the change moves what a graphic looks like. The page
  itself was opened on this worktree's dev server: no horizontal overflow at 1280, the six OGraf
  tiles equal width, the dashed tags rendered, the rendered copy read in order. The Browser pane
  could not hold a stable frame below the fold (its compositor lagged the DOM), so the section
  screenshots are not evidence; the DOM measurements are.

## Needs the owner

Nothing needs an account, money, identity or a harness. Two judgement calls are recorded for him
to reverse in the owner-queue item
(`docs/acceptance/owner-queue/2026-09-08-the-landing-page-says-what-it-can-prove.md`): whether
three dashed DIRECTION cards on a marketing page is the right amount of honesty, and whether the
kicker should keep "Free & open source" now that the `#free` section carries it.

## Pointers

- `docs/PROMISE_AUDIT.md` - the rows, the evidence, and what changed on the page because of them.
- `index.html`, `ograf.html` - the pages; `e2e/landing.spec.ts` pins the four claims.
- `docs/GOALS.md` - the accessibility principle, the `#ograf` section as the public statement of
  OGraf-first, the corrected release item under the agent door.
- `docs/PRODUCT_AND_MAP.md` - the identity paragraph now leads with free and open source.
- `scripts/check-client-neutral.mjs` - the allowlist entries for the reworded target lists.
- The two files row G holds, `src/model/importTemplate.ts` and `src/store/saveActions.ts`, were
  read and not touched.
