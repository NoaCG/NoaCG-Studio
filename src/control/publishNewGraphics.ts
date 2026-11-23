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
import { buildPanelSpec, copyDigest, graphicSpec, outputCuesOf, writeControlShow, type OutputPayload } from './hostedControl';
import { newGraphicNames, planAdditive, type AddedGraphic, type AdditiveOutcome } from './additivePublish';
import { readPayloadVersion, type PayloadVersion } from './payloadVersion';
import { forgetOwnPublish, notePublishedBoxes } from './publishParts';
import { classifyFailure } from './autoPublish';

/** What an attempt hands the page besides its outcome: the stamp stored now, and the payload when
 *  this attempt wrote it. */
export type NewGraphicsResult = AdditiveOutcome & { ver?: PayloadVersion; output?: OutputPayload };

const DENIED_WORDS = 'this account cannot publish this production';

export async function publishNewGraphics(show: Show): Promise<NewGraphicsResult> {
  const sb = await getSupabase();
  if (!sb) return { kind: 'gone' };
  // The new graphics are published as saved: this page's record must be a stored revision.
  const confirmed = await confirmedRevision(show).catch(() => null);
  if (!confirmed) return { kind: 'transient', reason: 'the saved production could not be read' };
  if ('wait' in confirmed) return { kind: 'wait' };
  const read = await sb.from('control_shows').select('output, panel').eq('id', show.id).maybeSingle();
  if (read.error) return { kind: 'transient', reason: 'the server did not answer' };
  if (!read.data) return { kind: 'gone' };
  const row = read.data as { output?: unknown; panel?: unknown };
  const stored = readPayloadVersion((row.output as { ver?: unknown } | null)?.ver);
  const names = new Set(stored ? newGraphicNames(show.graphics.map((g) => g.name), stored.g) : []);
  if (stored && !names.size) return { kind: 'current', ver: stored };
  const library = loadGraphics();
  const fresh = show.graphics.filter((g) => names.has(g.name));
  try {
    assertProductionGate(fresh, library, 'publish');
  } catch (e) {
    if (e instanceof ProductionGateError) {
      const first = e.failures[0];
      return { kind: 'refused', reason: first?.errors[0]?.message.replace(/\.$/, '') ?? 'it does not pass the checks' };
    }
    throw e;
  }
  const scenes = obsScenesOf(show);
  const panels = buildPanelSpec({ ...show, graphics: fresh }, library);
  const built = await Promise.all(fresh.map((g) => graphicSpec(g, templateForSavedGraphic(g, library))));
  const specs = built.some((s) => s.assets.some((a) => a.audio)) ? (await publishAudio({ graphics: built })).graphics : built;
  const added: AddedGraphic[] = [];
  for (const [k, g] of fresh.entries()) {
    added.push({
      name: g.name,
      spec: specs[k],
      digest: await copyDigest(show, show.graphics.indexOf(g), g.template),
      edited: designEditedAt(g, library),
      panel: panels[k],
      inScene: scenes.some((s) => s.graphics.includes(g.name)),
    });
  }
  const plan = await planAdditive({ output: row.output, panel: row.panel, added, cues: outputCuesOf(show) });
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
    // says which.
    const again = await sb.from('control_shows').select('published_ver').eq('id', show.id).maybeSingle();
    const now = readPayloadVersion((again.data as { published_ver?: unknown } | null)?.published_ver);
    if (!again.error && now && now.n === plan.base.n) return { kind: 'refused', reason: DENIED_WORDS };
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
