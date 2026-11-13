// ONE AUTOMATIC PUBLISH OF A SAVED REVISION (docs/work-specs/live-publishing/designs/G3.md sections
// 2, 3 and 5).
//
// What `publishControlShow` writes, built from the record that IS saved revision `rev`, naming it in
// the stamp (`ver.r`) so the server's guard (migration 0118) keeps publications in save order, and
// carrying `ver.c`, a digest of everything written with graphic bodies counted by their digests.
//
//   Stored `c` equals the built one   a revision-only update: the row learns `rev`, nothing is sent
//                                     to the outputs.
//   Otherwise                         a full publish, conditioned on the stamp it read.
//
// Off the Take's path (section 5): the payload is never turned into one string on the main thread.
// Each graphic spec without its assets, each asset and each panel entry becomes its own `Blob` in its
// own task, and the body is a `Blob` over those parts, sent with `fetch`. Between steps the work
// yields to the event loop and waits while a send of this page is in flight (`sendsIdle`).
//
// It never writes the production record. Answers what the attempt came to (control/autoPublish.ts).

import { answeredFetch, COPIES_MARK_HEADER, getSupabase } from '../backend/supabase';
import { loadBackendConfig } from '../backend/config';
import { loadGraphics, resolveSavedGraphicDoc, type GraphicDoc } from '../model/library';
import type { Show } from '../model/shows';
import { assertProductionGate, ProductionGateError } from '../validation/productionGate';
import { publishAudio } from '../backend/productionAudio';
import { profileForPublish } from '../model/profile';
import { buildOutputPayload, buildPanelSpec, copyDigest, readPanel, sendJoinBrand, type CuePublished, type OutputPayload, type PanelGraphicSpec } from './hostedControl';
import { digestText, readPayloadVersion, stampFromDigests, type PayloadVersion } from './payloadVersion';
import { designEditedAt } from '../model/library';
import type { PublishOutcome } from './autoPublish';
import { sendsIdle } from './sendsInFlight';

/** Resolves on a later task: a click queued meanwhile runs first. */
function yieldToInput(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof MessageChannel === 'function') {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => resolve();
      channel.port2.postMessage(null);
    } else setTimeout(resolve, 0);
  });
}

/** One step's worth of waiting: every send answered, then a later task. */
async function step(): Promise<void> {
  await sendsIdle();
  await yieldToInput();
  await sendsIdle();
}

/** How long each step took, for the measure harness (R10). */
export const publishStepMs: number[] = [];
const timed = async <T>(work: () => Promise<T> | T): Promise<T> => {
  await step();
  const t0 = performance.now();
  try {
    return await work();
  } finally {
    publishStepMs.push(performance.now() - t0);
    if (publishStepMs.length > 2_000) publishStepMs.splice(0, 1_000);
  }
};

/** The stored stamp and revision, from the two small columns. */
interface StoredStamp {
  exists: boolean;
  ver: PayloadVersion | null;
  rev: number | null;
}

async function readStamp(sb: NonNullable<Awaited<ReturnType<typeof getSupabase>>>, id: string): Promise<StoredStamp> {
  const { data, error } = await sb.from('control_shows').select('published_ver, published_rev').eq('id', id).maybeSingle();
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  if (!data) return { exists: false, ver: null, rev: null };
  const row = data as { published_ver?: unknown; published_rev?: unknown };
  return { exists: true, ver: readPayloadVersion(row.published_ver), rev: typeof row.published_rev === 'number' ? row.published_rev : null };
}

/** The panel entries as published, read only when this publisher's library lacks a graphic's record
 *  (its saved entries live in its author's library, issue #779). */
async function heldPanelIfNeeded(sb: NonNullable<Awaited<ReturnType<typeof getSupabase>>>, show: Show, library: GraphicDoc[]): Promise<PanelGraphicSpec[]> {
  if (show.graphics.every((g) => resolveSavedGraphicDoc(g, library))) return [];
  const { data, error } = await sb.from('control_shows').select('panel').eq('id', show.id).maybeSingle();
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return readPanel((data as { panel?: unknown } | null)?.panel);
}

/** A failure, in the publisher's classes (G3 section 3). */
function classify(e: unknown): PublishOutcome {
  if (e instanceof ProductionGateError) {
    const first = e.failures[0];
    const why = first?.errors[0]?.message.replace(/\.$/, '') ?? 'it does not pass the checks';
    return { kind: 'refused', refusal: 'gate', reason: `${first?.name ?? 'A graphic'} cannot go on air: ${why}. Fix it and the next save publishes.` };
  }
  const err = e as { message?: string; code?: string; status?: number };
  const message = String(err?.message ?? e);
  if (message === 'This publication names a save that does not exist') return { kind: 'refused', refusal: 'guard', reason: 'This save could not be published. The next save tries again.' };
  if (err?.code === '42501' || err?.status === 401 || err?.status === 403 || /row-level security|permission denied/i.test(message)) {
    return { kind: 'refused', refusal: 'denied', reason: 'This account cannot publish this production. Open it on a device that can.' };
  }
  return { kind: 'transient', reason: 'the server did not answer' };
}

/** The account's write matched nothing although the stored stamp is the one it named: the row
 *  policy refused it (row-level security filters an update to no rows, with no error). */
const DENIED: PublishOutcome = { kind: 'refused', refusal: 'denied', reason: 'This account cannot publish this production. Open it on a device that can.' };

/** A part of the body: one string turned into a Blob in its own step. */
const part = (text: string) => new Blob([text]);

/**
 * The request body for the published columns, built from `Blob` parts, each made in its own step:
 * the head (every column but the graphics and the panel, the stamp included), each graphic without
 * its assets, each asset, each panel entry. Only the head depends on the stamp, so a retry over a
 * newer stamp builds the head again and keeps every other part (G3 section 3, step 5).
 */
async function bodyBuilder(output: OutputPayload, columns: Record<string, unknown>, panel: PanelGraphicSpec[]): Promise<(ver: PayloadVersion) => Promise<Blob>> {
  const middle: Blob[] = [];
  for (const [i, g] of output.graphics.entries()) {
    const { assets, ...spec } = g;
    const specText = JSON.stringify({ ...spec, assets: [] });
    const cut = specText.lastIndexOf('"assets":[]') + '"assets":['.length;
    middle.push(await timed(() => part(`${i ? ',' : ''}${specText.slice(0, cut)}`)));
    for (const [j, a] of assets.entries()) middle.push(await timed(() => part(`${j ? ',' : ''}${JSON.stringify(a)}`)));
    middle.push(part(specText.slice(cut)));
  }
  const panelParts: Blob[] = [];
  for (const [i, entry] of panel.entries()) panelParts.push(await timed(() => part(`${i ? ',' : ''}${JSON.stringify(entry)}`)));
  const { graphics: _graphics, ...rest } = output;
  return async (ver) => {
    const head = JSON.stringify({ ...columns, output: { ...rest, ver, graphics: [] } });
    // `..."graphics":[]}}`: the graphics go inside that array, then the panel after the output.
    const at = head.lastIndexOf('"graphics":[]') + '"graphics":['.length;
    const first = await timed(() => part(head.slice(0, at)));
    return new Blob([first, ...middle, part(`${head.slice(at, -1)},"panel":[`), ...panelParts, part(']}')], { type: 'application/json' });
  };
}

/** The PATCH by id with a filter, the body a Blob; answers the rows it matched or throws. */
async function patchRow(id: string, filter: string, body: Blob | string): Promise<number> {
  const sb = await getSupabase();
  const cfg = loadBackendConfig();
  if (!sb) throw new Error('offline');
  const send = async (token: string) =>
    answeredFetch(`${cfg.url}/rest/v1/control_shows?id=eq.${encodeURIComponent(id)}&${filter}&select=id`, {
      method: 'PATCH',
      // THE BUILD MARK (production copies, migration 0115): production has the switch on, so an
      // unmarked production-authoring write is refused. The shared client adds it; this raw fetch must too.
      headers: { apikey: cfg.anonKey, authorization: `Bearer ${token}`, 'content-type': 'application/json', prefer: 'return=representation', [COPIES_MARK_HEADER]: '1' },
      body,
    });
  const session = (await sb.auth.getSession()).data.session;
  let answer = await send(session?.access_token ?? cfg.anonKey);
  if (answer.status === 401) {
    const refreshed = (await sb.auth.refreshSession()).data.session;
    if (refreshed) answer = await send(refreshed.access_token);
  }
  if (!answer.ok) {
    const problem = (await answer.json().catch(() => ({}))) as { message?: string; code?: string };
    throw Object.assign(new Error(problem.message ?? `HTTP ${answer.status}`), { code: problem.code, status: answer.status });
  }
  const rows = (await answer.json()) as unknown[];
  return Array.isArray(rows) ? rows.length : 0;
}

/**
 * Publish `show`, which is saved revision `rev`. `publishedOf`: each cue's appearance and adjust
 * records as the page measured them for this record.
 */
export async function publishRevision(
  show: Show,
  rev: number,
  /** Each cue's appearance and adjust records, measured for this record: run as a step of its own. */
  measure?: () => Promise<CuePublished | undefined>,
  /** The measure harness only (G3 section 13): write the whole payload again even when nothing changed. */
  force = false,
): Promise<PublishOutcome> {
  try {
    const sb = await getSupabase();
    if (!sb) return { kind: 'gone' };
    const library = loadGraphics();
    for (const g of show.graphics) await timed(() => assertProductionGate([g], library, 'publish'));
    let stored = await readStamp(sb, show.id);
    if (!stored.exists) return { kind: 'gone' };
    if (!force && stored.rev !== null && stored.rev >= rev) return { kind: 'superseded' };
    const heldPanel = await heldPanelIfNeeded(sb, show, library);
    const publishedOf = measure ? await timed(measure) : undefined;
    const raw = await timed(() => buildOutputPayload(show, library, publishedOf));
    const built = raw.soundAssets?.length ? await publishAudio(raw) : raw;
    const g: Record<string, string> = {};
    for (const [i, graphic] of show.graphics.entries()) g[graphic.name] = await timed(() => copyDigest(show, i, graphic.template));
    const panel = await timed(() => buildPanelSpec(show, library, heldPanel));
    // The DATA SOURCES (bindings, sources, collections) are left OUT of the content digest `c`:
    // Connect, Disconnect and Pause write them to the row with no publish (`writePublishedSources`),
    // so the stored `c` cannot speak for them (review on #2469). They ride every publish, full or
    // revision-only, so the row's source configuration is always the revision's.
    const dataSources = {
      bindings: show.bindings ?? {},
      sources: show.sources ?? [],
      collections: show.collections ?? [],
    };
    const columns = {
      title: show.name,
      ...dataSources,
      profile: profileForPublish(show.profile),
    };
    const { graphics: _bodies, ...meta } = built;
    const c = await timed(() =>
      digestText(JSON.stringify([g, meta, { title: show.name, profile: columns.profile }, panel.map(({ js: _js, ...entry }) => entry)])),
    );
    if (!force && stored.ver?.c === c) {
      // Nothing on the outputs would change: the row learns the revision, with the source columns.
      const landed = await patchRow(show.id, `published_ver->>c=eq.${encodeURIComponent(c)}`, JSON.stringify({ published_rev: rev, ...dataSources }));
      if (landed > 0) return { kind: 'published', rev };
      stored = await readStamp(sb, show.id);
      if (stored.rev !== null && stored.rev >= rev) return { kind: 'superseded' };
      // The content is still the one named and the revision is behind, yet nothing matched.
      if (stored.ver?.c === c) return DENIED;
    }
    const edited = Object.fromEntries(show.graphics.map((x) => [x.name, designEditedAt(x, library)]));
    const body = await bodyBuilder(built, columns, panel);
    for (let tries = 0; ; tries++) {
      const named = stored.ver ? stored.ver.n : null;
      const filter = named !== null ? `published_ver->>n=eq.${named}` : 'published_ver=is.null';
      const ver: PayloadVersion = { ...(await stampFromDigests(g, built.resolution, stored.ver, new Date(), edited)), r: rev, c };
      const landed = await patchRow(show.id, filter, await body(ver));
      if (landed > 0) {
        await afterFullPublish(sb, show);
        return { kind: 'published', rev, ver };
      }
      stored = await readStamp(sb, show.id);
      if (!stored.exists) return { kind: 'gone' };
      if (!force && stored.rev !== null && stored.rev >= rev) return { kind: 'superseded' };
      // The stamp is still the one named and the revision is behind, yet nothing matched: not a race.
      if ((stored.ver ? stored.ver.n : null) === named) return DENIED;
      if (tries >= 2) return { kind: 'transient', reason: 'other pages published at the same moment' };
    }
  } catch (e) {
    return classify(e);
  }
}

/** What a full publish does after it lands, as `publishControlShow` does: log rows older than
 *  7 days pruned, and the brand sent to the join page. Neither decides the outcome. */
async function afterFullPublish(sb: NonNullable<Awaited<ReturnType<typeof getSupabase>>>, show: Show): Promise<void> {
  const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  await sb.from('control_events').delete().eq('show_id', show.id).lt('created_at', cutoff).then(() => {}, () => {});
  if (show.hostedSlug && show.joinSlug) await sendJoinBrand(show, show.hostedSlug).catch(() => {});
}
