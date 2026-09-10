// The browser-output renderer's entry (docs/CLOUD_PLAYOUT.md §3). Boot: resolve the
// production by its OUTPUT capability, build the stage (every graphic preloaded), rebuild each
// graphic from its last report (the data half, then the visual half — recovery is both), then
// follow the command log live through the shared recovery discipline (followControlLog).
//
// Nothing but graphics ever renders on air: no connection text, no UI. A disconnected renderer
// keeps its last applied state and recovers silently; `&debug=1` overlays a status readout for
// setup and rehearsal. The "not available" card exists only for a wrong URL or an offline
// build — states a live production can never be in.

import { isBackendConfigured } from '../backend/config';
import {
  CONTROL_POLL_MS,
  CONTROL_TAIL_PAGE,
  controlOutputBySlug,
  controlOutputReport,
  controlOutputSeen,
  controlOutputTail,
  followControlLog,
  untilAnswered,
  type ControlEventRow,
} from '../control/hostedControl';
import {
  clockRowEffect,
  clockSpecFromHtml,
  clockValueAfterUpdate,
  rowInstant,
  speakingClockRowEffect,
  speakingClocksFromHtml,
  type ClockSpec,
  type SpeakingClockPair,
} from '../control/matchClockWire';
import { createAppliedOnce } from '../control/commandRoads';
import { alreadyInSnapshot, planOutputRecovery } from '../control/outputRecovery';
import { createOutputStage } from './stage';

/** How long the recovered picture is given to settle off air before the stage comes back.
 *  Covers a typical entrance plus an exit; the cost of overshooting is a moment more of the
 *  blank a just-loaded page was showing anyway, the cost of undershooting is an animation
 *  finishing on air. */
const CATCH_UP_SETTLE_MS = 1200;
/** Runaway guard on the boot catch-up walk (the same ceiling followControlLog's refill uses). */
const MAX_CATCH_UP_PAGES = 40;

const params = new URLSearchParams(window.location.search);
const outputSlug = params.get('production');
const debug = params.get('debug') === '1';

const debugEl = debug ? document.createElement('pre') : null;
const debugState: Record<string, string> = {};
if (debugEl) {
  debugEl.style.cssText =
    'position:fixed;left:8px;bottom:8px;margin:0;padding:8px 10px;z-index:10;' +
    'font:12px/1.5 monospace;color:#ffb84d;background:rgba(10,10,12,0.82);border-radius:6px;';
  document.body.appendChild(debugEl);
}
function dbg(key: string, value: string): void {
  if (!debugEl) return;
  debugState[key] = value;
  debugEl.textContent = Object.entries(debugState)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
}

/**
 * WHICH BROWSER ENGINE IS ACTUALLY RENDERING THIS. CasparCG's embedded CEF changed inside the
 * 2.3 line, so "I run 2.3.x" does not say whether a design using `color-mix()` will paint — and
 * the studio's compatibility report can only be as good as the number the operator brings to it.
 * There is exactly one machine that knows, and it is this one, so it says so on the debug
 * overlay. It costs nothing and settles a question that otherwise needs a changelog archaeology
 * session per install.
 */
if (debugEl) {
  const chrome = / (?:Chrome|Chromium)\/(\d+)/.exec(navigator.userAgent);
  dbg('engine', chrome ? `Chromium ${chrome[1]}` : navigator.userAgent.slice(0, 60));
}

/** The wrong-URL / offline card. Never part of a live production's air. */
function unavailable(reason: string): void {
  const card = document.createElement('div');
  card.style.cssText =
    // Longhands, not `inset` (Chromium 87): this card exists to explain a failure, and an old
    // CasparCG CEF is exactly where one happens — a card that unpositions itself there would
    // print its explanation into the corner of a live layer.
    'position:fixed;top:0;right:0;bottom:0;left:0;display:grid;place-items:center;background:#0a0a0c;color:#8a8a92;' +
    'font:15px/1.6 system-ui,sans-serif;text-align:center;';
  card.innerHTML = `<div><div style="font-size:18px;color:#c9c9cf;margin-bottom:6px">Output not available</div>${reason}</div>`;
  document.body.appendChild(card);
}

async function boot(): Promise<void> {
  if (!outputSlug) {
    unavailable('This URL is missing its <code>?production=</code> token.');
    return;
  }
  if (!isBackendConfigured()) {
    unavailable('This build runs offline — browser output needs the cloud backend.');
    return;
  }
  // THE RESOLVE IS THE ONE REQUEST THE WHOLE AIRING HANGS ON: show id, log baseline and every
  // graphic's last report arrive together, and nothing downstream can start without them. It
  // used to be asked once, with a failure indistinguishable from "no such production" - so one
  // dropped request painted the wrong-URL card over a live production and left it there. Only an
  // ANSWER decides now; a failure is retried for good, because a browser source has nothing to
  // degrade to and no one to tell.
  const answer = await untilAnswered(() => controlOutputBySlug(outputSlug), {
    onRetry: (attempts, error) => dbg('production', `resolving… (${attempts} failed: ${error})`),
  });
  const resolved = answer.ok ? answer.value : null;
  if (!resolved) {
    unavailable('This link is invalid or the production was unpublished.');
    return;
  }
  dbg('production', resolved.title);
  if (!resolved.output || resolved.output.graphics.length === 0) {
    // Published before the payload existed (an older build) or an empty rundown: stay
    // transparent and honest — the operator page will say "re-publish".
    dbg('payload', 'none — re-publish the production');
    return;
  }

  const stage = createOutputStage(document.body, resolved.output);
  dbg('graphics', stage.graphics.join(', '));

  /**
   * HOW MANY ENTRANCES THIS RENDERER HAS PLAYED, published on the body as `data-plays`.
   *
   * The same attribute `PayloadStage` publishes for the app's monitors, for the same reason and
   * on the surface that matters most: a DUPLICATE command is the one renderer fault that leaves
   * no trace. Replaying `play` on a graphic already up re-runs an animation and settles on
   * exactly the picture that was already there, so air after the bug is pixel-identical to air
   * without it. With a verb now travelling two roads (broadcast and durable log), "did that press
   * arrive once?" is a question only a count can answer, and this is the renderer's own answer to
   * it (e2e/configured/playout-both-roads.spec.ts).
   *
   * It renders nothing - an attribute is not a picture - so the rule that nothing but graphics
   * ever reaches air is untouched, and it costs one integer whether anybody is reading it or not.
   */
  let plays = 0;
  document.body.setAttribute('data-plays', '0');
  const countPlay = () => document.body.setAttribute('data-plays', String((plays += 1)));

  // ── Recovery baselines (0033): each live entry records the log row the renderer had applied
  // when it wrote that report, so the boot follows from the OLDEST baseline and skips, per
  // graphic, what its own snapshot already contains. Nothing reported at all means the START of
  // the log, never its head — the head would count commands nobody has ever rendered as already
  // on air. The whole rule, and why, is `control/outputRecovery.ts`; it lives out there so an
  // offline spec can drive it. ──
  const { followFrom, snapshotAt } = planOutputRecovery(stage.graphics, resolved.live);
  let lastAppliedId = followFrom;

  // ── Applied-truth bookkeeping (the panel event-log pattern, parent-side): the sandbox has
  // no DOM to harvest across, so the renderer reports what it FORWARDED — update data merged
  // per graphic, event payloads merged optimistically (the same rule the standalone panel's
  // log applies), machine state from the documents' own replies. Reports fire ONLY for
  // forwarded renderer commands and observed state changes — never for the log's status rows,
  // because control_output_report itself inserts a {t:'live'} status row, and reporting on it
  // would make the renderer feed its own subscription forever. ──
  const mergedData = new Map<string, Record<string, string>>();
  const lastReported = new Map<string, string>();
  const reportTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const scheduleReport = (graphic: string) => {
    clearTimeout(reportTimers.get(graphic));
    reportTimers.set(
      graphic,
      setTimeout(() => {
        const data = mergedData.get(graphic) ?? {};
        const state = stage.states.get(graphic) ?? null;
        // Byte-identical truth needs no second write (the 1 s state poll answers every second).
        const key = JSON.stringify([data, state]);
        if (key === lastReported.get(graphic)) return;
        lastReported.set(graphic, key);
        void controlOutputReport(outputSlug, graphic, data, state, lastAppliedId);
      }, 800),
    );
  };
  stage.onState((graphic) => scheduleReport(graphic));

  // ── Which graphics are LIVE (played/snapped and not yet stopped): only those can change
  // state on a timer, so only those need the 1 s machine-state poll — an idle stacked
  // graphic's machine cannot move without a command, and the renderer's main thread is the
  // one that must not miss frames. ──
  const liveGraphics = new Set<string>();
  setInterval(() => liveGraphics.forEach((g) => stage.requestState(g)), 1000);

  // ── THE MATCH CLOCK'S TIME ORIGIN (control/matchClockWire.ts). A clock is the one value that
  // keeps moving with nobody commanding it, so a snapshot of the commands cannot rebuild it: a
  // browser source reloaded at 67 minutes used to come back at 0:00. The clock's own field value
  // therefore carries the instant it was true (`"45:00@1755600000000"`), and this is where that
  // stamp is attached — DERIVED from the clockStart row's own server time, so every renderer
  // computes the same one and a boot-time replay of the log reconstructs it exactly. Stopping
  // banks the derived time back as a plain value; resetting banks the period's own start. All
  // three land in `mergedData`, which is what the report persists and what boot recovery
  // replays — which is the whole recovery. ──
  const clockSpecs = new Map<string, ClockSpec>();
  // …and the SPEAKING CLOCKS: a debate board runs two, alternating, and the same snapshot
  // problem bites twice as hard there — a renderer rebuilding mid-speech had no row left to
  // replay and came back at the allowance. Which of the two is running is not asked of the
  // machine; the stamp itself carries it (control/matchClockWire.ts).
  const speakingClocks = new Map<string, SpeakingClockPair>();
  for (const spec of resolved.output.graphics) {
    const clock = clockSpecFromHtml(spec.html);
    if (clock) clockSpecs.set(spec.key, clock);
    const speaking = speakingClocksFromHtml(spec.html);
    if (speaking) speakingClocks.set(spec.key, speaking);
  }
  // WHICH row moves the clock, to what, and in which order is `clockRowEffect` — pure, in
  // control/matchClockWire.ts, so an offline spec can drive it. This page only ever runs against
  // a live backend, and a decision left in this closure could be verified nowhere.
  const applyClock = (graphic: string, values: Record<string, string>) => {
    mergedData.set(graphic, { ...mergedData.get(graphic), ...values });
    stage.apply(graphic, { t: 'update', data: values });
  };

  /**
   * ONE COMMAND, from whichever road brought it (src/control/commandRoads.ts).
   *
   * Air used to be the WORST-placed seat in the house: the renderer never sends anything, so no
   * amount of applying optimistically on an operator's dashboard could reach it, and every
   * published verb arrived here 330-500 ms after the finger that pressed it. It now also listens
   * on the broadcast road, which is about 100 ms and has no slow mode - and `applied` is what
   * keeps the durable row that follows from playing the same entrance a second time.
   *
   * `createdAt` is the row's own server time and is absent on the fast road. Only an `event`
   * needs it (it is where a clock's shared origin comes from), and an event is sent slow for
   * exactly that reason, so the fallback below is reached by locally-authored rows only.
   */
  const applied = createAppliedOnce();
  const applyCommand = (graphic: string, incoming: ControlEventRow['msg'], createdAt: string | undefined) => {
    if (!applied.claim(incoming)) return;
    const row = { graphic, msg: incoming, created_at: createdAt };
    // `let`, because an update row's CLOCK fields are forwarded as this renderer HOLDS them
    // rather than as the row carried them — see the rewrite in the update branch below.
    let msg = row.msg;
    if (msg.t === 'update') {
      const merged = { ...mergedData.get(row.graphic), ...msg.data };
      // …except the CLOCK fields, which are not ordinary values: a resend of the cue's plain
      // time must not erase the origin this renderer stamped onto it (clockValueAfterUpdate).
      const held = clockSpecs.get(row.graphic);
      const prior = mergedData.get(row.graphic);
      const data = msg.data;
      const clockFields: string[] = [];
      const keepOrigin = (field: string) => {
        clockFields.push(field);
        if (data[field] === undefined) return;
        merged[field] = clockValueAfterUpdate(prior?.[field], data[field]);
      };
      if (held) keepOrigin(held.field);
      // Both speaking clocks, for the same reason and by the same rule: the cue stores the plain
      // allowance forever, so every Take mid-debate re-sends "05:00" over a running speech.
      const pair = speakingClocks.get(row.graphic);
      if (pair) { keepOrigin(pair.fieldA); keepOrigin(pair.fieldB); }
      mergedData.set(row.graphic, merged);
      // AND THE STAGE IS SENT WHAT WE NOW HOLD, not what the row carried. The template runs its
      // own guard against a resend, but it can only compare the value it last RECEIVED — and
      // once a clock has moved away from what the cue stores (a debate's second speech, a match
      // clock restarted after the interval) the cue's plain time is no longer equal to it, so
      // the resend reads as a correction and pulls a running clock back to the cue's value.
      // Forwarding the merged value settles it here instead: a stamped value is time-relative,
      // so re-sending it is always safe, and a genuine correction has already replaced it above.
      if (clockFields.some((f) => data[f] !== undefined)) {
        const forwarded = { ...data };
        for (const field of clockFields) {
          if (data[field] !== undefined) forwarded[field] = merged[field];
        }
        msg = { ...msg, data: forwarded };
      }
    } else if (msg.t === 'event' && msg.payload) {
      mergedData.set(row.graphic, { ...mergedData.get(row.graphic), ...msg.payload });
    } else if (msg.t === 'play' || msg.t === 'snap') {
      liveGraphics.add(row.graphic);
    } else if (msg.t === 'stop') {
      liveGraphics.delete(row.graphic);
    }
    const clock = clockSpecs.get(row.graphic);
    const speaking = speakingClocks.get(row.graphic);
    // A graphic carries one kind of clock or the other, never both: the match clock is read from
    // `.<prefix>-clock` and the speaking pair from `data-speaking`, and no design draws both.
    const effect = clock
      ? clockRowEffect(row, clock, mergedData.get(row.graphic)?.[clock.field], Date.now())
      : null;
    const pairEffect = speaking
      ? speakingClockRowEffect(row, speaking, mergedData.get(row.graphic), Date.now())
      : null;
    if (clock && effect?.when === 'before') applyClock(row.graphic, { [clock.field]: effect.value });
    if (pairEffect?.when === 'before') applyClock(row.graphic, pairEffect.values);
    // An EVENT carries WHEN it happened, from the row's own server time — the same instant every
    // renderer of this production reads, and the same one a replayed row carried when it was
    // first written. A graphic that runs a clock of its own (the debate board's two speaking
    // clocks) anchors to it instead of to this renderer's Date.now(), which is what stops two
    // browser sources drifting apart and what makes a catch-up replay resume a speech from where
    // it actually started. `rowInstant` is the match clock's own derivation, reused rather than
    // re-guessed: a server row's `created_at` wins, and a locally-authored row falls back to now,
    // which is correct there because that log has exactly one renderer.
    stage.apply(row.graphic, msg.t === 'event' ? { ...msg, at: rowInstant(row.created_at, Date.now()) } : msg);
    if (msg.t === 'play') countPlay();
    if (clock && effect?.when === 'after') applyClock(row.graphic, { [clock.field]: effect.value });
    if (pairEffect?.when === 'after') applyClock(row.graphic, pairEffect.values);
  };

  const apply = (row: ControlEventRow) => {
    lastAppliedId = Math.max(lastAppliedId, row.id);
    // Already inside the state this graphic was rebuilt from — replaying it would re-air it.
    // The FAST road cannot reach this guard and does not need to: it is only joined once the
    // boot catch-up has finished, so nothing it delivers can predate the snapshot.
    if (alreadyInSnapshot(snapshotAt, row.graphic, row.id)) return;
    applyCommand(row.graphic, row.msg, row.created_at);
    // Status rows ('cue'/'staged'/'live') are for the operator pages; the stage ignored them
    // and so does the report path.
    const t = row.msg.t;
    const forwarded = t === 'update' || t === 'play' || t === 'stop' || t === 'next' || t === 'event' || t === 'snap';
    // REPORTED FROM THE DURABLE ROW, even when the broadcast already put the command on screen.
    // A report banks `lastAppliedId` as the baseline a reboot recovers from, so scheduling it off
    // the fast road would record a baseline that does not include the command just applied - and
    // the next boot would replay rows this renderer had already run. The row is here within
    // 650 ms and the report debounces for 800, so nothing is actually later for it.
    //
    // It is not the only way a report is scheduled, and the other way is not closed: the graphic's
    // own state reply after a broadcast-applied entrance goes through `stage.onState` above. When
    // a durable row straggles past the debounce, that report banks a snapshot containing the
    // entrance against a baseline id below the row that carried it, and the next boot replays that
    // row again. It costs a re-fired entrance inside the catch-up, which is hidden while it
    // settles, so it is a cost rather than a fault - but it is a real one and not the ordering the
    // paragraph above describes.
    if (forwarded) scheduleReport(row.graphic);
    dbg('last row', String(row.id));
  };

  // ── Catch-up: everything commanded while this renderer was gone. Fetched BEFORE the rebuild
  // so the whole recovery happens in one hidden pass, because replayed commands are ordinary
  // commands and animate: a reopened output must show the settled picture, not the outage's
  // history playing out on air (the doctrine is data, then SNAP — recovery is never watchable).
  // Only lifecycle commands are worth hiding for; a missed `update` is a text swap with nothing
  // to watch, and nothing missed at all hides nothing, so an ordinary reopen still paints at
  // once. Paged, because the tail RPC answers CONTROL_TAIL_PAGE rows at a time. ──
  //
  // A page that FAILED is not an empty one: reading a dropped request as "nothing was missed" is
  // how the local half used to bring a live board back blank, so each page is retried. Unlike
  // the local half this one has somewhere to stand if the retries run out - the report baseline
  // is already rebuilt below - so it stops after a few and says so on the debug overlay; the
  // follow's own refill re-reads the same gap on subscribe, on air rather than hidden.
  const missed: ControlEventRow[] = [];
  for (let page = 0; page < MAX_CATCH_UP_PAGES; page += 1) {
    const tail = await untilAnswered(
      () => controlOutputTail(outputSlug, missed.length > 0 ? missed[missed.length - 1].id : followFrom),
      { limit: 6, onRetry: (attempts, error) => dbg('catch-up', `log read failed (${attempts}): ${error}`) },
    );
    if (!tail.ok) {
      dbg('catch-up', 'log unread — the follow will fill it');
      break;
    }
    missed.push(...tail.value);
    if (tail.value.length < CONTROL_TAIL_PAGE) break;
  }
  const animates = missed.some(
    (row) =>
      !alreadyInSnapshot(snapshotAt, row.graphic, row.id) &&
      (row.msg.t === 'play' || row.msg.t === 'stop' || row.msg.t === 'next' || row.msg.t === 'event'),
  );
  if (animates) {
    stage.setVisible(false);
    dbg('catch-up', `${missed.length} row(s), off air while they settle`);
  }

  // ── Boot recovery, per graphic: the data half, then the visual half (snap arms timers). ──
  for (const key of stage.graphics) {
    const mine = resolved.live[key];
    if (!mine) continue;
    if (mine.data) {
      mergedData.set(key, { ...mine.data });
      stage.apply(key, { t: 'update', data: mine.data });
    }
    if (mine.state?.groups) {
      stage.apply(key, { t: 'snap', snap: mine.state.groups });
      liveGraphics.add(key);
      // …and the data half AGAIN. Snap resets the graphic before composing the pose, which
      // clears every inline style — including ones the DATA layer owns, like the display:none
      // that hides an image field with no picture (that one recovers as an empty broken-image
      // box otherwise). Restating the data costs one message and repairs graphics whose code
      // was published before the runtime learned to preserve it.
      if (mine.data) stage.apply(key, { t: 'update', data: mine.data });
    }
  }

  // Replay what was missed, then come back on air once the animations it fired have landed.
  // A fixed settle beats waiting for "no state change in N ms": a recovered graphic can hold a
  // state that keeps moving (a ticker, a clock), so a quiet-period test would never fire.
  missed.forEach(apply);
  if (animates) {
    setTimeout(() => {
      stage.setVisible(true);
      dbg('catch-up', `${missed.length} row(s) replayed, back on air`);
    }, CATCH_UP_SETTLE_MS);
  }

  // ── Follow the log live (shared discipline: dedupe, hole → tail, refill on resubscribe, and
  // the CONTROL_POLL_MS floor under all three — every recovery above is driven by an event the
  // socket produces, and a channel that never joins produces none of them). ──
  //
  // A renderer that is only ever POLLING is a production running on a 30 s floor instead of a
  // sub-second stream, and it looks identical to a quiet show from every seat. So it is said in
  // both places this page can say anything: the debug overlay while it lasts, and the browser
  // console once — which is what reaches a CasparCG or OBS log when nobody thought to add
  // `&debug=1` first.
  const followStartedAt = Date.now();
  let warnedNotJoined = false;
  dbg('realtime', 'subscribing…');
  await followControlLog({
    showId: resolved.id,
    // Everything up to here is applied — including the catch-up rows replayed above, which is
    // why this is the applied cursor and not the baseline the catch-up started from.
    from: lastAppliedId,
    // The retry lives HERE rather than inside followControlLog: the shared follow takes a plain
    // list, and a failed read that came back empty would end its refill walk early. Five tries,
    // then the next hole in the live stream starts the walk again.
    tail: async (after) => {
      const tail = await untilAnswered(() => controlOutputTail(outputSlug, after), { limit: 5 });
      return tail.ok ? tail.value : [];
    },
    onRow: apply,
    // THE FAST ROAD, on the surface it matters most for: the audience's picture. Every command
    // here also arrives as a durable row a few hundred milliseconds later, and `applyCommand`
    // drops whichever copy is second.
    onCommand: (items) => items.forEach((item) => applyCommand(item.graphic, item.msg, undefined)),
    onStatus: ({ status, everJoined }) => {
      const poll = `${Math.round(CONTROL_POLL_MS / 1000)} s`;
      dbg('realtime', everJoined ? `following (${status})` : `NOT JOINED (${status || 'no status'}) — polling every ${poll}`);
      // Only after a full interval with no join: the first status a healthy channel reports can
      // be CHANNEL_ERROR, and supabase-js rejoins from it within seconds. Warning on that would
      // teach an operator to ignore this line.
      if (everJoined || warnedNotJoined || Date.now() - followStartedAt < CONTROL_POLL_MS) return;
      warnedNotJoined = true;
      console.warn(
        `NoaCG output: the Realtime channel has never joined (${status || 'no status'}). ` +
          `Following the control log by polling every ${poll} — commands can be that late on air.`,
      );
    },
  });

  // ── Heartbeat: operator surfaces read output_seen_at staleness as "renderer connected". ──
  void controlOutputSeen(outputSlug);
  setInterval(() => void controlOutputSeen(outputSlug), 60_000);
}

void boot();
