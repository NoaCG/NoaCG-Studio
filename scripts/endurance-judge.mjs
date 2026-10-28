// THE ENDURANCE VERDICT (docs/work-specs/playout-expanded-acceptance/spec.md, phase E8.1b): every
// check of the operating envelope, read from the record e2e/endurance/election-endurance.ts writes.
// Pure, so scripts/endurance-judge.test.mjs turns each check red with the defect it names.
//
// Ceilings. Parent §7's thresholds compare a repeat with the owner's laptop baselines; they cannot
// be compared on an Actions runner, so they stay the laptop's (O-1). The absolute bounds here are
// the ones E7.2b's rehearsal walk fails at: a bound field on air within 10 s of the provider's move,
// a candidates-only change within 13 s; a Take on air within 10 s. Samples taken inside a fault's
// window (Pause, a reload until the next Take, an output disconnect and its recovery, a handover)
// are reported but held to the recovery checks instead.

import { STEP_MS, candidates, countedAt, partyRevision, revisionOf, schedule as planOf, stepOfRevision } from './endurance-fixture.mjs';

const GRACE_MS = 5_000;
const RECOVER_MS = 20_000;
const CEILING = { dispatch: 10_000, bound: 10_000, candidates: 13_000 };
const ELECTION = ['Party totals', 'Count bug', 'Ticker', 'Candidate card'];
/** Every graphic the walk puts on air once for the whole run (the card takes turns, Board takes
 *  the foreign actions). */
const STEADY = ['Party totals', 'Count bug', 'Ticker', 'Scoreboard', 'Club Scorebug', 'House Scorebug', 'Arena Quiz'];
const MOVES = new Set(['play', 'stop', 'next', 'snap', 'event']);
/** Refusals the run causes on purpose: the 5 s gap (and the wait it asks for), a Pause, and an
 *  old owner or a waiting new one around a handover. */
const EXPECTED_REFUSALS = /not taken \((?:\d{3} )?(?:too_soon|paused|moved|epoch)\)|waiting as the production asked|not claimed \(409 held by another agent\)/;
/** What an old owner woken after the new claim answers: it is refused, as owner and as claimant. */
const OLD_OWNER_REFUSED = /not taken \((?:409 )?(?:moved|epoch)\)|not claimed \(409 held by another agent\)/;
/** Lines that say something was not taken or failed to reach the production. */
const REFUSAL = / not taken \(| not claimed \(| renewal failed| claim failed| the sender failed| waiting as the production asked/;
const MIB = 1024 * 1024;
/** What this run does not measure, said in every verdict so a green run is not read as more. */
export const UNMEASURED = [
  'a leak slower than its allowance that a cycle\'s controller reload or agent restart clears: each lifetime is about ten minutes (judged within each lifetime); only the output page lives the whole run',
  'the Vite dev server that hosts /api/data/source (its memory and request backlog)',
  'Postgres and the rest of the local Supabase stack',
  'the replay server, which runs inside the walk\'s own process (its memory is recorded as driver.rss, not judged)',
  'the output page\'s own request backlog (the controller\'s tree reads are judged)',
  'parent §7\'s laptop timing comparison, which needs the owner\'s laptop baselines (O-1)',
];

/** The largest of `xs`, or `floor` when empty (no spread: an hour's frames are many). */
const most = (xs, floor = 0) => xs.reduce((a, b) => (b > a ? b : a), floor);
/** The least-squares slope of [x, y] points, or 0 with fewer than two. */
function slope(points) {
  if (points.length < 2) return 0;
  const mx = points.reduce((a, [x]) => a + x, 0) / points.length;
  const my = points.reduce((a, [, y]) => a + y, 0) / points.length;
  const sxx = points.reduce((a, [x]) => a + (x - mx) ** 2, 0);
  return sxx ? points.reduce((a, [x, y]) => a + (x - mx) * (y - my), 0) / sxx : 0;
}
/** The areas counted in a count bug's text ("12 of 100 areas counted"), or null. */
const areas = (text) => {
  const m = /^(\d+) of 100 areas counted$/.exec(text ?? '');
  return m ? Number(m[1]) : null;
};
const num = (text) => (typeof text === 'string' && /^[\d,]+$/.test(text) ? Number(text.replace(/,/g, '')) : null);
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : null;
};
export function stats(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const at = (q) => (s.length ? s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)] : null);
  return { n: s.length, p50: at(0.5), p90: at(0.9), max: s.at(-1) ?? null, slowest: s.slice(-3).reverse() };
}

/** The windows in which a timing is a recovery, not a steady sample. */
function faultWindows(record) {
  const takes = (record.takes ?? []).filter((t) => t.key && t.at);
  return (record.faults ?? []).map((f) => {
    if (f.kind === 'reload') {
      // A reopened page holds what airs until the operator's next Take (D4).
      const next = takes.find((t) => t.clickAt >= (f.end ?? f.at));
      return { kind: f.kind, from: f.at, to: (next?.at ?? f.end ?? f.at) + RECOVER_MS };
    }
    return { kind: f.kind, from: f.at, to: (f.end ?? f.at) + RECOVER_MS };
  });
}
const inside = (windows, t) => windows.some((w) => t >= w.from && t <= w.to);

export function judge(record) {
  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), ...(detail ? { detail } : {}) });
  const plan = record.schedule ?? planOf(record.minutes);
  const people = candidates();
  const byName = new Map(people.map((p) => [p.name, p]));
  const byKey = new Map(people.map((p) => [`${p.district}/${p.candidate}`, p]));
  const rows = record.rows ?? [];
  const frames = record.frames ?? [];
  const samples = record.samples ?? [];
  const reads = record.reads ?? [];
  const faults = record.faults ?? [];
  const windows = faultWindows(record);
  const t0 = record.t0 ?? 0;
  // The provider's revisions (the snapshot's accepted revision is the agent's own sequence, which a
  // new owner continues): the newest one the replay server served bounds every figure on air.
  const served = new Map((record.provider ?? []).map((s) => [s.name, s.at]));
  const maxRevision = most([...served.keys()].map((name) => Number(/^count-(\d+)$/.exec(name)?.[1] ?? 0)));

  // ── It ran ──
  check('the run lasted the minutes asked', record.end && t0 && record.end - t0 >= plan.totalMs, `${Math.round(((record.end ?? 0) - t0) / 1000)} s of ${plan.totalMs / 1000} s`);
  check('no unhandled error in the controller, the output or the driver', (record.errors ?? []).length === 0, JSON.stringify((record.errors ?? []).slice(0, 5)));
  const switches = (record.takes ?? []).filter((t) => t.key);
  check('every cue switch took', switches.length >= Math.floor(plan.totalMs / 15_000) && switches.every((t) => t.at && !t.failed), JSON.stringify(switches.filter((t) => t.failed).slice(0, 3)));
  const kinds = (k) => faults.filter((f) => f.kind === k);
  check('every scheduled fault ran to its end', ['pause', 'reload', 'disconnect', 'handover'].every((k) => kinds(k).length === plan.events.filter((e) => e.kind === k).length && kinds(k).every((f) => f.end)), JSON.stringify(faults.filter((f) => !f.end)));

  // ── The fixture and the ingress limits ──
  const fx = record.fixture ?? {};
  const bytes = most((record.snapshots ?? []).map((s) => s.bytes ?? 0));
  check('the fixture is 1,000 candidates measured inside the 256 KiB body cap before the run', fx.candidates === 1000 && fx.bodyBytes > 0 && fx.bodyBytes <= fx.capBytes && fx.jsonbBytes > 0 && fx.jsonbBytes <= fx.capBytes, `body ${fx.bodyBytes}, jsonb ${fx.jsonbBytes} of ${fx.capBytes}`);
  // A tripwire: the route refuses a larger revision before storing it, so the stored size cannot
  // exceed the cap; a refusal shows in the check below. Kept to report the largest size stored.
  check('every accepted revision stayed inside the ingress limit (holds by construction: the route refuses a larger one before storing it)', bytes > 0 && bytes <= (fx.capBytes ?? 262144), `largest ${bytes} bytes`);
  // A frozen agent's request in flight fails when it wakes: expected of that agent, after that moment.
  const woken = faults.filter((f) => f.kind === 'handover' && f.mode === 'crash');
  // A request it had in flight when frozen (a renewal, a claim or a report) fails as it wakes.
  const wokeLate = (r) => woken.some((f) => r.agent === f.from && r.at >= f.woke && /renewal failed|claim failed|the sender failed: fetch failed/.test(r.line));
  const unexpected = reads.filter((r) => REFUSAL.test(r.line) && !EXPECTED_REFUSALS.test(r.line) && !wokeLate(r));
  check('no revision was refused for size, budget or anything the run did not cause', unexpected.length === 0, unexpected.slice(0, 3).map((r) => r.line).join(' | '));
  // Served, then held: only an older step makes `stale` and only a malformed one `invalid`; a
  // duplicate is a repeat, which the agent reads as `unchanged` like any second read of a step.
  const statuses = new Set(reads.map((r) => /^\S+ election (\w+) accepted=/.exec(r.line)?.[1]).filter(Boolean));
  const servedKinds = new Set((record.provider ?? []).map((s) => /^(\w+)-/.exec(s.name)?.[1]));
  check('the provider\'s duplicate, older and malformed steps were each served and held', ['duplicate', 'older', 'malformed'].every((k) => servedKinds.has(k)) && ['unchanged', 'stale', 'invalid'].every((s) => statuses.has(s)), `served ${[...servedKinds].join(',')}; read ${[...statuses].join(',')}`);
  check('no credential in anything the agents wrote', record.credentialLeaked === false);

  // ── Wrong-person frames and mixed records ──
  const takes = switches.filter((t) => t.at).map((t) => ({ ...t, person: byKey.get(`${t.key[0]}/${t.key[1]}`) }));
  const disconnects = windows.filter((w) => w.kind === 'disconnect');
  const wrong = [];
  const mixed = [];
  for (const f of frames) {
    if (f.name) {
      const i = takes.findLastIndex((t) => t.at <= f.at);
      const now = takes[i];
      const before = takes[i - 1];
      // The previous person may linger while the new Take settles, longer if the output was offline.
      const settle = now ? Math.max(now.at + GRACE_MS, ...disconnects.filter((w) => now.at <= w.to && now.clickAt >= w.from - GRACE_MS).map((w) => w.to)) : 0;
      // Before the first switch's answer, or a Take still in flight, the first person is the one clicked.
      const pending = takes.find((t) => t.clickAt <= f.at && t.at > f.at);
      const allowed = new Set([now?.person?.name, pending?.person?.name, f.at <= settle ? before?.person?.name : undefined].filter(Boolean));
      if (!allowed.has(f.name)) wrong.push({ at: f.at - t0, name: f.name, expected: [...allowed] });
      const person = byName.get(f.name);
      const votes = num(f.votes);
      if (!person || (f.votes && (votes === null || revisionOf(person, votes, maxRevision + 1) === null))) mixed.push({ at: f.at - t0, name: f.name, votes: f.votes });
    }
    const kok = num(f.kok);
    if (f.kok && (kok === null || partyRevision('KOK', kok, maxRevision + 1) === null)) mixed.push({ at: f.at - t0, kok: f.kok });
  }
  // Counts only rise in this fixture, so a figure going down on air or in a row is an older
  // revision reaching it (the provider serves one late every 100 s).
  const fell = [];
  const watch = (list, key, value, where) => {
    const last = new Map();
    for (const x of list) {
      const v = value(x);
      if (v === null) continue;
      const k = key(x);
      if (last.has(k) && v < last.get(k)) fell.push({ where, at: x.at - t0, key: k, from: last.get(k), to: v });
      last.set(k, v);
    }
  };
  watch(frames, () => 'KOK', (f) => num(f.kok), 'output');
  watch(frames, () => 'counted', (f) => areas(f.counted), 'output');
  watch(frames, (f) => f.name, (f) => (f.name ? num(f.votes) : null), 'output');
  watch(rows.filter((r) => r.graphic === 'Party totals' && r.t === 'update' && r.at >= t0), () => 'KOK', (r) => num(r.data?.f8), 'rows');
  watch(rows.filter((r) => r.graphic === 'Candidate card' && r.t === 'update' && r.at >= t0), (r) => r.data?.f0, (r) => (r.data?.f0 ? num(r.data?.f2) : null), 'rows');
  check('no older revision reached air: no figure ever went down', fell.length === 0, JSON.stringify(fell.slice(0, 3)));
  check('the output showed frames of the card throughout', frames.filter((f) => f.name).length >= takes.length, `${frames.length} frames`);
  check('no wrong-person frame on the output', wrong.length === 0, JSON.stringify(wrong.slice(0, 3)));
  check('every figure on air is one person\'s at one revision', mixed.length === 0, JSON.stringify(mixed.slice(0, 3)));

  // ── What the renderers received ──
  // The output's own `live` reports are not commands; a Take writes its values as an update row in
  // the same moment as its play, so that row belongs to the Take it comes with.
  const card = rows.filter((r) => r.graphic === 'Candidate card' && r.t !== 'live');
  const plays = card.filter((r) => r.t === 'play');
  const takeRow = (r, i) => r.t === 'update' && card[i + 1]?.t === 'play' && card[i + 1].at - r.at <= 50;
  const takeRows = new Set(card.filter(takeRow).map((r) => r.id));
  check('one play row per candidate Take, never a duplicate', plays.length === switches.length, `${plays.length} plays for ${takes.length} Takes`);
  const badRows = [];
  let p = -1;
  for (const r of card) {
    if (r.t === 'play') p++;
    const owner = takeRows.has(r.id) ? p + 1 : p;
    if (r.t !== 'update' || owner < 0 || !takes[owner]) continue;
    const person = takes[owner].person;
    const votes = num(r.data?.f2);
    if ((r.data?.f0 !== undefined && r.data.f0 !== person.name) || (r.data?.f2 !== undefined && (votes === null || revisionOf(person, votes, maxRevision + 1) === null))) badRows.push({ id: r.id, data: r.data, expected: person.name });
  }
  check('every card update row carries the aired person at one revision', badRows.length === 0, JSON.stringify(badRows.slice(0, 3)));
  // Every graphic on air for the hour (the election ones, the scorebugs, the quiz, the foreign
  // Scoreboard): the card takes turns and Board takes its actions, so those two are judged apart.
  // Each was taken in the setup (where the scorebug's clock is also started); from the run's start
  // nothing may take, advance, reset or press any of them.
  const otherMoves = STEADY.map((g) => [g, rows.filter((r) => r.graphic === g && MOVES.has(r.t) && r.at >= t0).map((r) => r.t), rows.some((r) => r.graphic === g && r.t === 'play' && r.at < t0)]);
  check('nothing took, advanced or reset the other graphics after their one Take', otherMoves.every(([, ts, taken]) => taken && ts.length === 0), JSON.stringify(otherMoves.filter(([, ts, taken]) => !taken || ts.length)));
  // Board takes its foreign actions as presses (`event`); nothing may take, stop or reset it.
  const boardMoves = rows.filter((r) => r.graphic === 'Board' && r.at >= t0 && MOVES.has(r.t) && r.t !== 'event');
  check('nothing took, stopped or reset the foreign Board: only its actions', rows.some((r) => r.graphic === 'Board' && r.t === 'play' && r.at < t0) && boardMoves.length === 0, JSON.stringify(boardMoves.slice(0, 3)));
  const cardMoves = card.filter((r) => MOVES.has(r.t) && r.t !== 'play');
  check('nothing but the Takes moved the card', cardMoves.length === 0, JSON.stringify(cardMoves.slice(0, 3)));
  check('no update row carried the collection', rows.every((r) => r.t !== 'update' || !JSON.stringify(r.data ?? {}).includes('schemaRevision')));

  // ── Foreign actions through the negotiated, guarded route ──
  const actions = record.actions ?? [];
  const badActions = actions.filter((a) => a.failed || a.outcome !== 'ran' || a.settled !== 'accepted' || a.marksAfter !== a.marksBefore + 1);
  check('every foreign action ran once on the program instance', actions.length >= Math.floor((plan.totalMs - 30_000) / 60_000) && badActions.length === 0, JSON.stringify(badActions.slice(0, 3)));
  const dups = actions.filter((a) => a.duplicate);
  // From the fifth action on, every fifth is also sent twice and keyed to the cue not on air.
  const pairsDue = actions.length >= 5;
  check('a foreign action keyed to an instance not on air was refused', !pairsDue || (dups.length >= 1 && dups.every((a) => a.elsewhere?.outcome === 'stale' && /the cue on Board changed/.test(a.elsewhere.note ?? '') && a.elsewhere.marks === a.marksAfter)), JSON.stringify(dups.map((a) => a.elsewhere)));
  check('a foreign action sent twice with one id ran once', (!pairsDue || dups.length >= 1) && dups.every((a) => a.duplicate.outcome === 'duplicate' && a.duplicate.marks === a.marksAfter), JSON.stringify(dups.filter((a) => a.duplicate.outcome !== 'duplicate' || a.duplicate.marks !== a.marksAfter)));

  // ── Owners: no stale-owner write ──
  const snaps = record.snapshots ?? [];
  const backwards = snaps.filter((s, i) => i > 0 && (s.epoch < snaps[i - 1].epoch || s.revision < snaps[i - 1].revision));
  check('the source\'s owner epoch and accepted revision never went back', snaps.length > 0 && backwards.length === 0, JSON.stringify(backwards.slice(0, 3)));
  const handovers = kinds('handover');
  check('every handover moved the source to a newer owner', handovers.length > 0 && handovers.every((h) => h.epochAfter > h.epochBefore), JSON.stringify(handovers.map((h) => [h.epochBefore, h.epochAfter])));
  const crashes = handovers.filter((h) => h.mode === 'crash');
  // The old owner, woken after the new claim, tried and was refused; had it written, the epoch
  // above would have gone back.
  const late = (h) => reads.filter((r) => r.agent === h.from && r.at >= h.woke && OLD_OWNER_REFUSED.test(r.line)).length;
  const lateAccepted = crashes.filter((h) => !h.woke || !(h.claimed < h.woke) || late(h) === 0 || snaps.some((s) => s.at > h.woke && s.epoch < h.epochAfter));
  check('an old owner woken after a handover was refused, never written', crashes.length === plan.events.filter((e) => e.kind === 'handover' && e.mode === 'crash').length && lateAccepted.length === 0, JSON.stringify(lateAccepted.map((h) => ({ at: h.at - t0, refused: late(h) }))));

  // ── Pause and Resume ──
  const pauses = kinds('pause');
  const leaked = pauses.flatMap((f) => rows.filter((r) => ELECTION.includes(r.graphic) && r.t === 'update' && !takeRows.has(r.id) && r.at > f.paused + 500 && r.at < f.resuming));
  check('Pause held every graphic: no update row while paused', pauses.length > 0 && leaked.length === 0, JSON.stringify(leaked.slice(0, 3)));
  // Resume appends its final values in the same call: the data rows it wrote land with it.
  const resumed = pauses.map((f) => {
    // From the call to its answer: the rows it wrote, timed by the database on the same machine.
    const written = rows.filter((r) => r.t === 'update' && r.src === 'api' && r.at >= f.resuming - 50 && r.at <= (f.end ?? f.resuming) + 50);
    const perGraphic = Object.values(Object.groupBy(written, (r) => r.graphic)).map((xs) => xs.length);
    return { writes: f.resume?.writes, rows: written.length, most: most(perGraphic) };
  });
  check('Resume sent the final values once: one row per moved graphic, no more', pauses.length > 0 && pauses.every((f) => f.answer?.paused === true && f.resume?.paused === false) && resumed.every((x) => x.writes >= 1 && x.rows === x.writes && x.most === 1), JSON.stringify(resumed));

  // ── Output disconnect ──
  // Offline, the output must really stop hearing (else the fault proved nothing), then catch up.
  const recovered = kinds('disconnect').map((f) => {
    const before = most(frames.filter((x) => x.at <= f.at + 3_000 && x.kok).map((x) => num(x.kok)));
    const heard = frames.some((x) => x.at > f.at + 3_000 && x.at < f.end && num(x.kok) > before);
    const after = frames.find((x) => x.at > f.end && x.at <= f.end + RECOVER_MS && num(x.kok) > before);
    return { at: f.at - t0, ok: Boolean(after) && !heard, offline: !heard, ms: after ? after.at - f.end : null };
  });
  check('the output went dark offline and caught up within 20 s of every reconnect', recovered.length > 0 && recovered.every((r) => r.ok), JSON.stringify(recovered));

  // The scorebug's own clock, started before the run, keeps counting through it.
  const seconds = (text) => {
    const m = /^(?:(\d+):)?(\d+):(\d{2})$/.exec(text ?? '');
    return m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
  };
  const ticks = frames.filter((f) => f.at >= t0 && seconds(f.clock) !== null).map((f) => ({ at: f.at, s: seconds(f.clock) }));
  const clockBack = ticks.filter((x, i) => i > 0 && x.s < ticks[i - 1].s);
  const span = ticks.length ? ticks.at(-1).s - ticks[0].s : 0;
  const elapsed = ticks.length ? (ticks.at(-1).at - ticks[0].at) / 1000 : 0;
  // Read throughout: from the run's first half minute to its last, never a gap over half a minute.
  const gaps = ticks.filter((x, i) => i > 0 && x.at - ticks[i - 1].at > 30_000).length;
  const covered = ticks.length > 0 && ticks[0].at - t0 <= 30_000 && (record.end ?? 0) - ticks.at(-1).at <= 30_000;
  check('the scorebug\'s clock kept running through the run, never reset', covered && gaps === 0 && clockBack.length === 0 && span >= elapsed - 30, `${ticks.length} readings, ${span} s counted over ${Math.round(elapsed)} s, ${clockBack.length} backwards, ${gaps} gaps over 30 s${covered ? '' : ', not read from start to end'}`);

  // ── Queues and instances ──
  const steady = plan.windows.filter((w) => !w.warmup);
  const inWindow = (w) => samples.filter((s) => s.at - t0 >= w.from && s.at - t0 < w.to);
  const agentSamples = samples.filter((s) => s.agent);
  // Tripwires on the agent's structure: one shared read in flight, one kept revision, and one
  // snapshot row per source (its primary key). They report the shape and catch a regression in it.
  check('pending provider reads bounded to one per source (holds by construction: one shared read; peak since each sample)', agentSamples.length > 0 && agentSamples.every((s) => s.agent.reading <= 1), `${agentSamples.length} samples`);
  check('the agent\'s requests to the production stay bounded: a report, a renewal and a sample at most', agentSamples.every((s) => (s.agent.posting ?? 0) <= 3), JSON.stringify(agentSamples.filter((s) => s.agent.posting > 3).map((s) => [s.at - t0, s.agent.posting]).slice(0, 3)));
  check('buffered updates bounded to one latest snapshot (holds by construction: one kept revision, one snapshot row per source)', agentSamples.every((s) => s.agent.undelivered <= 1) && samples.every((s) => s.snapshots <= 1));
  const handoverAt = (s) => handovers.some((h) => s.at >= h.at && s.at <= (h.end ?? h.at));
  check('one agent alive outside a handover', samples.filter((s) => !handoverAt(s)).every((s) => s.agentsAlive === 1), JSON.stringify(samples.filter((s) => !handoverAt(s) && s.agentsAlive !== 1).map((s) => [s.at - t0, s.agentsAlive]).slice(0, 3)));
  const readsByWindow = steady.map((w) => most(inWindow(w).map((s) => s.stateReadsMax ?? 0)));
  const restsByWindow = steady.map((w) => inWindow(w).some((s) => (s.stateReadsInFlight ?? 0) === 0));
  check('the controller\'s tree reads in flight come back to none and do not grow', restsByWindow.every(Boolean) && (readsByWindow.length < 2 || readsByWindow.at(-1) <= readsByWindow[0] + 1), JSON.stringify(readsByWindow));
  const outputBaseline = samples[0]?.output?.channels;
  check('the output\'s subscriptions are back to baseline after every reconnect', Number.isInteger(outputBaseline) && samples.filter((s) => !inside(windows, s.at)).every((s) => s.output?.channels === outputBaseline), JSON.stringify(samples.filter((s) => !inside(windows, s.at) && s.output?.channels !== outputBaseline).map((s) => [s.at - t0, s.output?.channels]).slice(0, 3)));
  const baseline = samples[0]?.controller?.channels;
  const settled = samples.filter((s) => !inside(windows, s.at));
  check('the controller\'s subscriptions are back to baseline after reloads', Number.isInteger(baseline) && settled.length > 0 && settled.every((s) => s.controller?.channels === baseline), JSON.stringify(settled.filter((s) => s.controller?.channels !== baseline).map((s) => [s.at - t0, s.controller?.channels]).slice(0, 3)));
  const outFrames = frames.filter((f) => Number.isInteger(f.frames)).map((f) => f.frames);
  check('the output\'s graphic instances stay at their count after every replacement', outFrames.length > 0 && most(outFrames) === outFrames[0] && frames.at(-1)?.frames === outFrames[0], `${outFrames[0]} to ${most(outFrames)}`);

  // ── Memory: steady-state windows compared after warmup ──
  const series = (side, field) =>
    steady.map((w) => {
      const xs = inWindow(w).filter((s) => s[side]?.gc && Number.isFinite(s[side]?.[field])).map((s) => s[side][field]);
      return median(xs);
    });
  const growth = [];
  const memory = {};
  const slopes = {};
  // A series counts only when it was measured: a failed CDP read leaves its window empty.
  const needed = steady.length;
  const unmeasured = [];
  for (const [side, field, slack] of [
    ['controller', 'heap', 0.2],
    ['output', 'heap', 0.2],
    ['controller', 'nodes', 0.1],
    ['output', 'nodes', 0.1],
    ['controller', 'listeners', 0.1],
    ['output', 'listeners', 0.1],
    ['controller', 'documents', 0],
    ['output', 'documents', 0],
  ]) {
    const xs = series(side, field);
    memory[`${side}.${field}`] = xs;
    const known = xs.filter((x) => x !== null);
    if (known.length < needed) unmeasured.push(`${side}.${field}`);
    if (known.length < 2) continue;
    const allowance = field === 'heap' ? known[0] * slack + 2 * MIB : Math.max(known[0] * slack, field === 'documents' ? 0 : 50);
    if (known.at(-1) > known[0] + allowance) growth.push({ series: `${side}.${field}`, first: known[0], last: known.at(-1) });
    // A rise in every window, more than 5% in all, is sustained growth even inside the allowance:
    // it is investigated before the run is accepted.
    if (known.length >= 3 && known.every((x, i) => i === 0 || x > known[i - 1]) && known.at(-1) > known[0] * 1.05) growth.push({ series: `${side}.${field}`, sustained: known });
    // The least-squares slope over every GC'd steady sample, carried across the steady span.
    const points = samples.filter((s) => s[side]?.gc && Number.isFinite(s[side]?.[field]) && steady.some((w) => s.at - t0 >= w.from && s.at - t0 < w.to)).map((s) => [s.at - t0, s[side][field]]);
    const fit = slope(points);
    const across = steady.length ? (steady.at(-1).to - steady[0].from) * fit : 0;
    slopes[`${side}.${field}`] = { perMinute: fit * 60_000, across };
    if (known.length >= 2 && across > allowance) growth.push({ series: `${side}.${field}`, fitted: across, allowance });
  }
  // The controller reloads and the agent restarts once a cycle, so the windows compare pages and
  // processes of one age: a leak each clears is judged within each lifetime, from its first GC'd
  // sample a minute in to its last.
  const lifetimes = [];
  const reloads = faults.filter((f) => f.kind === 'reload').map((f) => f.at);
  const restarts = faults.filter((f) => f.kind === 'handover').map((f) => f.at);
  for (const [series, cuts, value] of [
    ['controller.heap', reloads, (s) => (s.controller?.gc ? s.controller.heap : undefined)],
    ['agent.rss', restarts, (s) => s.agent?.rss],
  ]) {
    const bounds = [t0, ...cuts, record.end ?? Infinity];
    for (let i = 0; i < bounds.length - 1; i++) {
      const xs = samples.filter((s) => s.at > bounds[i] + 60_000 && s.at < bounds[i + 1] && Number.isFinite(value(s))).map(value);
      if (xs.length < 3) continue;
      const allowance = series === 'agent.rss' ? xs[0] * 0.25 + 10 * MIB : xs[0] * 0.2 + 2 * MIB;
      lifetimes.push({ series, from: bounds[i] - t0, first: xs[0], last: xs.at(-1) });
      if (xs.at(-1) > xs[0] + allowance) growth.push({ series, lifetime: bounds[i] - t0, first: xs[0], last: xs.at(-1) });
    }
  }
  // The agent restarts at every handover, so each window's median is that window's own process.
  const agentRss = steady.map((w) => median(inWindow(w).filter((s) => Number.isFinite(s.agent?.rss)).map((s) => s.agent.rss)));
  memory['agent.rss'] = agentRss;
  const knownRss = agentRss.filter((x) => x !== null);
  if (knownRss.length < needed) unmeasured.push('agent.rss');
  if (knownRss.length >= 2 && knownRss.at(-1) > knownRss[0] * 1.25 + 10 * MIB) growth.push({ series: 'agent.rss', first: knownRss[0], last: knownRss.at(-1) });
  const enough = steady.length >= 2 || record.minutes < 20;
  check('memory and instance counts hold across the steady-state windows', enough && unmeasured.length === 0 && growth.length === 0, growth.length ? JSON.stringify(growth) : unmeasured.length ? `not measured: ${unmeasured.join(', ')}` : `${steady.length} steady windows`);

  // ── Timings, each road on its own ──
  const timings = { dispatch: [], dispatchToAir: [], fetchToApply: [], providerToApply: [], applyToRenderBound: [], providerToRenderBound: [], applyToRenderCandidates: [] };
  const recovering = [];
  /** Samples left out of each road's steady population because they fell in a fault's window. */
  const excluded = { dispatch: 0, dispatchToAir: 0, fetchToApply: 0, providerToApply: 0, applyToRenderBound: 0, providerToRenderBound: 0, applyToRenderCandidates: 0, candidatesTooCloseToATake: 0 };
  /** Values applied in a steady moment that never reached the output in time: each one a failure. */
  const missed = [];
  for (const [i, t] of takes.entries()) {
    const play = plays[i];
    if (play && !inside(windows, t.clickAt)) timings.dispatch.push(play.at - t.clickAt);
    else if (play) excluded.dispatch++;
    const shown = frames.find((f) => f.at >= t.clickAt && f.name === t.person.name);
    if (shown && !inside(windows, t.clickAt)) timings.dispatchToAir.push(shown.at - t.clickAt);
    else if (shown) excluded.dispatchToAir++;
  }
  // Only the agent reads the provider, so a step's first read is the agent's fetch of it; the
  // provider moved at the step's own start on the server's clock (its first read, plus 5 s a step).
  const moved = (rev) => {
    const first = record.provider?.[0]?.at;
    const i = stepOfRevision(rev);
    return first === undefined || i === null ? null : first + i * STEP_MS;
  };
  // From the run's start: the setup's first rows land before the output has its graphics.
  const boardRows = rows.filter((r) => r.graphic === 'Party totals' && r.t === 'update' && r.data?.f8 && r.at >= t0);
  for (const r of boardRows) {
    const kok = num(r.data.f8);
    const rev = partyRevision('KOK', kok);
    const fetchAt = served.get(`count-${rev}`);
    const steadyRow = !inside(windows, r.at);
    if (!steadyRow) {
      for (const road of ['fetchToApply', 'providerToApply', 'applyToRenderBound', 'providerToRenderBound']) excluded[road]++;
      if (takes.some((t) => t.at <= r.at)) excluded.applyToRenderCandidates++;
    }
    if (fetchAt && steadyRow) timings.fetchToApply.push(r.at - fetchAt);
    if (moved(rev) !== null && steadyRow) timings.providerToApply.push(r.at - moved(rev));
    const shown = frames.find((f) => f.at >= r.at - 50 && num(f.kok) >= kok);
    if (shown) (steadyRow ? timings.applyToRenderBound : recovering).push(shown.at - r.at);
    if (steadyRow && r.at + CEILING.bound <= (record.end ?? Infinity) && (!shown || shown.at - r.at > CEILING.bound)) missed.push({ road: 'bound', at: r.at - t0, kok: r.data.f8 });
    if (shown && steadyRow && moved(rev) !== null) timings.providerToRenderBound.push(shown.at - moved(rev));
    // The aired card moves at the page's own read of the tree. It is owed to the person last
    // clicked: once a Take is clicked the card is being replaced, and the person leaving owes nothing.
    const aired = takes.findLast((t) => t.clickAt <= r.at);
    if (aired && steadyRow) {
      const want = aired.person.base + rev * aired.person.step;
      const onCard = frames.find((f) => f.at >= r.at - 50 && f.name === aired.person.name && num(f.votes) >= want);
      const nextTake = takes.find((t) => t.clickAt > r.at);
      if (onCard && (!nextTake || onCard.at < nextTake.clickAt)) timings.applyToRenderCandidates.push(onCard.at - r.at);
      // Owed by the earlier of the ceiling and the next Take (which replaces the card); a row too
      // close to that Take, or to the run's end, cannot be judged.
      const due = Math.min(r.at + CEILING.candidates, nextTake?.clickAt ?? Infinity, record.end ?? Infinity);
      const room = due - r.at;
      if (room < 2_000) excluded.candidatesTooCloseToATake++;
      else if (!onCard || onCard.at > due) missed.push({ road: 'candidates', at: r.at - t0, person: aired.person.name, want, room });
    }
  }
  // The source keeps being applied: every revision the provider's timeline published in a steady
  // moment is on the board (or overtaken by a newer one) within 15 s. The obligations come from the
  // fixture's own timeline, which moves whether or not anyone reads it, so an agent that stops
  // reading stalls here too. Coalescing is allowed; a stall is not.
  const appliedRevs = boardRows.map((r) => ({ at: r.at, rev: partyRevision('KOK', num(r.data.f8)) ?? 0 }));
  const stalled = [];
  let obligations = 0;
  for (let rev = 1; moved(rev) !== null && moved(rev) + 15_000 <= (record.end ?? 0); rev++) {
    const at = moved(rev);
    if (at < t0 || inside(windows, at) || inside(windows, at + 15_000)) continue;
    obligations++;
    if (!appliedRevs.some((a) => a.rev >= rev && a.at <= at + 15_000)) stalled.push({ at: at - t0, rev });
  }
  check('every revision the provider published was applied within 15 s (or overtaken by a newer one)', obligations > 0 && stalled.length === 0, `${stalled.length} of ${obligations} stalled: ${JSON.stringify(stalled.slice(0, 3))}`);
  // The count bug's own bound value moves every twelfth revision: each move published in a steady
  // moment is on the output within the bound road's ceiling plus the provider's step.
  const staleBug = [];
  let bugMoves = 0;
  for (let rev = 2; moved(rev) !== null && moved(rev) + 15_000 <= (record.end ?? 0); rev++) {
    if (countedAt(rev) === countedAt(rev - 1)) continue;
    const at = moved(rev);
    if (at < t0 || inside(windows, at) || inside(windows, at + 15_000)) continue;
    bugMoves++;
    if (!frames.some((f) => f.at > at && f.at <= at + 15_000 && (areas(f.counted) ?? -1) >= countedAt(rev))) staleBug.push({ at: at - t0, rev, want: countedAt(rev) });
  }
  check('the count bug followed every count the provider published within 15 s', record.minutes < 5 || (bugMoves > 0 && staleBug.length === 0), `${staleBug.length} of ${bugMoves} late: ${JSON.stringify(staleBug.slice(0, 3))}`);
  const report = Object.fromEntries(Object.entries(timings).map(([k, xs]) => [k, stats(xs)]));
  check('a Take is on air within 10 s', report.dispatchToAir.n > 0 && report.dispatchToAir.max <= CEILING.dispatch, JSON.stringify(report.dispatchToAir));
  check('a bound field is on air within 10 s of the provider\'s move', report.providerToRenderBound.n > 0 && report.providerToRenderBound.max <= CEILING.bound, JSON.stringify(report.providerToRenderBound));
  check('the aired card follows a correction within 13 s of its apply', report.applyToRenderCandidates.n > 0 && report.applyToRenderCandidates.max <= CEILING.candidates, JSON.stringify(report.applyToRenderCandidates));
  check('no value applied in a steady moment failed to reach the output in time', missed.length === 0, `${missed.length} missed: ${JSON.stringify(missed.slice(0, 3))}`);

  return { minutes: record.minutes, passed: checks.every((c) => c.ok), checks, timings: report, excluded, memory, slopes, lifetimes, readsInFlightByWindow: readsByWindow, recoveries: { disconnects: recovered, renderDuringFaults: stats(recovering) }, missed, unmeasured: UNMEASURED };
}
