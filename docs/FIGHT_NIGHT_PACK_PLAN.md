# Fight Night production package - plan

Status: **BUILT, 2026-08-17** (owner approved the vision check and §9 defaults) - and
**UNIFIED onto the graphics-pack system** that landed on main in parallel (`noacg-pack`,
`src/packs/graphicsPack.ts`, `docs/GRAPHICS_PACKS.md` - the Uutishuone pack). §3 as first
written described a second format; it was not built twice. What this branch ADDS to that
system: the optional top-level ORDERED cue rundown (the whole-show walk across graphics -
`GraphicsPack.rundown`, installed through `model/shows.ts setShowCues`), the EXPORT half
(`buildPack` + the export dialog's "Graphics pack" download - any production round-trips),
and the Fight Night pack itself: twelve graphics in `packs/fight-night/` (file-based
sources), assembled by `scripts/build-production-pack.mjs` (in the build gate, gates matching
`build-news-pack.mjs`) into `public/packs/fight-night.noacgpack.json`, listed beside
Uutishuone in the pack index with one-click Install (the index was retired on 2026-09-24:
NoaCG's own graphics now come only through the template wizard - `docs/GRAPHICS_PACKS.md`). `e2e/production-pack.spec.ts` covers the
round trip, the Fight Night install through the validation gate (rundown order pinned), and
refusals. Still open: the live cloud walk (§7 Phase 4's backend half) and the owner's look at
the rendered set.

**One scope amendment against §4 as first written:** v1 ships the steppy graphics
(scorecards, fight card) on hand-written SPX `next()` logic and the fight bug's clock as
self-contained runtime code (auto-start on play, re-seed from its field on ✎ Update) - NOT as
explicit `NOACG_ANIM` machines. Operator behaviour on every control surface is identical;
machines with `machine.controls` buttons (clock pause/resume) remain the v1.1 upgrade path.

## 1. What this is

One downloadable **production package**: a complete combat-sports ("Fight Night") graphics set -
twelve graphics in one look, plus a prefilled cue rundown - that imports into **Productions** and
plays out through the doors that already exist (output URL, hosted phone control, production
export). Two deliverables, deliberately separated:

1. **The platform feature** - a generic, versioned production-package format with import and
   export. It works for ANY production; anyone can share a whole show as one file. Fight Night is
   only the first content.
2. **The content** - the Fight Night set itself: graphics, machines, rundown, look.

Constraints this plan honors:

- **No `src/templates/` work.** Catalog changes are owned by another active worktree. The pack is
  saved-document CONTENT (the community-template shape of thing), never catalog variants. New code
  touches the model/serialization layer, the Productions surfaces, and a new content directory.
- **Productions are the only grouping** (student release step 3). The pack imports as library
  graphics plus ONE production. The retired packet store stays retired.
- **Non-negotiable 6**: the format carries a version and migrates on read; unknown version refuses
  honestly.
- Worth saying out loud: UFC airs on Vizrt, Ross Xpression and Singular.live. A fight package that
  goes template-to-live through one NoaCG URL is a demo squarely in Singular's home territory.

## 2. The element inventory (UFC-shaped, our own style)

What a real Fight Night broadcast runs, reduced to what a small production needs. We borrow the
ELEMENT LIST and the operator workflow; the visual style is our own (§5).

| # | Graphic | Show moment | Key fields | Control shape | Layer (back→front) |
|---|---|---|---|---|---|
| 1 | Event slate / holding | pre-show, breaks | event title, date, venue, "starts in" time | play/stop; countdown timer machine | 1 (backmost) |
| 2 | Fight card rundown | pre-show, between bouts | bout list (lines), card label (Main/Prelims) | steps: Next moves the highlight down the card | 2 |
| 3 | Matchup / versus card | bout intro | 2× name, nickname, record; division; rounds format; 2× photo (filelist) | play/stop full-screen | 2 |
| 4 | Tale of the tape | fighters in the cage | 2× name + ~6 stat pairs (age, height, reach, stance, record, camp) | steps: staged row reveal on Next | 2 |
| 5 | Official result | bout end | winner, method (dropdown: KO/TKO/Sub/Dec-U/Dec-S/Dec-M/Draw/NC), round, time | play/stop | 2 |
| 6 | Judges' scorecards | decisions | 3× judge name + score, winner | steps: reveal judge 1→2→3 on Next | 2 |
| 7 | Fight bug (scorebug) | whole bout | 2× short name, corner colors, round N of M, round clock | timer machine: Start round / Pause / clock re-seeds from field; round number = stepper field | 3 |
| 8 | Fighter intro lower third | walkouts, replays | name, nickname, record, camp/country | play/stop | 4 |
| 9 | Generic lower third | commentators, interviews | name, role/line 2 | play/stop | 4 |
| 10 | Live stats strip | mid-round, between rounds | 2 columns × 3 numbers (sig. strikes, takedowns, control) | number steppers; aired via ✎ Update without replay | 4 |
| 11 | Round card | round starts | round number, bout tag | play; brief, then Out | 5 |
| 12 | Stinger / transition wipe | replays, segment changes | none (brand mark baked) | play = one-shot | 6 (frontmost) |

Layers are the pool order - several graphics on air at once (bug + lower third + round card) is
native to the output stage; nothing new is needed for that.

Deliberately cut from v1 (real broadcasts have them; nothing blocks adding later): betting odds,
sponsor billboards, bonus-award reveals, ticker, weigh-in graphics, audience vote (the audience
plane already exists if the owner wants it in v2).

## 3. The package format + import (the one new platform feature)

- **Format**: one JSON file, `<name>.noacgpack.json`:
  `{ format: 'noacg-production-pack', v: 1, name, resolution, graphics: [...], cues: [...] }` -
  each graphics entry carries `name`, pool position, and a full SpxTemplate-shaped
  `html/css/js/assets/resolution/fps`. Assets stay the base64 data URLs they already are.
- **Import door**: Productions section grows "Import production…" plus a "Try a sample
  production" card that feeds the bundled Fight Night file through the same parser.
- **Import semantics**: every graphic passes `validateTemplate` at the boundary (non-negotiable 4,
  exactly as community import gates); new uuids are minted; each graphic lands as a library
  `GraphicDoc` (editable afterwards - the reason they are NOT pool-owned like pictures); one Show
  is created with the pool in pack order and the cues seeded verbatim. Name collisions get the
  show-export suffix treatment.
- **Export round-trip**: "Export production package…" on the production page serializes the same
  shape from the live records. The round-trip is what makes the format generic and self-sustaining
  rather than a one-off loader for this pack.
- **Versioning**: v1 now; additive fields never bump; a breaking change bumps and migrates on
  read; an unknown newer version refuses with a readable message, never a crash.

Why one JSON and not a zip: assets are already inline data URLs, so a zip adds an unzip dependency
and a second file layout for zero capability. One file = one parser, one validation path, trivially
downloadable and shareable. Revisit only if a pack approaches tens of MB - which §5's placeholder
rule exists to prevent.

## 4. Control and playout - what exists, what each graphic declares, what is missing

**Already exists, nothing to build:**

- The production page and the hosted phone page: cue rundown, Take / Update / Next / Out /
  All out, staged edits, the local PROGRAM monitor, the activity log.
- Control panels are GENERATED from each template's fields + machine (`machine.controls` buttons,
  structural legality). A pack graphic gets a correct panel by declaring its machine well - there
  is no per-graphic panel code anywhere, which is the control layer's whole design.
- Multi-layer air, the persistent output URL, publish pinning, recovery.
- Playout doors: publish → `/output?production=<slug>` into CasparCG / OBS / vMix (the primary,
  cloud-first door), and the production export (SPX / CasparCG / overlay + exported controller)
  as the offline fallback.

**What each graphic must declare (the authoring obligation):** the machines in §2's table, inside
`NOACG_ANIM` v2. The scorecard and tale-of-tape step reveals sit on the default path, so they
degrade to dumb `next`-stepping under plain SPX by construction. The fight bug's round clock
follows the match-clock semantics (counts down, stops at zero, re-seeds when the operator types a
correction) as **pack-owned self-contained code** - no imports from `src/templates`.

**Honestly missing / to verify:**

- The import/export feature itself (§3) - the only new platform surface.
- **Cloud door state**: hosted control is the primary door. Migration 0040 IS applied to production
  (confirmed by calling it, 2026-08-20 - `docs/CLOUD_PLAYOUT.md` §3), so the pack's cloud
  verification is no longer blocked on it and only needs somebody to walk it. The offline half
  (import, drive it unpublished, export) is fully provable today in the e2e suite.
- Old-CEF rule applies to every line of pack template JS: no `?.` / `??` (CasparCG 2.3.x).
- Clock and stat numerals must use faces with MEASURED tabular figures (`numericFontStack` - the
  Oswald trap), or the bug wobbles mid-round.

## 5. Authoring the content

- **Source layout**: new top-level `packs/fight-night/` - one directory per graphic
  (`template.html`, `style.css`, `logic.js`) plus `manifest.json` (names, pool order, cue
  rundown). `scripts/build-production-pack.mjs` assembles them into
  `public/packs/fight-night.noacgpack.json`, running `validateTemplate` + machine validation on
  every graphic as a build-time gate. Sources are reviewable and diffable; the shipped JSON is
  generated, never hand-edited.
- **One look across the set** (the kits doctrine). Proposal: carbon/steel darks, one hot signal
  accent (signal orange), a wide caps display face for fighter names, measured-tabular numerals
  for clock and stats, restrained glow. Distinct from UFC's look and from the NoaCG app chrome.
  Every color and shape rides the `:root` style contract, so the Style panel, looks, and the
  brand kit restyle the whole set after import.
- **Fictional everything**: promotion name, fighters, records. Real fighter names or likenesses
  never ship in the product (rights).
- **Photos**: shipped placeholders are lightweight vector silhouettes; real photos come from the
  user through the `filelist` fields. Keeps the pack file small and the published `output` row
  lean (the base64-row lesson from pictures).

## 6. The demo rundown (what imports ready-to-run)

The pack imports as production **"Fight Night"** with a fictional 3-bout card. Cues walk a full
show in order: opening slate → card rundown → per bout (matchup → tale of the tape → intro lower
thirds → bug up → round cards and rounds with the clock → stats mid-round → scorecards on a
decision → result) → closing slate. Cue notes teach the verbs in place ("Take airs the bug with
the clock paused - press Start round"). The rundown is the pack's teaching surface: a student
opens it and the show order is already the truth.

## 7. Build order

- **Phase 1 - format + import/export** (platform): the shapes in the model layer, import/export
  functions, the Productions door and sample card. E2E, offline: import a small placeholder pack →
  pool/cues/layers correct → an unpublished Take/Out drives the local stage → export round-trips to an
  equal file.
- **Phase 2 - the twelve graphics**: author + validate + bench each; a screenshot sweep of the
  rendered set for the owner to eyeball (the pack's own small sweep, patterned on the catalog
  gates - the catalog gates themselves do not run on pack content).
- **Phase 3 - the rundown + polish**: cue content, notes, sample card wiring, docs.
- **Phase 4 - verification**: full offline e2e; a live walk on real Supabase (publish, output URL
  in OBS and CasparCG, phone Take, kill-and-reload recovery); owner look at the rendered set.

Each phase commits to the feature branch; `npm run build` plus the focus suite per change; specs
land with their affected-mapper entries in the same commit.

## 8. Non-goals (v1)

- No catalog/wizard integration: no Browse tiles, no variant registry entries, no `src/templates`
  edits. Folding the pack into the catalog later is a separate decision.
- No live data connectors - stats are operator-bumped numbers (the CLOUD_PLAYOUT §7 direction is
  unchanged; this pack must not preempt it).
- No new backend schema: import/export is entirely client-side; the cloud door uses the existing
  publish machinery untouched.
- No real-brand or real-fighter assets, ever.

## 9. Open decisions (owner)

1. **Element list** (§2): confirm the twelve; anything cut that you want in v1 (odds? ticker?).
2. **Style direction**: "carbon + signal orange" as proposed, or a different accent word - or
   leave it to the Phase 2 set review.
3. **Distribution**: in-app sample card + downloadable file (both feed one parser), or in-app
   only first?
