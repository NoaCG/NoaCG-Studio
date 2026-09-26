// THE OGRAF HOST DOCUMENT: a minimal OGraf v1 renderer for ONE Graphic, as a string.
//
// The bridge's bench can exercise a NoaCG template through `composeDocument` because the
// template IS the document. A third-party OGraf Graphic is the opposite shape - a Web Component
// to mount inside somebody's page - so to validate, drive or screenshot one, the driver needs a
// page that does what a renderer does: import the `main` module, register the class under a
// tag, mount it, call `load()`, then the actions (spec §"Renderer / loader contract"). This is
// that page, with a tiny driver (`window.__ografHost`) the CLI calls through `page.evaluate`.
//
// Where the package comes from: a module import needs a real http(s) URL (browsers refuse
// module imports over `file://`, docs/OGRAF.md), so the CLI MOUNTS the package under the app's
// own origin with `context.route` - `/__noacg-package/<id>/...` answered from the files on disk
// - and this document imports `graphic.mjs` from that base. The same-origin mount is what lets a
// component's own `new URL('./lib/x', import.meta.url)` resolve, and it is why the bench
// browser's route allowlist admits that path prefix and nothing else outside the app.
//
// It lives in control/ because two entries load it: the bridge (the CLI bench) and the output
// stage (src/output/foreignOgraf.ts), and neither may import the other.
//
// Pure string building. Without `sandbox` the document runs in the CLI's contained bench context
// only. With `sandbox` it is the BOUNDARY ADAPTER the output stage mounts a foreign package
// through (docs/OGRAF_ECOSYSTEM.md §3): the stage puts it in an opaque-origin frame, the network
// policy below confines every load to the package, and the lifecycle is driven over a
// MessagePort the embedding page hands it, instead of `page.evaluate`.

/** What the host needs to mount one Graphic. */
export interface OgrafHostOptions {
  /** Absolute or origin-relative base URL of the package (ends with '/'). */
  packageBase: string;
  /** The manifest's `main`, relative to the package base. */
  main: string;
  /** The custom element tag to register. `customElements.define` cannot be undone, so a host
   *  that mounts several Graphics in one document needs a distinct tag per load. */
  tag: string;
  /** Canvas size the renderer presents (`renderCharacteristics` and the stage box). */
  width: number;
  height: number;
  /** Run as the isolation boundary: impose the package network policy and answer lifecycle
   *  calls over the MessagePort the embedding page sends with OGRAF_PORT_TYPE. */
  sandbox?: boolean;
}

/**
 * The embedding page -> host document, ONCE, on the frame's first load and before any package
 * code has run: `{ type: OGRAF_PORT_TYPE }` with a MessagePort transferred. Every call and reply
 * after that rides the port, `{ id, call, args }` one way and `{ id, payload }` back. A port
 * reaches only the document it was handed to, so a frame that later navigates itself away takes
 * nothing of the channel with it, and no sibling frame can speak on it.
 */
export const OGRAF_PORT_TYPE = 'noacg-ograf-port';
/** The calls the bridge admits; anything else is dropped unanswered. `offair` takes effect at
 *  once and answers nothing; the rest run one at a time in arrival order and answer each. */
export const OGRAF_CALLS = ['mount', 'play', 'stop', 'update', 'custom', 'offair'] as const;
export type OgrafCall = (typeof OGRAF_CALLS)[number];
/** How long one call may take before the calls behind it go ahead (answered 504). A Graphic that
 *  never resolves an action must not hold the operator's Stop hostage. */
const OGRAF_CALL_TIMEOUT_MS = 15_000;

/** JSON for an inline <script>: a `</script>` inside a string must not end the element. */
const inScript = (value: unknown): string => JSON.stringify(value).replace(/</g, '\\u003c');

/**
 * THE NETWORK POLICY of a sandboxed host document: every script, style sheet, image, font,
 * media file and fetch comes from the package's own base URL and nowhere else. A CSP source with
 * a path that ends in '/' matches that path and below, so `../` out of the package is refused as
 * surely as another host is. (An ENCODED `..%2f` stays under the prefix, so the package's server
 * must never decode it into a separator; §3 lists what that server owes.) Inline script and eval
 * stay allowed: they are the frame's own code and fetch nothing, and a stranger's library may
 * need them. Workers are refused outright (`worker-src` would otherwise fall back to
 * `script-src`), and frames, manifests and prefetches by `default-src 'none'`. What a CSP cannot
 * stop is listed in §3 of docs/OGRAF_ECOSYSTEM.md.
 */
export function ografNetworkPolicy(packageBase: string): string {
  const base = packageScope(packageBase);
  return [
    "default-src 'none'",
    `script-src 'unsafe-inline' 'unsafe-eval' ${base}`,
    `style-src 'unsafe-inline' ${base}`,
    `img-src ${base} data: blob:`,
    `font-src ${base} data:`,
    `media-src ${base} data: blob:`,
    `connect-src ${base}`,
    "worker-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ');
}

/** The package base as a CSP source: an absolute http(s) URL ending in '/', with nothing in it
 *  that could end the source expression or the directive early. */
function packageScope(packageBase: string): string {
  const url = new URL(packageBase);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`package base must be http(s): ${packageBase}`);
  if (url.search || url.hash) throw new Error(`package base carries a query or fragment: ${packageBase}`);
  const href = url.href.endsWith('/') ? url.href : `${url.href}/`;
  if (/[\s;,'"]/.test(href)) throw new Error(`package base is not a plain URL: ${packageBase}`);
  return href;
}

/** The host page. Transparent background, the stage sized to the canvas, no chrome. */
export function ografHostDocument(opts: OgrafHostOptions): string {
  // Sandboxed, the base is the validated CSP scope itself, so the script URL and the policy agree.
  const base = opts.sandbox
    ? packageScope(opts.packageBase)
    : opts.packageBase.endsWith('/') ? opts.packageBase : `${opts.packageBase}/`;
  const mainUrl = inScript(`${base}${opts.main.replace(/^\.\//, '')}`);
  const tag = inScript(opts.tag);
  // FIRST in the head, so nothing the document loads precedes it.
  const policy = opts.sandbox
    ? `<meta http-equiv="Content-Security-Policy" content="${ografNetworkPolicy(base)}">\n`
    : '';
  // Driven by the embedding page over the ONE port its parent hands over (OGRAF_PORT_TYPE).
  const bridge = opts.sandbox
    ? `
  const host = window.__ografHost;
  const calls = ${inScript(OGRAF_CALLS)};
  let port = null;
  let chain = Promise.resolve();
  const answer = (p) => {
    let timer;
    const late = new Promise((r) => { timer = setTimeout(() => r({ statusCode: 504, statusMessage: 'no answer within ${OGRAF_CALL_TIMEOUT_MS} ms' }), ${OGRAF_CALL_TIMEOUT_MS}); });
    return Promise.race([p, late]).finally(() => clearTimeout(timer));
  };
  window.addEventListener('message', (ev) => {
    if (port || ev.source !== window.parent || !ev.data || ev.data.type !== ${inScript(OGRAF_PORT_TYPE)} || !ev.ports[0]) return;
    port = ev.ports[0];
    port.onmessage = (e) => {
      const m = e.data;
      if (!m || !calls.includes(m.call) || !Array.isArray(m.args)) return;
      if (m.call === 'offair') { host.offair(m.args[0]); return; }
      chain = chain.then(() => answer(host[m.call](...m.args))).then((out) => {
        // The ReturnPayload's own fields only: a Graphic may return anything, and a value
        // postMessage cannot clone would otherwise stall every call behind this one.
        port.postMessage({ id: m.id, payload: { statusCode: out && out.statusCode, statusMessage: out && out.statusMessage, currentStep: out && out.currentStep } });
      }).catch(() => {});
    };
  });`
    : '';
  return `<!doctype html>
<html><head>
${policy}<meta charset="utf-8">
<meta name="color-scheme" content="dark">
<title>OGraf host</title>
<style>
  html, body { margin: 0; width: ${opts.width}px; height: ${opts.height}px; overflow: hidden; background: transparent; }
  #stage { position: relative; width: ${opts.width}px; height: ${opts.height}px; }
  #stage > * { position: absolute; inset: 0; }
</style>
</head><body>
<div id="stage"></div>
<script type="module">
  // The driver the bench calls. Every method resolves to the Graphic's ReturnPayload (or a
  // synthesized 5xx when the component threw), never rejects - the spec's own posture.
  const state = { el: null, mod: null, error: null };
  const payload = (p) => (p === undefined ? { statusCode: 200 } : p);
  const run = async (fn) => {
    try { return payload(await fn()); }
    catch (err) { return { statusCode: 500, statusMessage: String((err && err.message) || err) }; }
  };
  window.__ografHost = {
    async mount(data, renderCharacteristics) {
      return run(async () => {
        if (!state.mod) state.mod = await import(${mainUrl});
        const cls = state.mod.default;
        if (typeof cls !== 'function') throw new Error('main does not default-export a class');
        if (!customElements.get(${tag})) customElements.define(${tag}, cls);
        const el = document.createElement(${tag});
        document.getElementById('stage').appendChild(el);
        state.el = el;
        return el.load({ data: data || {}, renderType: 'realtime', renderCharacteristics: renderCharacteristics || { resolution: { width: ${opts.width}, height: ${opts.height} } } });
      });
    },
    play(params) { return run(() => state.el.playAction(params || {})); },
    stop(params) { return run(() => state.el.stopAction(params || {})); },
    update(data, params) { return run(() => state.el.updateAction(Object.assign({ data: data || {} }, params || {}))); },
    custom(id, data, params) { return run(() => state.el.customAction(Object.assign({ id, payload: data || {} }, params || {}))); },
    async dispose() {
      const el = state.el; state.el = null;
      if (!el) return { statusCode: 200 };
      const out = await run(() => el.dispose({}));
      el.remove();
      return out;
    },
    mounted() { return !!state.el; },
    // OFF AIR FROM THE INSIDE, as a NoaCG layer does it (stage.ts): hiding the frame from the
    // embedder would let Chromium throttle it, and a replayed entrance would finish on air.
    offair(on) { document.getElementById('stage').style.opacity = on ? '0' : ''; },
  };
  window.addEventListener('error', (e) => { state.error = String(e.message || e.error); });
  window.__noacgHostReady = true;${bridge}
</script>
</body></html>`;
}

/** A tag name a browser accepts (lowercase, hyphenated, no reserved names) from any id. */
export function hostTagFor(id: string, nonce: string): string {
  const clean = id.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || 'graphic';
  return `noacg-host-${clean}-${nonce}`;
}
