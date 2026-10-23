// A PUBLISHED PRODUCTION'S WIRE ON THE PAGE: resolve, seed, follow, stop (production-page refactor
// spec §2, §3; docs/CLOUD_PLAYOUT.md).
//
// One start per published mode: the page starts it when the production is published and the
// backend is there, and stops it when either goes or the session ends (it registers its stop with
// `session.onDispose`). Its lifetime, in order:
//
//   resolve   `controlShowBySlug`, asked again on the renderer's backoff until it ANSWERS; the
//             marker's moves and the commands applied are read at the start of the attempt that
//             answers (./airState.ts `airAtRequest`)
//   seed      the reports, then the rows after them (`bootMonitorReplay`), then one
//             `seedFromResolve`, which the moves guard skips when this page moved the marker
//             meanwhile
//   follow    the timed cues' arm wire (numbered log only), the log's history into the `log`
//             part, then `followControlLog` on both roads: commands to the page's `hear`, rows to
//             the log, the arm wire, the machine states and the data tree
//   seen      every 30 s, the output's last heartbeat and the header clock
//   stop      unsubscribe (also when the follow answers after the stop), the 30 s timer, the arm
//             wire. Every answer that lands after the stop changes nothing: no write, no call into
//             the page. In-flight requests are not aborted (§4.1 R3).
//
// The browser-only calls come in through `io` (./hostedControl.ts cannot be loaded in Node) and the
// page's own facts and setters through `page()`, read at each call, so a Node test drives the whole
// lifetime with a scripted wire. Only `.ts` runtime imports.

import type { CueArmWire, CueArmWireOptions } from './cueArmWire';
import type { LaneArm } from './cueAuto';
import type { LogEntry } from './eventLog';
import type { ControlCommandItem, ControlEventRow, ControlFollowStatus, ResolvedControlShow } from './hostedControl';
import type { ReplayItem } from './outputRecovery';
import type { PlayoutSession } from './playoutSession';
import { airAtRequest, forgetBootReplay, logged, seedFromResolve, withReports, type AirAtRequest, type AppendLog, type ClockSpecs } from './airState.ts';
import { writeArms } from './cueArmEngine.ts';

/** How far behind the log head the action log seeds its history. Global ids mean this is a ceiling
 *  on rows READ, not on rows shown: a busy instance yields fewer of this show's. */
export const LOG_HISTORY_SPAN = 400;
/** How often the output's last heartbeat is asked, and the header clock moved. */
export const SEEN_EVERY_MS = 30_000;

type Answer<T> = { ok: true; value: T } | { ok: false; error: string };

/** The browser-only calls (./hostedControl.ts, ./cueArmRpc.ts) and the timer. */
export interface SessionWireIo {
  controlShowBySlug: (slug: string) => Promise<Answer<ResolvedControlShow | null>>;
  untilAnswered: <T>(attempt: () => Promise<Answer<T>>, opts: { stop?: () => boolean; onRetry?: () => void }) => Promise<Answer<T>>;
  bootMonitorReplay: (slug: string, resolved: ResolvedControlShow) => Promise<ReplayItem[]>;
  hostedControlTail: (slug: string, after: number) => Promise<ControlEventRow[]>;
  followControlLog: (opts: {
    showId: string;
    from: number;
    tail: (after: number) => Promise<ControlEventRow[]>;
    seq?: ResolvedControlShow['seq'];
    onEpochReset?: () => void;
    onStatus?: (status: ControlFollowStatus) => void;
    onCommandStatus?: (status: string) => void;
    onCommand?: (items: ControlCommandItem[]) => void;
    onRow: (row: ControlEventRow) => void;
  }) => Promise<() => void>;
  controlOutputSeenAt: (showId: string) => Promise<string | null>;
  createCueArmWire: (options: CueArmWireOptions) => CueArmWire;
  /** How the action log takes new lines (./eventLog.ts `appendLogEntries`). */
  appendLog: AppendLog;
  armRpc: CueArmWireOptions['rpc'];
  setInterval: (run: () => void, ms: number) => unknown;
  clearInterval: (timer: unknown) => void;
}

/** What the wire asks of the page and tells it, read at each call. */
export interface SessionWirePage {
  /** The resolve failed and is being asked again (true), or that is over (false). */
  resolveWaiting: (waiting: boolean) => void;
  /** Before the first request: the previous answer's facts must not decide this one's road. */
  starting: () => void;
  /** The resolve answered: its heartbeat, published version, fast events and readers. */
  resolved: (resolved: ResolvedControlShow) => void;
  /** The seed is done: what air holds is known here, and each graphic's reported machine state. */
  recovered: (resolved: ResolvedControlShow) => void;
  /** The rundown's cues, for a live layer no renderer has reported. */
  cues: () => readonly { id: string; values: Record<string, string> }[];
  /** The clocks the production's graphics carry. */
  clocks: () => ClockSpecs;
  /** The timed cues' arm wire, while there is one. */
  armWire: (wire: CueArmWire | null) => void;
  /** Whether the server keeps this production's arms ('pending' again at the stop). */
  armsServer: (state: 'pending' | 'on' | 'missing') => void;
  /** The server said `ok` to this page's fire. */
  fire: (graphic: string, arm: LaneArm) => void | Promise<void>;
  note: (text: string) => void;
  follow: (status: ControlFollowStatus) => void;
  commandStatus: (status: string) => void;
  /** Commands from either road (the page claims them once, ./airState.ts `claimAndApply`). */
  hear: (items: { graphic: string; msg: ControlEventRow['msg'] }[]) => void;
  /** A renderer reported a graphic's machine state. */
  machineState: (graphic: string, state: { groups?: Record<string, string> } | null) => void;
  /** The tree moved server-side: read it again. */
  refreshData: () => void;
  /** A row as the action log names it, or null for a row it does not show. */
  describe: (row: ControlEventRow) => LogEntry | null;
  /** The output's last heartbeat. */
  seenAt: (at: string) => void;
  /** The 30 s tick, for the header clock. */
  tick: () => void;
}

export interface SessionWireAdapters {
  slug: string;
  showId: string;
  page: () => SessionWirePage;
}

export function startSessionWire(session: PlayoutSession, io: SessionWireIo, adapters: SessionWireAdapters): () => void {
  const { slug, showId, page } = adapters;
  let stopped = false;
  let unsubscribe: (() => void) | null = null;
  let arm: CueArmWire | null = null;
  const live = () => !stopped && session.alive();
  const tail = (after: number) => io.hostedControlTail(slug, after);

  const run = async () => {
    // Before the await: the previous answer must not decide this one's road while it is in flight.
    page().starting();
    session.apply((parts) => ({ ...parts, air: forgetBootReplay(parts.air) }));
    let at!: AirAtRequest;
    const answer = await io.untilAnswered(
      () => {
        // At the start of the round trip that ANSWERS: an answer older than the screen must not
        // overwrite it.
        at = airAtRequest(session.air.get());
        return io.controlShowBySlug(slug);
      },
      { stop: () => !live(), onRetry: () => page().resolveWaiting(true) },
    );
    if (!live()) return;
    page().resolveWaiting(false);
    const resolved = answer.ok ? answer.value : null;
    if (!resolved) return;
    page().resolved(resolved);
    // The reports must be in hand before the seed commits and the boot recovery fires.
    session.apply((parts) => ({ ...parts, air: withReports(parts.air, resolved.live) }));
    // …and the rows after each report (a report trails its graphic's last change by 800 ms).
    const sinceReports = await io.bootMonitorReplay(slug, resolved);
    if (!live()) return;
    const p = page();
    session.apply((parts) => ({ ...parts, air: seedFromResolve(parts.air, resolved, sinceReports, at, p.cues(), p.clocks()) }));
    p.recovered(resolved);
    // TIMED CUES, published: only on the numbered log, whose seq orders the arm rows.
    if (resolved.seq) {
      const wire = io.createCueArmWire({
        slug,
        get: session.arms.get,
        set: (arms) => writeArms(session, arms),
        fire: (graphic, a) => page().fire(graphic, a),
        note: (text) => page().note(text),
        rpc: io.armRpc,
      });
      arm = wire;
      page().armWire(wire);
      wire.start((state) => {
        if (!live()) return;
        if (state === 'missing') {
          wire.stop();
          if (arm === wire) arm = null;
          page().armWire(null);
        }
        page().armsServer(state);
      });
    } else {
      page().armsServer('missing');
    }
    const history = await io.hostedControlTail(slug, Math.max(0, resolved.lastEventId - LOG_HISTORY_SPAN));
    if (!live()) return;
    const described = history.map((row) => page().describe(row)).filter((e): e is LogEntry => !!e);
    session.apply((parts) => ({ ...parts, log: logged(parts.log, described, io.appendLog) }));
    const off = await io.followControlLog({
      showId,
      from: resolved.lastEventId,
      tail,
      seq: resolved.seq,
      onEpochReset: () => arm?.reset(),
      onStatus: (s) => {
        if (live()) page().follow(s);
      },
      onCommandStatus: (s) => {
        if (live()) page().commandStatus(s);
      },
      // THE FAST ROAD: the same verbs, broadcast before their rows.
      onCommand: (items) => {
        if (live()) page().hear(items);
      },
      onRow: (row) => {
        if (!live()) return;
        const msg = row.msg;
        // The same door the broadcast comes through; the second copy is dropped there.
        page().hear([{ graphic: row.graphic, msg }]);
        arm?.row(row);
        if (msg.t === 'live') {
          page().machineState(row.graphic, msg.state ?? null);
          // A newer report than the boot's: a rebuild reads what this page has seen since.
          session.apply((parts) => ({ ...parts, air: forgetBootReplay(parts.air) }));
        }
        // THE TREE MOVED SERVER-SIDE: any `src` row but typing and a marker (a feed, or a press on
        // another dashboard), durable only.
        else if (msg.t !== 'staged' && msg.t !== 'cue' && typeof (msg as { src?: string }).src === 'string') {
          page().refreshData();
        }
        const entry = page().describe(row);
        if (entry) session.apply((parts) => ({ ...parts, log: logged(parts.log, [entry], io.appendLog) }));
      },
    });
    // A follow that answers after the stop is ended at once, never left running.
    if (stopped) off();
    else unsubscribe = off;
  };

  const seen = io.setInterval(() => {
    page().tick();
    void io.controlOutputSeenAt(showId).then((at) => {
      if (live() && at !== null) page().seenAt(at);
    });
  }, SEEN_EVERY_MS);

  let unregister = () => {};
  const stop = () => {
    if (stopped) return;
    stopped = true;
    unregister();
    page().resolveWaiting(false);
    unsubscribe?.();
    unsubscribe = null;
    io.clearInterval(seen);
    arm?.stop();
    arm = null;
    page().armWire(null);
    page().armsServer('pending');
  };
  unregister = session.onDispose(stop);
  // A session that had already ended stopped it just now: nothing is asked.
  if (!stopped) void run();
  return stop;
}
