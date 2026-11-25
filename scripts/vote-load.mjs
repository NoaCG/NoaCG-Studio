#!/usr/bin/env node
// A ROOM OF PHONES VOTING, against the STAGING project (docs/work-specs/live-production-reliability
// /spec.md, P1 AC-4: "the cap is sized for the largest room a production expects, measured").
//
//   node scripts/vote-load.mjs --url <staging project URL> --key <its publishable key> \
//     --join <join slug> --control <control slug> [--phones 100]
//
// The CLI votes on whatever question is live on that production and prints the four counts. The
// whole walk (Go live, Stop, Continue the count, Start a new count, the operator's panel, the CSV
// and the result cue) is e2e/instruments/vote-load.ts, dispatched through hosted-latency.yml.
//
// EACH PHONE SENDS WHAT A REAL PHONE SENDS (src/audience/audienceData.ts `joinRead`/`joinWrite`,
// src/audience/joinSurface.ts): a plain POST of `audience_join_by_slug` every 5 s with up to 10%
// jitter either way, `audience_vote` with the round and revision it last read, a re-read straight
// after every send, the publishable key only, and its own device token. A person who sees "Not
// sent" or "Too many votes at once" presses Vote again; a phone here does the same, twice at most.
//
// It refuses any project but staging or a local stack: it writes votes.
//
// The pure half (the plan, the counts, the readings) is exported for scripts/vote-load.test.mjs,
// which runs the whole room against an in-memory stand-in. Node builtins only.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NEVER_REFS, isLocalStackUrl } from './configured-target.mjs';
import { metric } from './production-load.mjs';
import { stagingRef } from './supabase-projects.mjs';

/** The phone page's cadence (src/audience/audienceData.ts AUDIENCE_POLL.join). */
export const POLL_MS = 5_000;

/** The refusal words a phone shows (src/audience/audienceTypes.ts), mapped as `refusalOf` does. */
export const WORDS = {
  notSent: 'Not sent. Check your connection and try again.',
  closed: 'That question has closed.',
  final: 'Your vote is already in.',
  tooMany: 'Too many votes at once. Try again in a few seconds.',
  refused: 'That vote could not be counted.',
};

/** The refusal a phone shows for an answer (audienceData.ts `joinWrite` and `refusalOf`). */
export function phoneOutcome(status, message) {
  if (status === 0 || status >= 500) return WORDS.notSent;
  if (status >= 200 && status < 300) return null;
  if (/question has closed/.test(message)) return WORDS.closed;
  if (/your vote is already in/.test(message)) return WORDS.final;
  if (/too many votes at once/.test(message)) return WORDS.tooMany;
  return WORDS.refused;
}

/** A small seeded generator, so a run can be repeated phone for phone. */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** A device token of the shape src/audience/deviceToken.ts mints (22 of the guard's alphabet). */
export function deviceToken(random) {
  let out = '';
  for (let i = 0; i < 22; i += 1) out += TOKEN_ALPHABET[Math.floor(random() * TOKEN_ALPHABET.length)];
  return out;
}

/** The value at share `q` of sorted numbers (nearest rank), or null for none. */
export function quantile(sorted, q) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
}

/** Per kind of request: how many, the median, p95 and slowest in ms, and what went wrong. */
export function summarise(requests) {
  const out = {};
  for (const r of requests) {
    const k = (out[r.kind] ??= { count: 0, ms: [], failures: {} });
    k.count += 1;
    k.ms.push(r.ms);
    if (r.status < 200 || r.status >= 300) {
      const why = `${r.status || 'network'} ${r.message || ''}`.trim();
      k.failures[why] = (k.failures[why] ?? 0) + 1;
    }
  }
  for (const k of Object.values(out)) {
    const sorted = k.ms.sort((a, b) => a - b);
    k.medianMs = Math.round(quantile(sorted, 0.5));
    k.p95Ms = Math.round(quantile(sorted, 0.95));
    k.slowestMs = Math.round(sorted.at(-1));
    delete k.ms;
  }
  return out;
}

/** Counts per option from the phones' own record: each phone's last vote the server said yes to. */
export function scriptCounts(phones, roundId, options) {
  const counts = new Array(options).fill(0);
  for (const p of phones) {
    const v = p.sent.get(roundId);
    if (v !== undefined) counts[v] += 1;
  }
  return counts;
}

/** Counts per option from an export's votes (audience_votes_export) or the CSV's option letters. */
export function countsOf(options, votes) {
  const counts = new Array(options).fill(0);
  for (const v of votes) {
    const at = typeof v === 'string' ? v.charCodeAt(0) - 65 : v.option;
    if (at >= 0 && at < options) counts[at] += 1;
  }
  return counts;
}

/** Counts per option from a result cue's values: its `Label | count` lines, in option order. */
export function cueCounts(values, labels) {
  const lines = Object.values(values ?? {}).filter((v) => typeof v === 'string' && v.includes(' | '));
  const text = lines.at(-1) ?? '';
  const byLabel = new Map(text.split('\n').map((l) => l.split(' | ')).map(([label, n]) => [label, Number(n)]));
  const total = Object.values(values ?? {}).map((v) => /^(\d+) votes? · voting/.exec(String(v))).find(Boolean);
  return { counts: labels.map((l) => byLabel.get(l) ?? null), total: total ? Number(total[1]) : null };
}

/**
 * One Prometheus scrape of the database host, reduced to its running totals and levels: CPU seconds
 * (all, and idle or waiting on disk), seconds the disks were busy, memory, load and connections.
 */
export function hostTotals(text) {
  let cpuAll = 0;
  let cpuIdle = 0;
  for (const line of String(text ?? '').split('\n')) {
    if (!line.startsWith('node_cpu_seconds_total{')) continue;
    const value = Number(line.trim().split(' ').pop());
    if (!Number.isFinite(value)) continue;
    cpuAll += value;
    if (/mode="(idle|iowait)"/.test(line)) cpuIdle += value;
  }
  const total = metric(text, 'node_memory_MemTotal_bytes');
  const available = metric(text, 'node_memory_MemAvailable_bytes');
  return {
    cpuAll,
    cpuIdle,
    diskBusySeconds: metric(text, 'node_disk_io_time_seconds_total'),
    memoryUsedMiB: total !== null && available !== null ? Math.round((total - available) / 1_048_576) : null,
    memoryTotalMiB: total !== null ? Math.round(total / 1_048_576) : null,
    load1: metric(text, 'node_load1'),
    connections: metric(text, 'pg_stat_database_num_backends'),
  };
}

/**
 * The host over a window, from the scrapes taken in it: the CPU share busy and the disks' busy share
 * between the first and the last scrape (the endpoint refreshes its counters only every so often,
 * so neighbouring scrapes can be equal), and the peaks of memory, load and connections.
 */
export function hostWindow(readings, from = 0, to = Infinity) {
  const inside = readings.filter((r) => r.at >= from && r.at <= to && !r.error);
  const first = inside[0];
  const last = inside.at(-1);
  const spent = first && last ? last.cpuAll - first.cpuAll : 0;
  const seconds = first && last ? (last.at - first.at) / 1000 : 0;
  const max = (k) => (inside.some((r) => r[k] !== null) ? Math.max(...inside.map((r) => r[k] ?? -Infinity)) : null);
  const share = (x) => Math.round(x * 100) / 100;
  return {
    samples: inside.length,
    cpuBusy: spent > 0 ? share(1 - (last.cpuIdle - first.cpuIdle) / spent) : null,
    diskBusy: seconds > 0 && first.diskBusySeconds !== null && last.diskBusySeconds !== null ? share((last.diskBusySeconds - first.diskBusySeconds) / seconds) : null,
    memoryUsedMiBPeak: max('memoryUsedMiB'),
    memoryTotalMiB: last?.memoryTotalMiB ?? null,
    load1Peak: max('load1'),
    connectionsPeak: max('connections'),
    unread: readings.filter((r) => r.at >= from && r.at <= to && r.error).length,
  };
}

/**
 * When it was slow: per `bucketMs` from `from`, the requests started and the slowest of them, for
 * the buckets holding one slower than `slowMs`, each with the operator's marks inside it.
 */
export function slowTimeline(requests, marks, { from = 0, bucketMs = 2_000, slowMs = 2_000 } = {}) {
  const buckets = new Map();
  for (const r of requests) {
    const at = Math.floor((r.at - from) / bucketMs);
    const b = buckets.get(at) ?? { started: 0, slow: 0, slowestMs: 0 };
    b.started += 1;
    if (r.ms > slowMs) b.slow += 1;
    b.slowestMs = Math.max(b.slowestMs, Math.round(r.ms));
    buckets.set(at, b);
  }
  return [...buckets]
    .filter(([, b]) => b.slow > 0)
    .sort(([a], [b]) => a - b)
    .map(([at, b]) => ({
      s: (at * bucketMs) / 1000,
      ...b,
      marks: marks.filter((m) => Math.floor((m.at - from) / bucketMs) === at).map((m) => m.what),
    }));
}

/** Refuse anything but the staging project or a local stack: this writes votes. */
export function assertTarget(url, env = process.env) {
  const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(url ?? '')?.[1]?.toLowerCase();
  if (isLocalStackUrl(url)) return;
  if (!ref || NEVER_REFS.includes(ref) || ref !== stagingRef(env)) {
    throw new Error(`vote-load runs against the staging project or a local stack only, not ${url || 'nothing'}`);
  }
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * A room: the phones and every request they made. `phones` grows as late phones arrive.
 *
 * `opts.pollMs` and `opts.retryMs` exist for the test; a real run keeps the phone's 5 s.
 */
export function createRoom({ url, key, join, seed = 1, pollMs = POLL_MS, retryMs = 2_500, fetchImpl = fetch }) {
  assertTarget(url);
  const random = seeded(seed);
  const between = (lo, hi) => lo + random() * (hi - lo);
  const requests = [];
  const phones = [];
  let polling = true;

  async function rpc(kind, fn, args) {
    const started = performance.now();
    const startedAt = Date.now();
    let status = 0;
    let body = null;
    try {
      const res = await fetchImpl(`${url.replace(/\/+$/, '')}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
      status = res.status;
      const text = await res.text();
      body = text ? JSON.parse(text) : null;
    } catch {
      // A network failure: the phone shows "Not sent".
    }
    const message = status >= 200 && status < 300 ? '' : String(body?.message ?? '');
    requests.push({ kind, at: startedAt, ms: performance.now() - started, status, message });
    return { status, body, message };
  }

  function phone(index) {
    // `sent`: this script's own record, the last vote per round the server answered 200 to. What
    // the phone shows as "Your vote" is the server's `my_vote` in `view`.
    const p = { index, token: deviceToken(random), view: null, sent: new Map(), sends: [], timer: null };
    p.read = async () => {
      const { status, body } = await rpc('join', 'audience_join_by_slug', { p_join_slug: join, p_device: p.token });
      if (status !== 200) return;
      p.view = (Array.isArray(body) ? body[0] : body) ?? null;
    };
    p.poll = () => {
      if (!polling) return;
      p.timer = setTimeout(async () => {
        await p.read();
        p.poll();
      }, pollMs * (0.9 + random() * 0.2));
    };
    /** Tap an option and press Vote: up to two more presses after "Not sent" or "Too many". */
    p.vote = async (option) => {
      const round = p.view?.state?.round;
      if (!round) return null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const { status, message } = await rpc('vote', 'audience_vote', {
          p_join_slug: join,
          p_device: p.token,
          p_round: round.id,
          p_option: option,
          p_revision: Number(round.revision ?? 1),
        });
        const shown = phoneOutcome(status, message);
        p.sends.push({ round: round.id, option, attempt, shown, status, message });
        if (shown === null) p.sent.set(round.id, option);
        // The re-read straight after a send, as the page does: it shows "Your vote".
        await p.read();
        if (shown === null) return null;
        if (shown !== WORDS.notSent && shown !== WORDS.tooMany) return shown;
        await sleep(retryMs);
      }
      return p.sends.at(-1).shown;
    };
    phones.push(p);
    return p;
  }

  /** A phone opens the join link: it reads now, then every five seconds. */
  async function arrive(count) {
    const made = Array.from({ length: count }, () => phone(phones.length));
    await Promise.all(made.map((p) => p.read()));
    made.forEach((p) => p.poll());
    return made;
  }

  /** Wait until a phone has read a live question, as its poll brings it. */
  async function seen(p, deadline) {
    while (Date.now() < deadline) {
      const round = p.view?.state?.round;
      if (round) return round;
      await sleep(50);
    }
    return null;
  }

  /**
   * One run, from Go live: every phone without a vote of its own in this round picks within `windowMs` of seeing the
   * question (or of Go live, whichever is later) and presses Vote; `changers` phones change their
   * vote a few seconds later; `late` phones open the link during the run and vote. Resolves when
   * every phone is done.
   */
  async function run({ options, windowMs = 5_000, changers = 20, changeMs = [2_000, 6_000], late = 0, lateMs = [5_000, 15_000], timeoutMs = 60_000 }) {
    const liveAt = Date.now();
    const deadline = liveAt + timeoutMs;
    const pick = () => Math.floor(random() * options);
    const outcomes = [];
    const act = async (p, change) => {
      const round = await seen(p, deadline);
      if (!round) return outcomes.push({ phone: p.index, shown: 'never saw the question' });
      if (!p.sent.has(round.id)) {
        await sleep(Math.max(0, liveAt + between(0, windowMs) - Date.now()));
        const shown = await p.vote(pick());
        outcomes.push({ phone: p.index, kind: 'vote', shown });
      }
      if (change) {
        await sleep(between(changeMs[0], changeMs[1]));
        const from = p.sent.get(round.id);
        const to = (from ?? 0) + 1 + Math.floor(random() * (options - 1));
        const shown = await p.vote(to % options);
        outcomes.push({ phone: p.index, kind: 'change', shown });
      }
    };
    const present = [...phones];
    const changing = new Set(present.slice().sort(() => random() - 0.5).slice(0, changers));
    const work = present.map((p) => act(p, changing.has(p)));
    for (let i = 0; i < late; i += 1) {
      work.push(
        (async () => {
          await sleep(between(lateMs[0], lateMs[1]));
          const [p] = await arrive(1);
          await act(p, false);
        })(),
      );
    }
    await Promise.all(work);
    return outcomes;
  }

  /** Every phone reads once more (spread over two seconds) and says what it shows. */
  async function readBack(roundId) {
    await Promise.all(phones.map(async (p) => {
      await sleep(between(0, 2_000));
      await p.read();
    }));
    return phones.map((p) => (p.view?.state?.round?.id === roundId ? (p.view.my_vote ?? null) : 'not on this question'));
  }

  function leave() {
    polling = false;
    phones.forEach((p) => clearTimeout(p.timer));
  }

  return { phones, requests, rpc, arrive, run, readBack, leave };
}

/** The operator's two reads by the control slug: the tally and the export, as the page makes them. */
export async function operatorReads(room, control, roundId, options) {
  const tally = await room.rpc('tally', 'audience_tally', { p_slug: control, p_round: roundId });
  const row = Array.isArray(tally.body) ? tally.body[0] : tally.body;
  const exported = await room.rpc('export', 'audience_votes_export', { p_slug: control, p_round: roundId });
  const votes = Array.isArray(exported.body?.votes) ? exported.body.votes : [];
  return {
    tally: { counts: row?.counts ?? null, total: row?.total ?? null },
    export: { counts: countsOf(options, votes), total: votes.length, voters: new Set(votes.map((v) => v.voter)).size },
  };
}

/** The database host's readings every `everyMs` until stopped (the privileged metrics endpoint). */
export function sampleHost({ ref, serviceKey, everyMs = 5_000, fetchImpl = fetch }) {
  const readings = [];
  let timer = null;
  const scrape = async () => {
    try {
      const res = await fetchImpl(`https://${ref}.supabase.co/customer/v1/privileged/metrics`, {
        headers: { Authorization: `Basic ${Buffer.from(`service_role:${serviceKey}`).toString('base64')}` },
      });
      if (!res.ok) return readings.push({ at: Date.now(), error: `HTTP ${res.status}` });
      readings.push({ at: Date.now(), ...hostTotals(await res.text()) });
    } catch (error) {
      readings.push({ at: Date.now(), error: error.name });
    }
  };
  const loop = async () => {
    await scrape();
    timer = setTimeout(loop, everyMs);
  };
  void loop();
  return {
    readings,
    stop: () => clearTimeout(timer),
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (name, fallback) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : fallback);
  // Flags, not environment variables: a new variable naming a backend would be one the guard in
  // scripts/configured-target.mjs never looks at. `createRoom` refuses anything but staging.
  const url = flag('url', '');
  const key = flag('key', '');
  const join = flag('join');
  const control = flag('control');
  const count = Number(flag('phones', 100));
  if (!url || !key || !join || !control) {
    console.error('vote-load needs --url, --key, --join and --control.');
    process.exit(2);
  }
  const room = createRoom({ url, key, join, seed: Date.now() });
  await room.arrive(count);
  const round = room.phones[0].view?.state?.round;
  if (!round) {
    room.leave();
    console.error('No question is live on that production.');
    process.exit(1);
  }
  const options = round.options.length;
  const outcomes = await room.run({ options, changers: Math.round(count / 5), late: Math.round(count / 10) });
  const phonesShow = await room.readBack(round.id);
  room.leave();
  const reads = await operatorReads(room, control, round.id, options);
  console.log(JSON.stringify({
    phones: room.phones.length,
    script: scriptCounts(room.phones, round.id, options),
    ...reads,
    phonesNotShowingTheirVote: phonesShow.filter((v, i) => v !== (room.phones[i].sent.get(round.id) ?? null)).length,
    notCounted: outcomes.filter((o) => o.shown),
    requests: summarise(room.requests),
  }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
