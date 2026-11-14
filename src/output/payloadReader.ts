// READING THE PUBLISHED COPY OFF THE MAIN THREAD (live-publishing designs/G3.md section 5).
//
// An output that takes a new version reads the whole published copy, 6 to 20 MB. Parsing that on
// the page's main thread holds every command that arrives meanwhile. So a worker fetches and parses
// it, and hands the parsed payload back: the main thread receives a copy of the objects (no text to
// parse), and the stage, the swapper and the cues see exactly what they saw before.
//
// The worker is built from `readerMain` below as plain text (a Blob URL), so it needs no bundling
// and runs in Chromium 71 (CasparCG 2.3): ES2017, no imports. Anything that fails (no Worker, a
// refused Blob URL, an error in the worker) answers null and the caller reads on its main thread as
// before.

/**
 * The body of the worker. Two asks:
 *
 *   whole   fetch `control_output_resolve`, parse it, post back its `output` member (G3).
 *   parts   (live-publishing G4 section 5) fetch the head, then only the parts and images neither
 *           the worker nor the main thread holds, and post back the head and the specs the main
 *           thread lacks, images inline. It keeps only what the head it read and the one before
 *           name. A missing part or image reads the head once more; a second miss, no head, or two
 *           failed answers to one request answer `whole`, and the caller reads whole.
 *
 * Plain ES2017 with no spread, rest or helpers: it runs from its own text in Chromium 71.
 */
export function readerMain(): void {
  const scope = self as unknown as { onmessage: ((e: { data: unknown }) => void) | null; postMessage: (m: unknown) => void };
  type Ask = { id: number; url: string; key: string; slug: string; mode?: string; hold?: string[] };
  type Asset = { path: string; h?: string; data?: string };
  type Body = { assets?: Asset[] };
  type Ref = { key: string; p: string };
  const parts: { [d: string]: Body } = {};
  const images: { [h: string]: string } = {};
  let lastRefs: string[] = [];

  function call(ask: Ask, fn: string, args: object): Promise<unknown> {
    const once = () =>
      fetch(ask.url + '/rest/v1/rpc/' + fn, {
        method: 'POST',
        headers: { apikey: ask.key, authorization: 'Bearer ' + ask.key, 'content-type': 'application/json' },
        body: JSON.stringify(args),
        cache: 'no-store',
      }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))));
    // Two failed answers to one request: the caller reads whole.
    return once().catch(() => once());
  }

  function readWhole(ask: Ask): Promise<unknown> {
    return call(ask, 'control_output_resolve', { p_output_slug: ask.slug }).then((row) => (row && typeof row === 'object' ? (row as { output?: unknown }).output : null));
  }

  async function readParts(ask: Ask): Promise<{ whole: true } | { head: Record<string, unknown> | null; specs: { [d: string]: unknown } }> {
    const hold: { [d: string]: true } = {};
    (ask.hold || []).forEach((d) => (hold[d] = true));
    for (let round = 0; round < 2; round += 1) {
      const row = (await call(ask, 'control_output_head', { p_output_slug: ask.slug })) as { head?: Record<string, unknown> | null } | null;
      if (!row) return { head: null, specs: {} };
      const head = row.head;
      if (!head || typeof head !== 'object') return { whole: true };
      const refs = (Array.isArray(head.graphics) ? head.graphics : []) as Ref[];
      // Parts neither side holds, twenty to an answer.
      const need = refs.map((r) => r.p).filter((d) => !hold[d] && !parts[d]);
      let missing = false;
      for (let i = 0; i < need.length && !missing; i += 20) {
        const batch = need.slice(i, i + 20);
        const got = ((await call(ask, 'control_output_parts', { p_output_slug: ask.slug, p_digests: batch })) || {}) as { [d: string]: Body };
        batch.forEach((d) => {
          if (got[d] && typeof got[d] === 'object') parts[d] = got[d];
          else missing = true;
        });
      }
      // Images the parts to compose name and the worker does not hold, as many answers as it takes.
      const compose = refs.map((r) => r.p).filter((d) => !hold[d]);
      const want: string[] = [];
      compose.forEach((d) => {
        const body = parts[d];
        ((body && body.assets) || []).forEach((a) => {
          if (a.h && images[a.h] === undefined && want.indexOf(a.h) < 0) want.push(a.h);
        });
      });
      let asking = want;
      while (!missing && asking.length > 0) {
        const got = ((await call(ask, 'control_output_assets', { p_output_slug: ask.slug, p_hashes: asking })) || {}) as { assets?: { [h: string]: string }; more?: string[] };
        const answered = got.assets || {};
        const more = Array.isArray(got.more) ? got.more : [];
        asking.forEach((h) => {
          if (typeof answered[h] === 'string') images[h] = answered[h];
          else if (more.indexOf(h) < 0) missing = true;
        });
        if (more.length >= asking.length) missing = true; // nothing answered: never loop
        asking = more;
      }
      if (missing) continue;
      const specs: { [d: string]: unknown } = {};
      compose.forEach((d) => {
        const body = parts[d];
        const assets = (body.assets || []).map((a) => {
          if (!a.h) return a;
          const out: Asset = Object.assign({}, a);
          delete out.h;
          out.data = images[a.h];
          return out;
        });
        specs[d] = Object.assign({}, body, { assets: assets });
      });
      // Keep only what this head and the one before name.
      const keep: { [d: string]: true } = {};
      refs.forEach((r) => (keep[r.p] = true));
      lastRefs.forEach((d) => (keep[d] = true));
      lastRefs = refs.map((r) => r.p);
      const keepImages: { [h: string]: true } = {};
      Object.keys(parts).forEach((d) => {
        if (!keep[d]) delete parts[d];
        else ((parts[d].assets || []) as Asset[]).forEach((a) => a.h && (keepImages[a.h] = true));
      });
      Object.keys(images).forEach((h) => {
        if (!keepImages[h]) delete images[h];
      });
      return { head: head, specs: specs };
    }
    return { whole: true };
  }

  scope.onmessage = (e) => {
    const ask = e.data as Ask;
    const fail = (err: Error) => scope.postMessage({ id: ask.id, ok: false, error: String((err && err.message) || err) });
    if (ask.mode === 'parts') {
      readParts(ask).then((answer) => scope.postMessage(Object.assign({ id: ask.id, ok: true, parts: true }, answer)), fail);
      return;
    }
    readWhole(ask).then((output) => scope.postMessage({ id: ask.id, ok: true, output: output }), fail);
  };
}

let worker: Worker | null = null;
let broken = false;
let next = 1;
/** Each pending ask's answer handler: the worker's whole answer, or undefined when it failed. */
const waiting = new Map<number, (answer: WorkerAnswer | undefined) => void>();

interface WorkerAnswer {
  id: number;
  ok: boolean;
  output?: unknown;
  parts?: true;
  whole?: true;
  head?: Record<string, unknown> | null;
  specs?: Record<string, unknown>;
}

function start(): Worker | null {
  if (worker || broken) return worker;
  try {
    const url = URL.createObjectURL(new Blob(['(' + readerMain.toString() + ')()'], { type: 'text/javascript' }));
    worker = new Worker(url);
    worker.onmessage = (e: MessageEvent) => {
      const answer = e.data as WorkerAnswer;
      const done = waiting.get(answer.id);
      waiting.delete(answer.id);
      if (done) done(answer.ok ? answer : undefined);
    };
    worker.onerror = () => {
      // A worker that failed is never asked again: the next read goes to the main thread at once.
      broken = true;
      if (worker) worker.terminate();
      worker = null;
      waiting.forEach((done) => done(undefined));
      waiting.clear();
    };
  } catch {
    broken = true;
    worker = null;
  }
  return worker;
}

/** A worker that has not answered in this long is dropped and the page reads on the main thread. */
const READ_TIMEOUT_MS = 60_000;

/**
 * The published `output` of the production behind `slug`, parsed off the main thread. Undefined:
 * the worker could not answer (read on the main thread instead); null: no such production. Each
 * answer the worker gave is counted on `window.__noacgWorkerReads`, so a check can tell an answer
 * from the main-thread fallback (G3 R12).
 */
/** Ask the worker; undefined when it could not answer in time. */
function ask(message: Record<string, unknown>): Promise<WorkerAnswer | undefined> {
  const w = start();
  if (!w) return Promise.resolve(undefined);
  const id = next++;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waiting.delete(id);
      resolve(undefined);
    }, READ_TIMEOUT_MS);
    waiting.set(id, (answer) => {
      clearTimeout(timer);
      if (answer !== undefined) {
        const counted = window as unknown as { __noacgWorkerReads?: number };
        counted.__noacgWorkerReads = (counted.__noacgWorkerReads || 0) + 1;
      }
      resolve(answer);
    });
    w.postMessage(Object.assign({ id: id }, message));
  });
}

export function readPublishedOffThread(url: string, key: string, slug: string): Promise<unknown | null | undefined> {
  return ask({ url: url, key: key, slug: slug }).then((answer) => (answer ? answer.output : undefined));
}

/** The graphic specs this page holds, by part digest: those of the version it holds and of the one
 *  it is taking (G4 section 5, "What it keeps"). */
let heldSpecs = new Map<string, unknown>();

/**
 * The published `output` read in parts (live-publishing G4 section 5): the head, and only the specs
 * this page does not hold, put together with those it does. Answers the payload, null for no such
 * production, `whole` when it must be read whole (no current head, parts or images missing twice),
 * or undefined when the worker could not answer (read on the main thread instead).
 */
export function readPublishedInParts(url: string, key: string, slug: string): Promise<unknown | null | 'whole' | undefined> {
  return ask({ url: url, key: key, slug: slug, mode: 'parts', hold: Array.from(heldSpecs.keys()) }).then((answer) => {
    if (!answer) return undefined;
    if (answer.whole) return 'whole';
    const head = answer.head;
    if (!head) return null;
    const refs = (Array.isArray(head.graphics) ? head.graphics : []) as { p?: unknown }[];
    const specs = answer.specs || {};
    const graphics: unknown[] = [];
    const kept = new Map<string, unknown>();
    for (const ref of refs) {
      const d = typeof ref.p === 'string' ? ref.p : '';
      const spec = specs[d] !== undefined ? specs[d] : heldSpecs.get(d);
      if (spec === undefined) return 'whole';
      graphics.push(spec);
      kept.set(d, spec);
    }
    // What the version taken before names stays until the next read, so the version held and the
    // one being taken are both whole; nothing older is kept.
    const before = heldSpecs;
    heldSpecs = kept;
    lastRead.forEach((d) => {
      if (!heldSpecs.has(d) && before.has(d)) heldSpecs.set(d, before.get(d));
    });
    lastRead = refs.flatMap((r) => (typeof r.p === 'string' ? [r.p] : []));
    return Object.assign({}, head, { graphics: graphics });
  });
}
let lastRead: string[] = [];
