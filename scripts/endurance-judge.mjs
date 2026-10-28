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

import { candidates, partyVotes, revisionOf, schedule as planOf } from './endurance-fixture.mjs';

const GRACE_MS = 5_000;
const RECOVER_MS = 20_000;
const CEILING = { dispatch: 10_000, bound: 10_000, candidates: 13_000 };
const ELECTION = ['Party totals', 'Count bug', 'Ticker', 'Candidate card'];
const MOVES = new Set(['play', 'stop', 'next', 'snap', 'event']);
/** Refusals the run causes on purpose: the 5 s gap (and the wait it asks for), a Pause, and an
 *  old owner or a waiting new one around a handover. */
const EXPECTED_REFUSALS = /not taken \((?:\d{3} )?(?:too_soon|paused|moved|epoch)\)|waiting as the production asked|not claimed \(409 held by another agent\)/;
/** What an old owner woken after the new claim answers: it is refused, as owner and as claimant. */
const OLD_OWNER_REFUSED = /not taken \((?:409 )?(?:moved|epoch)\)|not claimed \(409 held by another agent\)/;
/** Lines that say something was not taken or failed to reach the production. */
const REFUSAL = / not taken \(| not claimed \(| renewal failed| claim failed| the sender failed| waiting as the production asked/;
const MIB = 1024 * 1024;

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
  const maxRevision = Math.max(0, ...(record.snapshots ?? []).map((s) => s.revision ?? 0), record.finalSnapshot?.accepted_revision ?? 0);

  // ── It ran ──
  check('the run lasted the minutes asked', record.end && t0 && record.end - t0 >= plan.totalMs, `${Math.round(((record.end ?? 0) - t0) / 1000)} s of ${plan.totalMs / 1000} s`);
  check('no unhandled error in the controller, the output or the driver', (record.errors ?? []).length === 0, JSON.stringify((record.errors ?? []).slice(0, 5)));
  const switches = (record.takes ?? []).filter((t) => t.key);
  check('every cue switch took', switches.length >= Math.floor(plan.totalMs / 15_000) && switches.every((t) => t.at && !t.failed), JSON.stringify(switches.filter((t) => t.failed).slice(0, 3)));
  const kinds = (k) => faults.filter((f) => f.kind === k);
  check('every scheduled fault ran to its end', ['pause', 'reload', 'disconnect', 'handover'].every((k) => kinds(k).length === plan.events.filter((e) => e.kind === k).length && kinds(k).every((f) => f.end)), JSON.stringify(faults.filter((f) => !f.end)));

  // ── The fixture and the ingress limits ──
  const fx = record.fixture ?? {};
  const bytes = Math.max(0, ...(record.snapshots ?? []).map((s) => s.bytes ?? 0));
  check('the fixture is 1,000 candidates measured inside the 256 KiB body cap before the run', fx.candidates === 1000 && fx.bodyBytes > 0 && fx.bodyBytes <= fx.capBytes && (fx.jsonbBytes ?? 0) <= fx.capBytes, `body ${fx.bodyBytes}, jsonb ${fx.jsonbBytes} of ${fx.capBytes}`);
  check('every accepted revision stayed inside the ingress limit', bytes > 0 && bytes <= (fx.capBytes ?? 262144), `largest ${bytes} bytes`);
  // A frozen agent's request in flight fails when it wakes: expected of that agent, after that moment.
  const woken = faults.filter((f) => f.kind === 'handover' && f.mode === 'crash');
  const wokeLate = (r) => woken.some((f) => r.agent === f.from && r.at >= f.woke && /renewal failed|claim failed/.test(r.line));
  const unexpected = reads.filter((r) => REFUSAL.test(r.line) && !EXPECTED_REFUSALS.test(r.line) && !wokeLate(r));
  check('no revision was refused for size, budget or anything the run did not cause', unexpected.length === 0, unexpected.slice(0, 3).map((r) => r.line).join(' | '));
  const statuses = new Set(reads.map((r) => /^\S+ election (\w+) accepted=/.exec(r.line)?.[1]).filter(Boolean));
  check('the provider\'s duplicate, older and malformed steps were each read and held', ['unchanged', 'stale', 'invalid'].every((s) => statuses.has(s)), [...statuses].join(','));
  check('no credential in anything the agents wrote', record.credentialLeaked === false);

  // ── Wrong-person frames and mixed records ──
  const takes = switches.filter((t) => t.at).map((t) => ({ ...t, person: byKey.get(`${t.key[0]}/${t.key[1]}`) }));
  const disconnects = windows.filter((w) => w.kind === 'disconnect');
  const wrong = [];
  const mixed = [];
  for (const f of frames) {
    if (f.name && f.name !== '') {
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
    if (f.kok && (kok === null || !Number.isInteger((kok - partyVotes('KOK', 0)) / (partyVotes('KOK', 1) - partyVotes('KOK', 0))))) mixed.push({ at: f.at - t0, kok: f.kok });
  }
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
  const otherMoves = ELECTION.filter((g) => g !== 'Candidate card').map((g) => [g, rows.filter((r) => r.graphic === g && MOVES.has(r.t)).map((r) => r.t)]);
  check('nothing took, advanced or reset the other graphics: one Take each', otherMoves.every(([, ts]) => ts.length === 1 && ts[0] === 'play'), JSON.stringify(otherMoves));
  const cardMoves = card.filter((r) => MOVES.has(r.t) && r.t !== 'play');
  check('nothing but the Takes moved the card', cardMoves.length === 0, JSON.stringify(cardMoves.slice(0, 3)));
  check('no update row carried the collection', rows.every((r) => r.t !== 'update' || !JSON.stringify(r.data ?? {}).includes('schemaRevision')));

  // ── Foreign actions through the negotiated, guarded route ──
  const actions = record.actions ?? [];
  const badActions = actions.filter((a) => a.failed || a.outcome !== 'ran' || a.settled !== 'accepted' || a.marksAfter !== a.marksBefore + 1);
  check('every foreign action ran once on the program instance', actions.length >= Math.floor((plan.totalMs - 30_000) / 60_000) && badActions.length === 0, JSON.stringify(badActions.slice(0, 3)));
  const dups = actions.filter((a) => a.duplicate);
  check('a foreign action sent twice with one id ran once', (actions.length < 5 || dups.length >= 1) && dups.every((a) => a.duplicate.outcome === 'duplicate' && a.duplicate.marks === a.marksAfter), JSON.stringify(dups.filter((a) => a.duplicate.outcome !== 'duplicate' || a.duplicate.marks !== a.marksAfter)));

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
  check('Resume sent the final values once: at most one row per bound graphic', pauses.every((f) => f.answer?.paused === true && f.resume?.paused === false && f.resume.writes >= 1 && f.resume.writes <= 2), JSON.stringify(pauses.map((f) => f.resume)));

  // ── Output disconnect ──
  const recovered = kinds('disconnect').map((f) => {
    const before = Math.max(0, ...frames.filter((x) => x.at <= f.at && x.kok).map((x) => num(x.kok)));
    const after = frames.find((x) => x.at > f.end && x.at <= f.end + RECOVER_MS && num(x.kok) > before);
    return { at: f.at - t0, ok: Boolean(after), ms: after ? after.at - f.end : null };
  });
  check('the output caught up within 20 s of every reconnect', recovered.length > 0 && recovered.every((r) => r.ok), JSON.stringify(recovered));

  // ── Queues and instances ──
  const steady = plan.windows.filter((w) => !w.warmup);
  const inWindow = (w) => samples.filter((s) => s.at - t0 >= w.from && s.at - t0 < w.to);
  const agentSamples = samples.filter((s) => s.agent);
  check('pending provider reads bounded to one per source', agentSamples.length > 0 && agentSamples.every((s) => s.agent.reading <= 1), `${agentSamples.length} samples`);
  check('buffered updates bounded to one latest snapshot', agentSamples.every((s) => s.agent.undelivered <= 1) && samples.every((s) => s.snapshots <= 1));
  const handoverAt = (s) => handovers.some((h) => s.at >= h.at && s.at <= (h.end ?? h.at));
  check('one agent alive outside a handover', samples.filter((s) => !handoverAt(s)).every((s) => s.agentsAlive === 1), JSON.stringify(samples.filter((s) => !handoverAt(s) && s.agentsAlive !== 1).map((s) => [s.at - t0, s.agentsAlive]).slice(0, 3)));
  const readsByWindow = steady.map((w) => Math.max(0, ...inWindow(w).map((s) => s.stateReadsMax ?? 0)));
  const restsByWindow = steady.map((w) => inWindow(w).some((s) => (s.stateReadsInFlight ?? 0) === 0));
  check('the controller\'s tree reads in flight come back to none and do not grow', restsByWindow.every(Boolean) && (readsByWindow.length < 2 || readsByWindow.at(-1) <= readsByWindow[0] + 1), JSON.stringify(readsByWindow));
  const baseline = samples[0]?.controller?.channels;
  const settled = samples.filter((s) => !inside(windows, s.at));
  check('the controller\'s subscriptions are back to baseline after reloads', Number.isInteger(baseline) && settled.length > 0 && settled.every((s) => s.controller?.channels === baseline), JSON.stringify(settled.filter((s) => s.controller?.channels !== baseline).map((s) => [s.at - t0, s.controller?.channels]).slice(0, 3)));
  const outFrames = frames.filter((f) => Number.isInteger(f.frames)).map((f) => f.frames);
  check('the output\'s graphic instances stay at their count after every replacement', outFrames.length > 0 && Math.max(...outFrames) === outFrames[0] && frames.at(-1)?.frames === outFrames[0], `${Math.min(...outFrames)} to ${Math.max(...outFrames)}`);

  // ── Memory: steady-state windows compared after warmup ──
  const series = (side, field) =>
    steady.map((w) => {
      const xs = inWindow(w).filter((s) => s[side]?.gc && Number.isFinite(s[side]?.[field])).map((s) => s[side][field]);
      return median(xs);
    });
  const growth = [];
  const memory = {};
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
    if (known.length < 2) continue;
    const allowance = field === 'heap' ? known[0] * slack + 2 * MIB : Math.max(known[0] * slack, field === 'documents' ? 0 : 50);
    if (known.at(-1) > known[0] + allowance) growth.push({ series: `${side}.${field}`, first: known[0], last: known.at(-1) });
  }
  const enough = steady.length >= 2 || record.minutes < 20;
  check('memory and instance counts hold across the steady-state windows', enough && growth.length === 0, growth.length ? JSON.stringify(growth) : `${steady.length} steady windows`);

  // ── Timings, each road on its own ──
  const timings = { dispatch: [], dispatchToAir: [], fetchToApply: [], providerToApply: [], applyToRenderBound: [], providerToRenderBound: [], applyToRenderCandidates: [] };
  const recovering = [];
  for (const [i, t] of takes.entries()) {
    const play = plays[i];
    if (play) timings.dispatch.push(play.at - t.clickAt);
    const shown = frames.find((f) => f.at >= t.clickAt && f.name === t.person.name);
    if (shown && !inside(windows, t.clickAt)) timings.dispatchToAir.push(shown.at - t.clickAt);
  }
  const fetched = new Map();
  for (const r of reads) {
    const m = /^(\S+) election changed accepted=(\d+)/.exec(r.line);
    if (m && !fetched.has(Number(m[2]))) fetched.set(Number(m[2]), Date.parse(m[1]));
  }
  const served = new Map((record.provider ?? []).map((s) => [s.name, s.at]));
  const boardRows = rows.filter((r) => r.graphic === 'Party totals' && r.t === 'update' && r.data?.f8);
  for (const r of boardRows) {
    const kok = num(r.data.f8);
    const rev = (kok - partyVotes('KOK', 0)) / (partyVotes('KOK', 1) - partyVotes('KOK', 0));
    const fetchAt = fetched.get(rev);
    const steadyRow = !inside(windows, r.at);
    if (fetchAt && steadyRow) timings.fetchToApply.push(r.at - fetchAt);
    if (served.has(`count-${rev}`) && steadyRow) timings.providerToApply.push(r.at - served.get(`count-${rev}`));
    const shown = frames.find((f) => f.at >= r.at - 50 && num(f.kok) >= kok);
    if (shown) (steadyRow ? timings.applyToRenderBound : recovering).push(shown.at - r.at);
    if (shown && steadyRow && served.has(`count-${rev}`)) timings.providerToRenderBound.push(shown.at - served.get(`count-${rev}`));
    // The aired card moves at the page's own read of the tree.
    const aired = takes.findLast((t) => t.at <= r.at);
    if (aired && steadyRow) {
      const want = aired.person.base + rev * aired.person.step;
      const onCard = frames.find((f) => f.at >= r.at - 50 && f.name === aired.person.name && num(f.votes) >= want);
      const nextTake = takes.find((t) => t.clickAt > r.at);
      if (onCard && (!nextTake || onCard.at < nextTake.clickAt)) timings.applyToRenderCandidates.push(onCard.at - r.at);
    }
  }
  const report = Object.fromEntries(Object.entries(timings).map(([k, xs]) => [k, stats(xs)]));
  check('a Take is on air within 10 s', report.dispatchToAir.n > 0 && report.dispatchToAir.max <= CEILING.dispatch, JSON.stringify(report.dispatchToAir));
  check('a bound field is on air within 10 s of the provider\'s move', report.providerToRenderBound.n > 0 && report.providerToRenderBound.max <= CEILING.bound, JSON.stringify(report.providerToRenderBound));
  check('the aired card follows a correction within 13 s of its apply', report.applyToRenderCandidates.n > 0 && report.applyToRenderCandidates.max <= CEILING.candidates, JSON.stringify(report.applyToRenderCandidates));

  return { minutes: record.minutes, passed: checks.every((c) => c.ok), checks, timings: report, memory, readsInFlightByWindow: readsByWindow, recoveries: { disconnects: recovered, renderDuringFaults: stats(recovering) } };
}
