// The LOCAL RELAY receiver: a marked, commented, DELETABLE block appended to an exported
// overlay graphic so a control panel can drive it THROUGH the bundled localhost relay
// (export/local-relay/). BroadcastChannel cannot cross into OBS/vMix's separate browser
// engine and never works over file:// — the relay's ordered log is the local counterpart of
// the hosted control log, same command vocabulary, polled over same-origin fetch.
//
// Inert everywhere the relay is not: over file://, or when the files are served by a plain
// static server (/relay/ping missing), the block probes once and goes quiet.

const OPEN = '/* == LOCAL RELAY (NoaCG) — edit or delete this whole block == */';
const CLOSE = '/* == END LOCAL RELAY == */';

export function hasLocalReceiver(js: string): boolean {
  return js.includes(OPEN);
}

/** The raw JS block — what the single-file composer appends as an extra body script. */
export function localReceiverJs(graphicName: string): string {
  return `${OPEN}
// Drive this graphic through the package's LOCAL RELAY (start it with the bundled launcher;
// see GETTING-ON-AIR.md). The relay keeps an ordered command log; this block polls it and
// applies rows addressed to this graphic — the same update/play/stop/next/event/snap
// vocabulary every NoaCG control surface speaks. Delete the whole block to opt out.
(function () {
  var GRAPHIC = ${JSON.stringify(graphicName)};
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return; // file:// — no relay
  // Which stream this instance follows: /graphic.html?stream=preview renders the PREVIEW
  // feed; the default is the program feed that goes to air.
  var STREAM = 'program';
  try {
    var q = new URLSearchParams(location.search).get('stream');
    if (q) STREAM = q;
  } catch (e) { /* very old engine — program feed */ }
  if (STREAM === 'preview') window.noacgSoundMode = 'silent';

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
  }

  var cursor = null;
  var polling = false;

  // ── THE RECOVERY BASELINE: what this graphic has already taken in ─────────────────────────
  // MERGED is every value ever written to this graphic, in order, and AIRFROM is the log row
  // of the play the CURRENT airing started with (0 when it is off air). Both are maintained live
  // and persisted, which is what lets the boot read start part-way down the log instead of at
  // its first row — see BOOT RECOVERY below.
  var merged = {};
  var airFrom = 0;
  function track(row) {
    var m = row.msg || {}, key;
    if (m.t === 'update' && m.data) { for (key in m.data) merged[key] = m.data[key]; }
    else if (m.t === 'event' && m.payload) { for (key in m.payload) merged[key] = m.payload[key]; }
    if (m.t === 'play') airFrom = row.id;
    else if (m.t === 'stop') airFrom = 0;     // taken off air: the next airing starts its own
  }

  function poll() {
    if (polling || cursor === null) return;
    polling = true;
    fetch('/relay/log?after=' + cursor)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        polling = false;
        if (!data || !data.rows || !data.rows.length) return;
        for (var i = 0; i < data.rows.length; i++) {
          var row = data.rows[i];
          cursor = row.id; // advance past every row — foreign rows must not be refetched
          if (row.graphic !== GRAPHIC || (row.stream || 'program') !== STREAM) continue;
          track(row);
          apply(row.msg);
        }
        saveBaseline();
      })
      .catch(function () { polling = false; });
  }

  // ── BOOT RECOVERY (docs/CLOUD_PLAYOUT.md's recovery discipline, local half) ───────────────
  // A browser source that reloads mid-show used to boot at the log HEAD and come back BLANK:
  // off air, every field at the design's own defaults, until an operator happened to press
  // something. Measured on an exported package: a board aired at 89-84 with the clock at 9:55
  // came back invisible, reading 88 and 10:00, with nine rows sitting unread in the log.
  //
  // The log IS the history, so recovery needs no report channel and no new protocol — it needs
  // a BOUNDED replay. Three things bound it, and all three matter:
  //
  //   - it starts at the LAST "play" for this graphic and stream, so what is re-run is the
  //     current airing rather than the whole show. A graphic never played, or stopped since,
  //     is supposed to be blank and is left alone;
  //   - it runs OFF AIR. Replayed commands are ordinary commands and they animate, so a
  //     visible replay would put the outage's history on screen — recovery is never watchable.
  //     The page hides itself, replays, lets the motion settle, and comes back;
  //   - it reads the log ONCE, so every fetch on the way in is retried rather than believed.
  //     A failed read is not a short log and a silent relay is not a missing one — see the
  //     retry discipline below, which is what stops one lost request costing a whole show.
  //
  // The opacity goes on documentElement deliberately: the runtime's own entrance reset clears
  // inline styles across the GRAPHIC's root subtree, which would strip a hide set inside it.
  var SETTLE_MS = 1200;         // an entrance plus an exit; overshooting only costs blank frames
  var MAX_PAGES = 40;           // the tail RPC answers 500 rows at a time — the same ceiling
                                // the hosted renderer's catch-up walk uses

  // ── WHERE THE READ STARTS (the local half's answer to the hosted plane's report baseline) ──
  // The replay above is bounded by the last play; the READ under it was not. It began at row 0
  // every time, and the relay's log is a file that is appended to and never rotated — so that is
  // not "this show", it is every show this package has ever run, up to 20,000 rows fetched 500
  // at a time before the graphic may paint. The hosted plane never pays that: a renderer starts
  // from its own last REPORT and reads only what came after it.
  //
  // There is no report channel here, so this block keeps its own baseline instead, in
  // localStorage on the relay's origin — which is exactly the thing that survives the outage
  // being recovered from, a browser source reloading. It records what has been merged, how far,
  // and which row the current airing began at, and the boot read then starts AT that play.
  //
  // It is a CACHE OF THE LOG and never a substitute for it: whatever it says, every row after
  // the bound is still read and replayed, so a stale baseline costs nothing and a missing one
  // costs only the old full walk. It is versioned because it is persisted (the repo's rule for
  // every stored format): an unknown version is ignored rather than guessed at. So is a baseline
  // whose cursor sits ahead of the relay's head — the log it describes has been reset, and the
  // rows it counted on are gone.
  var BASE_V = 1;
  var BASE_KEY = 'noacg.relay.baseline.' + GRAPHIC + '.' + STREAM;
  function readBaseline(head) {
    try {
      var raw = localStorage.getItem(BASE_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || s.v !== BASE_V) return null;                              // another build wrote it
      if (typeof s.cursor !== 'number' || s.cursor > head) return null;   // the log was reset
      if (typeof s.from !== 'number' || s.from > s.cursor) return null;   // not a shape we wrote
      return { cursor: s.cursor, from: s.from, data: s.data || {} };
    } catch (e) { return null; }   // no storage, or unreadable — the full walk still recovers
  }
  var baseTimer = null;
  function saveBaseline() {
    clearTimeout(baseTimer);
    baseTimer = setTimeout(function () {
      try {
        localStorage.setItem(BASE_KEY, JSON.stringify({ v: BASE_V, cursor: cursor, from: airFrom, data: merged }));
      } catch (e) { /* quota or a blocked store — recovery falls back to the full walk */ }
    }, 500);
  }

  // EVERY FETCH ON THE BOOT PATH RETRIES, because each one is the only chance it gets. A read
  // that failed used to be handed on as a SHORT LOG, and a short log says exactly what an empty
  // one says: this graphic never aired. Measured by dropping a single request at the reload —
  // a board live at 89 came back at 88 and off air, and stayed there through eight seconds of a
  // perfectly healthy relay. So a failure is now reported AS a failure (the ok flag below) and
  // the caller retries, rather than drawing a conclusion out of half a log.
  var BACKOFF_MS = 400, BACKOFF_MAX = 5000;
  function backoff(tries) { return Math.min(BACKOFF_MAX, BACKOFF_MS * (tries + 1)); }

  function readLog(after, acc, pages, tries, done) {
    if (pages >= MAX_PAGES) { done(acc, true); return; }
    function again() {
      if (tries >= 5) { done(acc, false); return; }
      setTimeout(function () { readLog(after, acc, pages, tries + 1, done); }, backoff(tries));
    }
    fetch('/relay/log?after=' + after)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.rows) { again(); return; }   // answered, but not with a log
        for (var i = 0; i < data.rows.length; i++) acc.push(data.rows[i]);
        if (data.rows.length < 500) done(acc, true);
        else readLog(acc[acc.length - 1].id, acc, pages + 1, 0, done);
      })
      .catch(again);
  }

  /** The row a baseline says the current airing began at, as this log actually has it. */
  function isAiringStart(row, id) {
    return !!row && row.id === id && row.graphic === GRAPHIC && (row.stream || 'program') === STREAM
      && !!row.msg && row.msg.t === 'play';
  }

  function recover(head, tries) { recoverFrom(readBaseline(head), head, tries); }

  function recoverFrom(base, head, tries) {
    // WHERE TO START READING. With a baseline: at the play the current airing began with — its
    // own row has to come back, hence the -1 — or at the cursor when nothing was on air, since
    // then there is no airing to reconstruct and only later rows can matter. With no baseline:
    // row 0, the whole log, which is a first boot on this machine and has no cheaper answer.
    var since = base ? (base.from > 0 ? base.from - 1 : base.cursor) : 0;
    readLog(since, [], 0, 0, function (all, ok) {
      if (!ok) {
        // The log IS the history, so a read that never answered must not be read as "nothing
        // ever aired" — that answer puts a live graphic back blank, which is the outage this
        // whole block exists to prevent. Try the read again; following from the head is the
        // last resort, taken only once retrying is hopeless.
        if (tries < 5) { setTimeout(function () { recoverFrom(base, head, tries + 1); }, backoff(tries)); return; }
        cursor = head; setInterval(poll, 400); return;
      }
      // THE BASELINE HAS TO DESCRIBE THIS LOG, and row numbers alone do not say that. A relay
      // whose relay-log.jsonl was deleted starts counting from 1 again, and once the new show
      // passes the old cursor the numbers look perfectly plausible while meaning different rows.
      // The read began one row BEFORE the airing's play precisely so that row comes back and can
      // be checked: if it is not that play, this baseline belongs to a log that no longer exists,
      // and the honest answer is the full walk rather than a replay of somebody else's show.
      if (base && base.from > 0 && !isAiringStart(all[0], base.from)) { recoverFrom(null, head, 0); return; }
      var mine = [];
      for (var i = 0; i < all.length; i++) {
        var r = all[i];
        if (r.graphic === GRAPHIC && (r.stream || 'program') === STREAM) mine.push(r);
      }
      // THE DATA HALF: every value ever written to this graphic, merged in order - not merely
      // those up to the play. Two things depend on the whole set:
      //
      //   - a bump sent after the take is a PARTIAL update carrying one field, so the score is
      //     only in the later rows (measured: recovering from the pre-play values alone brought
      //     the board back at 88 when it had aired at 89);
      //   - the clock's value carries its origin stamp, written when the clock started, which
      //     is after the play. Merging in order means the newest write wins, and the operator
      //     surfaces stage the stamped value into the cue, so a later Take carries it too
      //     (control/matchClockWire.ts clockValueAfterUpdate) rather than reverting it.
      //
      // "Ever" is why the baseline carries the merged values with it rather than only a row
      // number: the rows before the bound are not read again, so a field set once at the top of
      // the show and never rewritten lives on in MERGED alone, and TRACK continues that merge
      // over the rows just read, and it maintains the airing marker in the same pass — where
      // the current airing begins, and whether it is still on at all.
      var k, key;
      merged = {};
      if (base) { for (key in base.data) merged[key] = base.data[key]; }
      airFrom = base ? base.from : 0;
      for (k = 0; k < mine.length; k++) track(mine[k]);
      if (airFrom === 0) {          // never played, or stopped since: blank is the right picture
        cursor = head;
        saveBaseline();
        setInterval(poll, 400);
        return;
      }

      var root = document.documentElement;
      var prior = root.style.opacity;
      root.style.opacity = '0';
      if (typeof noacgSoundSetQuiet === 'function') noacgSoundSetQuiet(true);
      if (typeof update === 'function') update(JSON.stringify(merged));
      for (k = 0; k < mine.length; k++) { if (mine[k].id >= airFrom) apply(mine[k].msg); }
      // …and the data again, because a "snap" in the replay resets the graphic first and clears
      // the inline styles the DATA layer owns (an empty image field hides itself with one).
      if (typeof update === 'function') update(JSON.stringify(merged));

      // Follow live from the last row the REPLAY actually covered, never from the head the ping
      // answered: that head is older by everything that arrived while the log was being read,
      // and re-delivering those rows would run the play a second time, on air, as a re-entrance.
      cursor = all.length > 0 ? all[all.length - 1].id : head;
      saveBaseline();
      setInterval(poll, 400);
      setTimeout(function () {
        root.style.opacity = prior;
        if (typeof noacgSoundSetQuiet === 'function') noacgSoundSetQuiet(false);
      }, SETTLE_MS);
    });
  }

  // The probe tells apart the two things that used to look identical here. An ANSWER that is
  // not a relay's (the 404 plain static hosting gives) means there is no relay on this origin
  // and never will be: stay quiet, which is this block's inert contract. NO ANSWER means nobody
  // was listening YET — a browser source opened before the launcher was double-clicked, which
  // is the order a student does it in. That one used to sit dead for the whole show; it now
  // keeps knocking, one request every few seconds, and joins the moment the relay answers.
  function probe(tries) {
    fetch('/relay/ping')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.ok) return; // plain static hosting — stay quiet
        recover(d.head || 0, 0);
      })
      .catch(function () { setTimeout(function () { probe(tries + 1); }, backoff(tries)); });
  }
  if (typeof noacgSoundPrepare === 'function') noacgSoundPrepare().then(function () { probe(0); });
  else probe(0);
})();
${CLOSE}`;
}

/** The same block wrapped as a <script> tag, for callers injecting into finished HTML. */
export function localReceiverScript(graphicName: string): string {
  return `<script>\n${localReceiverJs(graphicName)}\n</script>`;
}
