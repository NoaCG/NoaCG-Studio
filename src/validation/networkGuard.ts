// The pure half of the network bench (networkBench.ts): the policy that refuses every request
// leaving a graphic, the script that reports each refusal to the page that loaded it, and the words
// a finding uses. No DOM and no value imports, so a node test loads it as it is.

/** What the bench posts to its parent for each refused request. */
export const NETWORK_REQUEST_TYPE = 'noacg-network-request';

/**
 * Everything a composed graphic needs runs inline or from a `data:`/`blob:` URL, with one
 * exception: a bundled font is `url("fonts/<file>")`, a file every export ships beside the graphic
 * and the studio serves under `fontBase`. Anything else it asks for leaves the graphic: another
 * site, or a file of the studio's own that a pack installed elsewhere will not have. Inline and
 * eval scripts stay allowed, because the composed document is built from them (the shape of
 * `ografNetworkPolicy`, with the font folder in place of a package base).
 */
export function networkPolicy(fontBase: string): string {
  return [
    "default-src 'none'",
    "script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'",
    "style-src 'unsafe-inline'",
    'img-src data: blob:',
    `font-src data: ${fontScope(fontBase)}`,
    'media-src data: blob:',
    "connect-src 'none'",
    "worker-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ');
}

/** The bundled-font folder as a CSP source: an absolute http(s) URL ending in '/', with nothing
 *  in it that could end the source expression or the directive early. */
function fontScope(fontBase: string): string {
  const url = new URL(fontBase);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`font base must be http(s): ${fontBase}`);
  const href = `${url.origin}${url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`}`;
  if (/[\s;,'"]/.test(href)) throw new Error(`font base is not a plain URL: ${fontBase}`);
  return href;
}

/**
 * The policy and its listener, FIRST in the document so nothing it loads precedes them.
 *
 * - The listener sits on `window` in the capture phase and keeps its own handle on the parent, so
 *   it hears every refusal before any listener the graphic adds could stop it.
 * - It records which command the graphic was running, read off the messages the live-control
 *   script obeys.
 * - A peer-to-peer connection (WebRTC) is a request no policy covers, so its constructors report
 *   and refuse. A page that navigates itself away is reported by the bench, which sees the frame
 *   load a second time.
 * - Time runs `timeScale` times faster for the graphic's own timers as for GSAP, so a request
 *   made a few seconds after Take is still seen inside the bench's short phases.
 */
export function networkGuardTags(fontBase: string, timeScale: number): string {
  return `<meta http-equiv="Content-Security-Policy" content="${networkPolicy(fontBase)}">
<script id="noacg-network-guard">
(function () {
  var host = window.parent;
  var phase = 'load';
  var report = function (url, directive) {
    try { host.postMessage({ type: ${JSON.stringify(NETWORK_REQUEST_TYPE)}, url: url, directive: directive, phase: phase }, '*'); } catch (x) {}
  };
  window.addEventListener('message', function (ev) {
    if (ev.source === host && ev.data && typeof ev.data.cmd === 'string') phase = ev.data.cmd;
  }, true);
  window.addEventListener('securitypolicyviolation', function (e) {
    report(String(e.blockedURI || ''), String(e.effectiveDirective || e.violatedDirective || ''));
  }, true);
  ['RTCPeerConnection', 'webkitRTCPeerConnection'].forEach(function (name) {
    if (!window[name]) return;
    window[name] = function () {
      report('a peer-to-peer connection', 'webrtc');
      throw new Error('Refused: a community pack makes no outside connection.');
    };
  });
  var later = function (native) {
    return function (fn, ms) {
      var rest = Array.prototype.slice.call(arguments, 2);
      return native.apply(window, [fn, (Number(ms) || 0) / ${timeScale}].concat(rest));
    };
  };
  window.setTimeout = later(window.setTimeout);
  window.setInterval = later(window.setInterval);
  document.addEventListener('DOMContentLoaded', function () {
    try { if (window.gsap) window.gsap.globalTimeline.timeScale(${timeScale}); } catch (x) {}
  });
})();
</script>
`;
}

/** The composed document with the guard first in its head, wherever the head begins. */
export function withNetworkGuard(html: string, fontBase: string, timeScale: number): string {
  const tags = networkGuardTags(fontBase, timeScale);
  for (const opening of [/<head\b[^>]*>/i, /<html\b[^>]*>/i, /<!doctype[^>]*>/i]) {
    const m = opening.exec(html);
    if (m) return html.slice(0, m.index + m[0].length) + tags + html.slice(m.index + m[0].length);
  }
  return tags + html;
}

/** Refusals that are not a request for a file: inline code and eval are allowed, so these only
 *  arrive from a policy a browser reads more strictly. */
const NOT_A_REQUEST = new Set(['', 'inline', 'eval', 'wasm-eval', 'trusted-types-policy', 'trusted-types-sink']);

export const isRequest = (url: string): boolean => !NOT_A_REQUEST.has(url);

/** What kind of thing was asked for, from the directive that refused it. */
export function requestKind(directive: string): string {
  switch (directive.replace(/-(elem|attr)$/, '')) {
    case 'connect-src': return 'a request from its code';
    case 'img-src': return 'an image';
    case 'font-src': return 'a font';
    case 'media-src': return 'a sound or video';
    case 'style-src': return 'a stylesheet';
    case 'script-src': return 'a script';
    case 'frame-src':
    case 'child-src': return 'a frame';
    case 'worker-src': return 'a worker';
    case 'form-action': return 'a form';
    case 'webrtc': return 'WebRTC';
    case 'navigation': return 'a navigation';
    default: return 'a file';
  }
}

/** When it was asked for, from the command the graphic was running. */
export function requestMoment(phase: string): string {
  switch (phase) {
    case 'update': return 'when its fields change';
    case 'play': return 'when it plays';
    case 'next': return 'on Continue';
    case 'stop': return 'when it goes out';
    default: return 'as it loads';
  }
}

/** One request the bench refused. */
export interface ObservedRequest {
  url: string;
  directive: string;
  phase: string;
}

/** The sentence a maker or a reviewer reads about one refused request. */
export function requestMessage(r: ObservedRequest): string {
  return `It asks for ${r.url} (${requestKind(r.directive)}) ${requestMoment(r.phase)}. ` +
    'A community pack carries everything it shows: put the file in the graphic or remove the request.';
}
