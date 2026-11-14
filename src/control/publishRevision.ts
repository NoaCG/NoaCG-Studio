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

import { answeredFetch, getSupabase } from '../backend/supabase';
import { loadBackendConfig } from '../backend/config';
import { loadGraphics, resolveSavedGraphicDoc, type GraphicDoc } from '../model/library';
import type { Show } from '../model/shows';
import { assertProductionGate, ProductionGateError } from '../validation/productionGate';
import { publishAudio } from '../backend/productionAudio';
import { profileForPublish } from '../model/profile';
import { buildOutputPayload, buildPanelSpec, copyDigest, publishedPanelEntries, pruneControlEvents, readPanel, readScenes, sendJoinBrand, type CuePublished, type OutputPayload, type PanelGraphicSpec } from './hostedControl';
import { digestText, readPayloadVersion, stampFromDigests, type PayloadVersion } from './payloadVersion';
import { designEditedAt } from '../model/library';
import { classifyFailure, DENIED, type PublishOutcome } from './autoPublish';
import type { ObsScene } from '../model/obsScenes';
import { sendsIdle } from './sendsInFlight';
import type { AudienceBrand } from '../audience/audienceBrand';
import { partialWritesOn } from '../backend/partialWrites';
import { forgetOwnPublish, noteOwnPublish, ownPublish, pruneDue, publishInParts } from './publishParts';

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

/** The signed-in client. */
type Sb = NonNullable<Awaited<ReturnType<typeof getSupabase>>>;

/** The stored stamp and revision, from the two small columns. */
interface StoredStamp {
  exists: boolean;
  ver: PayloadVersion | null;
  rev: number | null;
  /** The OBS scenes the published row holds: what a full publish replaces, so the page can take a
   *  graphic that joins a scene (obs-scenes #2489), as a press's publish does. */
  scenes: ObsScene[];
}

export async function readStamp(sb: Sb, id: string): Promise<StoredStamp> {
  // The scenes from the head when it is the publication's (live-publishing G4): reading one key of
  // `output` makes the server open the whole payload.
  const head = await partialWritesOn();
  const { data, error } = await sb.from('control_shows').select(head ? 'published_ver, published_rev, hscenes:published_head->scenes, hn:published_head->ver->n' : 'published_ver, published_rev, scenes:output->scenes').eq('id', id).maybeSingle();
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  if (!data) return { exists: false, ver: null, rev: null, scenes: [] };
  const row = data as { published_ver?: unknown; published_rev?: unknown; scenes?: unknown; hscenes?: unknown; hn?: unknown };
  if (head) {
    const v = readPayloadVersion(row.published_ver);
    if (v && row.hn === v.n) row.scenes = row.hscenes;
    else {
      const whole = await sb.from('control_shows').select('scenes:output->scenes').eq('id', id).maybeSingle();
      if (whole.error) throw Object.assign(new Error(whole.error.message), { code: whole.error.code });
      row.scenes = (whole.data as { scenes?: unknown } | null)?.scenes;
    }
  }
  return { exists: true, ver: readPayloadVersion(row.published_ver), rev: typeof row.published_rev === 'number' ? row.published_rev : null, scenes: readScenes(row.scenes) ?? [] };
}

/** The panel entries as published, read only when this publisher's library lacks a graphic's record
 *  (its saved entries live in its author's library, issue #779). */
async function heldPanelIfNeeded(sb: Sb, show: Show, library: GraphicDoc[], stored: PayloadVersion | null): Promise<PanelGraphicSpec[]> {
  if (show.graphics.every((g) => resolveSavedGraphicDoc(g, library))) return [];
  // The panel this page last published is the stored one while the stamp is still that publish's:
  // its entries are already known, so the whole panel is not read again (live-publishing G4).
  const mine = ownPublish(show.id);
  if (mine && stored && mine.ver.n === stored.n) return mine.panel;
  // With parts on, only the entries of the graphics this library lacks (migration 0120).
  if (await partialWritesOn()) return publishedPanelEntries(sb, show.id, show.graphics.filter((g) => !resolveSavedGraphicDoc(g, library)).map((g) => g.name));
  const { data, error } = await sb.from('control_shows').select('panel').eq('id', show.id).maybeSingle();
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return readPanel((data as { panel?: unknown } | null)?.panel);
}


/** With parts on, when the production opens (G4 section 1, as the maps are): the stored stamp, its
 *  scenes and the panel entries a publish needs, held as this page's own last publish until it
 *  publishes. The first publish after a reload then reads nothing; a stamp that moved meanwhile
 *  answers `moved`, and the publish forgets it and reads (R1). */
export async function prefetchPublication(sb: Sb, show: Show, library: GraphicDoc[]): Promise<void> {
  if (ownPublish(show.id) || !(await partialWritesOn())) return;
  const stored = await readStamp(sb, show.id);
  if (!stored.exists || !stored.ver) return;
  const panel = await heldPanelIfNeeded(sb, show, library, stored.ver);
  if (!ownPublish(show.id)) noteOwnPublish(show.id, { ver: stored.ver, rev: stored.rev, scenes: stored.scenes, panel });
}

/** A failure, in the publisher's classes (G3 section 3): a check a graphic fails here, the rest
 *  as the server answered (`classifyFailure`). */
function classify(e: unknown): PublishOutcome {
  if (e instanceof ProductionGateError) {
    const first = e.failures[0];
    const why = first?.errors[0]?.message.replace(/\.$/, '') ?? 'it does not pass the checks';
    return { kind: 'refused', refusal: 'gate', reason: `${first?.name ?? 'A graphic'} cannot go on air: ${why}. Fix it and the next save publishes.` };
  }
  return classifyFailure(e);
}

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
      // `answeredFetch` adds the production-copies build mark to every REST request (0115).
      headers: { apikey: cfg.anonKey, authorization: `Bearer ${token}`, 'content-type': 'application/json', prefer: 'return=representation' },
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
  /** Read the stored stamp and panel even when this page's own last publish could stand in. */
  fresh = false,
): Promise<PublishOutcome> {
  try {
    const sb = await getSupabase();
    if (!sb) return { kind: 'gone' };
    const library = loadGraphics();
    // The cheap exits first: a production unpublished meanwhile, or a revision already shown.
    // With parts on, the stamp this page's own last publish wrote stands in for a read: the server
    // writes only over the `n` named, so a stale one answers `moved` and is read below.
    const mine = (await partialWritesOn()) && !force && !fresh ? ownPublish(show.id) : null;
    let stored: StoredStamp = mine ? { exists: true, ver: mine.ver, rev: mine.rev, scenes: mine.scenes as ObsScene[] } : await readStamp(sb, show.id);
    const heldPanel = stored.exists ? await heldPanelIfNeeded(sb, show, library, stored.ver) : [];
    if (!stored.exists) return { kind: 'gone' };
    if (!force && stored.rev !== null && stored.rev >= rev) return { kind: 'superseded' };
    for (const g of show.graphics) await timed(() => assertProductionGate([g], library, 'publish'));
    const publishedOf = measure ? await timed(measure) : undefined;
    const raw = await timed(() => buildOutputPayload(show, library, publishedOf));
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
    // A team production's row belongs to its team, as a press's publish writes it (G4 section 4).
    const partsColumns = { ...columns, ...(show.teamId ? { team_id: show.teamId } : {}) };
    const { graphics: _bodies, ...meta } = raw;
    const c = await timed(() =>
      digestText(JSON.stringify([g, meta, { title: show.name, profile: columns.profile }, panel.map(({ js: _js, ...entry }) => entry)])),
    );
    if (!force && stored.ver?.c === c) {
      // Nothing on the outputs would change: the row learns the revision, with the source columns.
      const landed = await patchRow(show.id, `published_ver->>c=eq.${encodeURIComponent(c)}`, JSON.stringify({ published_rev: rev, ...dataSources }));
      if (landed > 0) {
        const own = ownPublish(show.id);
        if (own) noteOwnPublish(show.id, { ...own, rev });
        return { kind: 'published', rev };
      }
      forgetOwnPublish(show.id);
      // The stand-in was stale (another page published): start again from what is stored now, so
      // the panel entries and the content digest are not this page's old ones (issue #779).
      if (mine) return publishRevision(show, rev, measure, force, true);
      stored = await readStamp(sb, show.id);
      if (stored.rev !== null && stored.rev >= rev) return { kind: 'superseded' };
      // The content is still the one named and the revision is behind, yet nothing matched.
      if (stored.ver?.c === c) return DENIED;
    }
    // Sounds are uploaded only for a full publish (a revision-only update sends nothing).
    const built = raw.soundAssets?.length ? await publishAudio(raw) : raw;
    const edited = Object.fromEntries(show.graphics.map((x) => [x.name, designEditedAt(x, library)]));
    // ONLY WHAT CHANGED (live-publishing G4 section 4): with parts on, the difference from the stored
    // publication; a path that cannot be used falls back once to the whole write below.
    let inParts = await partialWritesOn();
    let body: ((ver: PayloadVersion) => Promise<Blob>) | null = null;
    /** The join page's brand as stored, from a publish in parts' answer (undefined: read it). */
    let brand: unknown = undefined;
    for (let tries = 0; ; tries++) {
      const named = stored.ver ? stored.ver.n : null;
      const filter = named !== null ? `published_ver->>n=eq.${named}` : 'published_ver=is.null';
      const ver: PayloadVersion = { ...(await stampFromDigests(g, built.resolution, stored.ver, new Date(), edited)), r: rev, c };
      let landed = 0;
      if (inParts) {
        const got = await publishInParts(sb, show.id, built, panel, ver, stored.ver, partsColumns, step);
        if (got.kind === 'gone') return { kind: 'gone' };
        if (got.kind === 'landed') {
          landed = 1;
          brand = got.brand;
        }
        if (got.kind === 'fallback') inParts = false;
      }
      if (!inParts) {
        body ??= await bodyBuilder(built, columns, panel);
        landed = await patchRow(show.id, filter, await body(ver));
      }
      if (landed > 0) {
        if (inParts) noteOwnPublish(show.id, { ver, rev, scenes: built.scenes ?? [], panel });
        else forgetOwnPublish(show.id);
        afterFullPublish(sb, show, brand);
        return { kind: 'published', rev, ver, scenes: { before: stored.scenes, after: built.scenes ?? [] } };
      }
      forgetOwnPublish(show.id);
      if (mine) return publishRevision(show, rev, measure, force, true);
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
 *  7 days pruned, and the brand sent to the join page. Neither decides the outcome, so neither is
 *  waited for. */
function afterFullPublish(sb: Sb, show: Show, brand?: unknown): void {
  // Rows older than 7 days: at most hourly from one page, as a publish now follows every save.
  if (pruneDue(show.id)) void pruneControlEvents(sb, show.id);
  // The brand as stored comes with a publish in parts' answer: compared, and sent only when it differs.
  if (show.hostedSlug && show.joinSlug) void sendJoinBrand(show, show.hostedSlug, brand as AudienceBrand | null | undefined).catch(() => {});
}
