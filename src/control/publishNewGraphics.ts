// THE BROWSER HALF OF AN ADDITIVE PUBLISH (live-production-reliability P2, AC-2; the rules are
// ./additivePublish.ts).
//
// One attempt: the saved record confirmed, the stored publication read whole, the new graphics built
// as a full publish would (the publish gate first), the plan, and one write over the stamp it read,
// through the same guarded update a press's publish uses (`writeControlShow`). It never writes the
// production record, the title, the bindings, the sources or the profile.

import { getSupabase } from '../backend/supabase';
import { confirmedRevision } from '../backend/savedRevision';
import { publishAudio } from '../backend/productionAudio';
import { loadGraphics, designEditedAt, templateForSavedGraphic } from '../model/library';
import { obsScenesOf } from '../model/obsScenes';
import type { Show } from '../model/shows';
import { assertProductionGate, ProductionGateError } from '../validation/productionGate';
import { buildPanelSpec, copyDigest, graphicSpec, outputCuesOf, readPublishedWhole, writeControlShow, type CuePublished, type OutputGraphicSpec, type OutputPayload } from './hostedControl';
import { additiveRefusal, newGraphicNames, planAdditive, uploadSounds, type AddedGraphic, type AdditiveOutcome } from './additivePublish';
import { readPayloadVersion, type PayloadVersion } from './payloadVersion';
import { forgetOwnPublish, notePublishedBoxes } from './publishParts';
import { classifyFailure } from './autoPublish';

/** What an attempt hands the page besides its outcome: the stamp stored now, and the payload when
 *  this attempt wrote it. */
export type NewGraphicsResult = AdditiveOutcome & { ver?: PayloadVersion; output?: OutputPayload };

const DENIED_WORDS = 'this account cannot publish this production';

export async function publishNewGraphics(
  show: Show,
  /** Each cue's appearance and adjust records, measured for this record, as a press's publish
   *  carries them: only the new graphics' cues use them. */
  measure?: (base: PayloadVersion | null) => Promise<CuePublished | undefined>,
): Promise<NewGraphicsResult> {
  const sb = await getSupabase();
  if (!sb) return { kind: 'gone' };
  // The new graphics are published as saved: a save of this page on its way, or a newer one on the
  // server, is waited for. Where the revision cannot be known (an instance without 0117), it goes
  // ahead, as a press's publish does; the stamp names no revision of its own either way.
  const confirmed = await confirmedRevision(show).catch(() => null);
  if (confirmed && 'wait' in confirmed) return { kind: 'wait' };
  const read = await sb.from('control_shows').select('output, panel').eq('id', show.id).maybeSingle();
  if (read.error) return { kind: 'transient', reason: 'the server did not answer' };
  if (!read.data) return { kind: 'gone' };
  const row = read.data as { output?: unknown; panel?: unknown };
  const stored = readPayloadVersion((row.output as { ver?: unknown } | null)?.ver);
  const names = new Set(stored ? newGraphicNames(show.graphics.map((g) => g.name), stored.g) : []);
  if (stored && !names.size) return { kind: 'current', ver: stored };
  const library = loadGraphics();
  const fresh = show.graphics.filter((g) => names.has(g.name));
  let built: OutputGraphicSpec[];
  try {
    assertProductionGate(fresh, library, 'publish');
    // A stranger's package is checked against its record here (`foreignSpec`), by the same gate.
    built = await Promise.all(fresh.map((g) => graphicSpec(g, templateForSavedGraphic(g, library))));
  } catch (e) {
    if (e instanceof ProductionGateError) {
      const first = e.failures[0];
      return { kind: 'refused', reason: first?.errors[0]?.message.replace(/\.$/, '') ?? 'it does not pass the checks' };
    }
    throw e;
  }
  const scenes = obsScenesOf(show);
  const panels = buildPanelSpec({ ...show, graphics: fresh }, library);
  const added: AddedGraphic[] = [];
  for (const [k, g] of fresh.entries()) {
    added.push({
      name: g.name,
      spec: built[k],
      digest: await copyDigest(show, show.graphics.indexOf(g), g.template),
      edited: designEditedAt(g, library),
      panel: panels[k],
      inScene: scenes.some((s) => s.graphics.includes(g.name)),
    });
  }
  // Every refusal that needs no upload first: a refused add uploads nothing. The stored sounds must be
  // under this account's key, since this write makes it their owner (migration 0121).
  const session = (await sb.auth.getSession()).data.session;
  if (!session) return { kind: 'transient', reason: 'this page is not signed in' };
  const uploader = session.user.id;
  const early = await additiveRefusal(row.output, added, uploader);
  if (early?.kind === 'nothing') return { kind: 'current', ...(stored ? { ver: stored } : {}) };
  if (early) return early;
  // New sounds uploaded under this account's key; the manifest carries the keys, as a full publish's.
  const uploaded = await uploadSounds(added.map((a) => a.spec), publishAudio);
  if ('kind' in uploaded) return uploaded;
  for (const [k, a] of added.entries()) a.spec = uploaded.graphics[k];
  const publishedOf = measure ? await measure(stored) : undefined;
  const plan = await planAdditive({ output: row.output, panel: row.panel, added, cues: outputCuesOf(show, publishedOf), sounds: uploaded.sounds, uploader });
  if (plan.kind === 'nothing') return { kind: 'current', ...(stored ? { ver: stored } : {}) };
  if (plan.kind === 'refused') return plan;
  let error: Awaited<ReturnType<typeof writeControlShow>>;
  try {
    error = await writeControlShow(sb, { id: show.id, output: plan.output, panel: plan.panel }, { exists: true, n: plan.base.n });
  } catch (e) {
    return outcomeOf(e);
  }
  if (error === 'moved') {
    // Another page published since the read, or the row policy filtered the write out: the stamp
    // says which, read through the column the write filtered on.
    const again = await readPublishedWhole(sb, show.id).catch(() => null);
    const now = readPayloadVersion(again?.ver);
    if (now && now.n === plan.base.n) return { kind: 'refused', reason: DENIED_WORDS };
    return { kind: 'transient', reason: 'another page published at the same moment' };
  }
  if (error) return outcomeOf(error);
  // This page's own last publish no longer stands for what is stored (live-publishing G4).
  forgetOwnPublish(show.id);
  notePublishedBoxes(show.id, plan.ver, plan.output.cues);
  return { kind: 'published', ver: plan.ver, output: plan.output };
}

function outcomeOf(e: unknown): NewGraphicsResult {
  const classified = classifyFailure(e);
  if (classified.kind === 'refused') return { kind: 'refused', reason: DENIED_WORDS };
  return { kind: 'transient', reason: 'the server did not answer' };
}
