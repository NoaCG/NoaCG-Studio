// Remote realtime control (Era 5.3). Drives a graphic from ANY device over a Supabase Realtime
// Broadcast channel — the cloud sibling of Era 4's same-origin BroadcastChannel, using the SAME
// message shape ({t:'update',data}|{t:'play'}|{t:'stop'}|{t:'next'}). Like liveData.ts, this
// generates a marked, commented, DELETABLE block appended to the template's own JS, so the code
// stays the source of truth and the DEFAULT export remains 100% offline (the block does nothing
// until REF+KEY are filled in).
//
// Design (see docs/ERA5_PLAN.md 5.3): a PUBLIC channel + the world-readable publishable key — no
// login, so nothing expires and an unattended on-air graphic never drops off. Isolation comes from
// the TOPIC being an unguessable capability (spx-control-<slug>-<random>), a shared secret between
// the graphic and its control panel. Hand-rolled WebSocket (Phoenix vsn=1.0.0), no bundled library.

import { slug } from '../model/slug';
import { loadBackendConfig } from '../backend/config';

const OPEN = '/* == REMOTE CONTROL (Supabase Realtime) — edit or delete this whole block == */';
const CLOSE = '/* == END REMOTE CONTROL == */';

const CAP_KEY = 'spx-gfx-remote-cap';

export interface RemoteControlConfig {
  /** Supabase project ref (the <ref> in <ref>.supabase.co). */
  ref: string;
  /** Publishable/anon key — public-safe to embed. */
  key: string;
  /** The shared channel topic (an unguessable capability). */
  topic: string;
}

/** True when the template JS already carries a remote-control block. */
export function hasRealtimeControl(js: string): boolean {
  return js.includes(OPEN);
}

/** Remove an existing remote-control block (so toggling off is clean). */
export function stripRealtimeControl(js: string): string {
  const start = js.indexOf(OPEN);
  const end = js.indexOf(CLOSE);
  if (start === -1 || end === -1) return js;
  return (js.slice(0, start) + js.slice(end + CLOSE.length)).replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

/** The per-project capability secret (stable, high-entropy) that makes the topic unguessable. */
export function ensureRemoteCap(): string {
  try {
    const existing = localStorage.getItem(CAP_KEY);
    if (existing) return existing;
    const bytes = new Uint8Array(9);
    (globalThis.crypto ?? ({} as Crypto)).getRandomValues?.(bytes);
    const cap = btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '').slice(0, 12) || `${Date.now()}`;
    localStorage.setItem(CAP_KEY, cap);
    return cap;
  } catch {
    return 'localonly';
  }
}

/** The remote topic for a graphic: its slug + the project capability. Both the graphic and its
 *  control panel derive the same string, so they meet on the same channel. */
export function remoteControlTopic(templateName: string): string {
  return `spx-control-${slug(templateName)}-${ensureRemoteCap()}`;
}

/** Extract the project ref from a Supabase URL (https://<ref>.supabase.co). */
export function refFromSupabaseUrl(url: string): string {
  const m = url.match(/^https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
  return m ? m[1] : '';
}

/**
 * Build the remote-control config from the app's configured Supabase backend + the graphic's topic.
 * Returns null when no backend is configured — remote control is then unavailable (offline mode).
 * The exported graphic reaches the SAME Supabase project the builder is signed into.
 */
export function remoteControlConfig(templateName: string): RemoteControlConfig | null {
  const cfg = loadBackendConfig();
  const ref = refFromSupabaseUrl(cfg.url);
  if (!ref || !cfg.anonKey) return null;
  return { ref, key: cfg.anonKey, topic: remoteControlTopic(templateName) };
}

// ── The receiver block appended to the graphic's template.js (default disabled). ──────────────────
export function realtimeControlBlock(cfg: RemoteControlConfig): string {
  return `${OPEN}
// Drive this graphic from another device over Supabase Realtime. The DEFAULT export is offline —
// this only runs when REF and KEY are filled in. Public channel + publishable key: no login, so
// nothing expires and an on-air graphic never drops off. The TOPIC is a shared secret — anyone who
// knows the KEY and this exact TOPIC can control the graphic, so keep it private. Delete this whole
// block for a pure-offline graphic. (Fire-and-forget: a command sent while the graphic is offline
// is not replayed.)
(function () {
  var REF = ${JSON.stringify(cfg.ref)};       // <ref>.supabase.co  (blank => stays offline)
  var KEY = ${JSON.stringify(cfg.key)};       // publishable key (public-safe)
  var TOPIC = ${JSON.stringify(cfg.topic)};   // the SAME unguessable topic the control panel uses
  if (!REF || !KEY) return;

  var url = 'wss://' + REF + '.supabase.co/realtime/v1/websocket?apikey=' + encodeURIComponent(KEY) + '&vsn=1.0.0';
  var full = 'realtime:' + TOPIC, n = 0, joinRef = null, ws = null, hb = null, backoff = 1000;
  function ref() { return String(++n); }

  // Reuse the graphic's own runtime — identical to the Era-4 BroadcastChannel receiver,
  // including the machine cues ('event' rides the serial queue, 'snap' enters instantly).
  // Send-only from the panel side, so no state replies here — the hosted control page
  // (Phase 5) reads state through its own durable channel instead.
  function dispatch(m) {
    if (!m) return;
    if (m.t === 'play' && typeof play === 'function') play();
    else if (m.t === 'stop' && typeof stop === 'function') stop();
    else if (m.t === 'next' && typeof next === 'function') next();
    else if (m.t === 'update' && typeof update === 'function') update(JSON.stringify(m.data || {}));
    else if (m.t === 'event' && typeof noacgDispatch === 'function') noacgDispatch(m.event, m.payload);
    else if (m.t === 'snap' && typeof noacgSnap === 'function') noacgSnap(m.snap || null);
  }

  function connect() {
    ws = new WebSocket(url);
    ws.onopen = function () {
      backoff = 1000; joinRef = ref();
      // Join the PUBLIC channel (no private:true, no token). The apikey in the URL is the auth.
      ws.send(JSON.stringify({ topic: full, event: 'phx_join', ref: joinRef, join_ref: joinRef,
        payload: { config: { broadcast: { self: false, ack: false }, presence: { key: '' }, postgres_changes: [] } } }));
      // Heartbeat must be <= 25s or the server drops the socket.
      hb = setInterval(function () {
        if (ws && ws.readyState === 1) ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: ref() }));
      }, 25000);
    };
    ws.onmessage = function (e) {
      var m; try { m = JSON.parse(e.data); } catch (_) { return; }
      // vsn=1.0.0 object envelope; the broadcast payload is DOUBLE-nested: payload.payload is our {t,...}.
      if (m.event === 'broadcast' && m.payload && m.payload.event === 'control') dispatch(m.payload.payload);
    };
    // Reconnect on drop (backgrounded tabs / network blips) so the graphic re-joins on its own.
    var down = function () { clearInterval(hb); ws = null; setTimeout(connect, backoff); backoff = Math.min(backoff * 2, 10000); };
    ws.onclose = down;
    ws.onerror = function () { try { ws.close(); } catch (_) {} };
  }
  connect();
})();
${CLOSE}
`;
}
