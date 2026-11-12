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

/** The body of the worker: fetch one RPC, parse it, post back its `output` member. */
function readerMain(): void {
  const scope = self as unknown as { onmessage: ((e: { data: unknown }) => void) | null; postMessage: (m: unknown) => void };
  scope.onmessage = (e) => {
    const ask = e.data as { id: number; url: string; key: string; slug: string };
    fetch(ask.url + '/rest/v1/rpc/control_output_resolve', {
      method: 'POST',
      headers: { apikey: ask.key, authorization: 'Bearer ' + ask.key, 'content-type': 'application/json' },
      body: JSON.stringify({ p_output_slug: ask.slug }),
      cache: 'no-store',
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then(
        (row: { output?: unknown } | null) => scope.postMessage({ id: ask.id, ok: true, output: row && typeof row === 'object' ? row.output : null }),
        (err: Error) => scope.postMessage({ id: ask.id, ok: false, error: String((err && err.message) || err) }),
      );
  };
}

let worker: Worker | null = null;
let broken = false;
let next = 1;
const waiting = new Map<number, (output: unknown | null | undefined) => void>();

function start(): Worker | null {
  if (worker || broken) return worker;
  try {
    const url = URL.createObjectURL(new Blob(['(' + readerMain.toString() + ')()'], { type: 'text/javascript' }));
    worker = new Worker(url);
    worker.onmessage = (e: MessageEvent) => {
      const answer = e.data as { id: number; ok: boolean; output?: unknown };
      const done = waiting.get(answer.id);
      waiting.delete(answer.id);
      if (done) done(answer.ok ? answer.output : undefined);
    };
    worker.onerror = () => {
      broken = true;
      waiting.forEach((done) => done(undefined));
      waiting.clear();
    };
  } catch (e) {
    broken = true;
    worker = null;
  }
  return worker;
}

/**
 * The published `output` of the production behind `slug`, parsed off the main thread. Undefined:
 * the worker could not answer (read on the main thread instead); null: no such production.
 */
export function readPublishedOffThread(url: string, key: string, slug: string, timeoutMs = 60000): Promise<unknown | null | undefined> {
  const w = start();
  if (!w) return Promise.resolve(undefined);
  const id = next++;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waiting.delete(id);
      resolve(undefined);
    }, timeoutMs);
    waiting.set(id, (output) => {
      clearTimeout(timer);
      resolve(output);
    });
    w.postMessage({ id, url, key, slug });
  });
}
