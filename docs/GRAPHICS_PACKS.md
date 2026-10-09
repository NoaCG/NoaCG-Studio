# Graphics packs — downloadable, finished, ready to operate

A **graphics pack** is one downloadable file (`<name>.noacgpack.json`) carrying several
FINISHED templates that install as one production: graphics pooled, playout layers set, a
prepared cue rundown seeded. Nothing needs the editor — import, publish (or export), operate.
It exists beside the wizard catalog, not inside it: a pack ships complete work, the catalog
ships starting points, and the two share no generator code.

**Decided 2026-10-02 (owner): Community packs, the wizard's third category.** The template
workflow has three categories - Templates, Kits, Community packs. A community pack is a
finished package people install and use at once and cannot modify; the community makes and
shares them, each shared pack is reviewed (automatic checks, then a NoaCG admin) before anyone
else sees it, and NoaCG seeds the shelf first. Browse's top control offers it as the third
answer beside one graphic and a whole kit; Install runs `installPack`. This SUPERSEDES the
2026-09-24 line that the studio lists no shipped packs: finished packages, NoaCG's seeds
included, are listed - on the wizard's Community packs shelf, not on the Productions import
card. Record, acceptance criteria and the next slice (share, review, takedown):
`docs/work-specs/community-packs/spec.md`.

**Decided 2026-09-24 (owner), still standing for the import card.** The Productions import
card lists NO shipped packs; it is only the door for packages made OUTSIDE the studio, above
all by a coding agent (`noacg pack`), and for productions exported as packs. Uutishuone and
Fight Night stay in the repo as pack files (and as the pack specs' fixtures) until they are
rebuilt as ordinary wizard kits. To revert, restore `public/packs/index.json` and the list in
`ProductionsSection.tsx` from the commit that made this change.

## The format (v1)

```jsonc
{
  "format": "noacg-pack",        // the marker parsePack refuses without
  "version": 1,                  // newer versions are refused with an upgrade message
  "name": "Uutishuone",          // becomes the production's name
  "description": "…",
  "graphics": [
    {
      "name": "Uutishuone ticker",   // pool identity — unique within the pack
      "type": "ticker",              // a real TemplateType
      "layer": 10,                   // playout layer 1–100 (back = low)
      "html": "…", "css": "…", "js": "…",   // the complete template (definition inside the HTML)
      "assets": [{ "path": "images/x.png", "data": "data:…" }],  // optional, inlined
      "resolution": { "width": 1920, "height": 1080 },           // optional (default 1080p)
      "fps": 50,                                                 // optional
      "cues": [{ "label": "Avaus", "values": { "f0": "UUTISET" }, "note": "…" }]
    }
  ]
}
```

`fields`/`settings` are never carried separately — they are parsed from the
`SPXGCTemplateDefinition` inside the HTML, the same source-of-truth rule as everywhere else.
The first cue REPLACES the auto-seeded default cue; the rest append in order.

**The whole-show rundown (optional, additive).** A pack may carry ONE top-level `cues` list
instead of per-graphic cues — the same cue shape plus a `graphic` name reference:

```jsonc
"cues": [
  { "graphic": "Fight bug", "label": "Round 1 - bug up", "values": { "f2": "1" } },
  { "graphic": "Round card", "label": "Round 1 card" },
  { "graphic": "Fight bug", "label": "Round 2 - bug up", "values": { "f2": "2" } }
]
```

Per-graphic cues can only append in pool order; a real show walk INTERLEAVES graphics (bug
up, round card, stats, bug again), which only one ordered list can express. It installs
through `model/shows.ts setShowCues` (one write); a pool graphic the rundown never names
keeps a seeded default cue at the end, so nothing becomes unreachable in the rundown. A file
carrying BOTH forms is refused. A pack without the list behaves exactly as before.

**The export half.** Any production round-trips: `buildPack(show)` serializes the live
records back into this shape (rundown as the top-level list), downloadable from the
production export dialog ("Graphics pack (.noacgpack.json)") — so the format is how whole
productions are shared, not only how shipped packs arrive.

**The community pack stamp (optional, additive).** A graphic installed from the Community packs
shelf carries `fromPack` on its library record (`{ id, version, author, name }`), which locks its
design (docs/work-specs/community-packs/spec.md AC-5). The export writes it on that graphic's
entry, and an import stamps the new record from it, so the lock and the production's credit line
survive Export then Import. Install from the shelf stamps every graphic with the shelf's own id,
whatever a file entry says. The stamp lives on the record and in this file, never inside the
template: the SPX, OGraf and CasparCG exports stay plain templates.

## The three pieces

- **`src/packs/graphicsPack.ts`** — the owner: `parsePack` (refuse-with-reason, never coerce),
  `validatePack` (every graphic through `validation/validateTemplate` — the ONE export gate),
  `installPack` (the shared `model/templateSet.ts` save path + layers + cues, every durable
  write claimed).
- **The door** — Home → Productions → the "Import a package" card: pick a `.noacgpack.json`
  (from `noacg pack --out` or a production export) and it installs as a production and opens it.
  No shipped pack is listed there (see the 2026-09-24 decision above). A package an agent SENT
  with `noacg pack --save` needs no file: it waits above the grid under "Waiting to install"
  with its own Install button (`docs/AGENT_SAVE.md` §7) and goes through the same installer.
- **The Community packs shelf** — the wizard's Browse step, third option
  (`wizard/steps/CommunityPacks.tsx`). It reads `public/packs/community/index.json` and installs
  a listed pack through the same installer, then opens the production. The seeds are FILE
  sources under `packs/community/<slug>/` (`manifest.json` with an `author`, a `preview.webp`,
  one folder per graphic with `template.html`/`style.css`/`logic.js` and an optional `fonts/`
  folder that rides along as inlined assets), assembled by `scripts/build-production-pack.mjs`
  with the same refusals as Fight Night, in `npm run build`. A seed is converted from an agent
  package with `noacg validate` (gate + bench) and then `noacg pack --out`, whose reader is the
  studio's own; the pack's files are that output split back into sources. The first seed is
  the Pub Quiz from the 2026-10-02 design-quality walk.
- **The shipped pack(s)** — sources as readable `.mjs` modules under `scripts/packs/<pack>/`,
  assembled by `scripts/build-news-pack.mjs` into `public/packs/` (git-tracked, served at
  `/packs/…`). The build refuses on: missing definition, missing SPX entry points, ES5
  violations in template JS (CasparCG 2.3 CEF), inline-hidden field holders, non-`fonts/`
  url() references. Edit a source, re-run the build, commit both.

## Uutishuone (the first pack)

Six graphics, one voice — a modern public-broadcaster news look (violet era; the palette,
mark and wording are our own), bundled Outfit, Finnish sample content:

| Graphic | Type | Layer | Notes |
|---|---|---|---|
| Uutishuone ticker | ticker | 10 | white bottom bar, rotating headlines (one textarea, one per line), live HH.MM clock; `next()` = skip |
| Uutishuone bug | bug | 20 | rounded-square mark + channel word + live clock, top right, always-on |
| Uutishuone name strap | lower-third | 30 | two-tier identifier; empty role collapses its tier |
| Uutishuone headline | lower-third | 31 | pill label (UUTISET / SÄÄ / SUORA…) docked on the headline container |
| Uutishuone endboard | fullscreen | 85 | full-frame close, manual out |
| Uutishuone opener | transition | 90 | full-frame stinger, clears ITSELF (own GSAP timer — the SPX `out` setting is not honoured by the cloud output) |

Rotator, not marquee, on purpose: a rotator survives live edits (`update()` re-reads the
list and holds its index — editing headlines on air never restarts the loop), and its
timers are killable GSAP calls the render clock can drive.

## Fight Night (the second pack)

Twelve graphics, one look — a combat-sports package (carbon/steel, one signal-orange accent,
Archivo + Saira, fictional promotion and fighters), with a ready-to-run three-bout rundown
that uses the top-level cue list (rounds interleave the bug, round cards and stats). Sources
are FILE-BASED — `packs/fight-night/<graphic>/{template.html,style.css,logic.js}` +
`manifest.json` — assembled by `scripts/build-production-pack.mjs` (same gates as the news
builder; runs in `npm run build`, so the emitted JSON can never go stale). Full plan and
element inventory: `docs/FIGHT_NIGHT_PACK_PLAN.md`; pinned by `e2e/production-pack.spec.ts`.
The fight bug's round clock counts down from its field, starts on Take, stops at 0:00 and
re-syncs when the operator types a new time + ✎ Update.

## Operating it (the demo walk)

1. Home → **Productions** → Import a package → **Import a package file…** →
   `public/packs/uutishuone.noacgpack.json` → the production page opens with all ten cues.
2. Take the **bug** cue, then the **ticker** cue — both stay up (each graphic has its own
   layer). Take the **opener** — it plays and clears itself.
3. Walk the name straps and headlines with ↑/↓ + Take; each replaces the previous on its
   layer while ticker and bug stay on air.
4. Live edit: select the ticker cue, edit the headlines textarea or the label, press
   **✎ Update** — the bar re-reads in place, no re-animation.
5. On air for real: **Publish** (signed in) and load the production's output URL in
   CasparCG/OBS/vMix — or **Export** the production to any target, controller included.
