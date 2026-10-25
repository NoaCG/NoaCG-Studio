// guards: src/control/graphicVerbs.ts
//
// THE LIVE PRESSES, WALKED AT RANDOM AGAINST THE PRESS CONTRACT (docs/work-specs/pinned-live-controls/
// spec.md "What a press does"). Two pinned graphics on one production page - Score (a clock graphic:
// ± on two unbound numbers, ⚡ goals that adjust them, Snap) and Quiz (clock-free: a one-press pick,
// a bare ⚡ Lock, ± on a number, Snap) - pressed through `liveSelection`, mixed with this page's
// Takes, Re-takes, Updates and Outs, another screen's Takes and corrections, typed corrections,
// held saves, the fallback timer firing, answers that land, fail, come back unanswered or are
// refused as stale, and rows heard back one at a time in log order. Both roads: the fast road (this
// page applies its own command at the press, airState.ts `claimAndApply`, and a clock graphic's ⚡
// event holds that graphic on the slow road for 1.2 s) and the slow road (only heard rows move
// this page's air record).
//
// THE ORACLE. INSTANCE, REFUSAL, QUEUE and WRITE come from the spec; BASE restates the diagnoser's
// ledger rule, so it proves the code keeps that rule, not that air is right (how often air differs
// is printed). It reads nothing of graphicVerbs.ts but what a press sends, writes and says, and what
// `heard` hands back to the page, and checks it against its own model of the wire, the server log
// and what this page has heard:
//   INSTANCE   a live press sends only while `liveCue[graphic]` is the cue it was drawn for and no
//              marker press of this page naming another cue is still out.
//   REFUSAL    a live press that sends nothing says exactly "Nothing sent: the cue on <graphic>
//              changed." and only after its instance really changed.
//   QUEUE-LIVE no two live sends of one graphic are out at once. The live chain's fallback is
//              pre-existing and accepted (PR #1730, comment 6403006781): a press its fallback
//              released may go ahead of the press it waited behind, and once it finishes it frees the
//              press queued behind it.
//   QUEUE-OWN  a live send waits behind this page's own Take/Re-take/Update/Out of that graphic
//              pressed before it and still out, unless its fallback timer fired.
//   STUCK      a live press never waits on another graphic, and every press finishes.
//   BASE       an unbound ± or ⚡ adjust counts from the diagnoser's one ledger (PR #1730, comment
//              6403006781; `oracleBase` has the rule): the newest own figure-carrying send by press
//              that is not gone decides - pending, its figure; landed and not taken past by a row
//              heard since, its figure; otherwise this page's own air record, else the cue, else 0.
//              One clause is the repair's own reading, not the diagnoser's: an own row arriving
//              already applied takes only the older sends past.
//              An Out (this page's or another screen's) heard empties the record, and this page's
//              own Out that landed takes every own send pressed before it past for every field.
//              Reported as BASE-FROM-FAILED when the figure sent counts from a gone send. How often
//              a counted figure differs from what air truly showed is printed, not checked.
//              Every check reads what the page knew at that send: an answer counts from the moment
//              the verbs take it, not from when the walk delivered it.
//   WRITE      a moved figure is written into the cue only after its send landed, into the cue
//              the press was drawn for, with the figure sent.
//
// PRESS_WALKS (default 150) walks per road; PRESS_STEPS (60) steps each. PRESS_SEED=n PRESS_ROAD=
// slow|fast [PRESS_STEPS=k] replays one walk and prints its trace; PRESS_LIST=1 prints every
// violation of every walk. A failing walk is printed with its seed and the shortest prefix of it
// that still fails.

import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AsyncLocalStorage } from 'node:async_hooks';

// controlModel.ts imports without extensions, as Vite does: resolve those to their `.ts` file so
// the press rules (`pressSend`, `movedKeys`, `adjustedValue`) run for real.
registerHooks({
  resolve(spec, ctx, next) {
    if (ctx.parentURL && /^\.\.?\//.test(spec) && !/\.[a-z]+$/.test(spec)) {
      const url = new URL(`${spec}.ts`, ctx.parentURL);
      if (existsSync(fileURLToPath(url))) return next(url.href, ctx);
    }
    return next(spec, ctx);
  },
});

const { createGraphicVerbs } = await import('../src/control/graphicVerbs.ts');
const { createPlayoutSession } = await import('../src/control/playoutSession.ts');
const { claimAndApply } = await import('../src/control/airState.ts');
const { airedAfter } = await import('../src/control/outputRecovery.ts');
const { liveSelection, pickButton } = await import('../src/control/liveControls.ts');
const { pressSend, movedKeys, adjustedValue } = await import('../src/control/controlModel.ts');
const { isStale, staleError } = await import('../src/control/seqSend.ts');
const { unansweredError } = await import('../src/control/failedSends.ts');

const WALKS = Number(process.env.PRESS_WALKS ?? 150);
const STEPS = Number(process.env.PRESS_STEPS ?? 60);
const STEP_MS = 100;
/** hostedControl.ts: a clock graphic's ⚡ event holds the graphic on the slow road this long. */
const SLOW_AFTER_EVENT_MS = 1200;
const CLOCK_GRAPHICS = new Set(['Score']);
const NO_CLOCKS = { clocks: new Map(), pairs: new Map() };
const LIVE = new Set(['bump', 'event', 'pick', 'snap']);
const FAILED = new Set(['failed', 'stale', 'unanswered']);

const settle = () => new Promise((resolve) => setImmediate(resolve));
const held = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};
/** A seeded generator (mulberry32): a failing walk replays from its seed. */
const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const oidOf = (msg) => (typeof msg?.oid === 'string' && msg.oid ? msg.oid : null);
/** What a command puts on air for its graphic's fields: an update's data, an event's payload. */
const figuresIn = (msg) => (msg.t === 'update' ? msg.data : msg.t === 'event' ? msg.payload : undefined);
/** The spec's arithmetic for a ± step: the figure as a whole number, moved by the delta. */
const plus = (figure, delta) => String((parseInt(String(figure ?? ''), 10) || 0) + delta);
const said = (msg) => `${msg.t}${figuresIn(msg) ? JSON.stringify(figuresIn(msg)) : ''}${msg.t === 'cue' ? `:${msg.cue}` : ''}${msg.t === 'event' ? `(${msg.event ?? msg.name ?? ''})` : ''}`;

const CUES = {
  Score: [
    ['s1', { home: '7', away: '3', name: 'Round 1' }],
    ['s2', { home: '0', away: '0', name: 'Round 2' }],
    ['s3', { home: '4', away: '1', name: 'Round 3' }],
    // A cue with no `away`: Taken after an Out, the field is on no record (second opinion, 32a).
    ['s4', { home: '2', name: 'Round 4' }],
  ],
  Quiz: [
    ['q1', { answer: 'A', qscore: '2', question: 'One' }],
    ['q2', { answer: 'C', qscore: '0', question: 'Two' }],
  ],
};
const GOAL = { event: 'goal', label: 'Goal', adjust: { home: 1 } };
const AWAY_GOAL = { event: 'away-goal', label: 'Away goal', adjust: { away: 1 } };
const SELECT = { event: 'select', label: 'Select', payload: ['answer'] };
const LOCK = { event: 'lock', label: 'Lock it in' };
const PICK = { field: 'answer', options: ['A', 'B', 'C', 'D'].map((v) => ({ label: v, value: v })) };

/** Which press a call runs for: a send, a save, a note, a cue write or a timer is the press's whose
 *  async flow made it. One for the file: every instance slows each async step down. */
const als = new AsyncLocalStorage();

/**
 * ONE WALK. Returns what the oracle flagged, the trace, and counts.
 */
async function walk(seed, road, steps) {
  const random = rng(seed);
  const holdChance = 0.1 + random() * 0.4;
  const pick = (list) => list[Math.floor(random() * list.length)];
  const chance = (p) => random() < p;
  const trace = [];
  const bad = [];
  const flag = (check, text) => bad.push({ check, text, at: trace.length });
  const stats = { presses: 0, sent: 0, refused: 0, writes: 0, counted: 0, offTruth: 0, offTruthAt: null };
  let now = 0;
  let seq = 0;

  // ── The page: its cues (saved values), the typed draft, its session ────────────────────────────
  const cues = Object.entries(CUES).flatMap(([graphic, list]) => list.map(([id, values]) => ({ id, sourceId: `g-${graphic}`, label: id.toUpperCase(), values: { ...values }, graphic })));
  const cueById = new Map(cues.map((c) => [c.id, c]));
  const cuesOf = (g) => cues.filter((c) => c.graphic === g);
  const draft = {};
  const saveDrafts = () => {
    for (const [id, values] of Object.entries(draft)) {
      cueById.get(id).values = { ...cueById.get(id).values, ...values };
      delete draft[id];
    }
  };
  const initialAired = { Score: { ...CUES.Score[0][1] }, Quiz: { ...CUES.Quiz[0][1] } };
  const session = createPlayoutSession('p1');
  session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: { Score: 's1', Quiz: 'q1' }, aired: structuredClone(initialAired) } }));
  const liveCueOf = (g) => session.air.get().liveCue[g] ?? null;

  // ── The wire and the server ─────────────────────────────────────────────────────────────────────
  /** The server log: committed rows, in order, with the commit's revision of its graphic. */
  const log = [];
  const serverRev = { Score: 0, Quiz: 0 };
  /** What this page has seen of each graphic's revision (protocol 2's base): heard rows, answers. */
  const pageRev = { Score: 0, Quiz: 0 };
  let heardUpTo = 0;
  const sends = [];
  const presses = [];
  const flushes = [];
  const timers = [];
  const slowUntil = {};
  const oidToSend = new Map();
  /** Who last moved each field of this page's own air record (the monitor): an own send or a row. */
  const writer = {};
  let stamped = 0;
  let foreign = 0;

  /** The page's `applyCommand`: each command once, on whichever road came first. */
  const applyCommand = (items) => {
    for (const item of items) {
      if (session.applied.has(item.msg)) continue;
      const by = oidToSend.has(oidOf(item.msg)) ? { send: oidToSend.get(oidOf(item.msg)) } : { row: true };
      // An Out empties the record; who emptied it is kept, for the accepted monitor case below.
      if (item.msg.t === 'stop') writer[item.graphic] = { cleared: by };
      for (const f of Object.keys(figuresIn(item.msg) ?? {})) (writer[item.graphic] ??= {})[f] = by;
    }
    session.apply((parts) => ({ ...parts, air: claimAndApply(parts.air, items, session.applied, NO_CLOCKS, now).air }));
  };

  /** This page's marker presses of a graphic still out (a Take, Re-take or Out). */
  const marks = (i, g) => i.graphic === g && (i.msg.t === 'cue' || i.msg.t === 'stop');
  const markersOut = (g) => sends.filter((S) => S.answer === null && S.items.some((i) => marks(i, g)));
  const markerCue = (S, g) => {
    const last = S.items.findLast((i) => marks(i, g));
    return last.msg.t === 'cue' ? (last.msg.cue ?? null) : null;
  };
  /** The newest of them, when it names another cue: what the layer will hold once it commits. */
  const markerOut = (g, cue) => {
    const newest = markersOut(g).at(-1);
    return newest && markerCue(newest, g) !== cue ? newest : null;
  };
  /** The cause a refusal may give: the marker moved, or any marker press of this page naming another
   *  cue is out (refusing behind an older one is conservative, not wrong). */
  const mayRefuse = (P) => liveCueOf(P.graphic) !== P.captured || markersOut(P.graphic).some((S) => markerCue(S, P.graphic) !== P.captured);
  const sample = () => {
    for (const P of presses) if (LIVE.has(P.kind) && !P.done && mayRefuse(P)) P.everFalse = true;
  };

  /** THE BASE: the diagnoser's one ledger (PR #1730, comment 6403006781), kept here from the walk's
   *  own events. The ledger is this page's figure-carrying sends in press order, each pending,
   *  landed or gone (failed, stale or unanswered: never a base, even if it commits later). A field
   *  of an entry is TAKEN PAST (`S.past`, written when the page hears a row, in `hearOne`) by
   *  (a) a row of an own send heard and applied: that entry and every older one;
   *  (b) another screen's row moving the field heard after the entry's press, pending or landed;
   *  (c) on the fast road an own row that arrives already applied (claimed): every strictly older
   *      entry, not its own.
   *  The newest entry by press that carries the field and is not gone decides alone: pending, its
   *  figure (taken past or not); landed and not taken past, its figure; else this page's own air
   *  record (the accepted monitor values included), else the cue's stored value, else 0. */
  const oracleBase = (g, f, cueId) => {
    const entry = sends.filter((S) => S.figures[g]?.[f] !== undefined && !FAILED.has(S.answer)).at(-1);
    if (entry && entry.answer === null) return { value: entry.figures[g][f], from: `pending send #${entry.idx}` };
    if (entry && !entry.past.has(f) && !entry.past.has('*')) return { value: entry.figures[g][f], from: `landed send #${entry.idx}` };
    const why = entry ? `send #${entry.idx} taken past` : 'no own entry';
    const record = session.air.get().aired[g]?.[f];
    if (record !== undefined) return { value: record, from: `${why}: this page's air record` };
    const cue = cueById.get(cueId);
    return { value: cue?.values[f] ?? '0', from: `${why}: no record, the cue` };
  };
  /** DIAGNOSTIC ONLY: what air truly shows for the field now, from every committed row (read when
   *  a counted figure commits: did it move what air showed by exactly its delta?). */
  const trueAir = (g, f) => {
    let aired = { [g]: initialAired[g] };
    for (const row of log) if (row.graphic === g) aired = airedAfter(aired, g, row.msg);
    return aired[g]?.[f];
  };

  const checkLiveSend = (P, items, idx) => {
    const g = P.graphic;
    P = { ...P, label: `press ${P.id}, ${P.label}` };
    if (liveCueOf(g) !== P.captured) flag('INSTANCE', `send #${idx} (${P.label}) drawn for ${P.captured} went while ${g}'s marker names ${liveCueOf(g)}`);
    const marker = markerOut(g, P.captured);
    if (marker) flag('INSTANCE', `send #${idx} (${P.label}) drawn for ${P.captured} went while this page's ${marker.kind} #${marker.idx} naming another cue was still out`);
    for (const S of sends) {
      if (S.answer !== null || !S.graphics.includes(g)) continue;
      // The fallback timer that this press set has fired: it may go past what it waited behind.
      if (P.released) continue;
      if (LIVE.has(S.kind)) {
        // The chain's fallback (pre-existing, out of scope): a press its fallback released may go ahead
        // of the press it waited behind (S's press, pressed before it, then overlaps it), and once it
        // finishes it frees the press queued behind it, which may then overlap the send it jumped.
        const jumpedBy = (R) => R.released && R.graphic === g && (R.done || (R.sends.length > 0 && R.sends.every((T) => T.answer !== null)));
        const [early, late] = S.press.seq < P.seq ? [S.press, P] : [P, S.press];
        const accepted = late.released || presses.some((R) => R.seq > early.seq && R.seq < late.seq && jumpedBy(R));
        if (!accepted) flag('QUEUE-LIVE', `send #${idx} (${P.label}) went while live send #${S.idx} (${S.label}) on ${g} was unanswered`);
      }
      else if (S.press && S.press.seq < P.seq) flag('QUEUE-OWN', `send #${idx} (${P.label}) went while this page's ${S.kind} #${S.idx} of ${g}, pressed before it, was unanswered`);
    }
    for (const [field, delta] of P.moves) {
      const sent = items.map((i) => (i.graphic === g ? figuresIn(i.msg)?.[field] : undefined)).filter((v) => v !== undefined).at(-1);
      const { value, from } = oracleBase(g, field, P.captured);
      if (sent === undefined || value === undefined) continue;
      const want = plus(value, delta);
      P.truth.push({ field, delta, sent });
      if (sent !== want) {
        // ... or the press counted from a figure of a send that failed, was refused or got no answer
        // (check 2's F1 and F2 family).
        const fromFailed = sends.some((S) => FAILED.has(S.answer) && S.figures[g]?.[field] !== undefined && plus(S.figures[g][field], delta) === sent);
        flag(fromFailed ? 'BASE-FROM-FAILED' : 'BASE', `send #${idx} (${P.label}${P.released ? ', released by its fallback' : ''}) sent ${field}=${sent}, expected ${want}: counting from ${value}, ${from}`);
      }
    }
  };

  const checkWrite = (P, cueId, values) => {
    stats.writes += 1;
    const text = `${cueId} ${JSON.stringify(values)}`;
    if (P) {
      const S = P.sends.find((s) => s.answer === 'landed');
      if (!S) return flag('WRITE', `press ${P.id} (${P.label}) wrote ${text} with no landed send (${P.sends.map((s) => `#${s.idx} ${s.answer ?? 'out'}`).join(', ') || 'nothing sent'})`);
      if (LIVE.has(P.kind) && cueId !== P.captured) flag('WRITE', `press ${P.id} (${P.label}) drawn for ${P.captured} wrote into ${text}`);
      for (const [k, v] of Object.entries(values)) {
        if (S.figures[P.graphic]?.[k] !== v) flag('WRITE', `press ${P.id} (${P.label}) wrote ${text}, but send #${S.idx} carried ${k}=${S.figures[P.graphic]?.[k]}`);
      }
      return;
    }
    // Outside any press: only a send that became landed when its row was heard.
    const ok = sends.some((S) => S.press?.captured === cueId && S.rowsAt !== undefined && S.rowsAt < heardUpTo && Object.entries(values).every(([k, v]) => S.figures[S.press.graphic]?.[k] === v));
    if (!ok) flag('WRITE', `wrote ${text} outside any press`);
  };

  const sender = {
    published: 'slug-1',
    showId: 'show-1',
    here: () => {},
    logSent: () => {},
    armSpecFor: () => null,
    applyHere: (items) => applyCommand(items),
    fastEvent: (graphic) => !CLOCK_GRAPHICS.has(graphic),
    debts: () => ({ landed: () => (shown) => shown, failed: () => {}, owed: () => 0 }),
    outputUsable: () => true,
    sending: () => {},
    owed: () => {},
    loggedAt: () => {},
    noOutput: () => {},
    note: (n) => {
      if (typeof n !== 'string') return;
      const P = als.getStore();
      if (P) {
        P.notes.push(n);
        if (LIVE.has(P.kind) && mayRefuse(P)) P.everFalse = true;
      }
      trace.push(`    note: ${n}`);
    },
  };
  const page = {
    graphics: [{ name: 'Score' }, { name: 'Quiz' }],
    get liveCue() {
      return session.air.get().liveCue;
    },
    get liveLayers() {
      return Object.entries(session.air.get().liveCue)
        .filter(([, c]) => c)
        .map(([graphic]) => ({ graphic }));
    },
    livePlayoutLayers: [],
    graphicOf: (cue) => cue.graphic ?? null,
    cueView: (cue) => ({ values: { ...cueById.get(cue.id)?.values, ...(draft[cue.id] ?? {}) } }),
    resolvedOf: () => ({}),
    flush: () => {
      const P = als.getStore() ?? null;
      if (!chance(holdChance)) {
        saveDrafts();
        return Promise.resolve();
      }
      const rec = { P, h: held(), released: false };
      flushes.push(rec);
      P?.flushes.push(rec);
      trace.push(`    save held (${P ? `press ${P.id}` : 'no press'})`);
      return rec.h.promise;
    },
    boundFields: () => ({}),
    selectionFor: () => ({ status: 'none' }),
    selectionAired: () => ({ landed: () => {}, undo: () => {} }),
    selectionStale: () => {},
    candidateFields: () => [],
    airedCandidate: () => null,
    airedCandidateFields: () => [],
    boundNow: () => ({}),
    boundReady: () => true,
    patchBound: async () => {},
    writeCue: (cueId, values) => {
      trace.push(`    writeCue ${cueId} ${JSON.stringify(values)}`);
      checkWrite(als.getStore() ?? null, cueId, values);
      const cue = cueById.get(cueId);
      if (cue) cue.values = { ...cue.values, ...values };
    },
    savedValues: (cueId) => ({ ...cueById.get(cueId)?.values }),
    writeLive: (cueId, values) => {
      trace.push(`    writeLive ${cueId} ${JSON.stringify(values)}`);
      checkWrite(als.getStore() ?? null, cueId, values);
      const cue = cueById.get(cueId);
      if (cue) cue.values = { ...cue.values, ...values };
    },
    playoutVerb: async () => true,
    clearMisses: () => {},
    noteStep: () => {},
    stopFolders: () => {},
    outUnnamed: async () => {},
    clearThroughBridge: async (note) => note,
    clearing: () => {},
  };
  const io = {
    // THE WIRE (hostedControl.ts `sendControlVerb`, protocol 2): each command stamped with an id,
    // the road decided item by item, the fast ones applied here before the round trip, and the
    // press numbered with what this page had seen of its graphic.
    sendControlVerbs: (opts) => {
      const P = als.getStore() ?? null;
      const items = opts.batches.flat().map((i) => ({ graphic: i.graphic, msg: oidOf(i.msg) ? i.msg : { ...i.msg, oid: `w-${++stamped}` } }));
      const idx = sends.length;
      sample();
      if (P && LIVE.has(P.kind)) checkLiveSend(P, items, idx);
      const fast = [];
      const holds = [];
      for (const item of items) {
        const isEvent = item.msg.t === 'event';
        const rides = road === 'fast' && (!isEvent || !CLOCK_GRAPHICS.has(item.graphic)) && (slowUntil[item.graphic] ?? 0) <= now;
        if (isEvent && !rides) {
          holds.push(item.graphic);
          slowUntil[item.graphic] = now + SLOW_AFTER_EVENT_MS;
        }
        if (rides) fast.push(item);
      }
      const figures = {};
      for (const item of items) if (figuresIn(item.msg)) figures[item.graphic] = { ...figures[item.graphic], ...figuresIn(item.msg) };
      const S = {
        idx,
        press: P,
        kind: P?.kind ?? 'other',
        label: P?.label ?? 'a send',
        graphics: [...new Set(items.map((i) => i.graphic))],
        items,
        figures,
        base: { ...pageRev },
        server: 'queued',
        answer: null,
        delivered: null,
        aired: fast.length > 0,
        appliedHere: fast.map((i) => i.graphic),
        holds,
        past: new Set(),
        sentAt: ++seq,
        h: held(),
      };
      sends.push(S);
      if (P?.truth?.length) S.truth = P.truth.splice(0);
      for (const item of items) if (oidOf(item.msg)) oidToSend.set(oidOf(item.msg), idx);
      P?.sends.push(S);
      stats.sent += 1;
      trace.push(`    send #${idx}${P ? ` (press ${P.id})` : ''} ${items.map((i) => `${i.graphic}:${said(i.msg)}`).join(' + ')}${fast.length ? ' (applied here)' : ''}`);
      if (fast.length > 0) opts.applyHere?.(fast);
      // What this page knows of the answer, from the moment the verbs take it (not when the walk
      // delivered it: a save released in the same step may run its press first).
      const know = () => {
        S.answer = S.delivered;
        // This page's Out that landed took the graphic off: every own send pressed before it is
        // taken past for every field, before its rows are heard.
        if (S.answer === 'landed') {
          for (const g of S.graphics) {
            if (!S.items.some((i) => i.graphic === g && i.msg.t === 'stop')) continue;
            for (const T of sends) if (T.idx < S.idx && T.figures[g]) T.past.add('*');
          }
        }
        S.answeredAt = ++seq;
      };
      return S.h.promise.then(
        (v) => (know(), v),
        (e) => {
          know();
          throw e;
        },
      );
    },
    verbStale: isStale,
    verbAired: (e) => e?.aired === true,
    verbsLanded: (e) => (typeof e?.landed === 'number' ? e.landed : 0),
    verbsSkipped: (e) => (Array.isArray(e?.skipped) ? e.skipped : []),
    verbSentItems: (e) => (Array.isArray(e?.sent) ? e.sent : null),
    headsSay: () => null,
    headsStillOn: async () => [],
    adjustedValue,
    movedKeys,
    pressSend,
    nameList: (names) => names.join(' and '),
    now: () => now,
    mintOid: (n) => `oid-${seed}-${n}`,
    setTimeout: (run, ms) => {
      const P = als.getStore() ?? null;
      timers.push({ run, ms, P, alive: true, due: now + ms });
      return timers.length;
    },
    clearTimeout: (id) => {
      if (timers[id - 1]) timers[id - 1].alive = false;
    },
  };
  const verbs = createGraphicVerbs(session, io, () => sender, () => page);

  // ── The server's side ───────────────────────────────────────────────────────────────────────────
  const commit = (rows, own) => {
    const g = rows[0].graphic;
    serverRev[g] += 1;
    for (const row of rows) log.push({ ...row, own, rev: serverRev[g] });
  };
  /** The server takes the oldest of this page's sends on a graphic (one at a time, in press order):
   *  refused as stale when another screen committed that graphic after the press's base. */
  const serve = (S, fate) => {
    if (S.graphics.some((g) => log.some((row) => row.graphic === g && row.own === null && row.rev > S.base[g]))) S.server = 'stale';
    else if (fate === 'lost') S.server = 'lost';
    else {
      S.server = 'committed';
      for (const { field, delta, sent } of S.truth ?? []) {
        stats.counted += 1;
        const shown = trueAir(S.graphics[0], field);
        if (sent !== plus(shown, delta)) {
          stats.offTruth += 1;
          if (stats.offTruthAt === null) stats.offTruthAt = `send #${S.idx} committed ${field}=${sent} over ${shown}`;
        }
      }
      S.rowsAt = log.length;
      commit(S.items, S.idx);
    }
    trace.push(`  server: #${S.idx} ${S.server}`);
  };
  const answer = (S, how) => {
    const g = S.graphics[0];
    const failure = (e) => Object.assign(e, { aired: S.aired, sent: S.items, landed: 0, skipped: [] });
    if (S.server === 'committed' && (how !== 'unanswered' || S.rowsAt < heardUpTo)) {
      // Landed (or abandoned after its own row was heard back: the wire calls that landed).
      S.delivered = 'landed';
      pageRev[g] = Math.max(pageRev[g], serverRev[g]);
      const pressedAgain = S.graphics.filter((gr) => sends.some((T) => T.idx > S.idx && T.graphics.includes(gr)));
      S.h.resolve({ skipped: [], superseded: [], pressedAgain });
    } else if (S.server === 'stale') {
      S.delivered = 'stale';
      pageRev[g] = Math.max(pageRev[g], serverRev[g]);
      S.h.reject(failure(staleError([g])));
    } else if (how === 'unanswered') {
      S.delivered = 'unanswered';
      S.h.reject(failure(unansweredError()));
    } else {
      S.delivered = 'failed';
      S.h.reject(failure(new Error('the network is down')));
    }
    for (const gr of S.holds) slowUntil[gr] = now + SLOW_AFTER_EVENT_MS;
    trace.push(`  answer #${S.idx}: ${S.delivered}${S.server === 'committed' && S.delivered !== 'landed' ? ' (committed)' : ''}`);
  };
  const firstOut = (g) => sends.find((S) => S.delivered === null && S.graphics.includes(g));
  const firstQueued = (g) => sends.find((S) => S.server === 'queued' && S.graphics.includes(g));
  /** A row heard back, as the page hears it (ProductionPage `hearCommand`): the sender first, then
   *  air's record and the marker for what it leaves to the page. */
  const hearOne = () => {
    const row = log[heardUpTo++];
    row.heardAt = ++seq;
    pageRev[row.graphic] = Math.max(pageRev[row.graphic], row.rev);
    trace.push(`  hear row ${heardUpTo - 1}: ${row.graphic}:${said(row.msg)} (${row.own === null ? 'another screen' : `send #${row.own}`})`);
    const item = { graphic: row.graphic, msg: row.msg };
    const rest = verbs.heard([item], (msg) => session.applied.has(msg));
    if (rest.length === 0 && row.own === null) trace.push(`    (the sender keeps it from the page)`);
    // The ledger's "taken past", from what this row is to the page (see `oracleBase`).
    // A stop (an Out, this page's or another screen's) moves every field: '*'.
    const fields = row.msg.t === 'stop' ? ['*'] : Object.keys(figuresIn(row.msg) ?? {});
    const given = rest.some((r) => r.msg === row.msg);
    const claimed = given && session.applied.has(row.msg);
    const pass = (S) => {
      if (S.figures[row.graphic]) for (const f of fields) S.past.add(f);
    };
    if (row.own === null) {
      for (const S of sends) if (S.sentAt < row.heardAt) pass(S);
    } else if (given && !claimed) {
      for (const S of sends) if (S.idx <= row.own) pass(S);
    } else if (claimed) {
      for (const S of sends) if (S.idx < row.own) pass(S);
    }
    applyCommand(rest);
  };
  const release = (rec) => {
    rec.released = true;
    saveDrafts();
    trace.push(`  save released (${rec.P ? `press ${rec.P.id}` : 'no press'})`);
    rec.h.resolve();
  };
  /** The fallback timers fire in the order they fall due (the earliest first), the clock moving on
   *  to that moment. */
  const nextTimer = () => timers.filter((t) => t.alive).sort((a, b) => a.due - b.due)[0];
  const fire = (t) => {
    t.alive = false;
    now = Math.max(now, t.due);
    if (t.P) {
      t.P.released = true;
      t.P.releasedAt = ++seq;
    }
    trace.push(`  fallback timer fires (${t.P ? `press ${t.P.id}` : 'no press'})`);
    t.run();
  };

  // ── Presses ─────────────────────────────────────────────────────────────────────────────────────
  const lastView = {};
  const press = (kind, graphic, label, run, extra = {}) => {
    const P = { id: presses.length, kind, graphic, label, seq: ++seq, sends: [], truth: [], notes: [], flushes: [], done: false, everFalse: false, moves: [], captured: null, ...extra };
    presses.push(P);
    stats.presses += 1;
    trace.push(`press ${P.id}: ${label}`);
    if (LIVE.has(kind) && mayRefuse(P)) P.everFalse = true;
    als.run(P, run).then(
      () => (P.done = true),
      (e) => {
        P.done = true;
        flag('THREW', `press ${P.id} (${label}) threw ${e?.message}`);
      },
    );
  };
  const live = (graphic) => {
    let view = liveSelection(graphic, cues, session.air.get().liveCue);
    if (lastView[graphic] && chance(0.1)) view = lastView[graphic];
    else lastView[graphic] = view;
    const captured = view.airCue?.id ?? null;
    if (!captured) return;
    const tag = `${graphic}/${captured}`;
    if (graphic === 'Score') {
      const roll = random();
      if (roll < 0.35) press('bump', graphic, `+1 home on ${tag}`, () => verbs.bump(view, 'home', 1), { captured, moves: [['home', 1]] });
      else if (roll < 0.42) press('bump', graphic, `-1 home on ${tag}`, () => verbs.bump(view, 'home', -1), { captured, moves: [['home', -1]] });
      else if (roll < 0.55) press('bump', graphic, `+1 away on ${tag}`, () => verbs.bump(view, 'away', 1), { captured, moves: [['away', 1]] });
      else if (roll < 0.78) press('event', graphic, `⚡ goal on ${tag}`, () => verbs.event(view, GOAL), { captured, moves: [['home', 1]] });
      else if (roll < 0.88) press('event', graphic, `⚡ away goal on ${tag}`, () => verbs.event(view, AWAY_GOAL), { captured, moves: [['away', 1]] });
      else press('snap', graphic, `snap on ${tag}`, () => verbs.snap(view, chance(0.5) ? 'reveal' : null, 'shown'), { captured });
    } else {
      const roll = random();
      if (roll < 0.35) {
        const value = pick(PICK.options).value;
        press('pick', graphic, `pick ${value} on ${tag}`, () => verbs.event(view, pickButton(SELECT, PICK, value)), { captured });
      } else if (roll < 0.5) press('event', graphic, `⚡ lock on ${tag}`, () => verbs.event(view, LOCK), { captured });
      else if (roll < 0.88) press('bump', graphic, `+1 qscore on ${tag}`, () => verbs.bump(view, 'qscore', 1), { captured, moves: [['qscore', 1]] });
      else press('snap', graphic, `snap on ${tag}`, () => verbs.snap(view, 'reveal', 'shown'), { captured });
    }
  };
  const own = (graphic) => {
    const on = liveCueOf(graphic);
    const roll = random();
    if (on && roll < 0.3) press('retake', graphic, `Re-take ${on}`, () => verbs.take(cueById.get(on)), { cue: on });
    else if (on && roll < 0.55) press('update', graphic, `Update ${on}`, () => verbs.update(liveSelection(graphic, cues, session.air.get().liveCue)), { cue: on });
    else if (on && roll < 0.7) {
      press('out', graphic, `Out ${graphic}`, () => verbs.out(liveSelection(graphic, cues, session.air.get().liveCue)), { cue: null });
      // Often a Take right behind it, as a new round starts: half the time the cue with no `away`.
      if (chance(0.6)) {
        const cue = graphic === 'Score' && chance(0.5) ? cueById.get('s4') : pick(cuesOf(graphic).filter((c) => c.id !== on));
        press('take', graphic, `Take ${cue.id}`, () => verbs.take(cue), { cue: cue.id });
      }
    } else {
      const cue = pick(cuesOf(graphic).filter((c) => c.id !== on));
      press('take', graphic, `Take ${cue.id}`, () => verbs.take(cue), { cue: cue.id });
    }
  };
  const anotherScreen = () => {
    const g = pick(['Score', 'Quiz']);
    foreign += 1;
    if (chance(0.1)) {
      trace.push(`  another screen takes ${g} out`);
      commit(
        [
          { graphic: g, msg: { t: 'stop', oid: `other-${foreign}-s` } },
          { graphic: g, msg: { t: 'cue', cue: null, oid: `other-${foreign}-c` } },
        ],
        null,
      );
    } else if (chance(0.6)) {
      const field = g === 'Score' ? pick(['home', 'away']) : pick(['qscore', 'answer']);
      const value = field === 'answer' ? pick(['A', 'B', 'C', 'D']) : String(Math.floor(random() * 15));
      trace.push(`  another screen corrects ${g} ${field}=${value}`);
      commit([{ graphic: g, msg: { t: 'update', data: { [field]: value }, oid: `other-${foreign}` } }], null);
    } else {
      const cue = pick(cuesOf(g));
      trace.push(`  another screen takes ${cue.id}`);
      commit(
        [
          { graphic: g, msg: { t: 'update', data: { ...cue.values }, oid: `other-${foreign}-u` } },
          { graphic: g, msg: { t: 'play', oid: `other-${foreign}-p` } },
          { graphic: g, msg: { t: 'cue', cue: cue.id, oid: `other-${foreign}-c` } },
        ],
        null,
      );
    }
  };
  const typeCorrection = () => {
    const cue = pick(cues);
    const field = cue.graphic === 'Score' ? pick(['home', 'away']) : 'qscore';
    draft[cue.id] = { ...draft[cue.id], [field]: String(Math.floor(random() * 15)) };
    trace.push(`  typed ${cue.id} ${field}=${draft[cue.id][field]} (not saved)`);
  };

  // ── After each step: what the presses did ──────────────────────────────────────────────────────
  const review = () => {
    for (const P of presses) {
      if (!LIVE.has(P.kind) || P.reviewed) continue;
      if (!P.done && mayRefuse(P)) P.everFalse = true;
      if (P.done) {
        P.reviewed = true;
        if (P.sends.length > 0) continue;
        stats.refused += 1;
        trace.push(`  press ${P.id} ended with nothing sent`);
        const note = `Nothing sent: the cue on ${P.graphic} changed.`;
        if (!P.notes.includes(note)) flag('REFUSAL', `press ${P.id} (${P.label}) sent nothing and said ${JSON.stringify(P.notes)}, not "${note}"`);
        if (!P.everFalse) flag('REFUSAL', `press ${P.id} (${P.label}) was refused though ${P.captured} held ${P.graphic} throughout`);
        continue;
      }
      if (P.sends.length > 0 || P.stuck) continue;
      const g = P.graphic;
      const waiting =
        P.flushes.length === 0 ||
        P.flushes.some((f) => !f.released) ||
        presses.some((Q) => Q !== P && !Q.done && Q.graphic === g && Q.seq < P.seq) ||
        sends.some((S) => S.answer === null && S.graphics.includes(g));
      if (!waiting) {
        P.stuck = true;
        flag('STUCK', `press ${P.id} (${P.label}) is still waiting with nothing of ${g} out or pressed before it`);
      }
    }
  };
  const step = async (action) => {
    action();
    await settle();
    await settle();
    review();
  };

  // Each walk weighs its moves differently, so rare mixes (a quiet other screen and many Re-takes,
  // or a busy one and slow answers) all come up.
  const weights = {
    live: 26,
    own: 3 + random() * 9,
    type: 3,
    serve: 5 + random() * 12,
    answer: 6 + random() * 14,
    both: 2 + random() * 6,
    foreign: 1 + random() * 6,
    hear: 6 + random() * 14,
    release: 6,
    timer: 1 + random() * 4,
    pass: 2 + random() * 4,
    idle: 4,
  };
  trace.push(`walk ${seed} on the ${road} road, saves held ${Math.round(holdChance * 100)}%, weights ${Object.entries(weights).map(([k, v]) => `${k} ${Math.round(v)}`).join(', ')}`);
  for (let n = 0; n < steps; n++) {
    now += STEP_MS;
    const graphic = chance(0.6) ? 'Score' : 'Quiz';
    const out = firstOut(graphic);
    const queued = firstQueued(graphic);
    const flushHeld = flushes.filter((f) => !f.released);
    const can = {
      live: true,
      own: true,
      type: true,
      serve: !!queued,
      answer: !!out && out.server !== 'queued',
      both: !!queued && queued === out,
      foreign: true,
      hear: heardUpTo < log.length,
      release: flushHeld.length > 0,
      timer: !!nextTimer(),
      pass: true,
      idle: true,
    };
    const open = Object.keys(weights).filter((k) => can[k]);
    let roll = random() * open.reduce((sum, k) => sum + weights[k], 0);
    const move = open.find((k) => (roll -= weights[k]) < 0) ?? 'idle';
    if (move === 'live') await step(() => live(graphic));
    else if (move === 'own') await step(() => own(graphic));
    else if (move === 'type') await step(typeCorrection);
    else if (move === 'serve') await step(() => serve(queued, chance(0.88) ? 'commit' : 'lost'));
    else if (move === 'answer') {
      const r2 = random();
      await step(() => answer(out, r2 < 0.82 ? 'landed' : r2 < 0.9 ? 'failed' : 'unanswered'));
    } else if (move === 'both') {
      // Committed (or refused) and answered at once.
      await step(() => {
        serve(queued, chance(0.9) ? 'commit' : 'lost');
        answer(queued, chance(0.85) ? 'landed' : chance(0.5) ? 'failed' : 'unanswered');
      });
    } else if (move === 'foreign') await step(anotherScreen);
    else if (move === 'hear') {
      // One row per hearing, as the follow delivers them; sometimes a few in a row.
      const count = 1 + Math.floor(random() * 3);
      for (let k = 0; k < count && heardUpTo < log.length; k++) await step(hearOne);
    } else if (move === 'release') await step(() => release(pick(flushHeld)));
    else if (move === 'timer') await step(() => fire(nextTimer()));
    else if (move === 'pass') {
      now += 1300;
      trace.push('  1.3 s pass');
    }
  }

  // ── Drain: every save, answer, row and timer, until the page is quiet ──────────────────────────
  for (let round = 0; round < 500; round++) {
    let moved = false;
    for (const rec of flushes) if (!rec.released) (release(rec), (moved = true));
    for (const g of ['Score', 'Quiz']) {
      const q = firstQueued(g);
      if (q) (serve(q, 'commit'), (moved = true));
      const o = firstOut(g);
      if (o && o.server !== 'queued') (answer(o, 'landed'), (moved = true));
    }
    if (heardUpTo < log.length) (hearOne(), (moved = true));
    await settle();
    await settle();
    review();
    if (!moved) {
      const t = nextTimer();
      if (!t) break;
      fire(t);
      await settle();
      await settle();
      review();
    }
  }
  for (const P of presses) if (!P.done) flag('STUCK', `press ${P.id} (${P.label}) never finished`);
  return { bad, trace, stats };
}

/** The shortest prefix of a failing walk that still fails the same check. */
async function shortest(seed, road, check) {
  for (let n = 1; n <= STEPS; n++) {
    const run = await walk(seed, road, n);
    if (run.bad.some((b) => b.check === check)) return { n, run };
  }
  return { n: STEPS, run: await walk(seed, road, STEPS) };
}

const replay = process.env.PRESS_SEED ? Number(process.env.PRESS_SEED) : null;

for (const road of ['slow', 'fast']) {
  if (replay !== null && (process.env.PRESS_ROAD ?? road) !== road) continue;
  test(`live presses on the ${road} road keep the press contract: instance, queue, base and write-on-acceptance (walk)`, async (t) => {
    if (replay !== null) {
      const run = await walk(replay, road, STEPS);
      console.log(`seed ${replay}, ${road} road:\n${run.trace.join('\n')}\n\n${run.bad.map((b) => `${b.check}: ${b.text}`).join('\n') || 'no violation'}`);
      assert.deepEqual(run.bad, []);
      return;
    }
    const failing = new Map();
    const totals = { presses: 0, sent: 0, refused: 0, writes: 0, counted: 0, offTruth: 0 };
    const offTruth = [];
    for (let seed = 1; seed <= WALKS; seed++) {
      const run = await walk(seed, road, STEPS);
      for (const k of Object.keys(totals)) totals[k] += run.stats[k];
      if (run.stats.offTruthAt && offTruth.length < 3) offTruth.push(`seed ${seed}: ${run.stats.offTruthAt}`);
      if (process.env.PRESS_LIST) for (const b of run.bad) console.log(`${road} ${seed} ${b.check}: ${b.text}`);
      for (const check of new Set(run.bad.map((b) => b.check))) {
        if (!failing.has(check)) failing.set(check, []);
        failing.get(check).push(seed);
      }
    }
    t.diagnostic(`${road} road: ${WALKS} walks, ${totals.presses} presses, ${totals.sent} sends, ${totals.refused} live presses refused, ${totals.writes} cue writes`);
    // Not a check: what the base rule costs where the page cannot know log order.
    t.diagnostic(`${road} road: ${totals.offTruth} of ${totals.counted} committed ± figures did not move air by exactly their step (${offTruth.join('; ') || 'none'})`);
    if (failing.size === 0) return;
    const parts = [];
    for (const [check, seeds] of failing) {
      const { n, run } = await shortest(seeds[0], road, check);
      const first = run.bad.find((b) => b.check === check);
      parts.push(
        `${check}: ${seeds.length} of ${WALKS} walks (seeds ${seeds.slice(0, 12).join(', ')}${seeds.length > 12 ? ', ...' : ''})\n` +
          `  seed ${seeds[0]}, first ${n} steps (replay: PRESS_SEED=${seeds[0]} PRESS_ROAD=${road} PRESS_STEPS=${n}):\n` +
          `  ${first.text}\n    ${run.trace.slice(0, first.at).join('\n    ')}`,
      );
    }
    assert.fail(`the ${road} road broke the press contract:\n\n${parts.join('\n\n')}`);
  });
}
