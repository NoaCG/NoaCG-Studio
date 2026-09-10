// WHAT DOES THE WIRE COST A PUBLISHED TAKE AND A PUBLISHED OUT? - measured with no browser and
// no fixture, on BOTH roads a verb travels.
//
//   node scripts/playout-wire-probe.mjs [--takes N]
//
// Since 2026-09-10 a verb travels two roads from one press (src/control/commandRoads.ts), and one
// call puts it on both: `control_send_many` inserts the durable row AND broadcasts the same
// commands on the production's PRIVATE topic, in one transaction (migration 0056). This times
// both, for the same press, on the same wire, read by a SECOND client - because that is what an
// operator's other page and the browser output renderer are, and because a broadcast is never
// echoed back to whoever sent it.
//
//   send    the RPC leaving this machine and its answer coming back
//   fast    the database's broadcast reaching the other client, on `cmd-<show id>`
//   slow    the inserted row reaching the other client over `postgres_changes`
//
// BOTH NUMBERS START AT THE SAME INSTANT - the press - so they are directly comparable, and both
// now include the RPC's own round trip, because neither road exists until it commits. The first
// version of this road broadcast from the CLIENT before the insert, which is why its `fast`
// column was about 50 ms and this one's cannot be: what was bought with that difference is a road
// a read-only output URL could push a command onto.
//
// `fast` is what the picture waits for now and `slow` is what it used to wait for, so the two
// columns are the before and the after of the same press, taken a millisecond apart.
//
// On a PUBLISHED production those hops are the whole difference between the local path and the
// published one, and NEITHER of them involves the browser: they are network, Postgres and the
// Realtime broadcaster. That is why this exists beside `playout-lag-bench.mjs` rather than inside
// it. The bench drives the real dashboard, needs a slot on this RAM-bound laptop, and takes ten
// minutes; this signs in, makes one throwaway production, presses the same commands a Take and an
// Out send, and answers in about thirty seconds. When somebody asks "is the venue's network the
// problem", this is the instrument - run it AT the venue, on that wifi, and compare.
//
// IT IS NOT A SUBSTITUTE for the bench. It cannot see the paint: what it measures ends the
// moment the command arrives in this process, and the app still has to apply it and draw a frame
// (about 30 ms on the built app, measured 2026-09-10). Add that to what this prints.
//
// It writes to the real backend, as the signed-in E2E account and through the same RPC and RLS
// the app uses - not the service role, which would skip the row-level checks that are part of
// what is being timed. The throwaway `control_shows` row is deleted at the end and its events go
// with it (`on delete cascade`, migration 0008), so a run leaves nothing behind. A run that dies
// mid-way leaves ONE row named "Wire probe"; the next run deletes any it finds.

import { createRequire } from 'node:module';
import { freemem, totalmem } from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ambientEnv } from './read-dotenv.mjs';

// The SDK is resolved through THIS FILE rather than through the process's cwd, so the probe works
// from a linked worktree that has no `node_modules` of its own - the same reason every other
// script here imports its siblings by relative path.
const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');

const args = process.argv.slice(2);
const at = args.indexOf('--takes');
const TAKES = at < 0 ? 8 : Number(args[at + 1]);
if (!Number.isInteger(TAKES) || TAKES < 1) {
  console.error(`--takes needs a whole number of at least 1; got ${JSON.stringify(args[at + 1] ?? null)}.`);
  process.exit(2);
}

// The CHECKOUT, resolved from this file rather than from `process.cwd()`. This is the instrument
// the acceptance note hands the owner with "nothing to set up", and he will run it by its full
// path from wherever his shell happens to be - `ambientEnv(process.cwd())` would then look for a
// `.env` in that directory, shell `git rev-parse` there for the main-checkout fallback, find
// neither, and exit claiming the machine has no credentials. Every other keyed script here
// resolves the same way.
const env = ambientEnv(fileURLToPath(new URL('..', import.meta.url)));
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;
const email = env.E2E_EMAIL;
const password = env.E2E_PASSWORD;
if (!url || !key || !email || !password) {
  console.error('needs VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, E2E_EMAIL and E2E_PASSWORD (this checkout\'s .env, or the main checkout\'s).');
  process.exit(2);
}

const gb = (bytes) => Math.round((bytes / 1024 ** 3) * 100) / 100;
const freeNow = () => ({ freeGb: gb(freemem()), totalGb: gb(totalmem()) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/**
 * THE SPREAD, because a median hides the thing this instrument was built to find. The durable
 * road's fan-out has two MODES - about 130 ms and about 650 ms - and which one a press gets looked
 * random; a median over sixteen presses can report 130 while a quarter of them took five times
 * that, and it is the slow quarter an operator remembers. So every summary prints the whole shape:
 * fastest, median, slowest, and how many presses sat past twice the median.
 */
const spread = (xs) => {
  if (!xs.length) return 'none arrived';
  const v = [...xs].sort((a, b) => a - b);
  const mid = Number(v[Math.floor(v.length / 2)].toFixed(1));
  const stragglers = v.filter((x) => x > mid * 2).length;
  return (
    `median ${mid} ms  (${v[0].toFixed(0)} to ${v[v.length - 1].toFixed(0)} ms over ${v.length})` +
    (stragglers > 0 ? `  - ${stragglers} past twice the median` : '')
  );
};

const sb = createClient(url, key, { auth: { persistSession: false } });

const signedIn = await sb.auth.signInWithPassword({ email, password });
if (signedIn.error) {
  console.error(`sign-in refused: ${signedIn.error.message}`);
  process.exit(2);
}

const PROBE_TITLE = 'Wire probe';
// Anything a previous run left behind. Deleting by TITLE and nothing else keeps this off the
// account's real productions, which the live e2e suite also uses.
await sb.from('control_shows').delete().eq('title', PROBE_TITLE);

const showId = randomUUID();
const created = await sb
  .from('control_shows')
  .insert({ id: showId, title: PROBE_TITLE })
  .select('slug')
  .single();
if (created.error) {
  console.error(`could not create the probe production: ${created.error.message}`);
  process.exit(2);
}
const slug = created.data.slug;

/**
 * EVERY ARRIVAL THIS RUN SAW, on either road: when it landed, which command it was, which press
 * sent it, and which ROAD brought it.
 *
 * The press number is carried in the command itself and read back off the arrival, rather than
 * the window being trusted to separate one press from the next. It has to be: the slow road has a
 * mode of about 650 ms and occasional stragglers past that, so a row from press N can land inside
 * press N+1's wait and be read as an instant fan-out - which drags the median DOWN, in the one
 * direction that makes the instrument flatter than the truth.
 *
 * It is read by a SECOND CLIENT, on its own socket, joined to the channel the app itself uses
 * (`control-<show id>`). Two reasons, and both are the point: a broadcast is not echoed back to
 * the client that sent it, so a one-client probe would see the fast road not at all; and the
 * seats this measurement is about - another operator's phone, the output renderer - ARE other
 * clients. What this prints is what one of them waits.
 */
const arrivals = [];

// SIGNED OUT, ON PURPOSE - the seat this measures is anonymous. A browser source in OBS, the
// venue's playout machine and an operator's phone on the hosted URL all hold a slug and no
// account, so they read both roads as `anon`. Signing this client in would exercise the
// `authenticated` half of the command topic's read policy (migration 0056) and leave the half
// every real renderer uses unmeasured: if anon were refused, the fast column would print `none`
// here and nowhere else.
const watcher = createClient(url, key, { auth: { persistSession: false } });

const LOG_TOPIC = `control-${showId}`;
const COMMAND_TOPIC = `cmd-${showId}`;
const noteRow = (payload) => {
  const msg = payload?.new?.msg;
  if (msg) arrivals.push({ at: performance.now(), road: 'slow', t: msg.t ?? '?', press: msg.press ?? null });
};
const noteBroadcast = (frame) => {
  for (const item of frame?.payload?.items ?? []) {
    const msg = item?.msg;
    if (msg) arrivals.push({ at: performance.now(), road: 'fast', t: msg.t ?? '?', press: msg.press ?? null });
  }
};

// THE TWO CHANNELS A FOLLOWING SURFACE JOINS, exactly as `subscribeControlEvents` joins them: the
// public one for the log's rows, and the PRIVATE one for the command frames. Separate on purpose -
// the durable road must not depend on the private topic's authorization.
let joined = false;
const channel = watcher
  .channel(LOG_TOPIC)
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'control_events', filter: `show_id=eq.${showId}` },
    noteRow,
  )
  .subscribe((status) => {
    if (status === 'SUBSCRIBED') joined = true;
  });

let commandsJoined = false;
const commands = watcher
  .channel(COMMAND_TOPIC, { config: { private: true } })
  .on('broadcast', { event: 'cmd' }, noteBroadcast)
  .subscribe((status) => {
    if (status === 'SUBSCRIBED') commandsJoined = true;
  });

const joinStart = performance.now();
while ((!joined || !commandsJoined) && performance.now() - joinStart < 30_000) await sleep(50);
const joinMs = performance.now() - joinStart;
if (!joined) {
  console.error('the LOG channel never joined in 30 s - a published operator page would be falling back to the 30 s poll (CONTROL_POLL_MS).');
}
// SAID OUT LOUD, because a refused private join is the way this instrument lies: every `fastMs`
// below would print `none` and read as a broadcaster that had gone quiet, when what actually
// happened is that this reader was not allowed in (migration 0056's read policy).
if (!commandsJoined) {
  console.error(`the PRIVATE command channel (${COMMAND_TOPIC}) never joined in 30 s - the fast column below measures nothing. Check the read policy on realtime.messages.`);
}

console.log(`# playout wire probe - ${new Date().toISOString()} - ${JSON.stringify(freeNow())}`);
console.log(`# channel join: ${joinMs.toFixed(0)} ms`);
console.log('# press  verb   sendMs   fastMs   slowMs');

/** Wait for one press's own command to arrive on one road, or give up. */
async function waitFor(press, t, road, limitMs = 10_000) {
  const from = performance.now();
  for (;;) {
    const hit = arrivals.find((a) => a.press === press && a.t === t && a.road === road);
    if (hit) return hit.at;
    if (performance.now() - from > limitMs) return null;
    await sleep(2);
  }
}

const sends = [];
const roads = { take: { fast: [], slow: [] }, out: { fast: [], slow: [] } };

/**
 * ONE PRESS, exactly as `sendControlVerb` puts it on the wire: an `oid` per command so the two
 * roads reconcile, and `fast: true` on the items the database may also broadcast. `press` is this
 * probe's own marker - `control_send_many` validates only `t` and `graphic` and inserts `msg`
 * verbatim, so it rides along and comes back on the row exactly as `oid` does, while `fast` is
 * read for the broadcast and never written to the log at all.
 */
async function press(n, verb, items) {
  const marked = items.map((item) => ({
    graphic: item.graphic,
    msg: { ...item.msg, press: n, oid: `probe-${n}-${verb}-${item.msg.t}` },
    fast: true,
  }));
  const sent = performance.now();
  const { error } = await sb.rpc('control_send_many', { p_slug: slug, p_items: marked });
  const returned = performance.now();
  if (error) {
    console.log(`# ${String(n).padStart(5)}  ${verb.padEnd(4)}  RPC FAILED: ${error.message}`);
    // Paced even here, and DELIBERATELY: the likeliest error is the log's own 50-per-5-seconds
    // cap, and retrying it without waiting turns one trip over the limit into every remaining
    // press failing.
    await sleep(900);
    return;
  }
  sends.push(returned - sent);
  // THE COMMAND THAT MOVES THE PICTURE is the one timed: `play` for a take, `stop` for an out.
  // `update` sets values on a graphic that is not up yet and `cue` is status the stage ignores by
  // contract, so neither is what an operator is watching for.
  const moves = verb === 'take' ? 'play' : 'stop';
  const fastAt = await waitFor(n, moves, 'fast');
  const slowAt = await waitFor(n, moves, 'slow');
  if (fastAt !== null) roads[verb].fast.push(fastAt - sent);
  if (slowAt !== null) roads[verb].slow.push(slowAt - sent);
  const col = (v) => (v === null ? 'none' : v.toFixed(0)).padStart(9);
  console.log(
    `# ${String(n).padStart(5)}  ${verb.padEnd(4)}${(returned - sent).toFixed(0).padStart(9)}` +
      `${col(fastAt === null ? null : fastAt - sent)}${col(slowAt === null ? null : slowAt - sent)}`,
  );
  // The log caps a production at 50 commands per 5 s (migration 0029) and a take is three, so
  // this paces well under it - and an operator does not press Take ten times a second either.
  await sleep(900);
}

for (let i = 0; i < TAKES; i += 1) {
  const n = i + 1;
  await press(n, 'take', [
    { graphic: 'probe', msg: { t: 'update', data: { title: `take ${n}` } } },
    { graphic: 'probe', msg: { t: 'play' } },
    { graphic: 'probe', msg: { t: 'cue', cue: `cue-${n}` } },
  ]);
  await press(n, 'out', [
    { graphic: 'probe', msg: { t: 'stop' } },
    { graphic: 'probe', msg: { t: 'cue', cue: null } },
  ]);
}

await watcher.removeChannel(channel);
await watcher.removeChannel(commands);
await sb.from('control_shows').delete().eq('id', showId);

console.log('');
console.log(`# send (click -> RPC answered):   ${spread(sends)}`);
for (const verb of ['take', 'out']) {
  const { fast, slow } = roads[verb];
  console.log(`# ${verb.padEnd(5)} click -> another surface, FAST:  ${spread(fast)}`);
  console.log(`# ${verb.padEnd(5)} click -> another surface, slow:  ${spread(slow)}`);
}
console.log('# the operator still waits for the app to apply and paint on top of the fast number.');
// Counted against the presses that were actually ACCEPTED: a press whose RPC was refused returns
// before it waits for anything, and reading it as a lost broadcast would blame the wrong road.
const accepted = sends.length / 2;
for (const verb of ['take', 'out']) {
  const missing = Math.max(0, Math.round(accepted) - roads[verb].fast.length);
  if (missing > 0) {
    console.log(`# ${missing} ${verb}(s) never arrived on the FAST road within 10 s - those fall back to the durable row.`);
  }
}
