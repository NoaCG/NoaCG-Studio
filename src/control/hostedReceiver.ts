// The HOSTED-CONTROL receiver (Phase 5): a marked, commented, DELETABLE block appended to a
// graphic's own JS when its show has a hosted control page. The cloud sibling of the
// BroadcastChannel receiver, but DURABLE: commands are rows in the control_events log, so
// this receiver (a) rebuilds the graphic at boot from its own last applied-state report,
// (b) follows new commands live over Realtime Postgres Changes, and (c) tail-fills any gap
// after a reconnect from the log. Like realtimeControl.ts it is hand-rolled (Phoenix
// vsn=1.0.0, no bundled library) and 100% inert until REF and KEY are filled in.

import { loadBackendConfig } from '../backend/config';
// The two rules this block MIRRORS rather than re-decides: where a boot starts reading the log,
// and how often a following surface re-reads it when Realtime says nothing. Both are owned by the
// modules the app's own renderer uses, so the emitted text cannot drift away from the plane it is
// supposed to behave like.
import { CONTROL_POLL_MS } from './hostedControl';
import { RECEIVER_FOLLOW_FROM_JS } from './outputRecovery';
import { refFromSupabaseUrl } from './realtimeControl';

const OPEN = '/* == HOSTED CONTROL (Supabase log) — edit or delete this whole block == */';
const CLOSE = '/* == END HOSTED CONTROL == */';

export interface HostedReceiverConfig {
  /** Supabase project ref (the <ref> in <ref>.supabase.co). */
  ref: string;
  /** Publishable/anon key — public-safe to embed. */
  key: string;
  /** The hosted page's capability slug (keep private — it authorizes operating). */
  slug: string;
  /** This graphic's name in the show — its card + its rows in the log. */
  graphic: string;
}

export function hasHostedReceiver(js: string): boolean {
  return js.includes(OPEN);
}

export function stripHostedReceiver(js: string): string {
  const start = js.indexOf(OPEN);
  const end = js.indexOf(CLOSE);
  if (start === -1 || end === -1) return js;
  return (js.slice(0, start) + js.slice(end + CLOSE.length)).replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

/** The app's backend as a receiver config for one graphic, or null offline. */
export function hostedReceiverConfig(slug: string, graphic: string): HostedReceiverConfig | null {
  const cfg = loadBackendConfig();
  const ref = refFromSupabaseUrl(cfg.url);
  if (!ref || !cfg.anonKey) return null;
  return { ref, key: cfg.anonKey, slug, graphic };
}

export function hostedReceiverBlock(cfg: HostedReceiverConfig): string {
  return `${OPEN}
// Drive this graphic from its HOSTED control page (?control=<slug> on the NoaCG site). The
// commands live in a durable log, which is what makes this recoverable: at boot the graphic
// rebuilds itself from its own last report (data + state), then follows new commands live
// and back-fills anything it missed while offline. The SLUG is a capability — anyone who
// has it (plus the public KEY) can operate the graphic, so keep it private. Delete this
// whole block for a pure-offline graphic.
(function () {
  var REF = ${JSON.stringify(cfg.ref)};        // <ref>.supabase.co  (blank => stays offline)
  var KEY = ${JSON.stringify(cfg.key)};        // publishable key (public-safe)
  var SLUG = ${JSON.stringify(cfg.slug)};      // the hosted page's capability slug
  var GRAPHIC = ${JSON.stringify(cfg.graphic)}; // this graphic's name in the show
  if (!REF || !KEY || !SLUG) return;

  var REST = 'https://' + REF + '.supabase.co/rest/v1/rpc/';
  var lastId = 0;      // the last log row applied — the tail cursor
  var showId = null;
  var joined = false;  // has the realtime channel ever answered our join?

  ${RECEIVER_FOLLOW_FROM_JS}

  // AN RPC EITHER ANSWERED OR FAILED, and this block must never confuse the two. A dropped
  // request says nothing about the show, so it is reported AS a failure (the ok flag) and the
  // caller retries; concluding from it is what used to leave a hosted graphic dead for a whole
  // airing - see the boot below, and docs/CONTROL_LAYER.md's hosted-half rule.
  function rpc(name, args) {
    return fetch(REST + name, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    }).then(function (r) {
      if (!r.ok) return { ok: false, value: null };   // 4xx/5xx: an error page is not a log
      return r.json().then(
        function (v) { return { ok: true, value: v }; },
        function () { return { ok: false, value: null }; }   // answered, but not with JSON
      );
    }).catch(function () { return { ok: false, value: null }; });
  }

  // Call until it ANSWERS, backing off. A limit of 0 keeps knocking for good, which is what the
  // boot resolve needs: without the show id there is no subscription to fall back to, so giving
  // up means dark until somebody notices and reloads the browser source.
  var RETRY_MS = 500, RETRY_MAX = 10000;
  function rpcRetry(name, args, limit, done, tries) {
    tries = tries || 0;
    rpc(name, args).then(function (r) {
      if (r.ok) { done(true, r.value); return; }
      if (limit && tries + 1 >= limit) { done(false, null); return; }
      setTimeout(function () { rpcRetry(name, args, limit, done, tries + 1); },
        Math.min(RETRY_MAX, RETRY_MS * Math.pow(2, tries)));
    });
  }

  // Apply one command through the graphic's own globals — the same mapping as every receiver.
  function apply(m) {
    if (!m) return;
    if (m.t === 'play' && typeof play === 'function') play();
    else if (m.t === 'stop' && typeof stop === 'function') {
      var priorQuiet = typeof noacgSoundQuiet !== 'undefined' && noacgSoundQuiet;
      if (m.sound === false && typeof noacgSoundSetQuiet === 'function') noacgSoundSetQuiet(true);
      stop();
      if (m.sound === false && typeof noacgSoundSetQuiet === 'function') noacgSoundSetQuiet(priorQuiet);
    }
    else if (m.t === 'next' && typeof next === 'function') next();
    else if (m.t === 'update' && typeof update === 'function') update(JSON.stringify(m.data || {}));
    else if (m.t === 'event' && typeof noacgDispatch === 'function') noacgDispatch(m.event, m.payload);
    else if (m.t === 'snap' && typeof noacgSnap === 'function') noacgSnap(m.snap || null);
    else return; // 'staged' / 'live' meta rows are for control pages, not for us
    scheduleReport();
  }

  // Report what is actually on air (the definition's fields, read back from the DOM, plus the
  // machine state) — the PUBLISHED truth the boot recovery and the pages' chips read.
  var reportTimer = null;
  function harvest() {
    var data = {};
    try {
      var defs = (window.SPXGCTemplateDefinition && window.SPXGCTemplateDefinition.DataFields) || [];
      for (var i = 0; i < defs.length; i++) {
        var f = defs[i] && defs[i].field;
        if (!f) continue;
        var el = document.getElementById(f);
        if (!el) continue;
        data[f] = el.tagName === 'IMG' ? (el.getAttribute('src') || '') : (el.textContent || '');
      }
    } catch (e) { /* report what we could */ }
    return data;
  }
  // The one call on this block that deliberately does NOT retry. A report is a SNAPSHOT of a
  // moment, and a retry would land it after a newer one has already been written - recovery
  // would then rebuild an older picture than the one this graphic had actually reached. A lost
  // report costs nothing on its own: the next command schedules another, and the log holds
  // everything the stale baseline is missing.
  function scheduleReport() {
    clearTimeout(reportTimer);
    reportTimer = setTimeout(function () {
      var state = (typeof noacgMachineState === 'function') ? noacgMachineState() : null;
      rpc('control_report', { p_slug: SLUG, p_graphic: GRAPHIC, p_data: harvest(), p_state: state });
    }, 800);
  }

  // Back-fill the gap after (re)connecting, in log order, then continue live. The tail RPC
  // answers TAIL_PAGE rows at a time, so one call only ever recovers that much of a gap: keep
  // pulling while pages come back full (every page advances the cursor, so the walk ends).
  // One walk at a time - a second in parallel would re-read the same rows and apply them twice.
  var TAIL_PAGE = 500;        // the RPC's own limit (migration 0008)
  var MAX_TAIL_PAGES = 40;    // runaway guard, the same ceiling the renderer's catch-up uses
  var POLL_MS = ${CONTROL_POLL_MS};  // the floor under realtime — see startPolling() below
  var tailing = false, tailAgain = false;
  function fillTail(booting) {
    // A second walk while one is in flight is REMEMBERED, not dropped. Dropping it re-creates the
    // bug the hole path exists to prevent, one level up: a row that arrives while the boot walk
    // is still reading is skipped here (its own handler returned without applying it, to keep the
    // cursor behind the gap), and the walk in flight may already have read past the point that
    // row would appear at - so nothing would fetch it until the poll came round.
    if (tailing) { tailAgain = true; return; }
    tailing = true;
    var quieted = booting === true;
    var pages = 0;
    var step = function () {
      // Five failures and we stop rather than spin: the socket is up by now, and the next row
      // that arrives with a hole in front of it starts this walk again - as does the poll below.
      rpcRetry('control_tail', { p_slug: SLUG, p_graphic: GRAPHIC, p_after: lastId }, 5, function (ok, rows) {
        if (!ok || !rows) {
          tailing = false; tailAgain = false;
          if (quieted && typeof noacgSoundSetQuiet === 'function') noacgSoundSetQuiet(false);
          return;
        }
        for (var i = 0; i < rows.length; i++) {
          if (rows[i].id > lastId) {
            if (!quieted && typeof noacgSoundSetQuiet === 'function') { quieted = true; noacgSoundSetQuiet(true); }
            lastId = rows[i].id; apply(rows[i].msg);
          }
        }
        pages += 1;
        if (rows.length >= TAIL_PAGE && pages < MAX_TAIL_PAGES) { step(); return; }
        tailing = false;
        if (quieted && typeof noacgSoundSetQuiet === 'function') noacgSoundSetQuiet(false);
        if (tailAgain) { tailAgain = false; fillTail(); }
      });
    };
    step();
  }

  // THE FLOOR UNDER REALTIME. Every recovery above is triggered by something the socket does — a
  // row arriving with a hole in front of it, or a reconnect. A channel that opens and never joins
  // (a venue proxy that passes the upgrade and eats the frames, a realtime incident, an old CEF)
  // does neither: it never closes, so nothing reconnects, and it never delivers, so no row can
  // reveal a gap. This graphic then holds whatever the boot fetched and airs nothing else for the
  // rest of the show, silently. So the log is re-read on a slow timer whatever the socket is
  // doing, and a channel that has never joined says so ONCE rather than being retried in silence.
  // The interval is the app's own (control/hostedControl.ts CONTROL_POLL_MS), where the cost
  // arithmetic behind it is written down.
  var warnedNotJoined = false;
  function startPolling() {
    setInterval(function () {
      if (!joined && !warnedNotJoined) {
        warnedNotJoined = true;
        try {
          console.warn('NoaCG: the realtime channel for "' + GRAPHIC + '" has never joined. ' +
            'Following the control log by polling every ' + Math.round(POLL_MS / 1000) +
            's - commands can be that late on air.');
        } catch (e) { /* a host with no console */ }
      }
      fillTail();
    }, POLL_MS);
  }

  // ── Realtime: follow new log rows (Postgres Changes on control_events). ──
  var url = 'wss://' + REF + '.supabase.co/realtime/v1/websocket?apikey=' + encodeURIComponent(KEY) + '&vsn=1.0.0';
  var n = 0, ws = null, hb = null, backoff = 1000;
  function ref() { return String(++n); }
  function connect() {
    var full = 'realtime:control-' + showId;
    joined = false;
    ws = new WebSocket(url);
    ws.onopen = function () {
      backoff = 1000;
      var joinRef = ref();
      ws.send(JSON.stringify({ topic: full, event: 'phx_join', ref: joinRef, join_ref: joinRef,
        payload: { access_token: KEY, config: { broadcast: { self: false }, presence: { key: '' },
          postgres_changes: [{ event: 'INSERT', schema: 'public', table: 'control_events', filter: 'show_id=eq.' + showId }] } } }));
      hb = setInterval(function () {
        if (ws && ws.readyState === 1) ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: ref() }));
      }, 25000);
    };
    ws.onmessage = function (e) {
      var m; try { m = JSON.parse(e.data); } catch (err) { return; }
      // THE JOIN REPLY, not the socket opening, is what says rows will now arrive — and it is
      // where the gap gets filled, mirroring the app's refill-on-SUBSCRIBED. Filling at onopen
      // instead read the log BEFORE the subscription existed, so anything written in that window
      // was delivered by neither and waited for the next row to expose the hole.
      if (m.event === 'phx_reply' && m.topic === full && m.payload && m.payload.status === 'ok') {
        joined = true;
        fillTail(); // anything sent while we were away, in order, before the live rows land
        return;
      }
      if (m.event !== 'postgres_changes') return;
      var rec = m.payload && m.payload.data && m.payload.data.record;
      if (!rec || rec.graphic !== GRAPHIC) return;
      if (rec.id <= lastId) return;          // replayed or already tail-filled
      // A HOLE: rows are missing in front of this one, so recover them from the log and let the
      // walk deliver this row too. Applying it here first would push the cursor PAST the gap,
      // and the tail's older rows would then be dropped as duplicates - the gap would close on
      // paper while the commands in it never ran (the rule followControlLog already carries).
      if (rec.id > lastId + 1) { fillTail(); return; }
      lastId = Math.max(lastId, rec.id);
      apply(rec.msg);
    };
    var down = function () { clearInterval(hb); ws = null; setTimeout(connect, backoff); backoff = Math.min(backoff * 2, 10000); };
    ws.onclose = down;
    ws.onerror = function () { try { ws.close(); } catch (err) { /* already down */ } };
  }

  // ── Boot: resolve the page, REBUILD from our own last report, then go live. ──
  //
  // THIS RESOLVE IS THE ONE REQUEST THE WHOLE AIRING HANGS ON. It hands over the show id (no
  // id, no subscription), the log baseline and the last report, so a graphic that never gets an
  // answer is not degraded - it is dead, silently, for as long as the show lasts. It used to be
  // asked exactly once, with a failure swallowed into null and read as "no such production",
  // which is what a REVOKED slug answers: one dropped request on the plane published
  // productions actually run on, and the graphic never connected again.
  //
  // So a failure is retried for good (rpcRetry with no limit), and only an ANSWER decides.
  // An answer with no row does mean the capability is gone - unpublished or rotated - and that
  // one is honoured by staying quiet, which is this block's contract for a slug it may not use.
  function boot() { rpcRetry('control_show_by_slug', { p_slug: SLUG }, 0, function (ok, rows) {
    var row = ok && rows && rows[0];
    if (!row) return;
    showId = row.id;
    // WHERE TO START READING. Not the log head: the head is a claim about the RENDERER — that
    // everything up to it is already on air — and a graphic that has never reported has rendered
    // none of it. A cue taken before this graphic finished loading (an operator with the
    // production up long before the browser source is added, which is the ordinary order) was
    // dropped for good that way: nothing to rebuild from, nothing left to replay, a dark layer
    // until somebody happened to send another command. control/outputRecovery.ts owns the rule
    // and the one case where this plane still differs from the app's renderer.
    lastId = followFrom(GRAPHIC, row.live, row.last_event_id);
    if (typeof noacgSoundSetQuiet === 'function') noacgSoundSetQuiet(true);
    var mine = (row.live || {})[GRAPHIC];
    if (mine) {
      // Reset is two operations, and recovery is both: the data half, then the visual half
      // (snap arms timers — recovery semantics).
      if (mine.data && typeof update === 'function') update(JSON.stringify(mine.data));
      if (mine.state && mine.state.groups && typeof noacgSnap === 'function') {
        noacgSnap(mine.state.groups);
        // Snap resets the graphic first, clearing every inline style — including the ones the
        // DATA layer owns (an image field with no picture is hidden inline). Restate the data.
        if (mine.data && typeof update === 'function') update(JSON.stringify(mine.data));
      }
    }
    // THE BOOT CATCH-UP, before the socket rather than through it: everything commanded since
    // that baseline, in log order. It used to happen only inside ws.onopen, so a graphic whose
    // socket was slow, blocked or dead showed the report and nothing else — and on the cold-boot
    // path above there is no report either, which is a blank layer over a full log.
    fillTail(true);
    startPolling();
    connect();
  }); }
  if (typeof noacgSoundPrepare === 'function') noacgSoundPrepare().then(boot);
  else boot();
})();
${CLOSE}
`;
}
