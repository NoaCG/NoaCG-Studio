// HARDWARE PANELS, THE PAGE'S WIRE (docs/work-specs/hardware-panel-control/protocol.md §4 to §6):
// the calls a page makes on its control slug, and the answering page itself - claim, the press
// topic, the feedback topic, and running a relayed press through the page's own dispatcher.
//
// Nothing here runs unless the operator switches "Answer the panel on this page" on: a page with
// the switch off makes no subscription and publishes nothing (spec, preserved behaviour).

import type { RealtimeChannel } from '@supabase/supabase-js';
import { loadBackendConfig } from '../backend/config';
import { getSupabase } from '../backend/supabase';
import { mintOid } from './commandRoads';
import {
  PANEL_PROTOCOL,
  PressMemory,
  SnapshotRing,
  judgePress,
  readPress,
  rowsChanged,
  snapshotChanged,
  wireRows,
  wireState,
  type PanelPress,
  type PanelSnapshot,
  type PanelVerb,
  type PressVerdict,
} from './panelFeedback';

// ── The page's calls ───────────────────────────────────────────────────────────────────────────

export interface PanelKeyRow {
  id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
}

export interface PanelList {
  claim: number;
  answering: { page: string; where: 'production' | 'control'; label: string; at: string } | null;
  panels: PanelKeyRow[];
}

async function call<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const sb = await getSupabase();
  if (!sb) throw new Error('No NoaCG backend is configured');
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/** A one-time pairing code for this production, or the sentence why not. */
export async function panelPairStart(slug: string): Promise<{ code: string; expiresAt: number } | { refused: string }> {
  const a = await call<{ ok: boolean; code?: string; expires_at?: string; note?: string }>('panel_pair_start', { p_slug: slug });
  return a.ok && a.code ? { code: a.code, expiresAt: Date.parse(a.expires_at ?? '') } : { refused: a.note ?? 'No code could be made.' };
}

export async function panelList(slug: string): Promise<PanelList> {
  const a = await call<PanelList & { ok: boolean }>('panel_list', { p_slug: slug });
  return { claim: a.claim, answering: a.answering, panels: a.panels ?? [] };
}

export async function panelRevoke(slug: string, keyId: string): Promise<void> {
  await call('panel_revoke', { p_slug: slug, p_key_id: keyId });
}

// ── The answering page ─────────────────────────────────────────────────────────────────────────

/** How often the answering page says it is still there; a panel gives up after 12 s of silence. */
export const PANEL_BEAT_MS = 4_000;

export type AnswerStatus =
  | { kind: 'claiming' }
  | { kind: 'answering' }
  | { kind: 'replaced'; by: string }
  | { kind: 'failed'; why: string };

export interface PanelPressReport {
  panel: string;
  verb: PanelVerb;
  verdict: PressVerdict;
  at: number;
}

export interface PanelAnswer {
  /** Call after every render: publishes when what a panel sees changed. */
  changed(): void;
  /** Switch the answer off: tell the panels, let go of the claim, leave both topics. */
  stop(): void;
}

/** Sixteen lowercase letters and digits, the page id panel_claim accepts. */
function pageId(): string {
  let id = '';
  while (id.length < 16) id += mintOid().replace(/[^a-z0-9]/g, '');
  return id.slice(0, 16);
}

/**
 * ANSWER THE PANEL ON THIS PAGE. Takes the production's claim (the last page to switch on wins),
 * listens for presses stamped with it, runs each through `run` - the page's own dispatcher - after
 * the page-side checks, and publishes what the keys draw from.
 */
export function answerPanel(opts: {
  slug: string;
  where: 'production' | 'control';
  /** How the panels and the other pages name this page. */
  label: string;
  /** What the page shows now; read at publish and at every press. */
  snapshot: () => PanelSnapshot;
  /** The verbs this surface runs at all; the rest are refused `not-here`. */
  runs: ReadonlySet<PanelVerb>;
  /** The page's dispatcher, as a key press reaches it. */
  run: (verb: PanelVerb, target: string) => void;
  onStatus: (status: AnswerStatus) => void;
  onPress: (report: PanelPressReport) => void;
}): PanelAnswer {
  const page = pageId();
  const memory = new PressMemory();
  const ring = new SnapshotRing();
  let claim = 0;
  let stopped = false;
  let pressChannel: RealtimeChannel | null = null;
  let feedChannel: RealtimeChannel | null = null;
  let feedJoined = false;
  let ver = 0;
  let rowsVer = 0;
  let shown: PanelSnapshot | null = null;
  let shownRows: PanelSnapshot['rows'] | null = null;
  let beat: ReturnType<typeof setInterval> | null = null;

  const send = (event: string, payload: object) => {
    if (feedChannel && feedJoined) void feedChannel.send({ type: 'broadcast', event, payload });
  };
  const meta = () => ({ ver, rowsVer, page, claim, where: opts.where, label: opts.label, at: Date.now() });
  /** Publish the state (and the rows) when they changed, or always when `force`. */
  const publish = (force = false) => {
    if (stopped || !claim) return;
    const snap = opts.snapshot();
    if (rowsChanged(shownRows, snap.rows) || force) {
      if (rowsChanged(shownRows, snap.rows)) rowsVer++;
      shownRows = snap.rows;
      send('rows', wireRows(snap.rows, rowsVer));
    }
    if (snapshotChanged(shown, snap)) {
      ver++;
      shown = snap;
      ring.put(ver, snap);
    } else if (!force) return;
    send('state', wireState(shown ?? snap, meta()));
  };

  const onPressMessage = (payload: unknown) => {
    const press = readPress(payload);
    if (!press || stopped) return;
    if (press.claim !== claim) {
      if (press.claim > claim) replaced('another page');
      return;
    }
    const now = Date.now();
    const done = memory.get(press.pressId, now);
    if (done) {
      send('result', { v: PANEL_PROTOCOL, id: press.pressId, panel: press.panel.id, outcome: 'duplicate', note: done.note });
      return;
    }
    const verdict = judgePress(press, opts.snapshot(), ring.get(press.seen), opts.runs) ?? { outcome: 'ran' as const };
    memory.remember(press.pressId, verdict, now);
    if (verdict.outcome === 'ran') opts.run(press.verb, press.target);
    send('result', { v: PANEL_PROTOCOL, id: press.pressId, panel: press.panel.id, outcome: verdict.outcome, ...(verdict.note ? { note: verdict.note } : {}) });
    opts.onPress({ panel: press.panel.label, verb: press.verb, verdict, at: now });
    // The press moved what the keys show; publish as soon as the page has drawn it.
    if (verdict.outcome === 'ran') setTimeout(() => publish(), 0);
  };

  const leave = async (ch: RealtimeChannel | null) => {
    if (!ch) return;
    const sb = await getSupabase();
    await sb?.removeChannel(ch);
  };

  const joinFeed = async (topic: string) => {
    const sb = await getSupabase();
    if (!sb || stopped) return;
    const ch = sb.channel(topic, { config: { private: true, broadcast: { self: false } } });
    feedChannel = ch;
    feedJoined = false;
    ch.subscribe((s) => {
      if (feedChannel !== ch || stopped) return;
      feedJoined = s === 'SUBSCRIBED';
      // Joined (or joined again): everything a panel draws, at once.
      if (feedJoined) publish(true);
    });
  };

  const replaced = (by: string) => {
    if (stopped) return;
    stopped = true;
    if (beat) clearInterval(beat);
    void leave(pressChannel);
    void leave(feedChannel);
    opts.onStatus({ kind: 'replaced', by });
  };

  const start = async () => {
    opts.onStatus({ kind: 'claiming' });
    const sb = await getSupabase();
    if (!sb) {
      opts.onStatus({ kind: 'failed', why: 'No NoaCG backend is configured' });
      return;
    }
    let answer: { claim: number; press_topic: string; feedback_topic: string };
    try {
      answer = await call('panel_claim', { p_slug: opts.slug, p_page: page, p_where: opts.where, p_label: opts.label });
    } catch (err) {
      opts.onStatus({ kind: 'failed', why: (err as Error).message });
      return;
    }
    if (stopped) {
      releaseNow(answer.claim);
      return;
    }
    claim = answer.claim;
    const ch = sb.channel(answer.press_topic, { config: { private: true } });
    pressChannel = ch;
    ch.on('broadcast', { event: 'press' }, (m: { payload: unknown }) => onPressMessage(m.payload));
    ch.on('broadcast', { event: 'want' }, () => publish(true));
    ch.on('broadcast', { event: 'claim' }, (m: { payload: { claim?: number; label?: string } }) => {
      if (typeof m.payload?.claim === 'number' && m.payload.claim > claim) replaced(m.payload.label || 'another page');
    });
    ch.on('broadcast', { event: 'rotated' }, (m: { payload: { feedback_topic?: string } }) => {
      const topic = m.payload?.feedback_topic;
      if (!topic) return;
      // Tell the panels on the old topic to ask again, then move: a revoked key cannot follow.
      send('moved', { v: PANEL_PROTOCOL });
      const old = feedChannel;
      void leave(old);
      void joinFeed(topic);
    });
    ch.subscribe();
    await joinFeed(answer.feedback_topic);
    beat = setInterval(() => send('beat', { v: PANEL_PROTOCOL, page, claim, ver, rowsVer }), PANEL_BEAT_MS);
    opts.onStatus({ kind: 'answering' });
  };

  /** Let go of a claim with a request that outlives the page (pagehide), best effort. */
  const releaseNow = (which: number) => {
    const { url, anonKey } = loadBackendConfig();
    if (!url || !anonKey || !which) return;
    void fetch(`${url}/rest/v1/rpc/panel_release`, {
      method: 'POST',
      keepalive: true,
      headers: { apikey: anonKey, authorization: `Bearer ${anonKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_slug: opts.slug, p_claim: which }),
    }).catch(() => {});
  };

  const stop = () => {
    if (stopped) return;
    send('gone', { v: PANEL_PROTOCOL, page, claim });
    stopped = true;
    if (beat) clearInterval(beat);
    window.removeEventListener('pagehide', stop);
    releaseNow(claim);
    void leave(pressChannel);
    void leave(feedChannel);
  };
  window.addEventListener('pagehide', stop);

  void start();
  return { changed: () => publish(), stop };
}

export type { PanelPress };
