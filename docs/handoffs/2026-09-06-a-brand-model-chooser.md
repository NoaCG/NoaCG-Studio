# Handoff - A: brand model + wizard chooser

**Branch:** `claude/a-brand-model-chooser` · **Date:** 2026-09-06 · **Row:** docs/BRAND_PLAN.md §10 row 1

**Not pushed, not queued** - this ran in a Claude Code cloud container, per the row's TRAPS. The
orchestrator integrates the branch.

## What landed

One commit (`5fd5843`) plus whatever follows it for the spec hardening below. Every claim in the
row's GOAL is built and, unusually for a cloud container, **actually run** - see Evidence.

**Model (§3).**
- `ProjectBrand` gains `logo?: AssetFile` and `notes?: string`, both additive optional.
- The anonymous singleton is retired. `defaultBrandId` (localStorage `spx-gfx-default-brand`)
  points at a saved look; `loadBrand()` resolves it; the `saveBrand` call after
  `applyDraftProject` is deleted, so **Create writes no brand record**.
- The old `spx-gfx-brand` key is never written by the app again. It is read by
  `legacyBrandOffer()` (for the next row's creator) and as `captureLookFromTemplate`'s
  style-family fallback, and the sync seam still carries the row (`saveLegacyBrand` /
  `clearLegacyBrand` in `src/backend/storage.ts`) so two devices converge.
- `Show.brandId` beside `Show.look`; `setShowBrand()`. The reference wins over the copy. **It has
  no WRITER yet** - the wizard READS it to preselect the chooser, and the surface that would set
  it is §6's "Apply brand to all graphics", which is the next row. Until then a production still
  behaves exactly as it did, through its captured `look`.
- `MAX_BRAND_LOGO_BYTES = 300_000` + `brandLogoRefusal(bytes)`, with the measurement written into
  the comment (see Traps).

**Behaviour (§5, §3, §6).**
- `brandPatch(brand, draft)` now also writes `importedImages` (merged, never replaced),
  `logoAssetPath` and `logoEnabled: true`. `brandClearPatch(previous, draft)` is its inverse and
  removes only that brand's asset.
- The footer checkbox is a `<select data-testid="wz-brand">`. Absent with zero brands, None by
  default, production preselect via `brandId` then the captured `look` under a synthetic entry.
- `applyLookToTemplate` fills an existing logo slot (img `src`, the field's `value`, and the
  definition block via `replaceDefinitionInHtml`) and leaves a slotless graphic byte-identical.
- Home's row: "Use for new graphics" sets the pointer, lights a ★, and is disabled on the row that
  already holds it; deleting that row clears the pointer.
- The AI strip's saved-look select is relabelled "Or a brand's colors" - it writes only
  `spec.brandColors`, and the label now says so.

## Evidence - what I actually saw

- `npm run build`: **green** (full chain, including depcruise, copy tells and the doc gates).
- `e2e/wizard-brand.spec.ts`: **10/10 passed** in a real Chromium (`--repeat-each=2`, after the
  hardening in trap 5). This is not a green-build claim - the chooser was driven, the created
  template read back, and the logo found in its slot.
- **Mutation-tested, both halves.** Dropping the logo block from `brandPatch` turned the run red
  on the two tests that depend on it; making `logoFieldOf` return null turned it red on exactly
  the apply test and nothing else (1 failed, 4 passed). Neither assertion is vacuous. The first
  of those runs also surfaced the flake in trap 5, which was fixed before either reading was
  trusted.
- **The two specs that drove the old checkbox are rewritten and green.**
  `e2e/package.spec.ts` ("a saved brand carries its look to another variant") and
  `e2e/wizard-filters.spec.ts` ("the chosen brand ranks its family first") both used
  `.wz-match input`, which now matches nothing - they would have gone red on CI with the feature
  working. Each now saves a look and drives the chooser. **32/32 passed** across those two plus
  `wizard-brand.spec.ts`.
- **A targeted 96-test slice, at 2 workers: 95 passed, 1 failed.** `library.spec.ts`,
  `productions.spec.ts`, `shows.spec.ts`, `wizard-kit.spec.ts`, `wizard-logo.spec.ts`,
  `wizard-finish.spec.ts`, `sync.spec.ts`, `storage-full.spec.ts` - every spec this change could
  plausibly reach, including "looks: capture the current look in Home, apply it to another
  graphic, survive reload", "a look carries SHAPE", "a kit opened FOR a production joins that one,
  in its look", and the whole logo-slot file. The one failure is
  `library.spec.ts:413` "a Home card frames on the GRAPHIC", a rendering-geometry assertion, and
  it is **PRE-EXISTING**: the pre-branch worktree fails it with the byte-identical number
  (`239.47222900390625` against `< 4`). It is the headless-shell shim of trap 7 rasterising
  differently, not this branch.
- **The 83-spec sprint-focus plan was STARTED and abandoned, on purpose.** At its default
  6 workers it is 752 tests on one container, and it went red at about a 60% rate on specs that
  cannot touch brands - ai, auth, caspar-connect, control-panel - each failing at 8-9 s, which is
  the 7 s expect timeout plus overhead. That is the overload red e2e/AGENTS.md describes, and it
  was MEASURED rather than assumed: `auth.spec.ts` + `adapt-first.spec.ts` pass **8/8 on the
  PRE-BRANCH tree** (a detached worktree at `8c1b39b`, 2 workers) and **8/8 on this branch**
  (2 workers), while 7 of those same 8 were red inside the 6-worker run. **Do not read that
  abandoned log as a verdict on this branch.** A real pre-merge run belongs on CI or on a machine
  that is not also this session.
- **NOT run:** the rest of the suite, and `npm run catalog:affected`. `src/templates/` is
  untouched, and `applyLookToTemplate`'s change is additive and gated on `brand.logo` existing, so
  no catalog design's rendered output moves - but that is reasoning, not a measurement, and the
  catalog gates are the thing that would prove it. **check: not run** as a workflow; its three legs
  were run individually (build, the spec, a review pass by hand).

## One degradation, stated

`captureLookFromTemplate` reads the STYLE FAMILY off whatever brand the app considers current,
because nothing in a template's own code records which catalog family it came from. That used to
be the anonymous record Create had just written with the right family; now it is the DEFAULT brand,
falling back to the retired record. With neither, a look captured on Home degrades to `'minimal'`.
It costs Browse ranking order and nothing else, and it is why `e2e/wizard-filters.spec.ts` now
states `styleTag: 'glass'` rather than capturing it. The honest fix is for a created graphic to
record its family somewhere, which is a persisted-format question this row deliberately did not
open.

## Traps that exist in no repo file

1. **`src/model/` may not import `src/model/packets.ts` from `brand.ts`.** A brand IS a look, so
   resolving the pointer means reading the look store - and `packets.ts` already imports
   `brand.ts`. The build's `depcruise` step refuses the cycle outright (`no-circular`), and it is
   the LAST gate before `vite build`, so it fails about four minutes into `npm run build`. The
   resolution: `loadBrand()` lives in `packets.ts`; `brand.ts` exports `hydrateBrand` for it.
   Anyone extending the brand model will hit this the same way.
2. **`defaultLogo: false` does not exist in the catalog** (checked 2026-09-06 - `cr01` is the only
   design that declares `defaultLogo` at all, and it is `true`). So decision 2's "even where the
   design's own default is logo-off" is currently unfalsifiable against the shipped catalog:
   `logoEnabled: true` in `brandPatch` is belt-and-braces today. It is written anyway, and the
   comment now says which it is. A future logo-off design is what would make it load-bearing.
3. **Logo size, measured rather than guessed.** Real 512 px PNG marks in this repo:
   `noacg-icon-amber-512.png` 14.5 KB, `noacg-mark-512.png` 34 KB, `noacg-icon-512.png` (gradient
   + glow) 171 KB; the 1024 px icon is 532 KB; the SVG marks under `benchmarks/pro/v1/spike/marks/`
   are 0.7-1.3 KB. 300 KB of FILE is ~400 KB of data-URL record, under `BODY_WARN_BYTES` (500 KB).
   The limit therefore refuses a screenshot of a mark, not a mark.
4. **`FinishedWalk` is a `useRef`, never serialized.** §5's "a walk restored from before this
   landed reads `matchBrand: true` as the default brand" needs no code: the walk lives in memory
   and dies with the tab. `brand`/`matchBrand` became `brandChoices`/`brandId` with no migration.
5. **Seeding a durable record right after `page.goto` is a coin flip.** `openWizard` resolves on
   `load`, which is before hydration; a `createLook` there is a read-modify-whole-record write
   against a mirror that is not yet the list, and the reloaded page then read `loadLooks()` as
   `[]` in 2 of 5 tests on one run and 0 of 5 on another. `awaitDurableReady(page)` BEFORE the
   seed (and before any post-reload `evaluate` read) is the fix. e2e/AGENTS.md warns about the
   post-reload READ; it does not warn about the pre-hydration WRITE, and that is the half that
   bit here.
6. **Six workers is too many for this container.** The suite sizes its worker count from free
   RAM and reports "6 workers - 14 GB free"; at that width the app boots slower than the 7 s
   default `expect` timeout and specs fail as "element(s) not found" on screens that are merely
   late. Two workers is what held here. The comparison above is the shape any session in a cloud
   container should run before believing a local red.
7. **Playwright in this container has no headless shell.** `/opt/pw-browsers` holds
   `chromium-1228` but only `chromium_headless_shell-1194`, and `npx playwright install
   chromium-headless-shell` fails to download through the proxy. What worked: a shim at
   `/opt/pw-browsers/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell`
   exec-ing `chromium-1228/chrome-linux/chrome --headless=new "$@"`. Container-local, nothing in
   the repo. `e2e/_offline-guard.ts` launches a browser of its own (it inspects an adopted dev
   server), so a `use.channel` override in the config does not reach it - the shim is what does.

## What the owner must see

`docs/acceptance/owner-queue/2026-09-06-choose-a-brand-in-the-wizard.md` carries the route. The two
things worth his eye: whether **"Brand: None"** in a footer that also holds Back and Next reads as a
CHOICE rather than furniture, and that with zero brands there is nothing there at all. The logo half
is only visible with a brand that has a logo, and until the next row's creator ships nothing in the
UI can put one in - the spec is what stands behind that claim meanwhile.

## What is left, and why

- **The brand CREATOR on Home** (BRAND_PLAN §4) - the whole of row 2. Everything it needs is in
  place: `createLook` returns the record, `setDefaultBrand` takes its id, `brandLogoRefusal` is the
  refusal, `legacyBrandOffer` / `dismissLegacyBrandOffer` are the "previous project look" line, and
  `ProjectBrand.notes` is the field. The section is still titled "Brand looks"; renaming it to
  "Brands" belongs with the creator, not with a row that only changed its row actions.
- **The editor's "Apply brand…" and a production's "Apply brand to all graphics"** (§6). The
  function they need (`applyLookToTemplate` with the logo) is done; only the surfaces are missing.
- **A logo thumbnail on the Home rows and in the chooser.** The chooser is a `<select>`, which
  cannot hold an image; if the thumbnail matters there it wants a popover, which is a design
  decision the creator row should make with the rest of the section in front of it.
- **`npm run catalog:affected`** - see Evidence. Worth one run on a machine that has the gates.
- **The AI door applying font and logo** stays level 2 (§5), as planned.

## Commit pointers

- `5fd5843` - the whole row. `src/model/brand.ts` is the header worth reading first: it states why
  the singleton retired and what the old key is still for.
- `src/components/wizard/draft.ts` `brandPatch` / `brandClearPatch` - the logo half, with the
  `paletteById` trap the row warned about left intact above it.
- `src/model/packets.ts` `applyLookToTemplate` + `logoFieldOf` / `markTag` - the apply-to-existing
  half. `logoFieldOf` requires BOTH a filelist field and a `-logo` class, which is what keeps a
  channel mark out of `ls41`'s presenter avatar.

**Attribution note:** the harness asked for a `Co-Authored-By` trailer; the repo's `AGENTS.md`
forbids one ("Never add a `Co-Authored-By` trailer or any agent co-author"). The repo contract won.
