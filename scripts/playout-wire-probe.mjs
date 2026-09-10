// WHAT DOES THE WIRE COST A PUBLISHED TAKE? - measured with no browser and no fixture.
//
//   node scripts/playout-wire-probe.mjs [--takes N]
//
// On a PUBLISHED production the operator's own PROGRAM monitor does not move when they press
// Take. `runVerb` (src/components/home/ProductionPage.tsx) awaits `control_send_many` and
// deliberately applies nothing locally, because the log follower brings the row back and
// applying twice would double every write. So the picture waits for two hops:
//
//   send     the RPC leaving this machine and its answer coming back
//   fanout   the inserted row reaching this same tab again over Realtime
//
// Those two are the whole difference between the local path and the published one, and NEITHER
// of them involves the browser: they are network, Postgres and the Realtime broadcaster. That is
// why this exists beside `playout-lag-bench.mjs` rather than inside it. The bench drives the real
// dashboard, needs a slot on this RAM-bound laptop, and takes ten minutes; this signs in, makes
// one throwaway production, presses the same three-command batch a Take sends, and answers in
// about fifteen seconds. When somebody asks "is the venue's network the problem", this is the
// instrument - run it AT the venue, on that wifi, and compare.
//
// IT IS NOT A SUBSTITUTE for the bench. It cannot see the paint: what it measures ends the
// moment the row arrives in this process, and the app still has to apply the command and draw a
// frame (about 30 ms on the built app, measured 2026-09-10). Add that to what this prints.
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
const median = (xs) => {
  const v = [...xs].sort((a, b) => a - b);
  return v.length ? Number(v[Math.floor(v.length / 2)].toFixed(1)) : null;
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
 * Every Realtime row this process saw: when it arrived, what kind it is, and WHICH TAKE SENT IT.
 *
 * The take number is carried in the command itself and read back off the row, rather than the
 * window being trusted to separate one take from the next. It has to be: the fan-out has a slow
 * mode of about 650 ms and occasional stragglers past that, so a row from take N can land inside
 * take N+1's wait and be read as an instant fan-out - which drags the median DOWN, in the one
 * direction that makes the instrument flatter than the truth.
 */
const arrivals = [];
let joined = false;
const channel = sb
  .channel(`wire-probe-${showId}`)
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'control_events', filter: `show_id=eq.${showId}` },
    (payload) => arrivals.push({
      at: performance.now(),
      t: payload.new?.msg?.t ?? '?',
      take: payload.new?.msg?.take ?? null,
    }),
  )
  .subscribe((status) => {
    if (status === 'SUBSCRIBED') joined = true;
  });

const joinStart = performance.now();
while (!joined && performance.now() - joinStart < 30_000) await sleep(50);
const joinMs = performance.now() - joinStart;
if (!joined) {
  console.error('the Realtime channel never joined in 30 s - a published operator page would be falling back to the 30 s poll (CONTROL_POLL_MS).');
}

console.log(`# playout wire probe — ${new Date().toISOString()} — ${JSON.stringify(freeNow())}`);
console.log(`# channel join: ${joinMs.toFixed(0)} ms`);
console.log('# take  sendMs  fanoutMs  back');

const sends = [];
const fanouts = [];
for (let i = 0; i < TAKES; i += 1) {
  const take = i + 1;
  // EXACTLY what a Take puts on the wire (`takeCueItems`): the cue's data, the graphic in, and
  // the shared cue-status row. Three rows, one atomic insert - so the numbers below are a take's,
  // not a single command's. `take` is this probe's own marker; `control_send_many` validates only
  // `t` and `graphic` and inserts `msg` verbatim, so it rides along and comes back on the row.
  const items = [
    { graphic: 'probe', msg: { t: 'update', take, data: { title: `take ${take}` } } },
    { graphic: 'probe', msg: { t: 'play', take } },
    { graphic: 'probe', msg: { t: 'cue', take, cue: `cue-${take}` } },
  ];
  const sent = performance.now();
  const { error } = await sb.rpc('control_send_many', { p_slug: slug, p_items: items });
  const returned = performance.now();
  if (error) {
    console.log(`# ${String(take).padStart(4)}  RPC FAILED: ${error.message}`);
    // Paced even here, and DELIBERATELY: the likeliest error is the log's own 50-per-5-seconds
    // cap, and retrying it without waiting turns one trip over the limit into every remaining
    // take failing.
    await sleep(900);
    continue;
  }
  // THE `play` ROW is the one that moves the picture - `update` sets values on a graphic that is
  // not up yet and `cue` is status the stage ignores by contract - so that is the row timed, and
  // it is picked by THIS take's marker rather than by being first in the window.
  sends.push(returned - sent);
  let play = null;
  const waitStart = performance.now();
  while (!play && performance.now() - waitStart < 10_000) {
    play = arrivals.find((a) => a.take === take && a.t === 'play') ?? null;
    if (!play) await sleep(2);
  }
  const fanoutMs = play ? play.at - sent : null;
  if (fanoutMs !== null) fanouts.push(fanoutMs);
  // How many of this take's three rows are back BY THE TIME its entrance is - the rest are still
  // in flight and are not waited for, because the operator is not waiting for them either.
  const backNow = arrivals.filter((a) => a.take === take).length;
  console.log(
    `# ${String(take).padStart(4)}${(returned - sent).toFixed(0).padStart(8)}${(fanoutMs === null ? 'none' : fanoutMs.toFixed(0)).padStart(10)}${String(backNow).padStart(6)}`,
  );
  // The log caps a production at 50 commands per 5 s (migration 0029) and a take is three, so
  // this paces well under it - and an operator does not press Take ten times a second either.
  await sleep(900);
}

await sb.removeChannel(channel);
await sb.from('control_shows').delete().eq('id', showId);

console.log('');
console.log(`# send   (click -> RPC answered):       median ${median(sends)} ms over ${sends.length}`);
console.log(`# fanout (click -> ENTRANCE back here): median ${median(fanouts)} ms over ${fanouts.length}`);
console.log('# the operator still waits for the app to apply and paint on top of the fanout number.');
if (fanouts.length < sends.length) {
  console.log(`# ${sends.length - fanouts.length} take(s) NEVER came back over Realtime within 10 s - on the real page those wait for the 30 s poll.`);
}
