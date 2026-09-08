// The TYPE FLOOR: the smallest a text line may render at, per graphic category.
//
// It lived as a const inside scripts/type-floor.mjs, which made it a CATALOG gate and nothing
// else - it renders every shipped variant AS AUTHORED and fails on anything under the floor.
// That is only half the question. `blocks`/`designAdjust` then rewrites the very font sizes the
// gate certified, on the AI path, after the gate has run: `designAdjust` clamped a supporting
// line at a hard 14px while this table holds a lower third to 20px, so a design could pass the
// catalog gate as authored and reach air six points under the floor with nothing measuring it.
//
// So the number moves here, where the adjuster, the live bench and the script can all read the
// SAME one. A second copy is how the gate and the thing it gates come to disagree - the
// unsafeJsConstructs precedent (one question, one answer, one place to update).

// MOVED 2026-09-08. The numbers themselves now live in `src/model/designRules.ts`, which its own
// header calls "the one canonical module for on-air legibility constraints ... nothing copies its
// numbers" - and these are legibility numbers. The move happened because the PRIMARY floor became
// type-aware (owner ruling 2026-09-08) and had to read the same per-category floor a persistent
// graphic already answers to; a model-layer rule cannot import validation, and copying the table
// would have produced exactly the second source of truth this file was created to prevent.
//
// This file stays as the name every caller already imports.
export { TYPE_FLOOR_PX, typeFloorFor } from '../model/designRules';
