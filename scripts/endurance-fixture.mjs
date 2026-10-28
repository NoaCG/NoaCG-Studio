// THE ENDURANCE FIXTURE (docs/work-specs/playout-expanded-acceptance/spec.md, phase E8.1b,
// "Required operating envelope"): what the 60-minute election run reads and when it misbehaves.
// Pure and deterministic: the same minutes give the same provider texts and the same schedule.
//
// The provider: 1,000 fictional candidates in the election rehearsal package's shape (the package's
// own six people keep their keys and names, so its cues select them), ten parties and a summary,
// one revision every five seconds. Some steps misbehave on a fixed pattern: a duplicate (the step
// before, byte for byte), an older revision arriving late, and malformed text (the next revision cut
// in half). Votes are `base + revision * step` per person, so any figure seen on air names the
// revision it came from, and a figure that matches no revision of that person is a mixed frame.
//
// The schedule: a cue switch every 15 s, a foreign action every 60 s (every fifth sent twice with
// one id), and in each cycle (ten minutes, or half the run if shorter) a Pause and Resume, a
// controller reload, an output disconnect and a reader handover, the handover alternating between
// a graceful release and a crashed agent whose claim has to lapse. Cycle 0 is the warmup; every
// later cycle is a steady-state window and they are compared with each other.

export const CANDIDATES = 1000;
export const STEP_MS = 5_000;
export const CUE_SWITCH_MS = 15_000;
export const ACTION_MS = 60_000;
export const PAUSE_MS = 30_000;
export const DISCONNECT_MS = 20_000;
/** Minutes of timeline the replay server holds beyond the run: its clock starts at the agent's
 *  first read, before the run's own start, and the run's teardown reads on. */
export const EXTRA_MINUTES = 10;
/** The route's ingress limit for one /api/data/source body (E4, owner 2026-10-20, G). */
export const BODY_CAP_BYTES = 256 * 1024;

const DISTRICTS = ['Helsinki', 'Uusimaa', 'Varsinais-Suomi', 'Satakunta', 'Ahvenanmaa', 'Häme', 'Pirkanmaa', 'Kaakkois-Suomi', 'Savo-Karjala', 'Vaasa', 'Keski-Suomi', 'Oulu', 'Lappi'];
const PARTIES = [
  ['KOK', 'National Coalition', '#2F6FD6', 220_000, 160],
  ['SDP', 'Social Democrats', '#E0314B', 210_000, 150],
  ['PS', 'Finns Party', '#E8B428', 175_000, 130],
  ['KESK', 'Centre', '#3FA34D', 126_000, 90],
  ['VIHR', 'Greens', '#6CC24A', 73_000, 50],
  ['VAS', 'Left Alliance', '#B5254C', 82_000, 60],
  ['RKP', 'Swedish People’s Party', '#FFDD00', 43_000, 30],
  ['KD', 'Christian Democrats', '#1B3E94', 29_000, 20],
  ['LIIK', 'Movement Now', '#8A2BE2', 9_800, 8],
  ['MUUT', 'Others', '#888888', 14_500, 10],
];
/** The package's own people, by their key: its cues select three of them (Aino, Leo, Sara). */
const NAMED = {
  '02/101': ['Aino Example', 0],
  '02/102': ['Mika Example', 1],
  '01/101': ['Leo Example', 2],
  '02/104': ['Niko Example', 3],
  '01/102': ['Ella Example', 5],
  '02/103': ['Sara Example', 4],
};

/** The 1,000 candidates: district round robin, numbers from 101, each with its own vote formula. */
export function candidates(count = CANDIDATES) {
  return Array.from({ length: count }, (_, k) => {
    const district = String((k % DISTRICTS.length) + 1).padStart(2, '0');
    const candidate = 101 + Math.floor(k / DISTRICTS.length);
    const named = NAMED[`${district}/${candidate}`];
    const party = PARTIES[named ? named[1] : k % PARTIES.length];
    return {
      district,
      candidate,
      name: named ? named[0] : `Example ${String(k + 1).padStart(4, '0')}`,
      affiliation: `${party[1]} · ${DISTRICTS[Number(district) - 1]}`,
      color: party[2],
      base: 500 + ((k * 7919) % 3000),
      step: 1 + ((k * 31) % 9),
    };
  });
}

/** One person's votes at a revision. */
export const votesAt = (person, revision) => person.base + revision * person.step;
/** The revision a figure of this person came from, or null when it is none of theirs. */
export function revisionOf(person, votes, maxRevision) {
  const r = (votes - person.base) / person.step;
  return Number.isInteger(r) && r >= 1 && r <= maxRevision ? r : null;
}
export const partyVotes = (code, revision) => {
  const [, , , base, step] = PARTIES.find((p) => p[0] === code);
  return base + revision * step;
};

/** What a step is: the provider's own revisions, or the pattern's misbehaviour. */
export function stepKind(i) {
  if (i === 0) return 'count';
  if (i % 20 === 7) return 'duplicate';
  if (i % 20 === 13) return 'older';
  if (i % 40 === 18) return 'malformed';
  return 'count';
}
/** The newest revision the provider has published by step `i` (counts alone move it). */
export function revisionAt(i) {
  let n = 0;
  for (let s = 0; s <= i; s++) if (stepKind(s) === 'count') n++;
  return n;
}

/** The step at which the provider first publishes a revision. */
export function stepOfRevision(revision) {
  if (!(Number.isInteger(revision) && revision >= 1)) return null;
  for (let i = 0, n = 0; ; i++) if (stepKind(i) === 'count' && ++n === revision) return i;
}

const pct = (n) => `${n.toFixed(1)}%`;
/** The provider's document at a revision, compact as a service would answer it. */
export function resultsDoc(people, revision) {
  const at = new Date(Date.UTC(2027, 3, 18, 17, 0, 0) + revision * STEP_MS).toISOString().replace('.000Z', 'Z');
  const counted = Math.min(100, Math.floor(revision / 12));
  const totals = PARTIES.map(([code]) => partyVotes(code, revision));
  const all = totals.reduce((a, b) => a + b, 0);
  const items = people
    .map((p) => ({ district: p.district, candidate: p.candidate, name: p.name, affiliation: p.affiliation, color: p.color, votes: votesAt(p, revision), status: 'Counting' }))
    .sort((a, b) => b.votes - a.votes || a.district.localeCompare(b.district) || a.candidate - b.candidate);
  return {
    fixture: true,
    note: 'Synthetic endurance results. Not an election count.',
    revision,
    observed_at: at,
    summary: { status: 'Preliminary', counted: `${counted} of 100 areas counted`, counted_share: `${counted}%` },
    parties: Object.fromEntries(PARTIES.map(([code], j) => [code, { share: pct((totals[j] / all) * 100), votes: totals[j] }])),
    candidates: { schemaRevision: 1, revision, items },
  };
}

/**
 * The provider's timeline: `{ length, at(i) }`, each step `{ name, text, revision }` where
 * `revision` is the revision the text claims (null when malformed). Texts are made when asked and
 * the last few kept, so an hour of 1,000-record revisions is never held at once.
 */
export function enduranceTimeline(minutes, people = candidates()) {
  const length = Math.ceil((minutes * 60_000) / STEP_MS) + 2;
  const cache = new Map();
  const text = (revision) => {
    if (!cache.has(revision)) {
      cache.set(revision, JSON.stringify(resultsDoc(people, revision)));
      if (cache.size > 6) cache.delete(cache.keys().next().value);
    }
    return cache.get(revision);
  };
  return {
    length,
    at(i) {
      const step = Math.min(Math.max(0, i), length - 1);
      const kind = stepKind(step);
      const revision = revisionAt(step);
      if (kind === 'count') return { name: `count-${revision}`, text: text(revision), revision };
      if (kind === 'duplicate') return { name: `duplicate-${revision}`, text: text(revision), revision };
      if (kind === 'older') return { name: `older-${Math.max(1, revision - 3)}`, text: text(Math.max(1, revision - 3)), revision: Math.max(1, revision - 3) };
      const next = text(revision + 1);
      return { name: `malformed-${revision + 1}`, text: next.slice(0, Math.floor(next.length / 2)), revision: null };
    },
  };
}

/** What the agent sends of a document (the rehearsal configuration's `sendPaths`). */
export const SEND_PATHS = ['revision', 'observed_at', 'summary', 'parties', 'candidates'];

/**
 * The fixture's measured size, recorded before the run: the provider's text, what the agent sends
 * (the projected payload and the whole request body) and what Postgres measures (`jsonbBytes`,
 * when the caller has asked the database), each against the 256 KiB body cap.
 */
export function measureFixture(minutes, people = candidates()) {
  // The largest revision the replay server can serve in this run, so nothing served is larger.
  const last = revisionAt(enduranceTimeline(minutes + EXTRA_MINUTES, people).length - 1);
  const doc = resultsDoc(people, last);
  const projected = Object.fromEntries(SEND_PATHS.map((k) => [k, doc[k]]));
  const payloadBytes = Buffer.byteLength(JSON.stringify(projected));
  const envelope = { v: 1, sourceId: 'election', configRevision: 1, op: 'report', claim: '00000000-0000-0000-0000-000000000000', acquisition: { v: 1, sourceId: 'election', configRevision: 1, ownerEpoch: 1000, acceptedRevision: last, providerSequence: last, checkedAt: doc.observed_at, changedAt: doc.observed_at, eventTime: doc.observed_at, status: 'changed', payload: projected } };
  return {
    candidates: people.length,
    revision: last,
    providerTextBytes: Buffer.byteLength(JSON.stringify(doc)),
    payloadBytes,
    bodyBytes: Buffer.byteLength(JSON.stringify(envelope)),
    capBytes: BODY_CAP_BYTES,
    headroom: Number((1 - Buffer.byteLength(JSON.stringify(envelope)) / BODY_CAP_BYTES).toFixed(3)),
    projected,
  };
}

/**
 * The run's schedule in milliseconds from its start: the cycle, the warmup, the steady-state
 * windows and every fault, in order.
 */
export function schedule(minutes) {
  const total = Math.round(minutes * 60_000);
  const cycleMs = Math.min(10 * 60_000, Math.floor(total / 2));
  const cycles = Math.floor(total / cycleMs);
  const events = [];
  for (let c = 0; c < cycles; c++) {
    // Three seconds after the cue switch due at that moment, so the two never race.
    const at = (f) => c * cycleMs + Math.round(cycleMs * f) + 3_000;
    events.push({ at: at(0.2), kind: 'pause', ms: PAUSE_MS });
    events.push({ at: at(0.4), kind: 'reload' });
    events.push({ at: at(0.6), kind: 'disconnect', ms: DISCONNECT_MS });
    events.push({ at: at(0.8), kind: 'handover', mode: c % 2 === 0 ? 'release' : 'crash' });
  }
  const windows = Array.from({ length: cycles }, (_, c) => ({ index: c, from: c * cycleMs, to: (c + 1) * cycleMs, warmup: c === 0 }));
  return { totalMs: total, cycleMs, warmupMs: cycleMs, windows, events };
}
