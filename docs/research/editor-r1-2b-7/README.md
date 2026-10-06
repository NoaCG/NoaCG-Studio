# R1.2b.7: folders, bins and hierarchy clarity

The [bounded spec and acceptance ledger](../../work-specs/editor-folders-bins/spec.md) record owner requirements, unattended decisions and evidence.

The [written-first baseline](../../work-specs/editor-folders-bins/evidence/baseline.log) ran j-3516 on unchanged main product source: existing group navigation passed; four new cases failed on absent folder/bin controls. The real-task case was added before implementation.

The [focused acceptance run](../../work-specs/editor-folders-bins/evidence/acceptance.log),
j-3577, passed 20 cases with `E2E_WORKERS=3`. It covers folders and bins,
group coexistence and exact ungroup, source preservation, atomic history,
stale/cycle/collision/unknown-operation refusal and document-switch drafts,
including reopening the same saved graphic. Unsupported metadata disables asset
moves. Asset moves/removals preserve folder labels and retain emptied bins.
Nested bin renames refuse paths occupied by another moving asset before any
rewrite, preserving source, view, revision and history exactly.
The Hairline task imports and places a sponsor image, saves/reopens through
the existing API and executes SPX, CasparCG and OGraf outputs. Geometry agrees
within 0.05px; the image resolves and no page errors occur.

Rendered captures: [desktop](desktop.png), [laptop](laptop.png),
[125% zoom proxy](laptop-125.png), plus the Project bins at
[desktop](desktop-bins.png), [laptop](laptop-bins.png) and
[125% zoom proxy](laptop-125-bins.png). The stage and root return stay visible;
Project scrolls, with the selected bin in view and asset controls within its width.
The proxy uses a 1093×614 CSS viewport for a 1366×768 screen at 125%.
Actual OS/browser zoom remains part of asynchronous desktop judgment.

Isolated mutations, broader regressions, build and landing are still pending.
The [desktop item](../../acceptance/owner-queue/2026-10-07-editor-folders-bins.md)
asks for product judgment only after the complete task passed.

Full B02/B04, final owner judgment and physical receiving-host acceptance remain open.
