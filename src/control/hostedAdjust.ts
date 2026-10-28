// THE ADJUST BLOCK ON THE HOSTED PAGE AND PHONE (docs/work-specs/playout-adjustments/spec.md,
// phase 3), with the production page's rules and the hosted page's authority: an operator there
// edits what the shared staging buffer holds and airs it only on Take or Update, exactly as for a
// field (control/cueStaging.ts). It never writes the production.
//
// Publish carries what the block needs beside each cue (`PublishedAdjust`): the graphic's default
// and the cue's own record as stored, the production look on that graphic, and the box the
// production page measured. An edit here is STAGED in the graphic's shared buffer under a key no
// field can have (`@adjust`): the graphic's default under the unit separator alone, a cue's
// exception under its cue id. The value is JSON, `{ on, r }`: the record staged (`r`, null for "no
// record at this scope") and the PUBLISHED record it was edited from (`on`). The shared buffer is
// never cleared, so a staged record counts only while that published record is still the one
// published: once the production page publishes another, its newer record wins and the old
// staging is ignored. A staged record that counts stands in for the published one at its scope,
// so every open page sees it and the next Take or Update carries the fold; nothing staged, the cue
// airs what was published.
// The doors are model/adjust.ts's (`patchAdjust`, a later version's record refused).
//
// The hosted page has no measurer of its own: a preset resolves against the published box, which
// is the production page's last measurement of that cue (spec "Stale geometry").
//
// Pure and Node-tested (scripts/hosted-adjust.test.mjs).

import { ADJUST_READ_ONLY, patchAdjust, promotedMembers, readAdjust, stepPatch, type AdjustPatch } from '../model/adjust.ts';
import { cueAdjustState, NO_GEOMETRY, type CueAdjustState, type GeometryPart, type StyleContext } from './adjustGeometry.ts';
import { STAGED_ADJUST } from './cueStaging.ts';
import type { ImportedFace } from './cueStyle.ts';
import { LOOK_FONT_DIR } from './productionLook.ts';
import { appearanceEquals, IDENTITY, publishedAppearance, type AppliedAppearance, type LookLayer, type Measurement, type Size } from './cueAdjust.ts';

/** What Publish carries beside a cue for the hosted page's Adjust block. */
export interface PublishedAdjust {
  /** The pool graphic's id: what a measurement and the look are keyed by. */
  graphicId: string;
  /** The graphic's default and the cue's own record, as stored (absent: none at that scope). */
  graphic?: unknown;
  cue?: unknown;
  /** The production look on this graphic while it is on. */
  look?: LookLayer;
  /** The production page's measurement of this cue, or none. */
  box?: Measurement;
  frame: Size;
  stage: Size;
}

const US = '\u001f';

/** The buffer key of a scope's staged record: a cue's under its id, the graphic's under none. */
export const stagedAdjustKey = (cueId: string | null) => `${cueId ?? ''}${US}${STAGED_ADJUST}`;
const keyAt = (scope: 'cue' | 'graphic', cueId: string) => stagedAdjustKey(scope === 'cue' ? cueId : null);

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** One scope's staged record: undefined (nothing staged that counts), null (staged as none), or the
 *  record. Staged over another published record than today's, or unreadable, it does not count. */
function stagedAt(buffer: Readonly<Record<string, string>> | undefined, cueId: string | null, published: unknown, graphicPublished: unknown): unknown | null | undefined {
  const raw = buffer && Object.prototype.hasOwnProperty.call(buffer, stagedAdjustKey(cueId)) ? buffer[stagedAdjustKey(cueId)] : undefined;
  if (raw === undefined) return undefined;
  try {
    const parsed = JSON.parse(raw) as { on?: unknown; r?: unknown; g?: unknown } | null;
    if (!parsed || typeof parsed !== 'object' || !('r' in parsed) || !same(parsed.on, published)) return undefined;
    // A promotion's cue half (`g`) counts only while the graphic's published default is the one it
    // was promoted over, so the two halves always count together.
    if ('g' in parsed && !same(parsed.g, graphicPublished)) return undefined;
    return parsed.r ?? null;
  } catch {
    return undefined;
  }
}

/** The records a cue folds on this page: each scope's staged record over its published one. */
export interface HostedRecords {
  graphic: unknown;
  cue: unknown;
  /** Anything staged at either scope: the cue's Take then carries the fold, not what was published. */
  staged: boolean;
}

export function hostedRecords(pub: PublishedAdjust, buffer: Readonly<Record<string, string>> | undefined, cueId: string): HostedRecords {
  const g = stagedAt(buffer, null, pub.graphic, pub.graphic);
  const c = stagedAt(buffer, cueId, pub.cue, pub.graphic);
  return {
    graphic: g === undefined ? pub.graphic : (g ?? undefined),
    cue: c === undefined ? pub.cue : (c ?? undefined),
    staged: g !== undefined || c !== undefined,
  };
}

/** The imported faces a cue's block resolves and offers: the pool's, and the look's own imported
 *  face, as on the production page (its bytes ride with the payload's first graphic): the look's
 *  while it is on, and one an older record here names under the look's folder. */
export function hostedImported(pub: PublishedAdjust, records: HostedRecords, imported: readonly ImportedFace[]): ImportedFace[] {
  const out = [...imported];
  for (const f of [pub.look?.font, recordFont(records.graphic), recordFont(records.cue)]) {
    if (!f || typeof f !== 'object' || !('family' in f)) continue;
    if (f !== pub.look?.font && !f.assetPath.startsWith(LOOK_FONT_DIR)) continue;
    if (!out.some((x) => x.family === f.family && x.assetPath === f.assetPath)) out.push({ family: f.family, assetPath: f.assetPath });
  }
  return out;
}

const recordFont = (raw: unknown) => {
  const r = readAdjust(raw);
  return r.status === 'ok' ? r.record.font : undefined;
};

/** The cue's fold, measurement and resolution on this page, as the production page's block reads
 *  them (control/adjustGeometry.ts `cueAdjustState`), against the published box. */
export function hostedAdjustState(
  pub: PublishedAdjust,
  records: HostedRecords,
  cueId: string,
  applied: AppliedAppearance | null | undefined,
  adjustedElsewhere: boolean,
  styleCtx: StyleContext,
): CueAdjustState {
  const geometry: GeometryPart = pub.box ? { byCue: {}, byGraphic: { [pub.graphicId]: pub.box } } : NO_GEOMETRY;
  const ctx: StyleContext = { ...styleCtx, imported: hostedImported(pub, records, styleCtx.imported), lookFor: () => pub.look };
  const state = cueAdjustState({ id: pub.graphicId, savedAt: '', adjust: records.graphic }, { id: cueId, adjust: records.cue }, pub.frame, pub.stage, {}, geometry, applied, adjustedElsewhere, ctx);
  // The published box is the last qualified one: it stands until a new Publish, so the block reads
  // it as current rather than "measuring" a box nobody here will measure.
  return pub.box ? { ...state, fresh: true } : state;
}

/** Another cue of this cue's graphic holds its own record, staged here or published. */
export function adjustedElsewhere(
  cue: { id: string; graphic: string },
  cues: readonly { id: string; graphic: string; adjust?: PublishedAdjust }[],
  buffer: Readonly<Record<string, string>> | undefined,
): boolean {
  return cues.some((c) => c.id !== cue.id && c.graphic === cue.graphic && !!c.adjust && hostedRecords(c.adjust, buffer, c.id).cue !== undefined);
}

/** RULE 2 ON THE HOSTED PAGE: with nothing staged, what was published (`publishedAppearance`);
 *  with a staged record, what the fold now resolves to. */
export function hostedAppearance(
  cue: { id: string; graphic: string; appearance?: AppliedAppearance; adjust?: PublishedAdjust },
  cues: readonly { id: string; graphic: string; appearance?: AppliedAppearance; adjust?: PublishedAdjust }[],
  buffer: Readonly<Record<string, string>> | undefined,
  applied: AppliedAppearance | null | undefined,
  styleCtx: StyleContext,
): AppliedAppearance | undefined {
  if (!cue.adjust) return publishedAppearance(cue, cues, applied);
  const records = hostedRecords(cue.adjust, buffer, cue.id);
  if (!records.staged) return publishedAppearance(cue, cues, applied);
  return hostedAdjustState(cue.adjust, records, cue.id, applied, adjustedElsewhere(cue, cues, buffer), styleCtx).send;
}

/** A waiting change on the hosted page, as the production page's `placeWaiting`: what a Take or
 *  Update of the cue would carry differs from what the wire says its graphic holds applied. Another
 *  operator's send of the same appearance clears it. */
export function hostedPlaceWaiting(
  cue: { id: string; graphic: string; appearance?: AppliedAppearance; adjust?: PublishedAdjust },
  cues: readonly { id: string; graphic: string; appearance?: AppliedAppearance; adjust?: PublishedAdjust }[],
  buffer: Readonly<Record<string, string>> | undefined,
  applied: AppliedAppearance | null | undefined,
  styleCtx: StyleContext,
): boolean {
  const next = hostedAppearance(cue, cues, buffer, applied, styleCtx);
  return !!next && !appearanceEquals(next, applied ?? IDENTITY);
}

/** What one press stages: buffer keys to values, or the wording of a refusal. */
export type StagedWrite = Record<string, string> | string;

/** A scope's staged value: the record (null for none) over the published one it was edited from. */
const stageValue = (pub: PublishedAdjust, scope: 'cue' | 'graphic', next: unknown) =>
  JSON.stringify({ on: (scope === 'cue' ? pub.cue : pub.graphic) ?? null, r: next ?? null });

/** A write at a scope: `patch` over the record that scope folds now. */
export function stageAdjustWrite(pub: PublishedAdjust, records: HostedRecords, cueId: string, scope: 'cue' | 'graphic', patch: AdjustPatch): StagedWrite {
  const next = patchAdjust(scope === 'cue' ? records.cue : records.graphic, patch);
  if (typeof next === 'string') return next;
  return { [keyAt(scope, cueId)]: stageValue(pub, scope, next) };
}

/** A step, from the fold as it stands (`foldedMember`), written at a scope. */
export function stageAdjustStep(pub: PublishedAdjust, records: HostedRecords, cueId: string, scope: 'cue' | 'graphic', step: { x?: number; y?: number; scale?: number }, patch: AdjustPatch = {}): StagedWrite {
  return stageAdjustWrite(pub, records, cueId, scope, stepPatch(records.graphic, records.cue, step, patch));
}

/** A reset: no record at the scope. */
export function stageAdjustReset(pub: PublishedAdjust, records: HostedRecords, cueId: string, scope: 'cue' | 'graphic'): StagedWrite {
  if (readAdjust(scope === 'cue' ? records.cue : records.graphic).status === 'read-only') return ADJUST_READ_ONLY;
  return { [keyAt(scope, cueId)]: stageValue(pub, scope, null) };
}

/** "Use for all": the cue's members onto the graphic's default and the cue's record gone, in one
 *  staged write. */
export function stageAdjustPromote(pub: PublishedAdjust, records: HostedRecords, cueId: string): StagedWrite {
  const members = promotedMembers(records.graphic, records.cue);
  if (typeof members === 'string') return members;
  if (!members) return {};
  const graphic = patchAdjust(records.graphic, members);
  if (typeof graphic === 'string') return graphic;
  return {
    [stagedAdjustKey(null)]: stageValue(pub, 'graphic', graphic),
    [stagedAdjustKey(cueId)]: JSON.stringify({ on: pub.cue ?? null, r: null, g: pub.graphic ?? null }),
  };
}

/** Publish's half: what every graphic cue carries for the hosted page's block, a graphic nobody
 *  adjusted included (its records are then absent and it carries no appearance, so what it airs is
 *  what it always did). */
export function publishedAdjustOf(
  graphic: { id: string; adjust?: unknown },
  cue: { adjust?: unknown },
  look: LookLayer | undefined,
  box: Measurement | null | undefined,
  frame: Size,
  stage: Size,
): PublishedAdjust {
  return {
    graphicId: graphic.id,
    ...(graphic.adjust !== undefined ? { graphic: graphic.adjust } : {}),
    ...(cue.adjust !== undefined ? { cue: cue.adjust } : {}),
    ...(look ? { look } : {}),
    ...(box ? { box } : {}),
    frame,
    stage,
  };
}

