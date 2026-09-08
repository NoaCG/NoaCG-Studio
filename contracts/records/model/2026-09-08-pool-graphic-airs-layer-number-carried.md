# model/pool-graphic-airs-layer-number-carried

Rule: `model/pool-graphic-airs-layer-number-carried`. Recorded 2026-09-08 on `claude/a-model-contract` at 684e2bf2.

The contract this replaced said the opposite - that the `graphics` array order IS the layer stack in paint order, that both surfaces showing it reverse it for display, and that `moveShowGraphic(+1)` therefore means forward. All three claims were false when this rule was written.

The layer is an explicit number the operator types (`DEFAULT_PLAYOUT_LAYER`, and `nextFreeLayer` for a new entry), and every z-order consumer reads `graphicLayer(g)`: `src/control/hostedControl.ts`, `src/export/showExport.ts`, `src/packs/graphicsPack.ts`, `src/components/home/ProductionPage.tsx`. Neither display site reverses anything - the production page shows a per-graphic layer badge and a shared-layer warning, and the editor's Productions block renders only a count. `moveShowGraphic` is dead code: nothing outside its own definition calls it, and it is filed as docs/backlog/dead-move-show-graphic-and-its-contract.md. `shows.ts` also still carried the stale phrase 'the graphic POOL, in layer order' in its own doc comment; that comment was corrected on the way in.
