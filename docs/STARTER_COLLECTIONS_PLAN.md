# Starter Collections and the shared brand library

Current delivery authority: [EDITOR_PLAN.md](EDITOR_PLAN.md). This document owns brand,
collection and installation mechanisms, delivered in R1.4 after the imported-SVG/animation
foundation. Further product implementation remains on owner hold.

Owner-approved scope, 2026-09-17: **Choose a NoaCG Starter Collection -> select/create a
brand -> adjust graphics in the editor -> add to production -> rehearse and run.** Most
users must finish this route without code or keyframes. The imported-SVG-to-animation workflow is the first delivery slice; this customization
journey uses the same editor and must complete within R1.

Home's Brand looks becomes **Brands**, the library of named `SavedLook` records already
used by the wizard. Complete the creator for name, logo, colours and fonts, with live
graphic previews. Use the same form and brand application transform from the editor;
do not create a second store or a collection-specific brand format. Capture from an open
graphic remains available alongside creating a brand from scratch.

Starter Collections are curated compatible designs, initially a lower third, headline,
logo bug and holding/end screens. The collection picker previews the whole set and lets
the user include only the graphics needed. Extend the existing kit creation path and
production save path. Authoring projects group GraphicDoc references; productions alone own live pools/cues.
Keep downloadable finished graphics packs interoperable with this route.

Brand application uses declared palette/font/shape roles and logo slots. Preview changes
across the selected set before applying. Unsupported artwork is identified; never imply
an imported SVG's arbitrary fills were recoloured or invent a logo placement. A local
graphic edit does not update the saved brand. Updating a saved brand does not modify
finished or on-air graphics. Applying later is explicit and targets named graphics.

The production action installs the selected graphics together, assigns sensible layers
and creates a starter cue order. Cue-specific names/content reuse the same graphic rather
than duplicating its design. Existing-production insertion previews additions, preserves
existing cues and avoids duplicate installs on retry. Multi-graphic updates use the previewed, revertible change set specified below, with
explicit durable-write outcomes before any success message.

Implementation order for this route:

1. **Shared brand foundation:** Home creator/editing and editor brand application, using
   existing records, shared colour/font controls, bundled assets and durable save feedback.
2. **Collection customization:** curated starter set, brand chooser/creation in context,
   multi-preview and clearly scoped individual overrides. Reuse the first phase's form.
3. **Production handoff:** selected-set installation and starter rundown through existing
   kit/show paths, with safe retries, durable outcome reporting and rehearsal.
4. **Acceptance and integration:** complete the route unaided in a proposed five minutes;
   test logo/font export, long content, save/reopen, individual overrides, collection-wide
   changes and actual production playback. This is an acceptance target, not a current claim.

The Home brand foundation has landed. Remaining editor integration follows R1.4 in the
consolidated plan; baseline measurements are assigned to their consuming slices.
The Studio inspection requirement applies to comparable brand/token/property behaviour;
NoaCG's production semantics continue to come from its own existing command path.


## Multi-graphic workspace and reuse, 2026-09-19

The owner now requires multiple graphics/timelines in one authoring project. See the
[workflow contract](research/editor-workflow-review-2026-09-19/README.md) for identities,
per-document drafts/history, migration and Home/production semantics. This is authoring
organization, not a revived Packet/package library or a second live-production container.
R1.4a-d refine this route: a durable projects/draft switching; b templates/brands per member;
c shared Home/editor selected-set installation and immediate playout availability; d recovery,
export and rehearsal. They can begin after R1.1c registry stability without waiting for AI.
Saved graphics remain standalone on Home; removing a project does not delete them. Both entry
points use the same installation operation and confirmed-write status. An already active
production retains its activated revision until explicit safe replacement. B19 joins B08-B10.

## Decisions, 2026-09-17

This is the R1.4 mechanism contract, linked to the
[animation editor rebuild](EDITOR_REBUILD_PLAN.md). It reuses the same editor and canonical
source, not a second editor. Home creation is implemented at `97601da7`; direct editor
application, collection customization and production installation remain unbuilt.

### Report application and preserve provenance

Choose a result from `applyLookToTemplate` containing the resulting template plus applied,
skipped and unsupported targets with reasons. Update all callers together when implementing
this return-type change; do not silently count untouched SVG fills as applied. Add optional
brand provenance to the saved graphic document: brand id and the exact role/target values
last written, including bundled asset content identity. Compare those values with current
source to identify individual overrides. Reapplication previews conflicts and preserves local
overrides unless explicitly selected for replacement. Old graphics without provenance remain
valid and require explicit application. Reject automatic propagation from saved-brand edits.
The editor applies source, visible sample data and provenance as one reversible transaction.

### Revert production changes without a library undo stack

Choose an explicit previewed change set: target ids, before and after document snapshots,
expected revisions and a durable operation identity. Persist the recovery record before any
member write; track confirmed writes and refuse success while any write is unconfirmed.
Retries reconcile the recorded operation instead of applying twice. Offer Revert using the
before snapshots, but first compare each current document with the operation's after revision.
Subsequent edits produce a conflict for review, never a silent overwrite. Record partial
outcomes and retain recovery across reload. Reject the old promise that editor history can
undo production library writes. Any new persisted recovery format must be versioned from its
first implementation, with unknown versions read-only and no unversioned side store.

### Reuse TemplatePack and stable installation identity

A Starter Collection IS a `TemplatePack` from `src/templates/packs.ts`, curated configuration
with its palette. Extend it rather than inventing another catalog. Saved installed graphics
carry optional stable collection id and item id; their pair, scoped to the destination
production, identifies an installation. Names remain editable labels. Match identity first;
name fallback is only an explicit, unambiguous legacy adoption preview and records identity
on confirmation. A same-name item from another collection is refused with an actionable
rename/keep-both choice, never silently replaced or attached to existing cues. Preserve
existing cues and map only confirmed installed ids into the new starter rundown. Repeated
installation uses the same operation identity. Reject name-based upsert as the default.

### Acceptance and scope

Collection drafts must survive switching graphics, Back, in-context brand creation/editing
and reload. Reuse existing durable draft/document storage with an explicit versioned format
if a new persisted shape is necessary. Save status distinguishes pending/confirmed/failed;
closing with unconfirmed writes offers retry or explicit discard. Creating a brand does not
reset collection edits. Undo remains scoped to the active graphic; collection-wide changes
have an explicit preview and recovery operation, not an implied cross-document undo stack.

Before R1.4 implementation, trace and document the existing live activation path. Required
policy: editing/installing library documents must not change an already active rendered
graphic. It retains its activated content until an explicit safe activation through the
existing production command path. If that isolation cannot be guaranteed, refuse replacement
of the active item and explain how to take it off air first. A durable write or successful
preview alone is not proof of on-air isolation. Test installation during active playback,
retry and subsequent intentional activation.

Use the refined R1.4a-d order above; it now includes project/draft ownership. Each
slice needs mapped browser checks, durable-write failure/retry evidence and its own owner
acceptance route. Include multiple collections with identical graphic names, renamed items,
legacy adoption, interrupted installation, later edits before revert, unsupported artwork,
brand asset replacement and exported font/logo portability. The five-minute route remains
an acceptance target, not a measured result. Automatic brand following remains later scope.

## Standing decisions

Owner decisions that still bind this plan (moved from the retired rulings file, 2026-09-26).

- No good design is left without a family: every design worth keeping belongs to a coherent collection, so someone who likes one graphic finds a matching production set.
- A collection's default look covers palette, typography, spacing, shape, layout, image treatment and motion. It is a default, never a lock.
