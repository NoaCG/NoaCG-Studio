# M1 source and preview contract examples

Proposed design contract, 2026-09-17. These are worked examples for implementation and
review, not proof that the current editor implements the new protocol.

## Source ownership and transforms

Every transaction declares its document ID, expected revision, changed source ranges,
sample-data changes, asset changes and brand-provenance changes. It either applies completely
to that revision or refuses. Derived bounds and selection are not persisted as a scene.

| Target | Before | After Layout move | Motion preservation |
|---|---|---|---|
| Catalog inline-block title in its existing mask | `.lower-third-name { display: inline-block; }` | Add a dedicated commented base-layout rule: `#f0 { --layout-x: 40px; --layout-y: 0px; position: relative; left: calc(var(--layout-x) * var(--scale)); top: calc(var(--layout-y) * var(--scale)); }` | Existing GSAP `transform`/`clipPath`/opacity tracks remain byte-identical. Relative offset does not reflow siblings. Test mask clipping and root bounds. |
| Imported placed text wrapper | `#fw0 { left: calc(100px * var(--scale)); top: calc(80px * var(--scale)); }` | `left: calc(140px * var(--scale))`; top unchanged | Child transform remains X -80 to 0; never replace it with an absolute CSS transform. Existing `placeLine` idiom is reused. |
| Existing SVG group | `<g id="team" transform="translate(100 80) rotate(30) scale(2)">` | Preserve this transform; move the eligible child in parent-local coordinates | Invert the rendered parent matrix, including SVG viewBox and screen zoom. No flattening of children or removal of original transforms. |
| Logo wrapper | width 200, height 100, transform scale 1 | Resize to 300x150; scale stays 1 | Fit/crop is explicit; replacing bytes does not change the slot. |

The catalog offset adapter applies only after proving the supported title's positioning and
display idiom. Already positioned source retains its existing idiom. Arbitrary CSS, competing
insets, constraints and unknown stacking contexts require capability refusal, not an automatic
`position: relative` rewrite. Required catalog/F2/Starter targets must receive real adapters;
this refusal cannot be used to evade required basics. In Layout, first move is immediately
available with numeric values and creates no animation keys.

Worked parent conversion: for parent translation (100,80), rotation 30 degrees and scale 2,
a local delta (20,-10) produces world delta (44.6410161514,2.6794919243). Inverting that parent
maps the pointer back to (20,-10). A child at (40,20) becomes (60,10), leaving the parent and
the child's animation offset untouched. Translate-only calculations fail this example.

All screen-to-document conversions must include iframe/pasteboard offsets, fit zoom and
browser zoom. Rotation/scale use the declared pivot and parent frame. Resize writes supported
dimensions; scale writes a transform value. These are separate operations and tests.

## Gesture and history examples

- Layout drag: begin at R7; live poses are transient; Escape restores R7 source and visible
  pose, adds no history and releases capture. Pointer-up commits one transaction R8.
- Animate first key: sample the rendered property through the shared easing evaluator at
  the chosen effective time, convert to stored time and preserve the pre-edit pose. Do not
  invent keys on sibling properties. Subsequent moves replace the same key, not append noise.
- Monaco typing then visual movement then brand application: three logical undo steps in
  chronological order. Undo restores the exact source plus sample values and logo/provenance
  changed by that transaction. The code pane's cursor state is retained independently.
- During a drag, a code edit advances R7 to R8. Cancel the stale R7 gesture before accepting
  the code transaction. A pointer-up tagged R7 cannot patch R8. Report this calmly in the UI.

## Proposed preview wire contract

Editor-owned control envelopes contain:

```json
{
  "type": "noacg.editor.apply",
  "documentId": "graphic-a",
  "revision": 18,
  "frameGeneration": 4,
  "requestId": 72,
  "operation": "animation-data",
  "parkedTime": { "clock": "effective-seconds", "phase": "in", "value": 0.4 },
  "assetDigest": "sha256-of-paths-and-bytes"
}
```

Payload carries validated source-derived data for supported hot updates. Do not evaluate
arbitrary JavaScript to recover it. Acknowledgement repeats all four identities and reports
`applied` only after update, seek and required asset/font readiness. `requires-rebuild` and
`rejected` carry reasons. Timeouts are explicit failures/rebuild requests, never success.
Existing source/window checks remain mandatory; generation guards a WindowProxy surviving
iframe navigation. Runtime events use their existing channel and cannot masquerade as acks.

| Sequence | Required result |
|---|---|
| Apply R18/request72, then delayed ack R17/request71 | Accept only R18/72; selection, source and parked time stay on R18. |
| Replace logo bytes at unchanged `assets/logo.svg` | Digest changes; rebuild if unsupported hot replacement; await new asset/font readiness and seek. Path identity alone fails. |
| Rebuild generation4 to generation5, old generation4 ack arrives | Refuse old ack even when document/revision match. Only current frame generation may settle the request. |
| Undo R18 to old content, then redo before undo ack arrives | Both changes receive new monotonic revisions/request IDs. Matching content hashes do not make a late undo ack current. |
| Switch graphic A to B during pending request | Reject every response tagged A. Per-document Monaco models and selection cannot leak into B. |
| Unsupported source or hot-update kind | Preserve source; take declared full rebuild/read-only visual fallback. Never silently partially apply. |
| Cancel transient gesture | Restore committed pose through the current request stream; no source-history entry. |

The same asset-byte digest participates in caching and reload, including same-path font bytes.
No 350/650 ms guessed delay constitutes readiness. M1 must implement and exercise these cases
against the real production bundle before calling the protocol proven.

## Preservation fixtures

The baseline includes a version-999 animation payload and a supported document with custom
easing plus handwritten CSS/JS sentinels. Unknown-version parsing must not overwrite source.
M1/M4 must additionally retain the existing legacy, loop, lifecycle-call and branch fixtures
from the repository's animation tests. Saving a raw fixture is not a tested migration.
