// guards: companion-module/src/panel.ts, companion-module/src/actions.ts, src/control/panelRelay.ts, src/control/panelActions.ts, src/control/panelFeedback.ts, src/control/graphicVerbs.ts, src/control/liveControls.ts, src/control/airState.ts
//
// QUICK +1 PRESSES FROM A DECK, END TO END (issue #2088; playout-companion-actions AC-2). A physical
// deck's +1 key pressed three or five times in quick succession goes through every seam a studio
// press takes, each the real code: the Companion module's key press (`pressGraphicKey`, its
// `PanelClient` with the press id and the one same-id retry), the relay (an in-memory stand-in
// for `panel_press` and Realtime, carrying the payload 0103 builds), the answering page
// (`answerPanel`: claim, press-id dedupe, `judgeAction`), the page's one dispatcher
// (`runCapability` on `liveSelection`), the verbs' per-graphic queue and the slow road's
// sent-figure base (`graphicVerbs` bump, `heard`), the command log (each send appended in order) and
// the output (the log applied in order). Nothing here sleeps: the module's clock is driven by hand,
// the wire's answers are held until the test releases them, and every hop is a microtask or an
// immediate, drained in place.
//
// Each run asserts AC-2's press rule: every press adds exactly one point, a duplicate or late copy
// of a press has no second effect, and a lost acknowledgement never replays a +1.

import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The page's modules import without extensions, as Vite does, and some (as the Companion module's)
// with `.js`, as tsc emits. Both resolve to their `.ts` file here when there is no `.js`. The page's backend client is the relay below.
const SUPABASE = /\/src\/backend\/supabase\.ts$/;
registerHooks({
  resolve(spec, ctx, next) {
    if (ctx.parentURL && /^\.\.?\//.test(spec)) {
      const bare = !/\.[a-z]+$/.test(spec);
      const js = /\.js$/.test(spec);
      if (bare || js) {
        const url = new URL(bare ? `${spec}.ts` : spec.replace(/\.js$/, '.ts'), ctx.parentURL);
        if (existsSync(fileURLToPath(url))) return next(url.href, ctx);
      }
    }
    return next(spec, ctx);
  },
  load(url, ctx, next) {
    if (SUPABASE.test(url)) return { format: 'module', source: 'export const getSupabase = async () => globalThis.__panelBackend ?? null;', shortCircuit: true };
    return next(url, ctx);
  },
});

// The answering page reads its tab's storage and listens for pagehide.
const listeners = new Map();
const storage = new Map();
globalThis.window = {
  sessionStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) },
  addEventListener: (type, fn) => listeners.set(type, [...(listeners.get(type) ?? []), fn]),
  removeEventListener: (type, fn) => listeners.set(type, (listeners.get(type) ?? []).filter((f) => f !== fn)),
};
const pagehide = () => (listeners.get('pagehide') ?? []).forEach((fn) => fn());

const { answerPanel } = await import('../src/control/panelRelay.ts');
const { graphicCapabilities, runCapability } = await import('../src/control/panelActions.ts');
const { createGraphicVerbs } = await import('../src/control/graphicVerbs.ts');
const { createPlayoutSession } = await import('../src/control/playoutSession.ts');
const { liveSelection } = await import('../src/control/liveControls.ts');
const { airedAfter } = await import('../src/control/outputRecovery.ts');
const { airAtRequest, claimAndApply, seedFromResolve } = await import('../src/control/airState.ts');
const { withLiveCue } = await import('../src/control/liveCue.ts');
const { PRESS_HOLD_MS, PRESS_DRAW_MS } = await import('../src/control/panelFeedback.ts');
const { PanelClient, RESULT_MS } = await import('../companion-module/src/panel.ts');
const { pressGraphicKey } = await import('../companion-module/src/actions.ts');

/** Let every hop run: microtasks, the page's zero-delay publishes, the relay's deliveries. */
async function drain() {
  for (let i = 0; i < 40; i++) await new Promise((resolve) => setImmediate(resolve));
}
function held() {
  let resolve, reject;
  const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

/** The module's clock, moved by hand. The page's clock and timers (its draw gap and its bound) are
 *  the test's mocked `Date` and `setInterval`, moved with it: `page` ticks them in gap-sized steps,
 *  each drained, so a press let go by a gap meets a page that has drawn the press before it. */
class HandClock {
  t = 1_000_000;
  timers = [];
  next = 1;
  constructor(test) {
    this.page = async (ms) => {
      while (ms > 0) {
        const step = Math.min(ms, PRESS_DRAW_MS);
        test.mock.timers.tick(step);
        ms -= step;
        await drain();
      }
    };
  }
  now = () => this.t;
  setTimeout = (fn, ms) => {
    const id = this.next++;
    this.timers.push({ at: this.t + ms, fn, id });
    return id;
  };
  clearTimeout = (id) => (this.timers = this.timers.filter((x) => x.id !== id));
  async advance(ms) {
    const end = this.t + ms;
    for (;;) {
      this.timers.sort((a, b) => a.at - b.at);
      const due = this.timers[0];
      if (!due || due.at > end) break;
      this.timers.shift();
      await this.page(due.at - this.t);
      this.t = due.at;
      due.fn();
      await drain();
    }
    await this.page(end - this.t);
    this.t = end;
    await drain();
  }
}

/**
 * THE RELAY: one in-memory broadcast hub standing in for Supabase Realtime, the page's RPCs, and
 * `panel_press` (0103: the press forwarded as `{v, verb, target, seen, press_id, claim, panel, cap,
 * instance, args}` on the claim's press topic). Each broadcast is delivered on its own immediate,
 * in send order, as a channel does. `faults` shapes what a press call does.
 */
function relayHub() {
  const CLAIM = 7;
  const topics = new Map();
  const deliver = (topic, event, payload, from) => {
    for (const sub of topics.get(topic) ?? []) {
      if (sub === from) continue;
      for (const [ev, fn] of sub.handlers) if (ev === '*' || ev === event) setImmediate(() => fn({ event, payload: structuredClone(payload) }));
    }
  };
  const join = (topic) => {
    const sub = { topic, handlers: [] };
    topics.set(topic, [...(topics.get(topic) ?? []), sub]);
    return sub;
  };
  const faults = { lostAck: new Set(), doubled: new Set(), lostResult: new Set(), lostSettled: new Set() };
  let pressCalls = 0;
  /** What the page's client (`getSupabase()`) sees. */
  const backend = {
    rpc: async (name) => {
      if (name === 'panel_lease') return { data: { ok: true, claim: CLAIM, press_topic: 'pnp-t', feedback_topic: 'pfb-t' }, error: null };
      if (name === 'panel_relay') return { data: { ok: true, verbs: ['graphic-action'] }, error: null };
      return { data: { ok: true }, error: null };
    },
    channel: (topic) => {
      const sub = join(topic);
      return {
        on: (_type, filter, fn) => (sub.handlers.push([filter.event, fn]), undefined),
        subscribe: (cb) => setImmediate(() => cb?.('SUBSCRIBED')),
        send: async ({ event, payload }) => {
          // A `result` the network loses (the module then hears only `settled`).
          if (event === 'result' && faults.lostResult.has(payload.id)) return;
          if (event === 'settled' && faults.lostSettled.has(payload.id)) return;
          deliver(topic, event, payload, sub);
        },
      };
    },
    removeChannel: async (ch) => ch,
  };
  /** What the module's `Relay` does. */
  const forward = (press) =>
    deliver('pnp-t', 'press', {
      v: press.v,
      verb: press.verb,
      target: press.target,
      seen: press.seen,
      press_id: press.id,
      claim: CLAIM,
      panel: { id: 'k1', label: 'Deck' },
      cap: press.cap,
      instance: press.instance,
      args: press.args ?? {},
    });
  const relay = {
    pairFinish: async () => ({ ok: false, refused: 'unknown-code' }),
    hello: async () => ({ ok: true, key_id: 'k1', label: 'Deck', title: 'Match', feedback_topic: 'pfb-t', answering: true }),
    press: async (_key, press) => {
      const n = ++pressCalls;
      forward(press);
      // Realtime delivers the same press twice.
      if (faults.doubled.has(n)) forward(press);
      // Reached the page, but the answer to the call is lost: the module retries with the same id.
      if (faults.lostAck.has(n)) throw new Error('the connection dropped');
      return { ok: true, claim: CLAIM };
    },
    listen: (topic, onEvent, onStatus) => {
      const sub = join(topic);
      sub.handlers.push(['*', (m) => onEvent(m.event, m.payload)]);
      setImmediate(() => onStatus('joined'));
      return () => topics.set(topic, (topics.get(topic) ?? []).filter((s) => s !== sub));
    },
    close: async () => {},
  };
  return { backend, relay, faults, pressCalls: () => pressCalls };
}

const NO_CLOCKS = { clocks: new Map(), pairs: new Map() };

/**
 * THE PRODUCTION PAGE as it answers a panel: one session, the real verbs, a pinned score banner
 * live on its layer, and the wire to the command log. On the slow road air's record moves only
 * when a row is heard back (`hear`). Each send is appended to the log at once (the order the server
 * commits them); its answer is held until the test lands it.
 */
function productionPage() {
  const session = createPlayoutSession('p1');
  let cues = [{ id: 'b1', sourceId: 'g-Score', label: 'B1', graphic: 'Score', values: { home: '7' } }];
  session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: withLiveCue(parts.air.liveCue, 'Score', 'b1'), aired: { Score: { home: '7' } } } }));
  const log = [];
  const sends = [];
  const fallbacks = [];
  const sender = {
    published: 'slug-1',
    showId: 'show-1',
    here: () => {},
    logSent: () => {},
    armSpecFor: () => null,
    applyHere: () => {},
    fastEvent: () => false,
    debts: () => ({ landed: () => (shown) => shown, failed: () => {}, owed: () => 0 }),
    outputUsable: () => true,
    sending: () => {},
    owed: () => {},
    loggedAt: () => {},
    noOutput: () => {},
    note: () => {},
  };
  const page = {
    graphics: [{ name: 'Score' }],
    get liveCue() {
      return session.air.get().liveCue;
    },
    get aired() {
      return session.air.get().aired;
    },
    get liveLayers() {
      return [{ graphic: 'Score' }];
    },
    livePlayoutLayers: [],
    graphicOf: (cue) => cue.graphic ?? null,
    cueView: (cue) => ({ values: { ...cue.values } }),
    resolvedOf: () => ({}),
    flush: () => Promise.resolve(),
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
    writeCue: (cueId, values) => (cues = cues.map((c) => (c.id === cueId ? { ...c, values: { ...c.values, ...values } } : c))),
    savedValues: () => undefined,
    writeLive: () => {},
    clearMisses: () => {},
    noteStep: () => {},
    stopFolders: () => {},
    outUnnamed: async () => {},
    clearThroughBridge: async (note) => note,
    clearing: () => {},
  };
  let oids = 0;
  const io = {
    sendControlVerbs: (opts) => {
      const items = opts.batches.flat();
      log.push(...items.map((item) => structuredClone(item)));
      const h = held();
      sends.push({ items, answer: h });
      return h.promise;
    },
    verbStale: (e) => e.stale === true,
    verbAired: (e) => e.aired === true,
    verbsLanded: (e) => e.landed ?? 0,
    verbsSkipped: (e) => e.skipped ?? [],
    verbSentItems: (e) => e.items ?? null,
    headsSay: () => null,
    headsStillOn: async () => [],
    adjustedValue: (current, delta) => String(Number(current ?? 0) + delta),
    movedKeys: () => [],
    pressSend: () => ({ fields: {}, tree: [] }),
    nameList: (names) => names.join(' and '),
    now: () => 1234,
    mintOid: () => `oid-${++oids}`,
    // The wait behind the press before it is released only when a test says the wire is that slow.
    setTimeout: (run) => (fallbacks.push(run), fallbacks.length),
    clearTimeout: () => {},
  };
  const verbs = createGraphicVerbs(session, io, () => sender, () => page);
  const machine = { buttons: [], descriptors: [], path: new Set(), legality: {} };
  /** Another pool graphic that comes and goes from the offer (a lower third taken and cleared),
   *  so the page republishes and counts its offer on between presses, as in a show. */
  let other = false;
  /** What a panel is offered, as the page's own block greys it (`graphicCapabilities`). */
  const offer = {
    list: () => {
      const live = session.air.get().liveCue.Score ?? null;
      const sel = liveSelection('Score', cues, session.air.get().liveCue);
      const caps = graphicCapabilities({
        graphic: 'Score',
        live,
        cue: sel.airCue?.label ?? null,
        arranged: { pinned: [], sections: [], more: [] },
        numbers: [{ key: 'home', label: 'Home' }],
        legal: () => true,
        stepping: sel.editingIsLive,
        aired: session.air.get().aired.Score ?? null,
        held: !!sel.airCue,
        foreign: { caps: [], refused: [] },
      });
      const score = { graphic: 'Score', pinned: true, live, cue: sel.airCue?.label ?? null, caps };
      const strap = { graphic: 'Strap', pinned: false, live: 's1', cue: 'S1', caps: [{ id: 'event:in', kind: 'event', label: 'In', place: 'section', args: null, allowed: true, invocable: true }] };
      return { graphics: other ? [score, strap] : [score] };
    },
    // As ProductionPage wires it: the one dispatcher, on the cue live on the graphic's layer.
    act: (run) => runCapability(run, machine, liveSelection(run.graphic, cues, session.air.get().liveCue), verbs),
  };
  /** Rows of the log heard back, as ProductionPage's `hearCommand` takes them. */
  const hear = (items) => {
    const rest = verbs.heard(items, (msg) => session.applied.has(msg));
    session.apply((parts) => ({ ...parts, air: claimAndApply(parts.air, rest, session.applied, NO_CLOCKS, 0).air }));
  };
  /** The output: the command log applied in its order. */
  const output = () => log.reduce((a, item) => airedAfter(a, item.graphic, item.msg), { Score: { home: '7' } }).Score.home;
  /** The session wire's resolve (sessionWire.ts `run`): asked now, answered by `answer(report)`
   *  with the renderer's report as it stood when asked, as `seedFromResolve` takes it. */
  const resolve = () => {
    const at = airAtRequest(session.air.get());
    return (report) =>
      session.apply((parts) => ({ ...parts, air: seedFromResolve(parts.air, { liveCue: { Score: 'b1' }, live: { Score: { data: report } } }, [], at, cues, NO_CLOCKS) }));
  };
  return { verbs, offer, hear, output, log, sends, fallbacks, resolve, cues: () => cues, toggleOther: () => (other = !other) };
}

/** A deck connected to an answering production page, both through the relay, on one clock. */
async function studio(t) {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: Date.now() });
  const hub = relayHub();
  globalThis.__panelBackend = hub.backend;
  const prod = productionPage();
  const reports = [];
  const answer = answerPanel({
    slug: 'slug-1',
    where: 'production',
    move: false,
    label: 'Production',
    snapshot: () => ({ title: 'Match', selected: null, space: null, live: ['b1'], allowed: {}, blocked: [], clip: null, bridge: 'ok', rows: [] }),
    runs: new Set(),
    run: () => {},
    actions: () => prod.offer,
    onStatus: () => {},
    onPress: (r) => reports.push(r),
  });
  const clock = new HandClock(t);
  const deck = new PanelClient({ relay: hub.relay, clock, instance: 'deck' });
  await deck.start({ key: 'ncpk_test', code: '', label: 'Deck' });
  await drain();
  // The page's claim, then its feed: the module's hello asks it to publish again.
  answer.changed();
  await drain();
  assert.equal(deck.status, 'ok', deck.note);
  assert.equal(deck.actionsNote, '', 'the deck holds the page\'s offer');
  const press = () => pressGraphicKey(deck, { graphic: 'Score', cap: 'step:home', delta: 1 });
  const done = () => {
    pagehide();
    void deck.stop();
    delete globalThis.__panelBackend;
  };
  return { hub, prod, deck, clock, press, reports, done, republish: () => answer.changed() };
}

/** The updates the log holds, as figures. */
const figures = (prod) => prod.log.filter((i) => i.msg.t === 'update').map((i) => i.msg.data.home);

/** Land the oldest send still out, and hear its rows when `hearNow`. Returns the rows. */
async function landNext(prod, landed, hearNow) {
  const send = prod.sends[landed];
  send.answer.resolve({ skipped: [], superseded: [], pressedAgain: [] });
  await drain();
  if (hearNow) prod.hear(send.items);
  await drain();
  return send.items;
}

/** Land the sends of `n` quick presses, and hear their rows, as each goes out: the page lets each
 *  press go one draw gap after the one before it (issue #2144). */
async function landEach(s, n) {
  for (let i = 0; i < n; i++) {
    await s.clock.advance(PRESS_DRAW_MS);
    await landNext(s.prod, i, true);
  }
}

/** The ways the slow road can hear its rows back against the next press. */
const ROWS = {
  'each row heard at its answer': 0,
  'each row heard one answer late': 1,
  'every row heard only after the last answer': Infinity,
};

for (const n of [3, 5]) {
  for (const [how, lag] of Object.entries(ROWS)) {
    test(`${n} quick +1 presses from the deck add exactly ${n} points (${how})`, async (t) => {
      const s = await studio(t);
      try {
        // Pressed back to back: none waits for the one before it to be answered.
        const outcomes = Array.from({ length: n }, () => s.press());
        await drain();
        assert.equal(s.hub.pressCalls(), n, 'every press left the deck');
        assert.equal(s.prod.sends.length, 1, 'the page sends one at a time per graphic');
        const unheard = [];
        for (let i = 0; i < n; i++) {
          // The send for press i is out (the page lets each press go one draw gap after the one
          // before it, issue #2144); land it.
          await s.clock.advance(PRESS_DRAW_MS);
          assert.equal(s.prod.sends.length, i + 1, `press ${i + 1} is the one out`);
          unheard.push(await landNext(s.prod, i, false));
          while (unheard.length > lag) s.prod.hear(unheard.shift());
          await drain();
        }
        for (const rows of unheard) s.prod.hear(rows);
        await drain();
        await s.clock.advance(RESULT_MS);
        const said = await Promise.all(outcomes);
        assert.deepEqual(figures(s.prod), Array.from({ length: n }, (_, i) => String(8 + i)), 'one update per press, each one more');
        assert.equal(s.prod.output(), String(7 + n), `the output shows ${7 + n}`);
        assert.equal(s.prod.cues()[0].values.home, String(7 + n), 'the cue keeps what aired');
        assert.ok(said.every((o) => o.ok), said.map((o) => o.sentence).join(' / '));
        assert.deepEqual(s.reports.filter((r) => !r.settled).map((r) => r.verdict.outcome), Array(n).fill('ran'));
        assert.deepEqual(s.reports.filter((r) => r.settled).map((r) => r.settled.outcome), Array(n).fill('accepted'));
      } finally {
        s.done();
      }
    });
  }
}

for (const superseded of [false, true]) {
  test(`5 quick +1 presses add exactly 5 when the wire is slow enough that the wait behind each press runs out${superseded ? ', and the server refuses the first send\'s late commit as superseded' : ''}`, async (t) => {
    const s = await studio(t);
    try {
      const outcomes = Array.from({ length: 5 }, () => s.press());
      await drain();
      // The first send hangs: every later press, let go one draw gap after the one before it, is let
      // go by its fallback and counts from what was sent.
      for (let i = 1; i < 5; i++) {
        await s.clock.advance(PRESS_DRAW_MS);
        while (s.prod.fallbacks.length > 0) {
          s.prod.fallbacks.shift()();
          await drain();
        }
      }
      assert.equal(s.prod.sends.length, 5);
      for (let i = 1; i < 5; i++) await landNext(s.prod, i, false);
      if (superseded) {
        // The abandoned first send commits after the newer ones and the server refuses it
        // (protocol 2, migration 0071): it never reaches the log, and the newer figures carry its point.
        const first = s.prod.log.findIndex((item) => item.msg.oid === s.prod.sends[0].items[0].msg.oid);
        assert.ok(first >= 0);
        s.prod.log.splice(first, 1);
        s.prod.sends[0].answer.resolve({ skipped: [], superseded: ['Score'], pressedAgain: [] });
        await drain();
      } else await landNext(s.prod, 0, false);
      for (const send of s.prod.sends.slice(superseded ? 1 : 0)) s.prod.hear(send.items);
      await drain();
      await s.clock.advance(RESULT_MS);
      await Promise.all(outcomes);
      assert.deepEqual(figures(s.prod), superseded ? ['9', '10', '11', '12'] : ['8', '9', '10', '11', '12']);
      assert.equal(s.prod.output(), '12');
      assert.equal(s.prod.cues()[0].values.home, '12', 'the cue keeps what aired');
    } finally {
      s.done();
    }
  });
}

test('5 +1 presses spaced between landings, with the offer republished between them and one press drawn from an older offer, add exactly 6', async (t) => {
  const s = await studio(t);
  try {
    const drawnAt = s.deck.actions.actionsVer;
    for (let i = 0; i < 5; i++) {
      const out = s.press();
      await drain();
      await landNext(s.prod, i, true);
      await s.clock.advance(RESULT_MS);
      assert.equal((await out).ok, true, `press ${i + 1}`);
      // Something else on the page moves its offer on before the next press.
      s.prod.toggleOther();
      s.republish();
      await drain();
    }
    assert.ok(s.deck.actions.actionsVer >= drawnAt + 5, 'the offer was republished between presses');
    // A key drawn five offers ago, pressed now (a deck that missed the republishes): still this
    // graphic's +1 on the same cue, so it runs, once.
    s.hub.relay.press('ncpk_test', { v: 2, verb: 'graphic-action', target: 'Score', seen: drawnAt, id: 'deck:old', cap: 'step:home', instance: 'b1', args: { delta: 1 } });
    await drain();
    await landNext(s.prod, 5, true);
    assert.deepEqual(figures(s.prod), ['8', '9', '10', '11', '12', '13']);
    assert.equal(s.prod.output(), '13');
    assert.equal(s.prod.cues()[0].values.home, '13');
  } finally {
    s.done();
  }
});

test('a press whose acknowledgement is lost is retried with its id and never adds a second point', async (t) => {
  const s = await studio(t);
  try {
    // The first and third presses reach the page and lose the answer to their call; the module
    // retries each once with its id (calls 4 and 5, after the three first calls).
    s.hub.faults.lostAck.add(1).add(3);
    const outcomes = Array.from({ length: 3 }, () => s.press());
    await drain();
    assert.equal(s.hub.pressCalls(), 5, 'three presses, two of them sent again');
    await landEach(s, 3);
    await s.clock.advance(RESULT_MS);
    const said = await Promise.all(outcomes);
    assert.deepEqual(figures(s.prod), ['8', '9', '10']);
    assert.equal(s.prod.output(), '10');
    assert.deepEqual(s.reports.filter((r) => !r.settled).map((r) => r.verdict.outcome), ['ran', 'ran', 'ran'], 'the page ran each id once');
    assert.ok(said.every((o) => o.ok), said.map((o) => o.sentence).join(' / '));
  } finally {
    s.done();
  }
});

test('a press delivered twice, or whose result is lost, runs once and is never sent again', async (t) => {
  const s = await studio(t);
  try {
    s.hub.faults.doubled.add(1).add(3);
    s.hub.faults.lostResult.add('deck:2');
    const outcomes = Array.from({ length: 3 }, () => s.press());
    await drain();
    await landEach(s, 3);
    // Long past every wait: the module never sends a press again on its own.
    await s.clock.advance(60_000);
    const said = await Promise.all(outcomes);
    assert.equal(s.hub.pressCalls(), 3);
    assert.deepEqual(figures(s.prod), ['8', '9', '10']);
    assert.equal(s.prod.output(), '10');
    // The press whose result was lost still says what it came to, from `settled`.
    assert.ok(said.every((o) => o.ok), said.map((o) => o.sentence).join(' / '));
  } finally {
    s.done();
  }
});

test('a press sent again after it was answered, however late, is answered duplicate and adds nothing', async (t) => {
  const s = await studio(t);
  try {
    const first = s.press();
    await drain();
    await landNext(s.prod, 0, true);
    await s.clock.advance(RESULT_MS);
    assert.equal((await first).ok, true);
    // The same press, as the deck sent it, arrives again (a stalled call the network let through
    // late): judged afresh it would still run, so only its id stops it.
    const seen = s.deck.actions.actionsVer;
    s.hub.relay.press('ncpk_test', { v: 2, verb: 'graphic-action', target: 'Score', seen, id: 'deck:1', cap: 'step:home', instance: 'b1', args: { delta: 1 } });
    await drain();
    assert.equal(s.prod.sends.length, 1, 'nothing more was sent');
    assert.deepEqual(s.reports.filter((r) => !r.settled).map((r) => r.verdict.outcome), ['ran'], 'the page ran it once');
    assert.deepEqual(figures(s.prod), ['8']);
    assert.equal(s.prod.output(), '8');
  } finally {
    s.done();
  }
});

test('a press the deck hears nothing back for says so and is never sent again', async (t) => {
  const s = await studio(t);
  try {
    // Both of the page's answers to the second press are lost: it ran, and the deck cannot know.
    s.hub.faults.lostResult.add('deck:2');
    s.hub.faults.lostSettled.add('deck:2');
    const outcomes = Array.from({ length: 3 }, () => s.press());
    await drain();
    await landEach(s, 3);
    await s.clock.advance(60_000);
    const said = await Promise.all(outcomes);
    assert.equal(s.hub.pressCalls(), 3, 'nothing was sent again');
    assert.deepEqual(figures(s.prod), ['8', '9', '10']);
    assert.equal(s.prod.output(), '10');
    assert.equal(said[1].ok, false);
    assert.equal(said[1].sentence, 'No answer from the operator page');
  } finally {
    s.done();
  }
});

test('3 quick +1 presses add exactly 3 when the page\'s resolve, asked before the first landed, answers after it with the older report', async (t) => {
  const s = await studio(t);
  try {
    // The page (re)opens its wire: the read of the output's report is out.
    const answer = s.prod.resolve();
    const outcomes = Array.from({ length: 3 }, () => s.press());
    await drain();
    await landNext(s.prod, 0, true);
    // The read comes back with the report as it was asked: 7, before the first +1.
    answer({ home: '7' });
    await drain();
    for (let i = 1; i < 3; i++) {
      await s.clock.advance(PRESS_DRAW_MS);
      await landNext(s.prod, i, true);
    }
    await s.clock.advance(RESULT_MS);
    await Promise.all(outcomes);
    assert.deepEqual(figures(s.prod), ['8', '9', '10']);
    assert.equal(s.prod.output(), '10');
    assert.equal(s.prod.cues()[0].values.home, '10');
  } finally {
    s.done();
  }
});

// ── THE ORDER OF PRESSES (issue #2109) ───────────────────────────────────────────────────────────
//
// Each press is its own relay call and broadcast, so the later of two quick presses can reach the
// page first. The cases above are unchanged; these drive the same module, relay and page with the
// relay's delivery moved. The module is the one on a deck today: its press carries only what 0.2.0
// sends, and the page numbers presses by the press id that has always carried a counter. Each case
// presses once first, because the first press a page hears from a panel sets the count. The page's
// timers are moved by hand, as the module's clock is.

/** The relay calls of these press ids wait until `release(id)`: later presses overtake them. */
function holdBack(s, ...ids) {
  const real = s.hub.relay.press;
  const gates = new Map(ids.map((id) => [id, held()]));
  s.hub.relay.press = async (key, press) => {
    await gates.get(press.id)?.promise;
    return real(key, press);
  };
  return (id) => gates.get(id).resolve();
}
/** These press ids are accepted by the relay and never reach the page. */
function lose(s, ...ids) {
  const real = s.hub.relay.press;
  s.hub.relay.press = async (key, press) => (ids.includes(press.id) ? { ok: true, claim: 7 } : real(key, press));
}
const minusOne = (s) => pressGraphicKey(s.deck, { graphic: 'Score', cap: 'step:home', delta: -1 });

/** The deck's first press, on the air and answered: the page knows the deck's count from here. */
async function firstPress(s) {
  const out = s.press();
  await drain();
  await landNext(s.prod, 0, true);
  await s.clock.advance(RESULT_MS);
  assert.equal((await out).ok, true);
}

/** Let the gap between two presses let go together pass. */
async function drawGap(t) {
  t.mock.timers.tick(PRESS_DRAW_MS);
  await drain();
}

/** A deck and an answering page whose keys are three cues of one graphic. The page is as a real one:
 *  a press changes what it shows only when it next draws, a task after the press ran. */
async function cueStudio(t) {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: Date.now() });
  const hub = relayHub();
  globalThis.__panelBackend = hub.backend;
  const ran = [];
  const sent = [];
  let drawn = [];
  const answer = answerPanel({
    slug: 'slug-2',
    where: 'production',
    move: false,
    label: 'Production',
    snapshot: () => ({
      title: 'Match',
      selected: null,
      space: null,
      live: drawn,
      allowed: {},
      blocked: [],
      clip: null,
      bridge: 'ok',
      rows: ['cara', 'anna', 'ben'].map((id) => ({ id, label: id, kind: 'cue', source: 'graphic' })),
    }),
    runs: new Set(['take-cue']),
    run: (_verb, target) => {
      ran.push(target);
      setImmediate(() => {
        drawn = [target];
        answer.changed();
      });
    },
    onStatus: () => {},
    onPress: () => {},
  });
  const clock = new HandClock(t);
  const deck = new PanelClient({ relay: hub.relay, clock, instance: 'deck' });
  const real = hub.relay.press;
  hub.relay.press = (key, press) => (sent.push(press), real(key, press));
  await deck.start({ key: 'ncpk_test', code: '', label: 'Deck' });
  await drain();
  answer.changed();
  await drain();
  assert.equal(deck.status, 'ok', deck.note);
  const done = () => {
    pagehide();
    void deck.stop();
    delete globalThis.__panelBackend;
  };
  const warmed = async () => {
    await deck.press('take-cue', 'cara');
    await drain();
    assert.deepEqual(ran, ['cara']);
    // The page has drawn it before the next press.
    await clock.advance(PRESS_DRAW_MS);
  };
  return { hub, deck, ran, sent, done, warmed };
}

test('a pick and then a reveal that reach the page reversed run in the order they were pressed', async (t) => {
  const s = await cueStudio(t);
  try {
    await s.warmed();
    const release = holdBack(s, 'deck:2');
    const pick = s.deck.press('take-cue', 'anna');
    const reveal = s.deck.press('take-cue', 'ben');
    await drain();
    assert.deepEqual(s.ran, ['cara'], 'the reveal waits for the pick');
    release('deck:2');
    await drain();
    assert.deepEqual(s.ran, ['cara', 'anna'], 'the pick runs as it is heard');
    await drawGap(t);
    assert.deepEqual(s.ran, ['cara', 'anna', 'ben'], 'in press order, with what was pressed last on air');
    assert.deepEqual((await Promise.all([pick, reveal])).map((o) => o.ok), [true, true]);
    // What the Companion module 0.2.0 on a deck sends: no field beyond these.
    for (const press of s.sent) assert.deepEqual(Object.keys(press).sort(), ['id', 'seen', 'target', 'verb']);
  } finally {
    s.done();
  }
});

test('a press let go after the one before it is judged against what that one drew', async (t) => {
  const s = await cueStudio(t);
  try {
    await s.warmed();
    const release = holdBack(s, 'deck:2');
    // One key, pressed twice, both drawn with Anna off air: the second must see her on air.
    const first = s.deck.press('take-cue', 'anna');
    const second = s.deck.press('take-cue', 'anna');
    await drain();
    release('deck:2');
    await drain();
    await drawGap(t);
    assert.deepEqual(s.ran, ['cara', 'anna'], 'the second is refused, not run on a page that has not drawn the first');
    const [one, two] = await Promise.all([first, second]);
    assert.equal(one.result.outcome, 'ran');
    assert.equal(two.result.outcome, 'stale');
  } finally {
    s.done();
  }
});

test('a press heard straight after the one before it, in order, is judged against what that one drew (issue #2144)', async (t) => {
  const s = await cueStudio(t);
  try {
    await s.warmed();
    // One key, pressed twice, both drawn with Anna off air, reaching the page in order and back to
    // back, before it draws the first.
    const first = s.deck.press('take-cue', 'anna');
    const second = s.deck.press('take-cue', 'anna');
    await drain();
    assert.deepEqual(s.ran, ['cara', 'anna'], 'the second waits for the page to draw the first');
    await drawGap(t);
    assert.deepEqual(s.ran, ['cara', 'anna'], 'then it is refused, not run on a page that has not drawn the first');
    const [one, two] = await Promise.all([first, second]);
    assert.equal(one.result.outcome, 'ran');
    assert.equal(two.result.outcome, 'stale');
  } finally {
    s.done();
  }
});

test('a reversed +1 and -1 each have their one effect, in the order they were pressed', async (t) => {
  const s = await studio(t);
  try {
    await firstPress(s);
    const release = holdBack(s, 'deck:2');
    const outcomes = [s.press(), minusOne(s)];
    await drain();
    assert.equal(s.prod.sends.length, 1, 'the second waits for the first');
    release('deck:2');
    await drain();
    await landNext(s.prod, 1, true);
    await drawGap(t);
    await landNext(s.prod, 2, true);
    await s.clock.advance(RESULT_MS);
    await Promise.all(outcomes);
    assert.deepEqual(figures(s.prod), ['8', '9', '8']);
    assert.equal(s.prod.output(), '8');
    assert.deepEqual(s.reports.filter((r) => !r.settled).map((r) => r.verdict.outcome), ['ran', 'ran', 'ran']);
  } finally {
    s.done();
  }
});

test('five +1 presses arriving in any order add exactly five, each once, whatever is delivered twice', async (t) => {
  const s = await studio(t);
  try {
    await firstPress(s);
    const release = holdBack(s, 'deck:2', 'deck:3', 'deck:5');
    const outcomes = Array.from({ length: 5 }, () => s.press());
    await drain();
    assert.equal(s.prod.sends.length, 1, 'presses 4 and 6 wait');
    // The relay's calls so far: the first press, then presses 4 and 6. The next two, presses 5 and 3
    // released below, are delivered twice while they are held.
    s.hub.faults.doubled.add(4).add(5);
    for (const id of ['deck:5', 'deck:3', 'deck:2']) {
      release(id);
      await drain();
    }
    for (let i = 1; i < 6; i++) {
      await landNext(s.prod, i, true);
      await drawGap(t);
    }
    await s.clock.advance(RESULT_MS);
    await Promise.all(outcomes);
    assert.deepEqual(figures(s.prod), ['8', '9', '10', '11', '12', '13']);
    assert.equal(s.prod.output(), '13');
    assert.deepEqual(s.reports.filter((r) => !r.settled).map((r) => r.verdict.outcome), Array(6).fill('ran'));
  } finally {
    s.done();
  }
});

test('a press that never arrives holds the next one for the bound only, and the presses after it not at all', async (t) => {
  const s = await studio(t);
  try {
    await firstPress(s);
    lose(s, 'deck:2');
    const lost = s.press();
    const third = s.press();
    await drain();
    assert.equal(s.prod.sends.length, 1, 'the third waits for the second');
    t.mock.timers.tick(PRESS_HOLD_MS - 1);
    await drain();
    assert.equal(s.prod.sends.length, 1, 'still inside the bound');
    t.mock.timers.tick(1);
    await drain();
    assert.equal(s.prod.sends.length, 2, 'the bound ran out: the third runs');
    await landNext(s.prod, 1, true);
    // The count moved past the lost press: the next press, once the page has drawn the third, is in
    // its turn again.
    await drawGap(t);
    const fourth = s.press();
    await drain();
    assert.equal(s.prod.sends.length, 3, 'the fourth runs as it is heard');
    await landNext(s.prod, 2, true);
    await s.clock.advance(RESULT_MS);
    await Promise.all([lost, third, fourth]);
    assert.deepEqual(figures(s.prod), ['8', '9', '10']);
    assert.equal(s.prod.output(), '10');
  } finally {
    s.done();
  }
});

test('a press arriving after the bound ran out still adds its one point', async (t) => {
  const s = await studio(t);
  try {
    await firstPress(s);
    const release = holdBack(s, 'deck:2');
    const outcomes = [s.press(), s.press()];
    await drain();
    t.mock.timers.tick(PRESS_HOLD_MS);
    await drain();
    assert.equal(s.prod.sends.length, 2, 'the bound let the later press go');
    await landNext(s.prod, 1, true);
    release('deck:2');
    await drain();
    await landNext(s.prod, 2, true);
    await s.clock.advance(RESULT_MS);
    await Promise.all(outcomes);
    assert.deepEqual(figures(s.prod), ['8', '9', '10']);
    assert.equal(s.prod.output(), '10');
    assert.deepEqual(s.reports.filter((r) => !r.settled).map((r) => r.verdict.outcome), ['ran', 'ran', 'ran']);
  } finally {
    s.done();
  }
});

test('a press on its own runs as it is heard: nothing has to tick for it', async (t) => {
  const s = await studio(t);
  try {
    for (let i = 0; i < 3; i++) {
      const out = s.press();
      await drain();
      assert.equal(s.prod.sends.length, i + 1, `press ${i + 1} went straight to the send`);
      await landNext(s.prod, i, true);
      await s.clock.advance(RESULT_MS);
      assert.equal((await out).ok, true);
    }
    assert.deepEqual(figures(s.prod), ['8', '9', '10']);
  } finally {
    s.done();
  }
});

test('the first press a page hears from a deck that has pressed before never waits for the numbers it missed', async (t) => {
  const s = await cueStudio(t);
  try {
    // The module has been up for a while: this page has never heard its earlier presses.
    await s.hub.relay.press('ncpk_test', { verb: 'take-cue', target: 'anna', seen: s.deck.state.ver, id: 'deck:57' });
    await drain();
    assert.deepEqual(s.ran, ['anna']);
  } finally {
    s.done();
  }
});

test('a page that stops answering runs nothing it was still holding', async (t) => {
  const s = await cueStudio(t);
  try {
    await s.warmed();
    const release = holdBack(s, 'deck:2');
    void s.deck.press('take-cue', 'anna');
    void s.deck.press('take-cue', 'ben');
    await drain();
    assert.deepEqual(s.ran, ['cara']);
    pagehide();
    release('deck:2');
    await drain();
    t.mock.timers.tick(PRESS_HOLD_MS);
    await drain();
    assert.deepEqual(s.ran, ['cara']);
  } finally {
    s.done();
  }
});
