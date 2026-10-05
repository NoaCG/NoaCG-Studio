import { readDestinationId } from '../model/outputSetup';
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
  followSeqLog,
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
  outputNameParam,
  type LiveEntry,
  type LivePresenceStatus,
  type LiveRoad,
} from '../control/livePath';
import { outputReadiness, outputStateWords, type ChangePrep, type GraphicCheck, type HeldVersion } from '../control/readiness';
import { alreadyInSnapshot, planOutputRecovery, seqBaselines } from '../control/outputRecovery';
import { supersededAnimations } from '../control/seqFollow';
import { airWhenSettled } from './catchUp';
import { pingDelay, type PingAck } from '../control/prepareLive';
import { createPreparer } from './prepare';
import { createOutputStage, heldLine } from './stage';
import { createSoundBudget } from '../assets/soundBudget';
import { publishedSoundLoader } from '../backend/productionAudio';

/** Runaway guard on the boot catch-up walk (the same ceiling followControlLog's refill uses). */
const MAX_CATCH_UP_PAGES = 40;

const params = new URLSearchParams(window.location.search);
const outputSlug = params.get('production');
const debug = params.get('debug') === '1';
/** What the operator calls this output on READY (`&name=CasparCG 1-20`), else its engine. */
const outputName = outputNameParam(window.location.search);

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

/** Reload, if this page's own URL answers right now; whether it is reloading. Otherwise it stays put. */
async function reloadIfServed(): Promise<boolean> {
  try {
    const page = await fetch(window.location.href, { cache: 'no-store' });
    if (page.ok) {
      window.location.reload();
      return true;
    }
  } catch {
    // Unreachable: a reload would paint the browser's error page. The caller carries on.
  }
  return false;
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
  // Protocol 2 first (migration 0071), today's resolve when the server has no sequence road.
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

  const soundBudget = createSoundBudget();
  const audio = (payload: typeof resolved.output) => ({ soundBudget, loadSound: publishedSoundLoader(outputSlug,payload.ver?.h ?? '') });
  const stage = createOutputStage(document.body, resolved.output, { sound: 'program', ...audio(resolved.output) });
  dbg('graphics', stage.graphics.join(', '));

  // ── READY (control/readiness.ts; docs/work-specs/playout-ready/spec.md R1, R6, R7): this output
  // decides for itself how many of its graphics are prepared and what fails, in the same code on
  // every host, and says so in its Presence entry. Each graphic is checked once its document has
  // loaded AND the boot recovery below has run: the warm pass (one off-air `update` with the
  // graphic's first cue values) is only for a graphic nothing has touched since boot - one on air,
  // or rebuilt from its report, already holds its own values and must keep them. Registered before
  // any await, so no document can load unobserved. ──
  const payload = resolved.output;
  const heldVersion: HeldVersion | null = payload.ver ? { n: payload.ver.n, h: payload.ver.h } : null;
  const checks = new Map<string, GraphicCheck>();
  /** Graphics a command or the recovery has reached since boot: never warmed. */
  const touched = new Set<string>();
  const firstCue = new Map<string, Record<string, string>>();
  for (const cue of payload.cues) if (!firstCue.has(cue.graphic)) firstCue.set(cue.graphic, cue.values);
  let catchingUp = false;
  /** A newer version being prepared beside this one (Prepare for Live, ./prepare.ts). */
  let chg: ChangePrep | undefined;
  /** The answer to the last command path ping this page received (migration 0072, R9). Always in
   *  the entry, empty until a ping arrives: an entry without it is an output that cannot answer. */
  let ack: PingAck = { id: '', ms: null };
  let markRecovered: () => void = () => {};
  const recovered = new Promise<void>((resolve) => {
    markRecovered = resolve;
  });
  const readiness = () => outputReadiness({ graphics: stage.graphics, checks, held: stage.held, version: heldVersion, catchingUp, chg });
  // `presence` is joined below; nothing here runs before it exists.
  const readyChanged = () => {
    dbg('ready', outputStateWords(readiness()));
    presence.touch();
  };
  stage.onSound(graphic => {
    const previous = checks.get(graphic);
    if (!previous) return;
    checks.set(graphic,{ ...previous, audio: stage.sounds.get(graphic) });
    readyChanged();
  });
  /** Graphics whose document has loaded (or been released on a fallback face). */
  const released = new Set<string>();
  stage.onLoaded((graphic) => {
    released.add(graphic);
    void recovered.then(async () => {
      const data = touched.has(graphic) ? null : (firstCue.get(graphic) ?? null);
      const answer = await stage.warm(graphic, data);
      checks.set(graphic, {
        done: true,
        error: stage.errors.get(graphic) ?? answer?.scriptError ?? (answer?.error === answer?.sounds?.error ? null : answer?.error) ?? null,
        audio: answer?.sounds,
        silent: answer === null,
        fontsFailed: answer?.fonts.failed ?? [],
        fontsLoading: answer?.fonts.loading ?? [],
        imagesBroken: answer?.images.broken ?? [],
      });
      readyChanged();
    });
  });
  /** A document that never loads and never says why (a script that never returns) must not read
   *  as preparing for ever: after this long it is not prepared, and if it loads later its check
   *  replaces that. §5.2 measured 1.4 to 3 s from open to ready. Only a document that has not
   *  loaded: one that has is waiting for the recovery or its warm answer, which has its own limit
   *  (stage.ts WARM_ANSWER_MS). */
  const NEVER_LOADED_MS = 20_000;
  setTimeout(() => {
    let changed = false;
    for (const graphic of stage.graphics) {
      if (checks.has(graphic) || released.has(graphic)) continue;
      checks.set(graphic, { done: true, error: stage.errors.get(graphic) ?? null, silent: true, fontsFailed: [], fontsLoading: [], imagesBroken: [] });
      changed = true;
    }
    if (changed) readyChanged();
  }, NEVER_LOADED_MS);
  // A graphic a font kept waiting past the cap airs on a fallback face (stage.ts `held`).
  stage.onHeld(() => {
    dbg('fonts', heldLine(stage.held) ?? '');
    readyChanged();
  });
  dbg('ready', outputStateWords(readiness()));

  // ── THE LIVE PATH, SEEN (control/livePath.ts): who this renderer is, how commands reach it, and
  // the Presence entry the operator pages build their health line from. Report-only: nothing
  // here changes what airs, and a server without the live topic (migration 0068) refuses only
  // the Presence join. The protocol is the one this renderer follows on, which the resolve decided
  // (seqMode, below): 2 on the numbered log, LIVE_PROTOCOL (1, by row id) otherwise. ──
  const seqMode = resolved.seq && !resolved.seq.legacy ? resolved.seq : null;
  const identity = { id: liveInstanceId(), build: LIVE_BUILD, protocol: seqMode ? 2 : LIVE_PROTOCOL };
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
  const entry = (): LiveEntry =>
    liveEntry('output', 'output', { log: logJoined, cmd: cmdJoined }, live.summary(), {
      name: outputName,
      destinationId: readDestinationId(window.location.search),
      ready: readiness(),
      ack,
      proto: identity.protocol,
    });
  const presence = joinLivePresence({
    showId: resolved.id,
    entry,
    // PREPARE FOR LIVE's request rides the production page's own entry (R4): acted on once, in its
    // turn, and only ever onto what the server holds (./prepare.ts).
    onPeers: (peers) => {
      for (const peer of peers) if (peer.kind === 'operator' && peer.surface === 'production' && peer.prep) preparer.request(peer.prep);
    },
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
    ready: readiness,
    // The same door the production page's request comes through, for specs.
    prepare: (prep: { id: string; n: number; h: string }) => preparer.request(prep),
    ack: () => ack,
  };
  // ── PREPARE A NEWER VERSION (./prepare.ts; R3): the changes are built beside the running
  // graphics and checked, and this page reloads onto the new version only when nothing is on air
  // here. Nothing starts before the boot recovery has run: until then this page does not know what
  // is on air. ──
  /** Per graphic, whether the log's own head says it is on air (protocol 2): filled by the boot's
   *  tail answer and every head the follower hands on. */
  const headOn = new Map<string, boolean>();
  /** A head has been heard in this epoch: until then headOn says nothing, not "nothing on air". */
  let headHeard = false;
  const noteHead = (graphics: Record<string, { on?: boolean }> | undefined) => {
    if (!graphics) return;
    headHeard = true;
    for (const graphic of Object.keys(graphics)) headOn.set(graphic, graphics[graphic].on === true);
  };
  const preparer = createPreparer({
    audio,
    held: payload.ver ?? null,
    resolve: async () => {
      await recovered;
      const answer = await untilAnswered(() => controlOutputResolve(outputSlug), { limit: 3 });
      return answer.ok && answer.value ? answer.value.output : null;
    },
    // On protocol 2 the log's own word for it, once a head has been heard (the boot's tail answer
    // carries one); otherwise the graphics played and not stopped here, which leans towards "on
    // air" (a report's machine state counts), and so towards staying.
    onAir: () => (seqMode && headHeard ? Array.from(headOn.values()).filter(Boolean).length : liveGraphics.size),
    recheck: async () => {
      for (const graphic of stage.graphics) {
        const held = checks.get(graphic);
        if (!held || !released.has(graphic)) continue;
        const answer = await stage.warm(graphic, null);
        if (answer) checks.set(graphic, { ...held, error: stage.errors.get(graphic) ?? answer.scriptError ?? (answer.error === answer.sounds?.error ? null : answer.error), audio: answer.sounds, fontsFailed: answer.fonts.failed, fontsLoading: answer.fonts.loading, imagesBroken: answer.images.broken });
      }
      readyChanged();
    },
    report: (next) => {
      chg = next;
      readyChanged();
    },
    reload: reloadIfServed,
  });
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
  // PROTOCOL 2 (migration 0071) reads the same rule in the per-production SEQUENCE, unless this
  // production still holds rows written before the migration that this renderer would need
  // (`legacy`): those carry no number, so it follows by id for this whole session, exactly as
  // before, and its reports move the baselines past them. `lastAppliedId` stays the highest id
  // applied either way: it is the baseline an older renderer or page reads from a report.
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
  /** Reports due even if nothing about the graphic changed (a re-bank, a republish; below). */
  const forcedReports = new Set<string>();
  /** Reports due because something about the graphic changed. */
  const changedReports = new Set<string>();
  /**
   * A FORCED REPORT IS NEVER URGENT, so it waits a random 1 to 21 s. Every renderer of a production
   * applies the same rows, so after a republish, or a boot on baselines a busy feed has left behind,
   * every renderer would report every graphic in the same second, and those rows used to count
   * toward the production's 50-commands-in-5-s cap and refuse the operator's Takes (review 3
   * client:F2). Spread, and dropped when another renderer banks the graphic first (`apply`), a
   * production's re-banks become a trickle. A change still reports in 800 ms, as it always did.
   */
  const FORCED_SPREAD_MS = 20_000;
  const scheduleReport = (graphic: string, force = false) => {
    if (force) {
      forcedReports.add(graphic);
      // A change already on its way carries the bank with it.
      if (changedReports.has(graphic)) return;
    } else {
      changedReports.add(graphic);
    }
    clearTimeout(reportTimers.get(graphic));
    reportTimers.set(
      graphic,
      setTimeout(
        () => {
          reportTimers.delete(graphic);
          changedReports.delete(graphic);
          const data = mergedData.get(graphic) ?? {};
          const state = stage.states.get(graphic) ?? null;
          // Byte-identical truth needs no second write (the 1 s state poll answers every second),
          // unless the write is due for its baseline.
          const key = JSON.stringify([data, state]);
          const forced = forcedReports.delete(graphic);
          if (!forced && key === lastReported.get(graphic)) return;
          lastReported.set(graphic, key);
          if (seqMode) banked(graphic);
          void (seqMode
            ? controlOutputReportSeq(outputSlug, graphic, data, state, { seq: lastAppliedSeq, epoch: followEpoch, event: lastAppliedId })
            : controlOutputReport(outputSlug, graphic, data, state, lastAppliedId));
        },
        force ? 1_000 + Math.floor(Math.random() * FORCED_SPREAD_MS) : 800,
      ),
    );
  };
  /**
   * NO BASELINE GROWS OLD (protocol 2; review 2 recovery:F1). A boot follows from the OLDEST
   * graphic's baseline, and a report is written only when a graphic changes, so a graphic taken
   * once and left alone (a bug, a logo) would hold every later boot of every renderer at its Take,
   * and a long show's reboot would read the whole retained log before painting. So every graphic
   * that holds a report is reported again once REBANK_AFTER COMMAND rows have been applied past its
   * bank, changed or not: `lastAppliedSeq` is the contiguous cursor, so what it banks is a true
   * baseline, and a reboot reads about REBANK_AFTER rows at most on top of its own gap. Report rows
   * (`live`) do not count, or re-banks would feed themselves once renderers times graphics reached
   * the threshold; and ANY renderer's report of a graphic is its bank, so one renderer banks it.
   */
  const REBANK_AFTER = 500;
  /** Per graphic that holds a report: the seq of its bank, and the command rows applied since. */
  const bankedAt = new Map<string, number>(seqMode ? snapshotAt : []);
  const sinceBank = new Map<string, number>([...bankedAt.keys()].map((graphic) => [graphic, 0]));
  const banked = (graphic: string, at = lastAppliedSeq) => {
    bankedAt.set(graphic, at);
    sinceBank.set(graphic, 0);
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
    // A graphic a command has reached is never warmed (READY above): it holds the operator's values.
    const verb = incoming.t;
    if (verb === 'update' || verb === 'play' || verb === 'stop' || verb === 'next' || verb === 'event' || verb === 'snap') touched.add(graphic);
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
    if (seqMode) {
      const seq = row.seq ?? 0;
      lastAppliedSeq = Math.max(lastAppliedSeq, seq);
      if (row.msg.t === 'live') {
        // A renderer's report of this graphic, this one's or another's, is its bank; a forced
        // report of it still waiting here is no longer needed (a change still reports).
        banked(row.graphic, seq);
        if (forcedReports.has(row.graphic) && !changedReports.has(row.graphic)) {
          clearTimeout(reportTimers.get(row.graphic));
          reportTimers.delete(row.graphic);
          forcedReports.delete(row.graphic);
        }
      } else if (row.msg.t !== 'ping') {
        for (const [graphic, at] of bankedAt) {
          // A catch-up replays rows from the oldest bank; rows before this graphic's do not count.
          if (seq <= at) continue;
          const since = (sinceBank.get(graphic) ?? 0) + 1;
          sinceBank.set(graphic, since);
          if (since < REBANK_AFTER) continue;
          banked(graphic);
          scheduleReport(graphic, true);
        }
      }
    }
    // PREPARE FOR LIVE's check of the command path (R9): answered in the Presence entry with how
    // long the row took from the server's commit, and never handed to the stage. Its graphic is
    // empty, so it names nothing here to air or to report.
    if (row.msg.t === 'ping') {
      ack = { id: row.msg.id, ms: pingDelay(row.msg.at, Date.now()) };
      dbg('ping', ack.ms === null ? ack.id : ack.id + ' in ' + ack.ms + ' ms');
      presence.touch();
      return;
    }
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
    // A tail answer carries every graphic's summary: what is on air, as the log says.
    noteHead(answer.value.head?.graphics);
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
  const replayed = missed.filter((row) => !alreadyInSnapshot(snapshotAt, row.graphic, position(row)));
  // ON AIR WITH NO POSE TO PUT BACK. A graphic with no state machine (a picture, a hand-written
  // template) reports no pose, so its report says nothing about whether it was up, and the Take
  // that put it up is older than the report, so it is not replayed either: an output that reloaded
  // while a picture was on air came back without it (CasparCG 2.3, 2026-10-01). The log's own head
  // says what is on air (protocol 2); such a graphic is played again inside the hidden catch-up
  // below, unless a play of it is among the rows replayed anyway.
  const onWithoutPose = stage.graphics.filter(
    (key) =>
      headOn.get(key) === true &&
      !resolved.live[key]?.state?.groups &&
      !replayed.some((row) => row.graphic === key && (row.msg.t === 'play' || row.msg.t === 'snap')),
  );
  const animates =
    onWithoutPose.length > 0 ||
    replayed.some((row) => row.msg.t === 'play' || row.msg.t === 'stop' || row.msg.t === 'next' || row.msg.t === 'event');
  if (animates) {
    stage.setVisible(false);
    dbg('catch-up', `${missed.length} row(s), off air while they settle`);
  }

  // ── Boot recovery, per graphic: the data half, then the visual half (snap arms timers). ──
  for (const key of stage.graphics) {
    const mine = resolved.live[key];
    if (!mine) continue;
    if (mine.data || mine.state?.groups) touched.add(key);
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
  for (const key of onWithoutPose) {
    stage.apply(key, { t: 'play' });
    liveGraphics.add(key);
    touched.add(key);
  }
  if (onWithoutPose.length > 0) dbg('catch-up', `on air with no pose, played again: ${onWithoutPose.join(', ')}`);

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
  // Everything the boot knows is applied: the READY checks may now warm what nothing touched.
  markRecovered();
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
    // THE NUMBERED LOG (hostedControl.ts followSeqLog, seqFollow.ts): in seq order, a gap is a
    // row in flight and never another production, and a refill applies every row it brings but
    // elides an entrance a later play or stop of the same graphic replaces. No fast road: the
    // numbered frame is written by the same transaction as the command frame and arrives with it,
    // on `seq-<show>`, which is this renderer's log road here. Presence stays on its own topic, so
    // nothing about Presence (a rate limit that closes its channel) can touch this road.
    dbg('commands', 'numbered log (the fast road is not needed)');
    const CATCH_UP_GRACE_MS = 5_000;
    let catchUpTimer: ReturnType<typeof setTimeout> | null = null;
    followSeqLog({
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
        if (replayed && rows.length) stage.setSoundQuiet(true);
        for (const row of rows) apply(row, replayed ? 'tail' : 'log', !quiet?.has(row.seq));
        if (replayed && rows.length) stage.setSoundQuiet(false);
      },
      onHole: () => live.hole(),
      // What is on air, as the log says, for Prepare for Live's "nothing on air here" (./prepare.ts).
      onHead: (head) => noteHead(head.graphics),
      // IN SYNC (READY's guarantee 6, R8): the follower is busy while it holds rows behind a gap or
      // reads the tail. That is normal for a moment after every reorder; held for longer than
      // CATCH_UP_GRACE_MS it means this output is not showing what the log says yet.
      onBusy: (busy) => {
        if (catchUpTimer) clearTimeout(catchUpTimer);
        catchUpTimer = null;
        if (busy) {
          catchUpTimer = setTimeout(() => {
            catchingUp = true;
            readyChanged();
          }, CATCH_UP_GRACE_MS);
        } else if (catchingUp) {
          catchingUp = false;
          readyChanged();
        }
      },
      // REPUBLISHED under the same address (unpublish + publish keeps the id and the slugs): a new
      // log numbered from 1, so no baseline this renderer holds means anything in it, and every
      // graphic that carries something reports again, in the new log, within the forced spread
      // (and only once across every renderer: the first report banks it for all): the republish
      // emptied every report, and a graphic still up that the new log never touches would
      // otherwise come back without it on a reboot. Without `reset` it is the first epoch of the
      // log already followed.
      onEpoch: (epoch, reset) => {
        followEpoch = epoch;
        if (!reset) return;
        headOn.clear();
        headHeard = false;
        snapshotAt.clear();
        lastAppliedSeq = 0;
        lastReported.clear();
        bankedAt.clear();
        sinceBank.clear();
        for (const graphic of stage.graphics) {
          if (liveGraphics.has(graphic) || mergedData.has(graphic)) scheduleReport(graphic, true);
        }
        dbg('protocol', 'numbered log (proto 2), republished: following the new log from its start');
      },
      onStatus,
    });
  } else {
    await followControlLog({
      showId: resolved.id,
      onReplay: (replaying) => stage.setSoundQuiet(replaying),
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
