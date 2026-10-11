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
import { workerInterval } from './workerTicker';
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

/** How often the answering page says it is still there (a panel gives up after 12 s of silence)
 *  and renews its lease (which lapses after 15 s: supabase/migrations/0081_panel_lease.sql). */
export const PANEL_BEAT_MS = 4_000;

export type AnswerStatus =
  | { kind: 'claiming' }
  | { kind: 'answering' }
  /** Another live page holds the panel; this page took nothing. */
  | { kind: 'held'; by: string }
  /** This page held the panel, and another page has it now. */
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
  /** Stop answering: tell the panels, let go of the lease, leave both topics. */
  stop(): void;
}

/** Sixteen lowercase letters and digits, the page id panel_lease accepts. */
function pageId(): string {
  let id = '';
  while (id.length < 16) id += mintOid().replace(/[^a-z0-9]/g, '');
  return id.slice(0, 16);
}

const tabPages = new Map<string, string>();

/**
 * THIS TAB'S PAGE ID for a production (panel lease L4): the lease is held by page id, and a reload
 * of the tab keeps it, so the reloaded page carries on under the same claim instead of losing the
 * panel or racing another page for it. It is handed to the next document of the tab only, on
 * `pagehide`, and taken out of storage as it is read: a tab duplicated from this one (which copies
 * session storage) gets an id of its own, so two tabs never answer as one page.
 */
export function tabPageId(slug: string): string {
  const known = tabPages.get(slug);
  if (known) return known;
  const key = `noacg-panel-page:${slug}`;
  let id = '';
  try {
    id = window.sessionStorage.getItem(key) ?? '';
    window.sessionStorage.removeItem(key);
  } catch {
    // no storage: a reload is a new page, whose lease waits for this one's to lapse
  }
  if (!/^[a-z0-9]{16}$/.test(id)) id = pageId();
  tabPages.set(slug, id);
  window.addEventListener('pagehide', () => {
    try {
      window.sessionStorage.setItem(key, id);
    } catch {
      // as above
    }
  });
  return id;
}

/** What an answering page hands the next document of its tab: the claim it answered under, and how
 *  far its state and rows versions had counted. */
interface HandedOn {
  claim: number;
  ver: number;
  rowsVer: number;
}

const handKey = (slug: string) => `noacg-panel-counts:${slug}`;

function handOn(slug: string, counts: HandedOn): void {
  try {
    window.sessionStorage.setItem(handKey(slug), JSON.stringify(counts));
  } catch {
    // no storage: the reloaded page counts from its claim's million, as a new claim does
  }
}

/** The counts the document before this one handed on, taken out as they are read (as the page id). */
function handedOn(slug: string): HandedOn | null {
  try {
    const raw = window.sessionStorage.getItem(handKey(slug));
    window.sessionStorage.removeItem(handKey(slug));
    const counts = raw ? (JSON.parse(raw) as Partial<HandedOn>) : null;
    return counts && typeof counts.claim === 'number' && typeof counts.ver === 'number' && typeof counts.rowsVer === 'number'
      ? { claim: counts.claim, ver: counts.ver, rowsVer: counts.rowsVer }
      : null;
  } catch {
    return null;
  }
}

/**
 * ANSWER THE PANEL ON THIS PAGE (docs/work-specs/panel-ownership-lease/spec.md). Takes the
 * production's panel lease, when it is free or already this tab's, or moves it here (`move`, "Use
 * here"); keeps it with a renewal on every beat; listens for presses stamped with its claim, runs
 * each through `run` - the page's own dispatcher - after the page-side checks, and publishes what
 * the keys draw from. Held by another live page and not moved, it takes nothing and says who.
 */
export function answerPanel(opts: {
  slug: string;
  where: 'production' | 'control';
  /** Move the panel here from whichever page holds it ("Use here"). */
  move: boolean;
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
  const page = tabPageId(opts.slug);
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
  /** Stops the beat and the renewal, which run on a timer a hidden tab cannot starve. */
  let beat: (() => void) | null = null;

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
    beat?.();
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
    let answer: { ok: boolean; claim: number; press_topic: string; feedback_topic: string; answering?: { label?: string } | null };
    try {
      answer = await call('panel_lease', { p_slug: opts.slug, p_page: page, p_where: opts.where, p_label: opts.label, p_move: opts.move });
    } catch (err) {
      opts.onStatus({ kind: 'failed', why: (err as Error).message });
      return;
    }
    if (!answer.ok) {
      // Held by another live page: never taken from it (L5).
      stopped = true;
      opts.onStatus({ kind: 'held', by: answer.answering?.label || 'Another page' });
      return;
    }
    if (stopped) {
      releaseNow(answer.claim);
      return;
    }
    claim = answer.claim;
    // Versions start at the claim's own million, so a key drawn under an earlier page's claim can
    // never match one of this page's states by number and be judged against the wrong one. A reload
    // of this tab carries on under the same claim (L4), so it carries on counting from where the
    // page before it stopped, for the same reason.
    const before = handedOn(opts.slug);
    ver = before && before.claim === claim ? Math.max(claim * 1_000_000, before.ver) : claim * 1_000_000;
    if (before && before.claim === claim) rowsVer = before.rowsVer;
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
    const renew = async () => {
      try {
        const kept = await call<{ ok: boolean; answering?: { label?: string } | null }>('panel_renew', { p_slug: opts.slug, p_page: page, p_claim: claim });
        // The claim moved on: another page took the panel ("Use here" there, or after this lease lapsed).
        if (!kept.ok) replaced(kept.answering?.label || 'another page');
      } catch {
        // Not answered: the next beat renews. A lapsed lease nobody took is still this page's.
      }
    };
    beat = workerInterval(PANEL_BEAT_MS, () => {
      send('beat', { v: PANEL_PROTOCOL, page, claim, ver, rowsVer });
      void renew();
    });
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

  /** `release`: let go of the lease. A page going away (`pagehide`) keeps it, since that is also a
   *  reload, and a reload carries on under it (L4); a closed tab's lease lapses in 15 s. */
  const stop = (release = true) => {
    if (stopped) return;
    send('gone', { v: PANEL_PROTOCOL, page, claim });
    stopped = true;
    beat?.();
    window.removeEventListener('pagehide', onHide);
    if (release) releaseNow(claim);
    void leave(pressChannel);
    void leave(feedChannel);
  };
  const onHide = () => {
    // Handed to the next document of this tab, which resumes the lease (L4) and its counts.
    if (claim) handOn(opts.slug, { claim, ver, rowsVer });
    stop(false);
  };
  window.addEventListener('pagehide', onHide);

  void start();
  return { changed: () => publish(), stop: () => stop() };
}

export type { PanelPress };
