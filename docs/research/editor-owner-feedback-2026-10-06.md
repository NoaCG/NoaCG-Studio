# Editor owner feedback, 2026-10-06

**Source:** the owner's desktop review of the R1.2b.6 group journey after PR #709.
The owner drew two rectangles and a closed Pen badge, grouped adjacent rows,
transformed the group, tried Undo/Redo, edited a member, returned to Composition,
saved/reopened, and tried Ungroup/Undo. The group workflow mostly made sense;
returning to the root composition was not immediately obvious. Canvas movement
to author animation felt natural.

## Why

The complete journey exposed everyday interaction and save-state friction. Keep
these observations visible in the existing roadmap without turning the next
folders/bins slice into a general editor rewrite. Engineering verification is
not owner workflow acceptance. This record captures reported behavior and
desired outcomes; it does not independently reproduce defects or mark them fixed.
Reproduce against current main before implementing a correction, since other
reliability work has landed since the groups release.

## Phase mapping and observable checks

| Feedback | Existing scope and follow-up | Acceptance to demonstrate |
|---|---|---|
| Rectangle/Pen and other drawing tools return to Select after each object | R1.2b everyday-tool usability follow-up, before R1.5; persistent tool ownership is now explicit | Draw several objects with the chosen tool without reselecting it. Completion retains the tool until the user switches tools; cancellation, path editing and group navigation remain coherent. |
| Entering a group is understandable; leaving it is hard to discover | Add to R1.2b.7 hierarchy acceptance, B02/E02; builds on the existing parent bar/local ruler contract | Current location and an obvious route to Composition/root are visible. Folders, transform groups and asset bins are distinguishable. Enter/exit works without instructions, retains canvas space, and explains parent versus local time. Check desktop, laptop and 125% zoom. |
| Moving artwork to create animation feels natural; rotate/scale/bounds should be consistent | Existing R1.2a/R1.2b transform/property contract, E04/E08 and B03/B05; usability follow-up | With a property armed, pointer movement, rotation and scale author the affected key at the playhead. Unarmed edits affect the base. Each gesture previews, cancels and undoes coherently. |
| Linked proportions appeared to allow squashing; familiar corners and mouse rotation are wanted | Existing R1.2b.1 transform contract: linked Scale X/Y, corner/edge handles and mouse rotation; investigate before claiming a defect | Numeric and pointer scale preserve the current ratio when linked and permit independent axes when unlinked. Temporary modifier behavior follows the existing contract. Rotation handles are discoverable and usable. Keep text-box layout resizing distinct from scale. |
| Delete, Undo/Redo, multi-select, Shift row ranges, right-click actions, modifier-drag duplication and proportional constraints should follow familiar conventions | Existing E02/E07/E17 and B02/B03/B06; bounded R1.2b usability follow-up | Demonstrate these actions consistently across canvas/layer/property controls, with input keyboard ownership intact. R1.2b.7 uses familiar selection and rename behavior on its new folder/bin controls; it does not implement the whole conventions list. |
| Rename layers by double-click/Enter; eye visibility; clear main/template row; properties available before keys | E02/E08 and B02/B05 layer/property usability follow-up | Rename without changing stable IDs, toggle visibility with an eye control, distinguish composition/template context from artwork, and expand X/Y, Scale and Rotation before animation exists. Preserve history, fields, masks and source fidelity. |
| Two diamonds are unclear; missing hover explanation, value/control alignment and numeric mouse scrubbing | Existing per-property animation and scrubbable-number contracts, E04/E08 and B03/B05; focused discoverability/layout follow-up | Every key control explains its distinct action by tooltip/accessibility name. Rows align at supported sizes. Numbers scrub with the documented modifiers, commit as one undo, and cancel with Escape. Existing implementations must be checked before adding replacements. |
| Unsaved work is questioned after reaching Home or opening another graphic | R1.4a durable graphic/draft lifecycle, B08/B09; bounded leave-editor reliability correction before another broad workflow review | Resolve unsaved work before leaving the editor. Offer save/keep, discard, and staying in the editor. Discarding an experiment does not retain it as a saved graphic or damage an existing saved copy. Avoid a delayed repeat question at the destination. |
| Repeated NOT SAVED TO THE CLOUD notices interrupt editing and other routes | Shared save/sync status reliability, with R1.4a/R1.4d; bounded correction alongside leave-editor behavior | Show one subtle, persistent and truthful save/cloud status. Unchanged sync state does not repeatedly interrupt. A new actionable failure remains visible with recovery, without treating on-air readiness as cloud-save state. Identify the actual notice and affected route/account state during reproduction. |
| Continue native editing while importing external alpha image sequences, Lottie and similar assets | Already R2.1a Lottie profile/import and R2.1b numbered image sequences, B14; richer structured data remains R3.1 | Keep both native authoring and imported-asset workflows. Preserve alpha, source FPS, resources and bundled exports; combine supported clips with editable NoaCG text/data, steps/states, In/Out behavior and trigger timing. Check reverse seek, interruption, preview/output parity and actual receiving hosts. |

## Next-session boundary

R1.2b.7 remains folders and bins. Add obvious group/root navigation and clear
folder-versus-group context to that slice, plus familiar interaction on its new
controls. Record findings that block its complete workflow and fix only clear,
contained problems within that scope. Persistent drawing tools, general transform
and property polish, broader layer conventions, and save-state work remain named
follow-ups. Animated asset imports stay in R2.1; this feedback does not bring them
into R1.2b.7 or replace native authoring with external-only creation.

After R1.2b.7, recommend the bounded drawing/transform/layer usability corrections
before proceeding to more animation features; save/leave reliability can be a
separate contained slice under its existing ownership. The exact correction order
depends on reproduction, not an assumption that every reported behavior is absent.
No new release number or full B02/B04 completion is declared here.

## Evidence

- [Authoritative editor roadmap](../EDITOR_PLAN.md): native visual authoring, interaction contracts, R1.2b, R1.4a/d and R2.1a/b.
- [Detailed editor contracts](../EDITOR_REBUILD_PLAN.md): linked scale/handles, numeric scrubbing, hierarchy and later animated assets.
- [Group review and owner response](https://github.com/NoaCG/NoaCG-Studio/blob/745c6f2dcd9ce5e82cc6655c652e08f0568800fd/docs/acceptance/owner-queue/2026-10-05-editor-groups.md).
- [R1.2b.6 engineering receipt](editor-r1-2b-6/README.md): scoped verification, supported operations and remaining acceptance boundaries.

This documentation change records and assigns the feedback. It changes no
product behavior; full B02/B04, final owner acceptance and physical receiving-host
acceptance remain open.
