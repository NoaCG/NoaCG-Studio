# The saved-content model (the library, productions, and the graphic lifecycle)

**Status: adopted 2026-07-21; PACKAGES RETIRED 2026-08-04** (docs/GOALS_ARCHIVE.md "Student release"
step 3 - the audit found only empty folder shells, so removal needed no data migration).
This is the binding contract for how finished work is saved, organized, reopened, and
controlled.

Planned editor extension (2026-09-19, not shipped): [workflow decision](research/editor-workflow-review-2026-09-19/README.md)
adds versioned authoring-project manifests referencing standalone GraphicDoc IDs and per-document
draft sessions in R1.4a. It does not revive retired packages or change production/on-air copy
semantics. The singleton working slot below describes today's code, not the future tab contract.

## 1. The shape

```text
User
├── Graphic  (GraphicDoc — the FLAT library; every save is standalone)
│   └── Control panel + entries (ControlEntry[] ON the graphic)
├── Production  (model/shows.ts Show — the live unit: pool COPIES with a graphicId
│                back-link + cues + look + capability slugs — docs/CLOUD_PLAYOUT.md)
└── Video  (model/videoProject.ts — unchanged)
```

- **Where all of this is STORED: the durable store** (`model/durableStore.ts`) — IndexedDB
  behind a synchronous in-memory mirror, holding the seven heavy keys (graphics, shows, the
  working graphic and video slots, saved videos, looks, the retired packet store). It replaced
  localStorage, whose ~5 MB origin quota filled after about ten graphics: an uploaded image is
  base64 (+33%), localStorage stores UTF-16 (×2) and a library record keeps the Reset baseline
  (×2), so a 150 KB logo cost ~820 KB. A desktop profile now reports gigabytes. Three
  consequences worth knowing before touching a save path:
  - **Reads stay synchronous** (the mirror), so no model or component signature changed. The
    ONE asynchronous step is boot: `src/main.tsx` hydrates before importing App, because module
    scope reads the autosaved project as it loads.
  - **A write is confirmed a moment AFTER the call returns**, so a refusal cannot be that
    call's return value. A caller that wants to branch on it awaits `commitDurableWrites()`,
    which CLAIMS the failure and reports it in its own words; anything unclaimed is announced
    generically by App.tsx a tick later. A refused write rolls the mirror back, so the library
    never serves an edit no reload would reproduce, and no failure ever latches — an earlier
    refusal must not block the write that would prove there is room again.
  - **Small preferences stay in localStorage** (prefs, layout, doc kind, brand, AI settings,
    sync metadata): kilobytes, read before hydration by design, and seeded by E2E init scripts
    that cannot reach IndexedDB. A browser without IndexedDB falls back to localStorage
    entirely, old ceiling and all, rather than failing to boot.
- **`GraphicDoc`** (`model/library.ts`, durable key `spx-gfx-graphics`, sync kind
  `'graphic'`) is the durable unit: `{ id, name, packageId, template, baseline?,
  entries, activeEntryId, createdAt, updatedAt, deleted? }`. The id is a stable UUID —
  renaming never breaks references. `entries` are the control panel's named data rows
  (`{ id, label, values: Record<fieldId, string>, updatedAt }`). `packageId` is DEPRECATED
  inert data: never read by the UI, kept (not nulled) so retirement did not bump updatedAt
  across the whole library.
- **Packages are retired.** The `'packet'` sync kind is gone (existing cloud/local rows stay
  inert; nothing reads or destroys them), all package UI and writers are removed, and
  `#/package/*` lands on Home. The ONE surviving packet path is library.ts's v1 extraction:
  a pre-library packet found in the durable store still gets its embedded graphics migrated into
  the library on read (convergent; the packet is rewritten `graphics: [] + version: 2`).
- **Shows** (`model/shows.ts`) are the PRODUCTION unit (user-facing word: production): the
  graphic pool + the cue rundown + the production LOOK + the published capability slugs —
  docs/CLOUD_PLAYOUT.md §2. Grouping graphics for air happens HERE, nowhere else.

## 2. The working document and Save

`model/project.ts` (the autosaved working slot) gains `graphicId?: string | null` and
`dirty?: boolean` — which library record the open document IS, and whether it has changed
since the last explicit Save. The store (`templateStore`) tracks
`saved: { graphicId, dirty, status: 'idle' | 'saving' | 'failed' }`:

- Any template mutation marks `dirty` (the same subscription that autosaves).
- **Save** writes the template (+ baseline + entries) into the linked GraphicDoc; first
  save opens the SAVE DIALOG: name the graphic (every save is standalone in the flat
  library).
- **Save As / Duplicate** mints a new GraphicDoc id.
- The autosave slot is the crash-safety net (reload restores edits, dirty flag included);
  Save is the durable, named, synced record. Both survive; they are never conflated.
- Opening another document with unsaved changes asks first (Save / Discard / Cancel).

## 3. Navigation (hash routes, one application)

`src/app/router.ts` — hash routing (static-host safe, refresh restores, browser
Back/Forward are real history):

| Route | Surface |
|---|---|
| *(none)* | Home. Redirected on boot - the wizard on a first-ever visit, `#/home` otherwise (docs/GOALS_ARCHIVE.md "Student release" step 4). A fragment the app does not own (a sign-in token) renders Home and is left in place. The old code editor this route used to open is closed (2026-09-24). |
| `#/home` (+`#/home/<section>`) | Home — bare `#/home` is the dashboard (productions first, then top graphics + videos); sections: productions, graphics, videos, looks. Retired names (recent, controls) land on the dashboard. |
| `#/graphic/<id>` | Retired as a surface (2026-09-24): opens that graphic's CONTROL page and is rewritten to `#/control/<id>`, so the link an agent's `noacg save` prints still works. The control page does the cloud lookup described in the next row. |
| `#/control/<graphicId>` | The graphic's control panel (fields + entries + event buttons + live preview). An id this browser has not pulled yet is ASKED OF THE CLOUD and waited for (`backend/graphicWhenSynced.ts`): "Opening…" while it is fetched, "Graphic not found" only once it is known to be gone, and with no session a sign-in is offered and the id stays in the address, because the record usually exists in an account this browser has never opened. |
| `#/production/<id>` | One production's page (pool, cues, links, publish, operating). |
| `#/video` | The video editor shell. |
| `#/new` (+`#/new/<designId>`) | The creation wizard's front page. A boot that LANDS here renders no under-surface at all — there is no Home to preserve, and mounting one under a full-screen opaque wizard can only ever flash. |
| `#/new[/<designId>]/step/<name>` | ONE step of the wizard's walk: every step reached gets its own entry, so Back walks the walk and only the front page's Back leaves. NAMED, never numbered — import mode carries an extra step, so an index means a different step depending on which mode wrote the URL. |
| `#/package/*` | RETIRED — old links land on Home. |

`?control=<slug>` and `?chat=<slug>` query routes are untouched (hosted capability URLs).
Home and the control panel are ROUTED SURFACES, not modals, so Graphic → Control panel →
Back returns to the graphic, and Video ↔ Graphics is plain history.

**Card thumbnails are a LIVE render, never a stored picture** (`components/home/GraphicThumb.tsx`).
Every Home graphic card renders the real template through `preview/composeDocument`, in a small
iframe scaled from the template's own resolution and parked at its settled on-air state (the
editor canvas's own settle recipe: `update()` → the entrance parked at the end of its
FINITE motion, never `progress(1)` (docs/DYNAMIC_MOTION_SCOPE.md §11) →
`update()`). Nothing about the record changes: no thumbnail field on `GraphicDoc`, so no format
version bump, no migration, and no second copy of the artwork riding every cloud sync. It also
cannot go stale — a template edited on another device shows its new look the moment it syncs,
which is exactly when a preview has to be trusted. The cost, re-rendering per Home visit, is paid
down by mounting each iframe only once its card scrolls into view. The card frames on the
GRAPHIC rather than the canvas (`preview/frameGraphic.ts`, the same recipe behind the wizard's
picker cards): most formats occupy a fraction of the frame, so it measures the graphic's own box
once the settle is done and zooms onto that, with the whole-canvas fit as the floor.

## 4. Control panel entries

An **entry** is a named, saved data row for one graphic ("Anna Andersson — Presenter"):
create / duplicate / edit / delete / select; the ACTIVE entry's values feed the editor
preview (sample data), the in-app control panel's Play, and the exported standalone
`controlpanel.html` (entries are baked into the panel spec as a switcher). Entries live
ON the GraphicDoc, so they save, reopen, and sync with the graphic.

The HOSTED control page (`?control=<slug>`) publishes them the same way: `publishControlShow`
reads each show graphic's entries out of the library into the `panel` spec, and the page
renders a READ-ONLY switcher. Picking an entry loads its values into the SHARED staging
buffer — the same path typing takes — so it airs on an explicit take, and the hosted
`staged`/`live` model stays per-graphic, not per-entry. Authoring stays in the app; a change
reaches operators on the next publish. A show's copy of a graphic records `graphicId` (the
library record it came from) so the lookup is by stable id, not by name — see
docs/CONTROL_LAYER.md.

The whole-SHOW export (`export/showExport.ts`) carries entries the same way, and through the
same resolver (`model/library.ts` `entriesForSavedGraphic` — graphicId, unique-name fallback):
each graphic's entries are read out of the library at export time and baked into both the
aggregated `show_controlpanel.html` and that graphic's own `controlpanel.html`. Entries are
never embedded in the `Show` record, so this is not a persisted-shape change and needs no
migration — the show export references the library graphic and resolves entries on export.

**Every export that bundles an operator page carries them.** The SINGLE-GRAPHIC export (the
Export panel's SPX and HTML-overlay targets) reads them back through `ExportContext.entries`,
resolved from the working project's `saved.graphicId` at export time; the whole-SHOW export
resolves them per pool graphic as above. (The whole-PACKAGE export retired with packages —
whole-show export covers the need.) So the panel an operator downloads has the same switcher
wherever it came from, and a graphic that was never saved simply has no entries to carry —
entries are authored on the RECORD, not on the code.

## 5. Versioning

`GraphicDoc` carries `version: 1`; `Show` carries `version: 2` (normalized on read, a
format stamp for future breaking changes); the retired `Packet` keeps `version: 2` for the
v1 extraction (doctrine: STATE_MACHINE_SCHEMA §5). Additive fields never bump; sync kind
`'graphic'` ships with Supabase migration `0009_graphic_kind.sql`.

## 6. Folders — the library's grouping layer

**Status: presentation revised 2026-08-23** after the first real bulk use (22 agent-made
graphics saved into one folder and staged as a production). The DATA has not changed since it
shipped; what changed is that folders now group the view instead of filtering a flat one.

- **The data**: `GraphicDoc.folder?: string` — ONE optional, additive field, one level deep, no
  folder record anywhere. A folder IS the set of graphics naming it, so every folder verb is
  `setGraphicsFolder` over its members: renaming rewrites the name on each, removing clears it
  (the graphics are unfiled, never deleted), and an emptied folder ceases to exist by itself.
  Additive-optional means **no version bump and no migration** (§5), and a folder a user names
  but has not filled yet has nothing to persist — it lives in component state until something
  is moved into it, and is gone on reload. A folder is deliberately NOT the retired package: no
  export unit, no embedded copies, no second place a graphic can live.
- **The presentation** (`components/home/sections/GraphicsSection` + `home/FolderItem`):
  **folders come first, then the graphics filed in none of them.** Opening a folder shows its
  contents alone, under a breadcrumb carrying the way back, the folder's own ⋯ (rename /
  remove) and its "+ Production". Both views group — cards in the card grid, rows in the table
  — off ONE component, so a folder can never do less in one view than in the other.
  Until this walk the folders were a CHIP ROW over a flat list of the whole library, which the
  owner overruled on sight: *"no point with a folder if I see all the graphics as a list."*
- **A SEARCH FLATTENS IT — globally, and the owner ratified that scope on 2026-08-23.** Typing
  a name is a question about the whole library, so while a query stands the band stands down and
  every match is listed across folders, INCLUDING while you are standing inside one. Two
  obligations come with crossing folders. **Every match says where it lives**: the table
  switches on its FOLDER column and a card wears the same folder tag under its name (the card
  grid is the default view, so table-only was the same as nowhere for most people). Both are off
  at every other level, where the answer is already known and the column printed one value down
  the whole page; an unfiled match wears no tag on a card, where a lone em dash reads as a typo
  rather than as "nowhere". **Clearing the query gives the folder back** — `folderFilter` is
  retained rather than cleared while a search stands, so a search costs no walk back in.
  A "current folder" scope was considered and deliberately NOT built: it is worth adding only if
  a library large enough to need it turns up.
- **A folder pools whole.** "+ Production" on a folder adds every graphic it holds to a chosen
  or new production, through the same `poolAll` the bulk bar uses — including its honest
  partial-failure report ("N of M were added before storage ran out"), because the honesty of
  that report is the part that must not fork per door.
- **Every "+ Production" door is one component** (`home/ProductionPicker`): a library row, a
  folder, a bulk selection, and the open graphic's control panel. It CLOSES on a successful
  pick and moves the ✓ to the button; a FAILED add keeps it open, because a durable write is
  confirmed after the call returns (§1) and a closing menu would report a save that did not
  happen. Which WAY it opens is measured against the viewport, not assumed
  (`home/LibMenu`) — the bulk bar floats at the bottom of the screen by design.
