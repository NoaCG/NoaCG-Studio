import { type Page, type Route } from '@playwright/test';
import { playedSeconds } from '../src/control/playoutProtocol';

// A FAKE NOACG BRIDGE AT THE NETWORK LAYER, for the playout specs that drive server clips
// (docs/CLIP_PLAYBACK_PLAN.md §10): `/health`, `/status`, `/list`, `/act` and `/state`, answered from
// a model of what the real Bridge's runner does - each file of a sequence after the one before it, a
// fade in starting that long before the end, and, for a sequence that loops, the first file again
// after the last - on a clock the test moves (`skew`). The runner itself is tested against a stateful
// fake CasparCG in cli/test/runner.test.mjs; this is only what a page can see of it.
//
// Its defaults are NoaCG Bridge 0.5.0 in front of CasparCG 2.5.0, which is what
// e2e/playout-sequence.spec.ts was written against. A spec names a newer Bridge (`features`), a
// server that can do less (`capabilities`), an action the server refuses (`refuse`), or one held in
// flight (`gate`).

export const BRIDGE = 'http://127.0.0.1:8899';
export const TOKEN = 'e2e-token';

/** Settings for a paired Bridge and a studio with two channels, clips on channel 2. */
export async function seedSettings(page: Page): Promise<void> {
  await page.addInitScript(
    ([bridge, token]) => {
      // Init scripts also run in sandboxed graphic frames; only the app owns these settings.
      if (window.top !== window) return;
      localStorage.setItem(
        'spx-gfx-caspar',
        JSON.stringify({
          agentUrl: bridge,
          agentToken: token,
          host: '127.0.0.1',
          amcpPort: 5250,
          channel: 1,
          layer: 20,
          v: 1,
          channels: [
            { channel: 1, name: 'Graphics' },
            { channel: 2, name: 'Inserts' },
          ],
          clipChannel: 2,
        }),
      );
    },
    [BRIDGE, TOKEN] as const,
  );
}

interface Entry {
  file: string;
  cueId?: string;
  length: number;
  fadeIn: number;
  raw: unknown;
}

/** What the Bridge runs on one slot: the files, when the first started, and a pause. */
interface Run {
  entries: Entry[];
  startedAt: number;
  pausedAt?: number;
  instance?: string;
  /** A sequence that starts over after its last file (Loop the folder). */
  loop?: boolean;
  /** One file the server itself LOOPs (a take's `loop`). */
  serverLoop?: boolean;
  /** A web page on the slot (a take of a URL: NoaCG's output put on air), which never ends. */
  html?: boolean;
}

export type FakeAction = { verb: string; slot: { channel: number; layer: number }; [k: string]: unknown };

export interface Fake {
  /** No Bridge is listening, while its configured settings stay in the browser. */
  missing: boolean;
  session: string;
  generation: Record<string, number>;
  runs: Record<string, Run | undefined>;
  /** Moves the fake's clock ahead of the wall's, as a clip playing on would. */
  skew: number;
  actions: FakeAction[];
  /** How many times the page has read `/state`. */
  stateCalls: number;
  /** Hold a captured state reply in flight to reproduce an output action overtaking it. */
  stateGate: () => Promise<void> | void;
  /** What the server's list (`CLS`) answers. */
  list: { name: string; kind: string; frames?: number; fps?: number }[];
  /** What `/health` lists. 0.5.0's by default; 0.6.0 adds `sequence-loop`. */
  features: string[];
  version: string;
  /** What `/status` lists for the server. */
  capabilities: string[];
  /** A plain take's length by file, seconds; 10 when not named. */
  lengths: Record<string, number>;
  /** The server refuses this action: its sentence, else null. Checked once the action is recorded. */
  refuse: (action: FakeAction) => string | null;
  /** Awaited before the action is answered, so a spec can hold one in flight. */
  gate: (action: FakeAction) => Promise<void> | void;
  /** The server refuses `INFO` for the channel, as for a channel it does not have. */
  refuseState: boolean;
  /** Puts a web page on a slot (`1-20`) as another operator would, or clears it. */
  showPage: (addr: string, url: string | null) => void;
  /** The Bridge restarts: a new session that remembers nothing it started, while the server plays on
   *  what it already had - the file on air, and the one queued behind it - and then holds. */
  restart: () => void;
}

export async function fakeBridge(page: Page, init: Partial<Omit<Fake, 'restart' | 'showPage'>> = {}): Promise<Fake> {
  let count = 0;
  const now = () => Date.now() + fake.skew;
  const fake: Fake = {
    missing: false,
    session: 'b5',
    generation: {},
    runs: {},
    skew: 0,
    actions: [],
    stateCalls: 0,
    stateGate: () => {},
    list: [],
    features: ['state', 'playback', 'sequence'],
    version: '0.5.0',
    capabilities: ['state', 'end', 'fade', 'trim', 'level', 'sequence'],
    lengths: {},
    refuse: () => null,
    gate: () => {},
    refuseState: false,
    ...init,
    showPage: (addr, url) => {
      fake.runs[addr] = url ? { entries: [{ file: url, length: 0, fadeIn: 0, raw: null }], startedAt: now(), html: true } : undefined;
    },
    restart: () => {
      fake.session = `${fake.session}r`;
      for (const run of Object.values(fake.runs)) {
        if (!run) continue;
        const { k } = where(run, ((run.pausedAt ?? now()) - run.startedAt) / 1000);
        const queued = run.entries[k + 1] ?? (run.loop ? run.entries[0] : undefined);
        run.entries = [...run.entries.slice(0, k + 1), ...(queued ? [queued] : [])];
        delete run.instance;
        delete run.loop;
      }
    },
  };
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
  const json = (route: Route, body: unknown) => route.fulfill({ status: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  /** Which entry is on air after `t` seconds, and how far into it: each starts its fade in before the
   *  one before it ends; the last holds at its end, or in a loop the first comes round again. */
  function where(run: Run, t: number) {
    const n = run.entries.length;
    if (run.serverLoop) return { k: 0, position: t % run.entries[0].length };
    let start = 0;
    let k = 0;
    for (let step = 1; ; step++) {
      const i = step % n;
      if (i === 0 && !run.loop) break;
      if (step >= n && !run.loop) break;
      const next = start + run.entries[k].length - run.entries[i].fadeIn;
      if (t < next) break;
      start = next;
      k = i;
    }
    return { k, position: Math.min(run.entries[k].length, t - start) };
  }
  await page.route(`${BRIDGE}/**`, async (route) => {
    if (fake.missing) {
      await route.abort('connectionrefused');
      return;
    }
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === '/health') {
      return json(route, { ok: true, agent: 'noacg-bridge', v: 2, version: fake.version, adapters: ['casparcg'], features: fake.features });
    }
    const body = JSON.parse(req.postData() || '{}') as { channel?: number; kind?: string; action?: FakeAction };
    if (path === '/status') {
      return json(route, { ok: true, v: 2, version: '2.5.0 69e8ad5 Stable', raw: '201 VERSION OK', capabilities: fake.capabilities });
    }
    if (path === '/list') return json(route, { ok: true, v: 2, items: body.kind === 'media' ? fake.list : [] });
    if (path === '/state') {
      fake.stateCalls += 1;
      if (fake.refuseState) {
        return json(route, { ok: false, v: 2, error: { hop: 'target', code: 'refused', detail: 'CasparCG refused the command: 401 INFO ERROR. Check the channel and layer.', raw: '401 INFO ERROR' } });
      }
      const channel = body.channel ?? 1;
      const slots = Object.entries(fake.runs)
        .filter(([addr]) => addr.startsWith(`${channel}-`))
        .map(([addr, run]) => {
          const common = { layer: Number(addr.split('-')[1]), generation: fake.generation[addr] ?? 0 };
          if (!run) return { ...common, producer: 'empty', paused: false, loop: false };
          if (run.html) return { ...common, producer: 'html', file: run.entries[0].file, paused: false, loop: false };
          const t = ((run.pausedAt ?? now()) - run.startedAt) / 1000;
          const { k, position } = where(run, t);
          const on = run.entries[k];
          // What is still to play after the one on air: the rest, and in a loop the first ones again.
          const rest = run.loop ? [...run.entries.slice(k + 1), ...run.entries.slice(0, k)] : run.entries.slice(k + 1);
          return {
            ...common,
            producer: 'video',
            file: on.file,
            segment: { start: 0, length: on.length },
            position,
            paused: run.pausedAt !== undefined,
            loop: !!run.serverLoop,
            ...(run.instance ? { instance: run.instance } : {}),
            ...(run.instance && on.cueId ? { cueId: on.cueId } : {}),
            ...(rest.length ? { queued: { file: rest[0].file, auto: true } } : {}),
            ...(run.instance && rest.length ? { sequence: { next: rest.map((e) => e.raw), ...(run.loop ? { loop: true } : {}) } } : {}),
          };
        });
      await fake.stateGate();
      return json(route, { ok: true, v: 2, channel, session: fake.session, observedAt: Date.now(), slots });
    }
    if (path === '/act') {
      const a = body.action!;
      fake.actions.push(a);
      const addr = `${a.slot.channel}-${a.slot.layer}`;
      // The real Bridge moves the generation before it sends, whether or not the server takes it.
      if (a.verb !== 'update' && a.verb !== 'next') fake.generation[addr] = (fake.generation[addr] ?? 0) + 1;
      await fake.gate(a);
      const refused = fake.refuse(a);
      if (refused) return json(route, { ok: false, v: 2, error: { hop: 'target', code: 'refused', detail: refused } });
      if (a.verb === 'pause' || a.verb === 'resume') {
        const run = fake.runs[addr];
        if (run && a.verb === 'pause' && run.pausedAt === undefined) run.pausedAt = now();
        if (run && a.verb === 'resume' && run.pausedAt !== undefined) {
          run.startedAt += now() - run.pausedAt;
          run.pausedAt = undefined;
        }
      }
      let instance: string | undefined;
      if (a.verb === 'take' || a.verb === 'sequence') {
        instance = `${fake.session}.${++count}`;
        const entries: Entry[] =
          a.verb === 'sequence'
            ? (a.entries as { item: { name: string }; cueId?: string; playback?: { fadeIn?: number; trim?: { in?: number; out?: number } }; media: { seconds: number } }[]).map((e) => ({
                file: e.item.name,
                cueId: e.cueId,
                // The part of the file the entry plays, by the one trim rule the page and the Bridge count with.
                length: playedSeconds(e.media.seconds, e.playback?.trim?.in, e.playback?.trim?.out) ?? e.media.seconds,
                fadeIn: e.playback?.fadeIn ?? 0,
                raw: e,
              }))
            : [{ file: (a.item as { name: string }).name, cueId: a.cueId as string | undefined, length: fake.lengths[(a.item as { name: string }).name] ?? 10, fadeIn: 0, raw: null }];
        fake.runs[addr] = {
          entries,
          startedAt: now(),
          instance,
          ...(a.verb === 'sequence' && a.loop === true ? { loop: true } : {}),
          ...(a.verb === 'take' && a.loop === true ? { serverLoop: true } : {}),
          ...(a.verb === 'take' && (a.item as { kind?: string }).kind === 'url' ? { html: true } : {}),
        };
      }
      if (a.verb === 'out' || a.verb === 'clear') fake.runs[addr] = undefined;
      return json(route, { ok: true, v: 2, raw: '202 OK', generation: fake.generation[addr], session: fake.session, ...(instance ? { instance } : {}) });
    }
    return json(route, { ok: true, v: 2, items: [] });
  });
  return fake;
}
