// The tiny receiver injected into an exported graphic's index.html. It lets a standalone
// control panel (controlpanel.html, same browser + origin) drive the graphic live over a
// BroadcastChannel — useful when the graphic runs as an OBS/browser source and you operate
// it from another tab. It only ADDS a listener; SPX/CasparCG still call the same globals
// directly, so nothing conflicts. On a renderer without BroadcastChannel it does nothing.

export function controlReceiverScript(templateName: string, channelName: string): string {
  return `<script id="spx-control-receiver">
/* Control receiver — ${templateName}.
   A control panel on the same machine (controlpanel.html) posts messages here; we forward
   them to the graphic's own update()/play()/stop()/next() — and, when this graphic carries a
   state machine, 'event' and 'snap' to noacgDispatch()/noacgSnap() (the machine cues a
   generated control page sends). After every handled message the receiver answers with the
   machine state, and a lightweight watcher reports timer-driven changes too, so the panel's
   state chip stays honest. Remove this block to opt out. */
(function () {
  if (/[?&]stream=preview(?:&|$)/.test(location.search)) window.noacgSoundMode = 'silent';
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    var ch = new BroadcastChannel('${channelName}');
    var lastSent = '';
    function reply(force) {
      var hasState = typeof noacgMachineState === 'function';
      var hasOver = typeof noacgTextOverflow === 'function';
      if (!hasState && !hasOver) return;
      try {
        var state = hasState ? noacgMachineState() : null;
        // WHICH VALUES DID NOT FIT — the field ids this graphic could not size down far enough
        // to hold (its fit ladder's last rung). The panel warns the operator with it; the copy
        // is never cut and the artwork is never reshaped to hide it.
        var over = hasOver ? noacgTextOverflow() : null;
        var key = JSON.stringify([state, over]);
        if (!force && key === lastSent) return;
        lastSent = key;
        ch.postMessage({ t: 'state', state: state, over: over });
      } catch (e) { /* state unavailable — the panel just shows no chip */ }
    }
    ch.onmessage = function (ev) {
      var m = ev.data || {};
      if (m.t === 'update' && typeof update === 'function') update(JSON.stringify(m.data || {}));
      else if (m.t === 'play' && typeof play === 'function') play();
      else if (m.t === 'stop' && typeof stop === 'function') {
        var priorQuiet = typeof noacgSoundQuiet !== 'undefined' && noacgSoundQuiet;
        if (m.sound === false && typeof noacgSoundSetQuiet === 'function') noacgSoundSetQuiet(true);
        stop();
        if (m.sound === false && typeof noacgSoundSetQuiet === 'function') noacgSoundSetQuiet(priorQuiet);
      }
      else if (m.t === 'next' && typeof next === 'function') next();
      else if (m.t === 'event' && typeof noacgDispatch === 'function') {
        // WHEN this event happened. A graphic that runs a clock of its own reads it instead of
        // Date.now(), so every renderer given the same row anchors to the same instant.
        //
        // It is SET AND LEFT, never cleared after the call. noacgDispatch queues the event and
        // the state's own calls fire a frame later, so clearing it on the next line puts the
        // instant back to null before the thing that needed it runs — which is exactly the bug
        // the first cut of this shipped: a replayed 90-second-old switch still started the
        // speech from five minutes. Leaving it is safe because it is rewritten by every event,
        // to null when there is no instant, so it always reads as the MOST RECENT event's.
        window.noacgEventAt = (typeof m.at === 'number' && m.at > 0) ? m.at : null;
        noacgDispatch(m.event, m.payload);
      }
      else if (m.t === 'snap' && typeof noacgSnap === 'function') noacgSnap(m.snap || null);
      reply(m.t === 'hello');
      watch();
    };
    // Timers advance the machine with no message to answer, and a webfont arriving re-runs the
    // text fit — a cheap watcher reports both.
    //
    // ARMED AGAIN ON THE FIRST MESSAGE, not only at load. In a SINGLE-FILE package (CasparCG,
    // the OBS/vMix overlay) this block goes in at the end of the body and the composer appends
    // the template's own JS after it, so at load neither global exists yet and the watcher used
    // to stay disarmed for the life of the page: the panel then paired, answered every press,
    // and silently never reported a timer-driven change. Re-checking costs a boolean per message.
    //
    // NOTHING IN THIS SCRIPT MAY CONTAIN THE CLOSING BODY TAG, not even inside a comment. Both
    // injectControlReceiver and composeSelfContainedHtml find their insertion point with
    // /<\\/body>/i and replace the FIRST match, so one written here becomes the first one in the
    // document and the template's whole JS lands inside this comment. Nine specs went red on it.
    var watching = false;
    function watch() {
      if (watching) return;
      if (typeof noacgMachineState !== 'function' && typeof noacgTextOverflow !== 'function') return;
      watching = true;
      setInterval(function () { reply(false); }, 1000);
    }
    watch();
    // Announce the boot: a control panel that kept an event log hears this and rebuilds a
    // refreshed graphic (latest data, then snap to the last known state) — crash recovery.
    ch.postMessage({ t: 'graphic-online' });
  } catch (e) { /* channel unavailable — the graphic still works, just not remotely driven */ }
})();
</script>`;
}
