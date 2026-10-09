# Independent post-landing check

The scoped task passed on fetched, landed main and on production. A checker who
did not implement PR #909 repeated the pinned reference task after the merge,
then independently authored and exercised the NoaCG interview task. No product
changes were needed by this check.

Checked commit: `2e164047f30ac1594144e82a55dcc91a6e727bda` (PR #909, merged
2026-10-09 22:48:59 UTC). The dedicated worktree was
`C:\Users\ahonemi\.codex\worktrees\editor-cli-independent-check\NoaCG-Studio`,
branch `codex/editor-cli-independent-check`. Fetch and fast-forward reached that
exact commit; an ancestor check passed. The checkout holding `main` was not
edited or built. Browser and native runs used the shared scheduler, cost 0.5,
one browser worker, and private ignored artifacts. Other sessions were left alone.

## Executed checks

All times below are scheduler times in UTC. The JSON results also retain the
inner task start and finish times. [jobs.json](jobs.json) contains exact commands
and actual exit verdicts.

| Check | Job | Started | Finished | Result |
| --- | --- | --- | --- | --- |
| VectorCraft post-merge repeat | j-4097 | 22:50:33.044 | 22:50:36.216 | DONE, exit 0 |
| Independent main task and three executable outputs | j-4100 | 22:55:06.326 | 22:55:43.208 | DONE, exit 0; one browser case |
| Anonymous production import/edit/save/reload/play | j-4101 | 22:55:50.701 | 22:56:09.091 | DONE, exit 0; one browser case |

The earlier reference job j-4032 was preparation, not the post-landing repeat.
Job j-4067 verified that the executed EXE was byte-identical to the EXE in the
published-hash ZIP. Both finished with exit 0.

The production run first read [version.json](production-version.json): exact
checked commit, built `2026-10-09T22:49:38.417Z`. It used the normal anonymous
product route, with no development module imports or seeded private state.
[main-task.json](main-task.json) and [production-task.json](production-task.json)
record the successful journeys. CI and deployment workflow verification is
recorded separately by the phase owner.

## Pinned working reference

Executed [VectorCraft v0.4.0](https://github.com/storytold/vectorcraft/releases/tag/v0.4.0)
from the [upstream repository](https://github.com/storytold/vectorcraft), pinned to
[`a26aa5b203c901979eb447d28e34e7357138c789`](https://github.com/storytold/vectorcraft/tree/a26aa5b203c901979eb447d28e34e7357138c789).
The actual download was the
[Windows portable ZIP](https://github.com/storytold/vectorcraft/releases/download/v0.4.0/vectorcraft-0.4.0-windows-x64-portable.zip),
verified against the [published checksums](https://github.com/storytold/vectorcraft/releases/download/v0.4.0/SHA256SUMS.txt)
and GitHub release asset digest. No runtime or upstream code was copied into the
product or this receipt.

- ZIP SHA-256: `fa8d7dc5590ebf1adb93d040dd7420441a2e55db2971f33c05c0c0e5edde0fec`.
- Executed EXE SHA-256: `19d93588ae034e38084be17e626a7f2174bd626059723c93d4681e752a72ffba` (93,838,872 bytes).
- Archive entry: `vectorcraft-0.4.0-windows-x64-portable/vectorcraft.exe`.

[reference-provenance.json](reference-provenance.json) records the verified
upstream URLs and five exact source paths with Git blob identities. Relevant
source includes the [loopback dispatcher](https://github.com/storytold/vectorcraft/blob/a26aa5b203c901979eb447d28e34e7357138c789/apps/vectorcraft/src/control_server.rs),
[UI control](https://github.com/storytold/vectorcraft/blob/a26aa5b203c901979eb447d28e34e7357138c789/crates/ui-egui/src/control.rs),
[text commands](https://github.com/storytold/vectorcraft/blob/a26aa5b203c901979eb447d28e34e7357138c789/crates/engine/src/cmd/typecmd.rs),
[object commands](https://github.com/storytold/vectorcraft/blob/a26aa5b203c901979eb447d28e34e7357138c789/crates/engine/src/cmd/object.rs)
and [history commands](https://github.com/storytold/vectorcraft/blob/a26aa5b203c901979eb447d28e34e7357138c789/crates/engine/src/cmd/edit.rs).
[reference-archive-verification.json](reference-archive-verification.json)
records the archive-to-executed-binary equality proof.

## Shared interactions and explicit task differences

The checker supplied an original [SVG interview card](reference-input.svg) to the
reference and independently chose the NoaCG edits below. These are comparable
text, typography, artwork, history and persistence tasks. They do not establish
identical artwork controls or whole-editor parity.

| Interaction | VectorCraft | NoaCG |
| --- | --- | --- |
| Open artwork | Import original 1920x1080 SVG; inspect native text/path nodes | Normal New graphic import route for real CLI `riverlight.zip`; choose Edit artwork |
| Change headline | Nadia Kovacs to Mina Patel with `text.setText` | Public field f0 to Mina Patel through Artwork text and Apply text |
| Second line | Stage producer retained unchanged | Public field f1 changed to Stage producer through the same visual control |
| Typography | Native size 60 to 64 with `text.setStyle`; increased bounds observed | Computed 48px to 64px through font-size inspector; bundled Inter actually loaded |
| History | Keyboard Undo/Redo restores the respective text bounds and retains Mina Patel | Undo returns 48px, Redo returns 64px, second text edit survives; Escape cancels a 90px draft |
| Artwork change | Translate panel alone by (+40,-25), then Undo/Redo its bounds | Change panel solid fill to #18384c through appearance inspector |
| Save and reopen | Create a new native .vectorcraft file, reopen and compare nodes/bounds/text | UI Save, await Saved, reload and compare complete source template on main; production repeats the visible journey |
| Render | Native render and GUI after reopen | Actual Play to the held pose after reopen, then rehearsal Out; all three browser exports execute play/update/stop |

[reference-task.json](reference-task.json) retains the actual command sequence,
compact node snapshots and history assertions. The reference panel ends at
(190,710), so its left edge aligns with the unchanged headline at x=190. NoaCG
retains its original geometry and uses a narrower panel, logo, grey role line
and static RIVERLIGHT label. Both show the edited white headline. The native
reference has compact tools/properties and native SVG nodes; NoaCG exposes source
layers, an inspector and a cue timeline. Typeface and unit matching were not
claimed.

## NoaCG contract evidence

The imported CLI ZIP SHA-256 was
`f03ed74c585cad7e0b46ba1fec16e314d73b986d2e969d688aa35ba7f0fb4311`.
After visual edits, main assertions proved unchanged JavaScript and asset data,
unchanged f0/f1 keys, updated field defaults, retained `festival-panel` and
`festival-config` IDs, retained JSON metadata and unrelated `.festival-unused`
CSS. The complete saved template was equal after reload. Static RIVERLIGHT was
unchanged after editing and after live field updates. The logo loaded at natural
width 72 and the bundled Inter FontFace reached `loaded` in each output.

Rehearsal and each executable SPX, CasparCG and OGraf browser output reached the
same measured held pose: root opacity 1, transform none, panel/name/role opacity
1. Each output showed 64px text and panel rgb(24,56,76), accepted a live update to
LIVE MINA / On-air producer, retained static text/metadata, and stopped to root
opacity 0. OGraf lifecycle actions returned 200. No page errors or console
errors occurred in either final NoaCG journey or any output.

[output-render-comparison.json](output-render-comparison.json) records a pixel
comparison: SPX and CasparCG captures match exactly. OGraf matches exactly after
subtracting the test host page's (8,8) body-margin offset. Non-white bounds were
[120,775,598,961] for SPX/CasparCG and [128,783,606,969] for OGraf. This is a
harness-host offset; graphic-relative geometry and pixels agree. It is not proof
of a receiving host's page setup.

No reference equivalent exists for CLI broadcast source packages, public fields,
static field exclusions, embedded script metadata, bundled broadcast resources,
cues, operator updates or SPX/CasparCG/OGraf exports. Those are the separate
NoaCG contract evidence above. This independent task did not repeat stale-context
refusal or every unsupported-edit refusal; the phase qualification receipts and
committed qualification spec cover those. It does not qualify physical playout
hosts, native browser zoom, all unsupported source forms or broader B17/B18/E23.

## Rendered journey and limits

All eleven final PNGs were inspected. [captures.json](captures.json) lists hashes
and sizes. Main and production were captured after actual Play completed Enter
and held at 1.26s, not at an arbitrary scrub time.

| Capture | Observed result |
| --- | --- |
| [Main 1920x1080](main-desktop.png), [production](production-desktop.png) | Opaque white Mina Patel, role, logo and static label survive reopen. Full artboard, inspector and four timeline rows are visible. |
| [Main 1366x768](main-laptop.png), [production](production-laptop.png) | Artboard fits and headline remains readable, but detail is small. Role timeline row needs vertical scrolling. |
| [Main 1093x614](main-zoom-proxy.png), [production](production-zoom-proxy.png) | Existing zoom-equivalent viewport with 200% of Fit. Artboard is vertically clipped, small text needs closer inspection, document title/Saved are hidden by responsive layout, Role needs timeline scrolling. Controls and timeline remain present. This is not a native browser-zoom test. |
| [Reference render](reference-independent-render.png), [native UI](reference-independent-ui.png) | Edited headline and size, moved navy panel, untouched mint role and white KITE LIVE survive native reopen. |
| [SPX](main-spx-live-update.png), [CasparCG](main-casparcg-live-update.png), [OGraf](main-ograf-live-update.png) | Full-size live-update text, font, logo, panel and static label agree; OGraf has the measured host offset described above. |

Production's real anonymous consent prompt remains visible in all three captures
and occludes the lower-right timeline. No consent choice was made. The normal
import/edit/save/reload/play task still completed. The screenshots preserve this
occlusion rather than claiming an unobstructed production timeline.

## Private harness corrections

Job j-4098 failed with exit 1 because the checker expected root opacity 0 at Home.
Existing editor runtime deliberately keeps the root visible during scrubbing;
the authored Enter animation targets the panel and text. The harness was
corrected to assert panel opacity 0 at Home, then actual Play and fully held
panel/name/role opacity 1. Product code was unchanged.

Job j-4099 passed with exit 0, including preservation and all exports. Image
inspection found its earlier fixed 1.60s capture setup was inside Out, after the
1.26s held pose. Final j-4100 uses actual Play and held-pose readiness before
captures. All source, asset, history and exported-pose assertions were retained.
These are observed harness corrections, not scheduler verdict losses or product
regressions. Direct Node invocation succeeded; no shim-causality claim is made.

## Phase-note record

The checked result and explicit limits are recorded in the bounded CLI phase of
[EDITOR_REBUILD_PLAN.md](../../../EDITOR_REBUILD_PLAN.md).
