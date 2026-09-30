// The browser-output renderer's entry (docs/CLOUD_PLAYOUT.md §3). Boot: resolve the
// production by its OUTPUT capability, build the stage (every graphic preloaded), rebuild each
// graphic from its last report (the data half, then the visual half — recovery is both), then
// follow the command log live through the shared recovery discipline (followControlLog).
//
// Nothing but graphics ever renders on air: no connection text, no UI. A disconnected renderer
// keeps its last applied state and recovers silently; `&debug=1` overlays a status readout for
// setup and rehearsal. "Not available" (a wrong URL, an offline build, an unpublished
// production) paints nothing either; its words show only under `&debug=1`.

import { isBackendConfigured } from '../backend/config';
import {
  CONTROL_POLL_MS,
  CONTROL_TAIL_PAGE,
  controlOutputReport,
  controlOutputReportSeq,
  controlOutputResolve,
  controlOutputSeen,
  controlOutputTail,
  controlOutputTailSeq,
  followControlLog,
  followLiveSeq,
  untilAnswered,
  type ControlEventRow,
  type ControlFollowStatus,
  type RpcAnswer,
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
import {
  LIVE_BUILD,
  LIVE_PROTOCOL,
  createLiveStats,
  describeLiveSummary,
  hostEngine,
  joinLivePresence,
  liveEntry,
  liveInstanceId,
  type LiveEntry,
  type LivePresenceStatus,
  type LiveRoad,
} from '../control/livePath';
import { alreadyInSnapshot, planOutputRecovery, seqBaselines } from '../control/outputRecovery';
import { supersededAnimations } from '../control/seqFollow';
import { airWhenSettled } from './catchUp';
import { createOutputStage, heldLine } from './stage';

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
// The host's own marker (CasparCG's `window.caspar`) can arrive after this script runs, so the
// line is written again once the production resolves (livePath.ts `hostEngine`).
dbg('engine', hostEngine());

/** Why the renderer has nothing to show. Published as `body[data-unavailable]`. */
type Unavailable = 'no-token' | 'offline' | 'unpublished';

const UNAVAILABLE_TEXT: Record<Unavailable, string> = {
  'no-token': 'This URL is missing its <code>?production=</code> token.',
  offline: 'This build runs offline. Browser output needs the cloud backend.',
  unpublished: 'This link is invalid or the production was unpublished.',
};

/**
 * "Output not available": a wrong URL, an offline build, or a production that is not published.
 *
 * IT PAINTS NOTHING ON AIR. It used to be an opaque full-frame card, on the theory that a live
 * production can never be in these states - but a CasparCG layer or OBS source that reloads onto
 * a production somebody unpublished is exactly that, and it put a dark frame on air. So the page
 * stays transparent: the reason goes to `body[data-unavailable]` and the console, and its words
 * appear only with `&debug=1`, where setup and rehearsal already expect a readout.
 */
function unavailable(why: Unavailable): void {
  document.body.setAttribute('data-unavailable', why);
  console.warn(`NoaCG output: not available (${why}). Add &debug=1 to the URL to see why on the page.`);
  if (!debug) return;
  const card = document.createElement('div');
  card.setAttribute('data-testid', 'output-unavailable');
  card.style.cssText =
    // Longhands, not `inset` (Chromium 87): this card exists to explain a failure, and an old
    // CasparCG CEF is exactly where one happens. The frame stays transparent; only the words
    // sit on a panel, the debug readout's.
    'position:fixed;top:0;right:0;bottom:0;left:0;display:grid;place-items:center;background:transparent;' +
    'font:15px/1.6 system-ui,sans-serif;text-align:center;';
  card.innerHTML =
    '<div style="padding:14px 18px;border-radius:6px;background:rgba(10,10,12,0.82);color:#8a8a92">' +
    `<div style="font-size:18px;color:#c9c9cf;margin-bottom:6px">Output not available</div>${UNAVAILABLE_TEXT[why]}</div>`;
  document.body.appendChild(card);
}

/** Library-load failures in a row before the boot reloads (about 1.5 s after the first). */
const RELOAD_AFTER_THROWS = 3;

/** Reload, if this page's own URL answers right now. Otherwise stay put and keep retrying. */
async function reloadIfServed(): Promise<void> {
  try {
    const page = await fetch(window.location.href, { cache: 'no-store' });
    if (page.ok) window.location.reload();
  } catch {
    // Unreachable: a reload would paint the browser's error page. The retry goes on.
  }
}

async function boot(): Promise<void> {
  if (!outputSlug) {
    unavailable('no-token');
    return;
  }
  if (!isBackendConfigured()) {
    unavailable('offline');
    return;
  }
  // THE RESOLVE IS THE ONE REQUEST THE WHOLE AIRING HANGS ON: show id, log baseline and every
  // graphic's last report arrive together, and nothing downstream can start without them. It
  // used to be asked once, with a failure indistinguishable from "no such production" - so one
  // dropped request painted the wrong-URL card over a live production and left it there. Only an
  // ANSWER decides now; a failure is retried for good, because a browser source has nothing to
  // degrade to and no one to tell.
  //
  // Protocol 2 first (migration 0070), today's resolve when the server has no sequence road.
  //
  // A THROW here is the client library's chunk failing to load (supabase-js is fetched on
  // demand; a failed RPC answers, it does not throw). It is retried like any other failure, but
  // two things mean a retry in this document cannot fetch it: Chromium, which every playout
  // host embeds, keeps a failed module fetch for the life of the document (measured
  // 2026-09-30), and an old deployment's hashed chunk answers 404 for good once a deploy lands
  // between this page's HTML and its import. Both need the page again, so after a few throws in
  // a row it reloads, but only once its own URL answers: reloading during an outage would swap
  // a transparent page for the browser's error page, on air.
  let thrown = 0;
  const answer = await untilAnswered(
    async () => {
      try {
        const result = await controlOutputResolve(outputSlug);
        thrown = 0;
        return result;
      } catch (err) {
        thrown += 1;
        // Not awaited: a probe that hangs on a half-dead network must not stall the retries.
        if (thrown >= RELOAD_AFTER_THROWS) void reloadIfServed();
        throw err;
      }
    },
    { onRetry: (attempts, error) => dbg('production', `resolving… (${attempts} failed: ${error})`) },
  );
  const resolved = answer.ok ? answer.value : null;
  if (!resolved) {
    unavailable('unpublished');
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
  // A graphic a font kept waiting past the cap airs on a fallback face (stage.ts `held`).
  stage.onHeld(() => dbg('fonts', heldLine(stage.held) ?? ''));

  // ── THE LIVE PATH, SEEN (control/livePath.ts): who this renderer is, how commands reach it, and
  // the Presence entry the operator pages build their health line from. Report-only: nothing
  // here changes what airs, and a server without the live topic (migration 0068) refuses only
  // the Presence join. ──
  const identity = { id: liveInstanceId(), build: LIVE_BUILD, protocol: LIVE_PROTOCOL };
  dbg('engine', hostEngine());
  dbg('identity', `${identity.id} · build ${identity.build} · protocol ${identity.protocol}`);
  let logJoined: boolean | null = null;
  let cmdJoined: boolean | null = null;
  let presenceStatus: LivePresenceStatus = 'joining';
  const live = createLiveStats({
    onChange: () => {
      // Built only where it is shown: the summary sorts its samples, and a playout box's main
      // thread is the one that must not miss frames.
      if (debug) dbg('live', describeLiveSummary(live.summary()));
      presence.touch();
    },
  });
  const entry = (): LiveEntry => liveEntry('output', 'output', { log: logJoined, cmd: cmdJoined }, live.summary());
  const presence = joinLivePresence({
    showId: resolved.id,
    entry,
    onStatus: (status) => {
      presenceStatus = status;
      dbg(
        'presence',
        status === 'joined'
          ? 'announced on the live topic'
          : status === 'down'
            ? 'NOT JOINED - operator pages fall back to the heartbeat'
            : status,
      );
    },
  });
  // For specs and for whoever opens the console on a playout box.
  (window as unknown as { __noacgLive?: unknown }).__noacgLive = {
    identity,
    engine: hostEngine,
    entry,
    summary: () => live.summary(),
    presence: () => presenceStatus,
  };
  /** Rows a tail read returned, each with its read: the follow hands them to `onRow` like any other,
   *  and this is how that callback tells them from rows the log topic delivered. A read counts as a
   *  refill once, and only if a row of it was new here: the poll and every rejoin re-read a window
   *  behind the cursor (logFollow.ts), which mostly returns rows already applied. */
  const fromTail = new WeakMap<ControlEventRow, { counted: boolean }>();

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
  //
  // PROTOCOL 2 (migration 0070) reads the same rule in the per-production SEQUENCE, unless this
  // production still holds rows written before the migration that this renderer would need
  // (`legacy`): those carry no number, so it follows by id for this whole session, exactly as
  // before, and its reports move the baselines past them. `lastAppliedId` stays the highest id
  // applied either way: it is the baseline an older renderer or page reads from a report.
  const seqMode = resolved.seq && !resolved.seq.legacy ? resolved.seq : null;
  let followEpoch = seqMode?.epoch ?? null;
  dbg('protocol', seqMode ? 'numbered log (proto 2)' : resolved.seq ? 'row id (proto 1: older rows need it)' : 'row id (proto 1)');
  const byId = planOutputRecovery(stage.graphics, resolved.live);
  const { followFrom, snapshotAt } = seqMode ? planOutputRecovery(stage.graphics, seqBaselines(resolved.live)) : byId;
  let lastAppliedId = byId.followFrom;
  let lastAppliedSeq = seqMode ? followFrom : 0;
  /** Where a row sits in the log this renderer follows. */
  const position = (row: ControlEventRow) => (seqMode ? (row.seq ?? 0) : row.id);

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
        void (seqMode
          ? controlOutputReportSeq(outputSlug, graphic, data, state, { seq: lastAppliedSeq, epoch: followEpoch, event: lastAppliedId })
          : controlOutputReport(outputSlug, graphic, data, state, lastAppliedId));
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
   * needs it (it is where a clock's shared origin comes from), and a CLOCK's events are sent
   * slow for exactly that reason (hostedControl.ts, SLOW_AFTER_EVENT_MS). A clock-free graphic's
   * event may arrive here fast and falls back to now, which it never reads.
   */
  const applied = createAppliedOnce();
  // `road` is set for what the LIVE follow delivers and absent for the boot catch-up, whose rows
  // are history rather than latency (livePath.ts counts and times the former only).
  // `animate` false is an entrance a later `play` or `stop` of the same graphic in the same refill
  // replaces (seqFollow.ts `supersededAnimations`): everything about the row applies except the
  // stage animation nobody would see finish.
  const applyCommand = (
    graphic: string,
    incoming: ControlEventRow['msg'],
    createdAt: string | undefined,
    road?: LiveRoad,
    animate = true,
  ) => {
    const receivedAt = Date.now();
    if (road) live.received(road, incoming);
    if (!applied.claim(incoming)) {
      if (road) live.duplicate(incoming);
      return;
    }
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
    if (animate) {
      stage.apply(row.graphic, msg.t === 'event' ? { ...msg, at: rowInstant(row.created_at, Date.now()) } : msg);
      if (msg.t === 'play') countPlay();
    }
    if (road) live.applied(road, incoming, receivedAt);
    if (clock && effect?.when === 'after') applyClock(row.graphic, { [clock.field]: effect.value });
    if (pairEffect?.when === 'after') applyClock(row.graphic, pairEffect.values);
  };

  const apply = (row: ControlEventRow, road?: LiveRoad, animate = true) => {
    // The id baseline is the highest id applied on either road: that is what an older reader of
    // the report (an old renderer, a page's id-road boot replay) takes as "already in the snapshot".
    lastAppliedId = Math.max(lastAppliedId, row.id);
    if (seqMode) lastAppliedSeq = Math.max(lastAppliedSeq, row.seq ?? 0);
    // Already inside the state this graphic was rebuilt from — replaying it would re-air it.
    // The FAST road cannot reach this guard and does not need to: it is only joined once the
    // boot catch-up has finished, so nothing it delivers can predate the snapshot.
    if (alreadyInSnapshot(snapshotAt, row.graphic, position(row))) return;
    applyCommand(row.graphic, row.msg, row.created_at, road, animate);
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
    dbg('last row', seqMode ? `${row.seq ?? '?'} (id ${row.id})` : String(row.id));
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
  // On protocol 2 the pages are numbered; a production republished since the resolve answers
  // `reset`, which ends the catch-up here and leaves the new log to the follow.
  const readTail = async (after: number): Promise<RpcAnswer<ControlEventRow[]>> => {
    if (!seqMode) return controlOutputTail(outputSlug, after);
    const answer = await controlOutputTailSeq(outputSlug, after, followEpoch);
    if (!answer.ok) return answer;
    if (answer.value.reset) return { ok: true, value: [] };
    // A production with no head at the resolve gets its first epoch here, with these rows.
    followEpoch ??= answer.value.epoch;
    return { ok: true, value: answer.value.rows };
  };
  const missed: ControlEventRow[] = [];
  for (let page = 0; page < MAX_CATCH_UP_PAGES; page += 1) {
    const tail = await untilAnswered(
      () => readTail(missed.length > 0 ? position(missed[missed.length - 1]) : followFrom),
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
      !alreadyInSnapshot(snapshotAt, row.graphic, position(row)) &&
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

  // ── Replay what was missed, then come back on air once the replay has stood still. ──
  //
  // The return used to be a flat 1200 ms from the moment these rows were handed to the stage -
  // before the documents have even loaded, since commands queue until then - and off air used to
  // mean an opacity on the stage, which throttles the documents to about 1 Hz. A cold boot
  // replays the whole log (nothing reported yet means the log's START, outputRecovery.ts), so a
  // production that had been rehearsed came back mid-replay and played every entrance and exit
  // it was catching up on ON AIR: the whole output flashed a second after a CasparCG browser
  // source loaded it. Both halves are fixed - the documents go off air from the inside and keep
  // their frame rate (stage.ts), and WHEN to return is asked rather than guessed (catchUp.ts).
  missed.forEach((row) => apply(row));
  if (animates) {
    void airWhenSettled(stage)
      .then((ending) =>
        dbg(
          'catch-up',
          `${missed.length} row(s) replayed, back on air${ending === 'cap' ? ' (still moving at the cap)' : ''}`,
        ),
      )
      // A renderer that is off air with nothing left to put it back is a dark channel for the
      // rest of the show, so whatever went wrong, air comes back and says so where the one
      // surface an operator has on a playout box can show it.
      .catch((error: unknown) => {
        stage.setVisible(true);
        dbg('catch-up', `failed (${String(error)}) — back on air anyway`);
        console.warn('NoaCG output: the boot catch-up failed; the stage is back on air.', error);
      });
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
  const onStatus = ({ status, everJoined }: ControlFollowStatus) => {
    // What the Presence entry says about the log road: joined NOW, not ever.
    logJoined = status === 'SUBSCRIBED';
    presence.touch();
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
  };
  if (seqMode) {
    // THE NUMBERED LOG (hostedControl.ts followLiveSeq, seqFollow.ts): in seq order, a gap is a
    // row in flight and never another production, and a refill applies every row it brings but
    // elides an entrance a later play or stop of the same graphic replaces. No fast road: the
    // numbered frame is written by the same transaction as the command frame and arrives with it,
    // on the live topic, which is this renderer's log road here.
    dbg('commands', 'numbered log (the fast road is not needed)');
    followLiveSeq({
      showId: resolved.id,
      from: lastAppliedSeq,
      epoch: followEpoch,
      tail: async (after, epoch) => {
        const tail = await untilAnswered(() => controlOutputTailSeq(outputSlug, after, epoch), { limit: 5 });
        return tail.ok ? tail.value : null;
      },
      onRows: (rows, replayed) => {
        // A tail read hands over only rows that were new here, so each one that does is a refill.
        if (replayed) live.refilled();
        const quiet = replayed ? supersededAnimations(rows) : null;
        for (const row of rows) apply(row, replayed ? 'tail' : 'log', !quiet?.has(row.seq));
      },
      onHole: () => live.hole(),
      // REPUBLISHED under the same address (unpublish + publish keeps the id and the slugs): a new
      // log numbered from 1, so no baseline this renderer holds means anything in it, and every
      // graphic reports again. Without `reset` it is the first epoch of the log already followed.
      onEpoch: (epoch, reset) => {
        followEpoch = epoch;
        if (!reset) return;
        snapshotAt.clear();
        lastAppliedSeq = 0;
        lastReported.clear();
        dbg('protocol', 'numbered log (proto 2), republished: following the new log from its start');
      },
      onStatus,
    });
  } else {
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
        const rows = tail.ok ? tail.value : [];
        const read = { counted: false };
        rows.forEach((row) => fromTail.set(row, read));
        return rows;
      },
      onRow: (row) => {
        const read = fromTail.get(row);
        if (read && !read.counted) {
          read.counted = true;
          live.refilled();
        }
        apply(row, read ? 'tail' : 'log');
      },
      onHole: () => live.hole(),
      // THE FAST ROAD, on the surface it matters most for: the audience's picture. Every command
      // here also arrives as a durable row a few hundred milliseconds later, and `applyCommand`
      // drops whichever copy is second.
      onCommand: (items) => items.forEach((item) => applyCommand(item.graphic, item.msg, undefined, 'fast')),
      // THE FAST ROAD, on the debug overlay, because it is the only place its absence can be seen.
      // A command channel that never joins costs no correctness - every command still arrives as a
      // durable row - so nothing goes red and air simply goes back to being a few hundred
      // milliseconds late. This line is what turns that into something an operator can read out to
      // whoever asks why the graphics feel slow again.
      onCommandStatus: (status) => {
        cmdJoined = status === 'SUBSCRIBED';
        presence.touch();
        dbg('commands', status === 'SUBSCRIBED' ? 'fast road joined' : `NOT JOINED (${status}) — the log road only`);
      },
      onStatus,
    });
  }

  // ── Heartbeat: operator surfaces read output_seen_at staleness as "renderer connected". ──
  void controlOutputSeen(outputSlug);
  setInterval(() => void controlOutputSeen(outputSlug), 60_000);
}

void boot();
