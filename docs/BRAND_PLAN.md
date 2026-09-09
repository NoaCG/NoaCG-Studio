# Brands - your own look, chosen per graphic

**Status: binding plan, owner-directed 2026-09-05. Level 1 is wave work; level 2 is parked and
described in section 9. Row 1 of section 10 (the MODEL and the wizard CHOOSER) landed
2026-09-06 - sections 3 and 5, plus the logo half of section 6's one-graphic apply; the CREATOR
of section 4 and the production-wide apply are still to build.** The ask, in the owner's words: *"we need to be able to create a brand and
then in the wizard you should be able to choose that brand. The graphic would magically adapt to
the brand. If there's a place for a logo, that logo would be placed there. Colors, fonts,
everything would follow the brand."* The creator lives on Home.

**The user promise:** make a brand once - logo, colors, typeface, a few words on how it should
look - then pick it from a list when you make a graphic. The graphic comes out in that brand, logo
included wherever the design has a place for one. Apply it to graphics you already made.

---

## 1. What exists today, and why the checkbox feels dead

The feature is four pieces that do not know about each other, plus two that are missing. This plan
joins them; it adds no fifth store.

- **The anonymous project brand** (`src/model/brand.ts`, key `spx-gfx-brand`). One unnamed record:
  palette + typeface + shape tokens. Every wizard Create overwrites it with whatever was just made
  (`CreationWizard.tsx`, the `saveBrand` call after `applyDraftProject`). The footer checkbox
  "Colors & typeface from this project" copies it into the draft. It does something, but it copies
  from a graphic nobody chose, and it only appears once a first graphic exists. That is the whole
  reason it reads as inert.
- **Brand looks on Home** (`src/components/home/sections/LooksSection.tsx`, `model/packets.ts`
  `SavedLook`). Named, cloud-synced (`SYNC_KINDS` has `look`), import/export as `.look.json`,
  "Apply" retints the open graphic (`applyLookToTemplate`), "Use for new" copies the look into the
  anonymous record. A look can ONLY be captured from a graphic open in the editor
  (`captureLookFromTemplate`); nothing lets a person author one from nothing.
- **Productions carry a look** (`model/shows.ts` `Show.look`, set on the first graphic added). The
  wizard, opened from a production, pre-ticks the checkbox with it.
- **The AI door proposes colors** from the saved looks and from an uploaded image
  (`AiStep.tsx` `.ai-brand` strip, `assets/paletteExtract.ts`). Proposed, never applied.
- **Missing: a logo in the brand.** Logos travel a separate road: wizard imported images ->
  `draft.logoAssetPath` -> the shared slot every `logo: 'optional'` design gets
  (`templates/shared/logoSlot.ts`, a real filelist field bound to `<img id="fN">`).
- **Missing: a creator.** Colors and typeface are chosen per graphic in the Style step; there is no
  surface that makes a brand as an object of its own.

## 2. Decisions (owner, 2026-09-05)

1. **The wizard defaults to no brand.** A person with no brands sees no chooser at all; a person
   with brands sees "None" selected until they choose. This reaffirms the standing ruling that
   matching is explicit (`docs/GOALS_ARCHIVE.md`, "Project brand + match toggle").
2. **The logo goes only where the design has a place for one, and there it is on by default.**
   A design that declares `logo: 'optional'` gets the brand's logo in its slot when a brand with a
   logo is chosen, even where the design's own default is logo-off. A design with no slot gets no
   logo, and nothing tries to invent a place for it - no AI placement, no "beside the graphic".
   Those are level 2 questions (section 9) and the owner named the risk himself.
3. **One logo per brand for now.** A logo set (light, dark, monochrome) comes later as additive
   fields; the model is shaped so that costs no migration.
4. **The creator lives on Home**, where brands already live. The section is renamed from "Brand
   looks" to "Brands".
5. **Brand = today's look, grown.** Not a new store beside the old one. Same storage key, same
   sync kind, same file format extended - a `.look.json` from before still imports.
6. **The anonymous record retires.** Create stops overwriting it. Its one remaining job, "use this
   for new graphics", becomes a pointer to a named brand (`defaultBrandId`); the wizard chooser
   still starts at None (decision 1) - the default brand is what "Use for new graphics" on Home
   preselects, nothing else.
7. **Bake at create, apply on demand.** A graphic carries its brand's values in its own code
   (code is truth, principle 1). Editing a brand later does not silently re-brand finished
   graphics; "Apply brand" on a graphic or on a whole production does, visibly and undoably.

## 3. The model

Additive on `SavedLook` and `ProjectBrand` (root `AGENTS.md` rule 6: optional fields, no version
bump, no migration). The type keeps its name in code; the UI word is "brand".

```ts
// model/brand.ts - ProjectBrand gains:
logo?: AssetFile;      // PNG or SVG as a data-URL asset at images/<slug>.<ext>; ships in exports
notes?: string;        // "how the graphic should look", free text, shown in the creator and the
                       // chooser's tooltip; level 2 feeds it to the AI brief
// model/packets.ts - SavedLook is the named, synced brand record (id, name, brand, updatedAt).
// model/brand.ts - the singleton record is replaced by:
defaultBrandId: string | null   // key spx-gfx-default-brand; loadBrand() resolves it to the look
```

- `loadBrand()` keeps its signature and returns the default brand's `ProjectBrand`, or null. Every
  caller (the wizard, the AI strip, `captureLookFromTemplate`'s fallback) keeps working; the
  `saveBrand` call at Create is deleted, and `saveBrand(look.brand)` on Home becomes
  `setDefaultBrand(look.id)`. `clearBrand` clears the pointer. The old key is read once for a
  brand written before this landed and offered as an importable "Previous project look" - one
  line in the creator, and it disappears once dismissed or saved as a brand.
- **Productions** gain `brandId?: string`. `Show.look` stays as the captured fallback for
  productions that never chose a brand; when both exist the reference wins.
- **Logo size.** The sync layer warns above 500 KB per record (`supabaseProvider.ts`
  `BODY_WARN_BYTES`) and the record carries the data URL. The creator prefers SVG, accepts PNG,
  and refuses a file above 300 KB with the reason ("a logo this large slows every sync and every
  export; export it smaller or as SVG"). Measured, not guessed: the row records the size of a
  typical PNG channel mark at 512 px.
- `brandPatch(brand)` (`wizard/draft.ts`) additionally writes `logoAssetPath` and
  `importedImages: [logo]` when `brand.logo` exists and `variant.logo !== 'none'`; the existing
  `logoEnabled` resolution (`model/wizard.ts`, `options.logoEnabled ?? variant.defaultLogo ??
  !!options.logoAssetPath`) then turns the slot on because a path is present. Decision 2 falls out
  of the code that is already there.
- `applyLookToTemplate` learns the logo: when the template has a filelist field whose element is
  the `.{prefix}-logo` image, it adds the asset, sets the field's default value to the path and
  writes the `src`; a template without such a field is left exactly as it was, which
  `designHasLogoSlot` already decides for the catalog.

## 4. Home - the Brands section and the creator

Route: `#/home` -> Brands chip. One list, one creator.

**The list** (today's rows, kept): swatches, name, typeface, plus the logo thumbnail and a star
for the default brand. Row actions: Edit, Apply to open graphic, Use for new graphics (sets the
star), Download `.brand.json`, Delete. Import accepts `.brand.json` and `.look.json`.

**The creator** opens in place of the list (not a modal; Home sections are pages) for "+ New
brand" and Edit. Fields, top to bottom:

1. **Name.**
2. **Logo.** Drop or choose PNG/SVG. Shown twice, on the app's dark ground and on white, because a
   mark that vanishes on one of them is the first thing a producer notices. "Remove" clears it.
3. **Colors.** Accent, text, dim text, panel - the same four the Style step edits, with the same
   pickers and hex inputs (`Palette` in `model/wizard.ts`). One button, "Pull from the logo",
   runs `extractBrandColors` on the uploaded mark and offers its colors as chips; clicking a chip
   sets the accent. The pick stays the person's (paletteExtract.ts explains why).
4. **Typeface.** The bundled list, or upload a font file - the Style step's importer reused, not
   copied (`model/fonts.ts` `CustomFont`, `registerAppFont`, tabular-figure measurement).
5. **Notes.** "How should graphics in this brand look?" Free text, three lines visible.
6. **Advanced - shape.** Collapsed. Corner radius, blur, edge, accent weight, trackings: the
   `TOKEN_VARS` set `captureLookFromTemplate` already captures. Most people never open it; a look
   captured from a graphic fills it.
7. **Seed from the open graphic.** The existing capture, as a link inside the creator rather than
   a separate row, and only when a graphic is open.

**Live preview, the part that makes it a creator and not a form.** Three real catalog designs
render in the brand as it is edited - one lower third with a logo slot, one info card, one corner
bug - through `wizard/MiniPreview.tsx`, each created with `variant.create(options)` and the
brand's patch. The person sees the logo land in the slot and the accent move before saving. Which
three is a design choice for the row; the rule is that at least one has a logo slot and at least
one has none, so decision 2 is visible in the preview itself.

Save writes through `commitDurableWrites()` and reports a refusal before it says saved, like the
import path does today.

## 5. The wizard - the chooser

The footer checkbox becomes a select: **Brand: None / [each brand by name]**, offered exactly
where the checkbox is offered today (`BRAND_MODES`, and the per-mode step rule in
`CreationWizard.tsx` - a video, a dropped template file and a blank have nowhere to put a brand,
so they never see it). With zero brands the control is absent, not disabled (decision 1).

- Choosing a brand does what the checkbox did (`patch(brandPatch(brand))`) plus the logo
  (section 3). Choosing None clears palette, font and the logo path the brand set - and only that
  path, never an image the person imported themselves.
- The Browse ranking keeps its `brandFamily` context from the chosen brand's `styleTag`.
- **Production context** (`pendingProductionId`): the production's `brandId` preselects the
  chooser; a production with only a captured `look` behaves as today.
- **The AI door's brand strip** lists brands by name, with the logo thumbnail, and writes the
  same `spec.brandColors` lock it writes today. Applying font and logo through the AI path is
  level 2; the strip says "colors" so nobody expects more.
- The wizard's `walk` snapshot (`matchBrand`, `brand`) becomes `brandId`; a walk restored from
  before this landed reads `matchBrand: true` as "the default brand".
- Kit mode: the chosen brand reaches every graphic of the set, as the toggle does today
  (`kitLookPatch`).

## 6. Applying a brand to graphics that exist

- **One graphic**: Home row "Apply to open graphic" (kept) and the editor's Style panel gains
  "Apply brand..." listing the brands. Both go through `applyLookToTemplate` and land on the CSS
  tab with the patch highlighted and undoable, as today.
- **A production**: the production page gains "Apply brand to all graphics" - the same function
  over each saved graphic in the production, each write reported, the production's `brandId` set.
  Undo is per graphic (the editor's history), so the button says how many it will touch first.

## 7. What a brand cannot reach, said where it would be expected

The chooser appears only where the brand can reach the graphic, which is the owner's standing rule
(2026-09-03: do not offer things that do nothing). Two cases deserve a sentence in the UI rather
than silence:

- **Imported SVG artwork** keeps its own fills; a brand changes the `:root` vars and the typeface
  the imported design reads for its TEXT, and nothing else. The Import mode's chooser tooltip
  says so. Recoloring artwork by role is an SVG-road question, not a brand one.
- **A design with no logo slot** shows no logo. The creator's preview shows this by including one
  such design (section 4).

## 8. Gates and the owner's route

- `npm run build`; `npm run catalog:affected` after the `logoSlot.ts` / `applyLookToTemplate`
  change, and the gates it names.
- Playwright, mapped in the same commit: the creator (make a brand with a logo and a custom font,
  reload, it is there; the 300 KB refusal), the chooser (zero brands = no control; choose one =
  accent, font and logo in the created graphic; None clears only what the brand set), apply to an
  existing graphic (logo lands in an existing filelist field, a slotless design is byte-identical),
  and the production-wide apply. `e2e/library.spec.ts` and `e2e/package.spec.ts` already cover
  the looks rows; they are updated, not duplicated.
- Owner-queue file (`docs/acceptance/owner-queue/2026-09-xx-brands.md`): route under a minute -
  Home -> Brands -> + New brand -> drop a logo, pick an accent -> Save -> + New graphic -> choose
  the brand -> the lower third carries the logo. What to look at: the logo on both grounds in the
  creator, and whether the chooser reads as "which brand" without a tooltip.
- Docs in the same commits: `src/components/wizard/AGENTS.md` (the chooser replaces the toggle
  paragraph), `src/components/home/AGENTS.md` (the creator), `model/brand.ts` header,
  `docs/GOALS.md` item moves to the archive when the owner has seen it.

## 9. Level 2 - parked, with the mechanism sketched

Not started until the owner moves it up; written here so the level-1 shapes leave room for it.

- **The brand bible as a PDF.** From the Brands section: a generated document - logo on both
  grounds, palette with hex values and contrast ratios, typeface specimens, the notes, and the
  three preview graphics rendered in the brand. Deterministic HTML-to-PDF first (the export path
  already renders templates headless); AI only for prose, and only as a proposal the person
  edits, under the BYO/tier rules in `docs/AI_PLATFORM_PLAN.md`. Sent to a client or a producer.
- **Notes feed the AI brief.** `brand.notes` joins the Create-with-AI brief when that brand is
  chosen, next to `brandColors`.
- **A logo set.** `logoDark`, `logoMono` additive beside `logo`; the slot picks by the panel's
  luminance, which `useMarkLegibility` already measures.
- **Placing a logo where no slot exists.** The owner's own reading: an AI job, or a manual
  placement that risks the design. Neither is level 1. When it comes, it is an editor action that
  writes a real slot into the code (a filelist field plus the image), never a floating overlay.
- **Brand follows.** An opt-in per production that re-applies the brand to its graphics when the
  brand changes. Only after apply-to-all has been used enough to know it is wanted.

## 10. Wave rows - the draft for the night

Two rows. The second starts when the first lands, because both need the model and the model
belongs to one branch. Letters and pools are the orchestrator's to mint; the pools below are the
recommendation, with the kind of thinking each rewards.

```
SESSION <1> - brand model chooser
BRANCH <tool>/<1>-brand-model-chooser
MODEL  opus high - product judgement inside an existing contract; the shapes are decided, the
       joins are not written
START  now
TOUCHES src/model/brand.ts, src/model/packets.ts, src/model/shows.ts, src/components/wizard/draft.ts,
       src/components/wizard/CreationWizard.tsx, src/components/wizard/steps/AiStep.tsx,
       src/components/home/sections/LooksSection.tsx (row actions only), src/templates/shared/logoSlot.ts,
       e2e/wizard-brand.spec.ts (new), e2e/library.spec.ts, e2e/package.spec.ts   MINTS -
GOAL   A brand with a logo, chosen from the wizard's chooser, produces a graphic that carries its
       accent, typeface and logo in its own code; with zero brands the chooser is absent; None
       clears only what the brand set; Create no longer overwrites any brand record; the same brand
       applied to an existing graphic with a logo slot fills the slot, and leaves a slotless graphic
       byte-identical. Every claim pinned by a spec that is mapped.
WHY    docs/BRAND_PLAN.md §1 - the toggle copies from a graphic nobody chose, and the logo has no
       road into a brand at all. This row is the joint; the creator (next row) is worthless without it.
READ   docs/BRAND_PLAN.md (all), src/model/brand.ts, src/model/packets.ts (looks half),
       src/components/wizard/draft.ts brandPatch, src/templates/shared/logoSlot.ts,
       src/components/wizard/AGENTS.md (brand toggle + BRAND_MODES paragraphs).
DO     1. Model (§3): logo + notes on ProjectBrand, defaultBrandId replaces the singleton, loadBrand
          resolves it, Show.brandId, one-time read of the old key.  2. brandPatch writes the logo path;
          applyLookToTemplate fills an existing logo field.  3. The chooser replaces the checkbox (§5),
          production preselect, walk snapshot, AI strip names brands.  4. Home rows: "Use for new
          graphics" sets the pointer and shows the star.  5. Specs and the wizard AGENTS.md paragraph.
CORE   1-3. Step 4 and the AI strip are the tail.
TRAPS  paletteById substitutes PALETTES[0] for an unknown id and never reports a miss - brandPatch's
       comment says why a brand's palette must travel as customPalette. The logo is a data URL inside a
       synced record; measure a real PNG mark's size and write the number into the 300 KB refusal.
GATE   npm run build, npm run catalog:affected and the gates it names, then push and read the CI run -
       check WHICH jobs ran. Commit each verified step.
QUEUE  Then, as your LAST THREE actions and in this order: /check; write
       docs/handoffs/<date>-<1>-brand-model-chooser.md; /queue-merge. Never merge into main yourself.
```

```
SESSION <2> - brand creator home
BRANCH <tool>/<2>-brand-creator
MODEL  fable high - a creation surface a non-technical producer uses once and trusts; UI/UX work
START  on <1> landing
TOUCHES src/components/home/sections/LooksSection.tsx (becomes BrandsSection), src/components/home/BrandEditor.tsx (new),
       src/components/home/HomePage.tsx (chip label + route), src/styles/*.css (home section),
       src/components/home/AGENTS.md, e2e/brand-creator.spec.ts (new),
       docs/acceptance/owner-queue/<date>-brands.md   MINTS -
GOAL   On Home, "Brands" lists brands with logo thumbnails and a default star; "+ New brand" opens a
       creator with name, logo (shown on dark and on white), four colors with "Pull from the logo",
       typeface (bundled or uploaded), notes, collapsed shape; three real catalog designs preview the
       brand live, one of them slotless; Save persists through the durable store and a reload shows the
       brand; a 300 KB logo is refused with its reason; import accepts .brand.json and .look.json.
WHY    docs/BRAND_PLAN.md §4 - a brand can only be captured from an open graphic today; there is no
       way to author one, so the chooser row <1> built has nothing a producer made on purpose.
READ   docs/BRAND_PLAN.md §2, §4, §7; what row <1> landed, in the code rather than in its handoff -
       src/model/brand.ts (the ProjectBrand record and the retired anonymous look it still reads)
       and src/model/packets.ts captureLookFromTemplate, whose header states the one degradation
       row <1> left: with no brand and no legacy record the style family falls back to 'minimal',
       which costs Browse ranking order and nothing else; src/components/home/AGENTS.md;
       src/components/wizard/steps/StyleStep.tsx (font import + color pickers to REUSE);
       src/components/wizard/MiniPreview.tsx; src/assets/paletteExtract.ts; docs/DESIGN_LANGUAGE.md.
DO     1. Rename the section and its chip; rows gain thumbnail, star, Edit.  2. BrandEditor with the
          seven fields of §4, reusing the Style step's pickers and font importer (extract shared pieces
          rather than copying).  3. Live preview: three designs via MiniPreview + brandPatch, re-rendered
          on every edit, debounced.  4. Save/refusal through commitDurableWrites; Edit round-trips.
          5. Spec, AGENTS.md, the owner-queue file with the §8 route.
CORE   1-4. The shape section may ship collapsed and read-only if the session runs short.
TRAPS  Home sections are pages, never modals (home AGENTS.md); the preview iframes cost RAM - three,
       not six, and unmount when the creator closes. A font uploaded here must registerAppFont so the
       list row renders in it after reload, as loadBrand does.
GATE   npm run build, then push and read the CI run - check WHICH jobs ran. Commit each verified step.
QUEUE  Then, as your LAST THREE actions and in this order: /check; write
       docs/handoffs/<date>-<2>-brand-creator.md; /queue-merge. Never merge into main yourself.
```
