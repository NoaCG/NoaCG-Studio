// Build a single runnable HTML document from a template, for the live preview iframe.
//
// In the editor the HTML references external files (css/template.css, js/template.js,
// js/gsap.min.js). Those don't exist inside an iframe srcdoc, so here we strip those local
// references and inline the CSS, the bundled GSAP, and the template JS instead. The exported
// package keeps the external references (the files are written to disk by the exporter).

import gsapSource from '../assets/gsap.min.js?raw';
import lottieSource from '../assets/lottie.min.js?raw';
import { inlineAssetRefs, isDataUrl } from '../assets/assetUtils';
import { templateUsesLottie } from '../assets/lottieSupport';
import { settleGraphic, reportGraphicBox } from './settleGraphic';
import {
  PREVIEW_CMD_TYPE,
  PREVIEW_STATE_TYPE,
  PREVIEW_PLAYHEAD_TYPE,
  PREVIEW_CMD_ERROR_TYPE,
} from './previewProtocol';
import { killAllTimelines, resetGraphicInline, runSimCommand } from './simulatorRuntime';
import {
  CANVAS_CMD_TYPE,
  CANVAS_QUERY_TYPE,
  CANVAS_REPLY_TYPE,
  CANVAS_RECTS_TYPE,
  CANVAS_MARK,
} from './canvasControlProtocol';
import type { SpxTemplate } from '../model/types';

/** Remove <link>/<script> tags that point at local template files we will inline instead.
 *  (Exported: render/composeRenderDocument composes its own self-contained document.) */
export function stripLocalAssetTags(html: string): string {
  return html
    // <link rel="stylesheet" href="css/..."> and similar relative stylesheets
    .replace(/<link\b[^>]*href=["'](?:\.\/)?(?:css\/|js\/)[^"']*["'][^>]*>/gi, '')
    // <script src="js/..."></script> (gsap, template.js, any local js)
    .replace(/<script\b[^>]*src=["'](?:\.\/)?(?:js\/|css\/)[^"']*["'][^>]*>\s*<\/script>/gi, '');
}

/** Options for the live preview composition. */
export interface ComposeOptions {
  /**
   * Authoring/pasteboard mode — the EDITOR PREVIEW ONLY. Render the canvas inset by this pad
   * (canvas px) inside a larger viewport so content positioned OUTSIDE the canvas (an
   * entrance that starts off the left edge) is still painted and reachable. Pad is a pure
   * editor-view concept: it never enters the template code, keyframes, or any persisted
   * state, and it is NEVER used by exports/renders/thumbnails (those use their own composers).
   */
  authoring?: { padX: number; padY: number };
  /**
   * Park the graphic at its settled on-air state from INSIDE the document, driving it with this
   * data (a JSON string, the shape `update()` takes) once and reporting the result back. Once
   * settled, the document also reports its own bounding box back to `parent`
   * (`{ type: 'spx-preview-box', x, y, w, h }`) — a caller that needs to frame on the graphic
   * (preview/frameGraphic.ts) reads that instead of a `contentDocument` read, which the iframe's
   * `sandbox="allow-scripts"` (no `allow-same-origin`) makes impossible from outside.
   *
   * For a one-shot preview — the moderation queue's look at a stranger's template, a Home card's
   * thumbnail, a wizard picker card — this is the whole recipe: without it, every graphic that is
   * hidden until `play()` would show as a black rectangle, on the one surface whose only job is
   * to LOOK at the thing. A preview that needs REPEATED control after that (play again, push new
   * data, fire an operator event) reaches for `liveControl` below instead; the two options
   * compose (WizardPreview and GraphicControlPage use `liveControl` alone and settle their first
   * frame with an explicit `'settle'`/`'play'` command instead, since here the data to settle
   * with can change after compose without rebuilding the document — see their own comments).
   */
  settleWithData?: string;
  /**
   * Install a COMMAND CHANNEL inside the document instead of settling it once: the wizard's
   * persistent live preview (WizardPreview.tsx) needs to play/stop/update the SAME document
   * repeatedly (Replay, Out, a demo-text push) at times the parent can't predict, so a one-shot
   * settle isn't enough — but the template being previewed can be AI-generated or hand-imported
   * code, so the iframe still carries no `allow-same-origin` and the parent still can't reach in
   * directly.
   *
   * The document listens for the commands in preview/previewProtocol.ts's `PreviewCmd` union
   * (play/stop/next/update/settle/measure/dispatch/state) and calls the matching SPX or machine
   * function; a caller should send through that module's `postPreviewCmd`, not a raw
   * `postMessage`, so the wire shape can't drift. `'play'`, `'settle'` and `'measure'` reply with
   * the document's box exactly like `settleWithData` does, so a caller measuring for the
   * zoom-to-graphic framing never needs `contentDocument`; `'state'` replies with the machine's
   * pointers (`PreviewStateMessage`), for a caller polling what a state chip names and what greys
   * an event button. `'play'` and `'settle'` wait (capped) on `document.fonts.ready` first, so a
   * font choice shows whether the play/settle comes from the initial load or a later command.
   */
  liveControl?: boolean;
  /**
   * The EDITOR's own live simulator (PlayoutSimulator.tsx): play/stop/next/settle/scrub/snap,
   * distinct from `liveControl`'s plain commands because these prefer the house builder contract
   * (`buildInTimeline`/`buildOutTimeline`/`revealNextStep`) when the template has one, own
   * `window.__activeTl`/`__scrubTl` for a pushed playhead (`PreviewPlayheadMessage`, read by
   * StepTimeline/LegacyTimeline instead of polling `contentWindow`), and schedule the SPX `out`
   * auto-exit timer off the document's own `SPXGCTemplateDefinition` — none of which
   * WizardPreview/GraphicControlPage need. The command set (`'sim-play'`/`'sim-stop'`/
   * `'sim-next'`/`'sim-settle'`/`'scrub'`/`'snap'`, plus the plain `'update'`/`'dispatch'`/
   * `'state'` this option ALSO answers so the editor's iframe needs no other option turned on
   * for those) lives in preview/previewProtocol.ts's `PreviewCmd`; the composition itself is
   * preview/simulatorRuntime.ts's `runSimCommand`, serialized here for the same reason
   * `settleGraphic` is — it drives live GSAP timeline objects that cannot cross `postMessage`.
   */
  simulate?: boolean;
  /**
   * The EDITOR canvas's direct-manipulation channel (CanvasInteraction.tsx): hit-testing, live
   * drag/scale/rotate previews, and inline text editing, none of which fit `liveControl`'s
   * discrete commands — see preview/canvasControlProtocol.ts for the full design (a continuous
   * rect-push stream in place of per-pointermove hit-test queries, plus a small correlated
   * request/reply for the handful of reads a rect can't answer: a GSAP-resolved transform value,
   * an element's live text). This document tracks whatever selectors the `'track'` command names
   * and reports their rects every animation frame (`CanvasRectsMessage`) regardless of whether
   * anything is selected — hover hit-testing needs them too.
   */
  canvasControl?: boolean;
}

/**
 * Serialize one helper INTO a preview document, bound under BOTH names it can be called by.
 * Every `${fn.toString()}` in this file goes through here — that is the whole rule.
 *
 * `.toString()` hands back the function's source AS THE BUNDLER LEFT IT. Under `npm run dev`
 * Vite serves the original identifiers, so `killAllTimelines` is still spelled
 * `killAllTimelines`. A production build MINIFIES it to `Q` — and a SIBLING serialized function
 * that calls it (`runSimCommand` calls it four times) therefore carries `Q(...)` in its own
 * emitted source. Binding the helper only under the readable alias left `Q` undefined inside the
 * document, and composeDocument wraps every command in `try { … } catch (e) {}`, so the
 * `ReferenceError` went nowhere: on https://noacg.studio the editor stage never settled and
 * Play, Stop, Next, scrub and snap all did nothing, while dev was perfect. Reported 2026-08-27,
 * measured and fixed 2026-09-02; `scripts/check-preview-serialization.mjs` is the gate.
 *
 * So bind the BUNDLE's own name (`fn.name` — `killAllTimelines` in dev, `Q` in production) and
 * alias it to the readable name the hand-written code in these tags calls. Each tag runs inside
 * its own IIFE, so neither binding reaches the template's globals. The aliases are all
 * multi-character and a minifier hands out single characters, so an alias can never collide with
 * another helper's bundle name.
 */
function serializeHelper(fn: { name: string; toString(): string }, alias: string): string {
  const bound = fn.name || alias;
  const decl = `var ${bound} = ${fn.toString()};`;
  return bound === alias ? decl : `${decl}\n  var ${alias} = ${bound};`;
}

/** Inject inline <style>, GSAP, and the template JS into the document <head>/<body>. */
export function composeDocument(template: SpxTemplate, options: ComposeOptions = {}): string {
  // Inline uploaded assets (assets/foo.png -> data URL) so the preview renders media
  // without a server. The exported package keeps the relative paths + real files.
  let html = stripLocalAssetTags(inlineAssetRefs(template.html, template.assets));
  const css = inlineAssetRefs(template.css, template.assets);

  const { width, height } = template.resolution;

  // Base style: ensure the canvas is always exactly the right resolution even if the
  // template CSS doesn't set it (e.g. the blank template). Template CSS can override.
  const baseStyle = `html, body { width: ${width}px; height: ${height}px; overflow: hidden; }`;

  const styleTag = `<style id="spx-base-style">\n${baseStyle}\n</style>\n<style id="spx-inline-css">\n${css}\n</style>`;

  // Authoring/pasteboard mode (editor preview only, never exported): the iframe VIEWPORT is
  // grown to canvas + pad on every side (by PreviewFrame), so painting off-canvas content
  // requires a viewport larger than the canvas. This style — injected AFTER the template CSS
  // so it wins the cascade — insets the canvas by `pad` and stops the body from clipping.
  // `position: relative` is the least-invasive containing block: it keeps the root and every
  // absolutely-positioned descendant resolving against the canvas-sized body, so a 1920x1080
  // template lays out exactly as it does on air (verified by the pasteboard spike). No
  // transform/contain (would add a compositing layer) and no innerWidth shim — the residual
  // divergences (position:fixed, vw/vh, window.innerWidth reflecting the padded viewport) are
  // unused by the house px-based templates and stay honest rather than half-shimmed.
  const authoringStyleTag = options.authoring
    ? `<style id="spx-authoring-style">
html { overflow: hidden; }
body { position: relative; overflow: visible !important; margin: ${options.authoring.padY}px ${options.authoring.padX}px !important; }
</style>`
    : '';
  const gsapTag = `<script id="spx-gsap">\n${gsapSource}\n</script>`;
  // The bundled Lottie player rides along ONLY when the template uses it (unlike GSAP,
  // which every template animates with) — see src/assets/lottieSupport.ts.
  const lottieTag = templateUsesLottie(template) ? `\n<script id="spx-lottie">\n${lottieSource}\n</script>` : '';
  const jsTag = `<script id="spx-template-js">\n${template.js}\n</script>`;

  // Preview-only: uploaded assets exist as in-memory data URLs, so an image path the
  // template sets at RUNTIME (update() writing an <img> src, a rebuild injecting
  // <img src="images/...">) can't resolve inside the srcdoc iframe. This observer swaps
  // any known relative path for its data URL the moment it appears. The exported package
  // has the real files on disk and needs none of this.
  const runtimeAssets = Object.fromEntries(
    template.assets.filter((a) => isDataUrl(a.data)).map((a) => [a.path, a.data as string]),
  );
  const assetShimTag = Object.keys(runtimeAssets).length
    ? `<script id="spx-preview-assets">
(function () {
  var MAP = ${JSON.stringify(runtimeAssets)};
  // <img> uses src; an SVG picture slot (<image>, the imported-SVG road) uses href.
  function fix(el) {
    var attr = el.tagName === 'IMG' ? 'src' : 'href';
    var src = el.getAttribute(attr);
    if (!src) return;
    var clean = src.replace(/^\\.\\//, '');
    if (MAP[clean]) el.setAttribute(attr, MAP[clean]);
  }
  function isPic(el) { return el.tagName === 'IMG' || el.tagName === 'image'; }
  new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      if (m.type === 'attributes' && isPic(m.target)) fix(m.target);
      if (m.addedNodes) m.addedNodes.forEach(function (n) {
        if (n.tagName && isPic(n)) fix(n);
        else if (n.querySelectorAll) n.querySelectorAll('img, image').forEach(fix);
      });
    });
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'href'] });
})();
</script>\n`
    : '';

  // Capture runtime errors and report them to the builder (for the validator / inline feedback).
  // Defined before the template JS so it also catches errors thrown there.
  const captureTag = `<script id="spx-error-capture">
window.onerror = function (message, source, lineno) {
  try { parent.postMessage({ type: 'spx-preview-error', message: String(message), line: lineno }, '*'); } catch (e) {}
  return false;
};
window.addEventListener('unhandledrejection', function (ev) {
  try { parent.postMessage({ type: 'spx-preview-error', message: String(ev.reason) }, '*'); } catch (e) {}
});
</script>`;

  // Preview-only: match the editor's color-scheme (styles.css :root). Chromium disables
  // iframe TRANSPARENCY when the embedder's and the iframe's color-schemes disagree — a
  // dark app around an undeclared (light) srcdoc would paint the stage opaque white.
  // Exported packages don't get this tag; playout servers control their own background.
  const colorSchemeTag = `<meta name="color-scheme" content="dark">`;

  // GSAP must load before the template JS. Put both at the end of <head> if possible. The
  // authoring style comes LAST so it overrides the template's own resetCanvasCss.
  const headInjection = `${colorSchemeTag}\n${assetShimTag}${gsapTag}${lottieTag}\n${styleTag}\n${authoringStyleTag ? `${authoringStyleTag}\n` : ''}`;
  if (/<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, `${headInjection}</head>`);
  } else {
    html = headInjection + html;
  }

  // The settle bootstrap: the SHARED recipe (preview/settleGraphic.ts), serialized into the
  // document so it can run where the parent cannot reach. One definition, two places it executes.
  const settleTag = options.settleWithData
    ? `\n<script id="spx-settle">
(function () {
  ${serializeHelper(settleGraphic, 'settle')}
  ${serializeHelper(reportGraphicBox, 'report')}
  var run = function () {
    settle(window, ${JSON.stringify(options.settleWithData)});
    report(window);
  };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(run, run);
  else run();
})();
</script>`
    : '';

  // The live-control bootstrap (see ComposeOptions.liveControl): a command channel over
  // postMessage in place of contentWindow/contentDocument access. `waitFonts` mirrors the
  // fonts-ready cap the settle bootstrap folds into `run` above; here it gates every 'play'
  // (not just the first) since a Replay click should also show the chosen font, and awaiting an
  // already-resolved `fonts.ready` costs nothing observable.
  const liveControlTag = options.liveControl
    ? `\n<script id="spx-live-control">
(function () {
  ${serializeHelper(settleGraphic, 'settle')}
  ${serializeHelper(reportGraphicBox, 'report')}
  function waitFonts(cb) {
    if (document.fonts && document.fonts.ready) {
      var done = false;
      var go = function () { if (done) return; done = true; cb(); };
      document.fonts.ready.then(go, go);
      setTimeout(go, 400);
    } else {
      cb();
    }
  }
  window.addEventListener('message', function (ev) {
    if (ev.source !== window.parent) return;
    var msg = ev.data;
    if (!msg || msg.type !== ${JSON.stringify(PREVIEW_CMD_TYPE)}) return;
    if (msg.cmd === 'update') {
      try { window.update && window.update(msg.data); } catch (e) {}
    } else if (msg.cmd === 'play') {
      waitFonts(function () {
        try {
          if (msg.data != null) window.update && window.update(msg.data);
          window.play && window.play();
        } catch (e) {}
        report(window);
      });
    } else if (msg.cmd === 'settle') {
      waitFonts(function () {
        settle(window, msg.data);
        report(window);
      });
    } else if (msg.cmd === 'stop') {
      try { window.stop && window.stop(); } catch (e) {}
    } else if (msg.cmd === 'next') {
      try { window.next && window.next(); } catch (e) {}
    } else if (msg.cmd === 'dispatch') {
      /* Set and LEFT, never cleared after the call: noacgDispatch queues the event and the
         state's own calls fire a frame later, so clearing it here would put it back to null
         before the clock that needed it reads it. Every event rewrites it (to null when there
         is no instant), so it always reads as the most recent event's. */
      window.noacgEventAt = (typeof msg.at === 'number' && msg.at > 0) ? msg.at : null;
      try { window.noacgDispatch && window.noacgDispatch(msg.event, msg.payload); } catch (e) {}
    } else if (msg.cmd === 'measure') {
      report(window);
    } else if (msg.cmd === 'snap') {
      // Recovery semantics (docs/CLOUD_PLAYOUT.md §3): the output renderer restores a live
      // graphic's pose instantly — timers arm unless the sender says otherwise, exactly like
      // the exported receivers' noacgSnap path.
      try {
        window.noacgSnap && window.noacgSnap(
          msg.assignments || null,
          msg.timers === false ? { timers: false } : undefined
        );
      } catch (e) {}
    } else if (msg.cmd === 'state') {
      try {
        var s = window.noacgMachineState ? window.noacgMachineState() : null;
        // …and, in the same reply, WHICH VALUES DID NOT FIT (previewProtocol.ts's
        // PreviewStateMessage.overflow). Its own try/catch: a template answering one of the
        // two questions must still answer the one it has.
        var over = null;
        try { over = window.noacgTextOverflow ? window.noacgTextOverflow() : null; } catch (e2) {}
        parent.postMessage({ type: ${JSON.stringify(PREVIEW_STATE_TYPE)}, state: s, overflow: over }, '*');
      } catch (e) {}
    }
  });
})();
</script>`
    : '';

  // The editor's simulator bootstrap (see ComposeOptions.simulate): runSimCommand
  // (preview/simulatorRuntime.ts) drives window.__activeTl/__scrubTl directly, so the
  // composition has to live where those timeline objects do. It also answers the plain
  // 'update'/'dispatch'/'state' commands itself (the editor's iframe turns on `simulate` alone,
  // never `liveControl`, so exactly one script is ever listening for a given message — running
  // both would double-handle a shared command name like 'dispatch'). The playhead push is a
  // free-running rAF loop: while a timeline is active it reports {phase, time, duration} every
  // frame so StepTimeline/LegacyTimeline can draw a live playhead without polling
  // contentWindow; it costs nothing while idle (an active-check and nothing else).
  const simulateTag = options.simulate
    ? `\n<script id="spx-simulate">
(function () {
  ${serializeHelper(killAllTimelines, 'killAllTimelines')}
  ${serializeHelper(resetGraphicInline, 'resetGraphicInline')}
  ${serializeHelper(runSimCommand, 'runSimCommand')}
  /* A command that throws is NEVER nothing to say. Swallowing it silently is what let a
     minified-name mismatch kill settle, play, stop, next, scrub and snap on the deployed site for
     a week while every local reading stayed green (2026-09-02): no console error, no badge, just
     a blank stage and a Play button that did nothing. Every command runs through sim() below,
     which reports the throw and — just as importantly — CLEARS on the press that works, so a
     single bad scrub does not haunt the stage. It is its own channel rather than the load-time
     'spx-preview-error' one because that one is an export blocker that only a rebuild clears, and
     "this press failed" is not "this graphic cannot ship". The rAF playhead loop below keeps its
     silent catch: it fires sixty times a second. */
  function sim(name, run) {
    var message = null;
    try {
      run();
    } catch (e) {
      message = name + ': ' + ((e && e.message) || String(e));
    }
    try {
      parent.postMessage({ type: ${JSON.stringify(PREVIEW_CMD_ERROR_TYPE)}, message: message }, '*');
    } catch (ignored) {}
  }
  window.addEventListener('message', function (ev) {
    if (ev.source !== window.parent) return;
    var msg = ev.data;
    if (!msg || msg.type !== ${JSON.stringify(PREVIEW_CMD_TYPE)}) return;
    if (msg.cmd === 'update') {
      /* An update() that throws is the single most common failure in generated code - a field id
         that does not exist, a data shape the template did not expect - and it produces exactly
         the symptom this channel was added for: stale content on the stage and nothing said. */
      sim('update', function () { window.update && window.update(msg.data); });
    } else if (msg.cmd === 'dispatch') {
      /* Set and LEFT, never cleared after the call: noacgDispatch queues the event and the
         state's own calls fire a frame later, so clearing it here would put it back to null
         before the clock that needed it reads it. Every event rewrites it (to null when there
         is no instant), so it always reads as the most recent event's. */
      window.noacgEventAt = (typeof msg.at === 'number' && msg.at > 0) ? msg.at : null;
      sim('dispatch', function () { window.noacgDispatch && window.noacgDispatch(msg.event, msg.payload); });
    } else if (msg.cmd === 'state') {
      try {
        var s = window.noacgMachineState ? window.noacgMachineState() : null;
        // …and, in the same reply, WHICH VALUES DID NOT FIT (previewProtocol.ts's
        // PreviewStateMessage.overflow). Its own try/catch: a template answering one of the
        // two questions must still answer the one it has.
        var over = null;
        try { over = window.noacgTextOverflow ? window.noacgTextOverflow() : null; } catch (e2) {}
        parent.postMessage({ type: ${JSON.stringify(PREVIEW_STATE_TYPE)}, state: s, overflow: over }, '*');
      } catch (e) {}
    } else if (msg.cmd === 'sim-play') {
      sim('sim-play', function () { runSimCommand(window, { action: 'sim-play', data: msg.data }); });
    } else if (msg.cmd === 'sim-stop') {
      sim('sim-stop', function () { runSimCommand(window, { action: 'sim-stop' }); });
    } else if (msg.cmd === 'sim-next') {
      sim('sim-next', function () { runSimCommand(window, { action: 'sim-next' }); });
    } else if (msg.cmd === 'sim-settle') {
      sim('sim-settle', function () { runSimCommand(window, { action: 'sim-settle', data: msg.data }); });
    } else if (msg.cmd === 'scrub') {
      sim('scrub', function () { runSimCommand(window, { action: 'scrub', phase: msg.phase, time: msg.time, data: msg.data, from: msg.from }); });
    } else if (msg.cmd === 'snap') {
      sim('snap', function () { runSimCommand(window, { action: 'snap', assignments: msg.assignments, timers: msg.timers }); });
    }
  });
  (function tickPlayhead() {
    requestAnimationFrame(tickPlayhead);
    var active = window.__activeTl || window.__scrubTl;
    try {
      if (active) {
        var dur = Math.max(active.tl.duration(), 0.001);
        var time = active.tl.time() % (dur + 0.0001);
        parent.postMessage({ type: ${JSON.stringify(PREVIEW_PLAYHEAD_TYPE)}, active: true, phase: active.phase, time: time, duration: dur, runId: active.runId }, '*');
      } else {
        parent.postMessage({ type: ${JSON.stringify(PREVIEW_PLAYHEAD_TYPE)}, active: false, phase: '', time: 0, duration: 0, runId: 0 }, '*');
      }
    } catch (e) {}
  })();
})();
</script>`
    : '';

  // WHAT A MARK LOOKS LIKE (canvasControlProtocol.ts's `CANVAS_MARK` and its 'mark' command).
  // Shipped with the channel rather than pushed by the caller, because a class the document
  // cannot paint is a class that does nothing - so the document owning the paint is what makes
  // the command's contract complete.
  //
  // The wash is an SVG FILTER rather than a fill, because it has to sit OVER the shape's own
  // colour and an element has one fill: feFlood makes a sheet of amber, feComposite cuts it to
  // the shape's own alpha, and feMerge lays that over the shape unchanged. So a rounded plate, a
  // freehand path and a plate turned three degrees all light up as the shape the designer drew,
  // which is the whole reason this is a class going IN rather than a box drawn on top from a
  // rect coming out (docs/TEXT_BOX_BINDING.md, "the preview overlay").
  //
  // THE FILTER REGION IS LEFT AT SVG'S OWN DEFAULT (-10% to 120% of the bounding box) rather than
  // pinned to the box, because a plate with a stroke paints outside its bounding box and pinning
  // the region would CLIP that stroke - the artwork visibly changing because somebody pointed at
  // a checklist row, which is the one thing a preview of an import must never do. The price is
  // that a marked element's `getBoundingClientRect` grows by the region's margin while it is lit,
  // and nothing reads it there: a mark only exists while the pointer is on the CHECKLIST, and the
  // pointer reaching the canvas is the same event that clears it.
  const canvasMarkTag = `
<svg id="spx-canvas-mark-defs" width="0" height="0" aria-hidden="true" style="position:absolute">
  <filter id="spx-canvas-lit-tint">
    <feFlood flood-color="#f6a623" flood-opacity="0.12" result="wash" />
    <feComposite in="wash" in2="SourceAlpha" operator="in" result="onShape" />
    <feMerge>
      <feMergeNode in="SourceGraphic" />
      <feMergeNode in="onShape" />
    </feMerge>
  </filter>
</svg>
<style id="spx-canvas-mark-style">
.${CANVAS_MARK.LIT} { filter: url(#spx-canvas-lit-tint); }
</style>`;

  // The editor canvas's direct-manipulation channel (see ComposeOptions.canvasControl and
  // preview/canvasControlProtocol.ts). `tracked` starts empty until the parent's first 'track'
  // command arrives (right after load), so the rect push is a no-op until then.
  const canvasControlTag = options.canvasControl
    ? `\n${canvasMarkTag}
<script id="spx-canvas-control">
(function () {
  var tracked = [];
  var framed = [];
  function elDepth(el) {
    var n = 0;
    for (var q = el.parentElement; q; q = q.parentElement) n++;
    return n;
  }
  window.addEventListener('message', function (ev) {
    if (ev.source !== window.parent) return;
    var msg = ev.data;
    if (!msg) return;
    if (msg.type === ${JSON.stringify(CANVAS_CMD_TYPE)}) {
      if (msg.cmd === 'track') {
        tracked = msg.selectors || [];
        framed = msg.frames || [];
      } else if (msg.cmd === 'mark') {
        // ONE COMMAND IS THE WHOLE STATE OF A MARK: everything wearing the class loses it, then
        // every named selector gains it. So a caller never has to remember what it lit last, and
        // an empty list is how it clears.
        try {
          var wearing = document.querySelectorAll('.' + msg.className);
          for (var w = 0; w < wearing.length; w++) wearing[w].classList.remove(msg.className);
          var want = msg.selectors || [];
          for (var s = 0; s < want.length; s++) {
            var marked = [];
            try { marked = document.querySelectorAll(want[s]); } catch (e) {}
            for (var q = 0; q < marked.length; q++) marked[q].classList.add(msg.className);
          }
        } catch (e) {}
      } else if (msg.cmd === 'gsap-set') {
        try {
          var gEl = document.querySelector(msg.selector);
          if (gEl && window.gsap) window.gsap.set(gEl, msg.vars);
        } catch (e) {}
      } else if (msg.cmd === 'set-style') {
        try {
          var sEl = document.querySelector(msg.selector);
          if (sEl) {
            for (var k in msg.props) {
              if (Object.prototype.hasOwnProperty.call(msg.props, k)) sEl.style[k] = msg.props[k];
            }
          }
        } catch (e) {}
      } else if (msg.cmd === 'set-scale-var') {
        try {
          if (msg.value == null) document.documentElement.style.removeProperty('--scale');
          else document.documentElement.style.setProperty('--scale', String(msg.value));
        } catch (e) {}
      } else if (msg.cmd === 'set-text') {
        try {
          var tEl = document.querySelector(msg.selector);
          if (tEl && tEl.tagName !== 'IMG') tEl.textContent = msg.text;
        } catch (e) {}
      }
    } else if (msg.type === ${JSON.stringify(CANVAS_QUERY_TYPE)}) {
      try {
        var values = (msg.requests || []).map(function (r) {
          try {
            var el = document.querySelector(r.selector);
            if (!el) return null;
            if (r.kind === 'text') return el.textContent;
            var v = window.gsap && window.gsap.getProperty ? window.gsap.getProperty(el, r.prop) : null;
            var n = Number(v);
            return isNaN(n) ? null : n;
          } catch (e) {
            return null;
          }
        });
        parent.postMessage({ type: ${JSON.stringify(CANVAS_REPLY_TYPE)}, reqId: msg.reqId, values: values }, '*');
      } catch (e) {}
    }
  });
  (function tickRects() {
    requestAnimationFrame(tickRects);
    try {
      var rects = {};
      for (var i = 0; i < tracked.length; i++) {
        var sel = tracked[i];
        var el2 = null;
        try { el2 = document.querySelector(sel); } catch (e) {}
        if (el2 && el2.getClientRects().length > 0) {
          var r = el2.getBoundingClientRect();
          rects[sel] = { left: r.left, top: r.top, width: r.width, height: r.height, depth: elDepth(el2) };
        } else {
          rects[sel] = null;
        }
      }
      // THE ELEMENT'S OWN FRAME, for the selectors that asked for one (CanvasFrame). getBBox
      // leaves out every transform above the element, so those numbers are the same on any
      // canvas rendering the same markup; getScreenCTM carries the whole chain, so a caller can
      // draw a rectangle in the element's space and let CSS do the turning. A plain HTML node
      // has neither and answers with its rect and the identity, which is exactly true for it.
      var frames = {};
      for (var j = 0; j < framed.length; j++) {
        var fsel = framed[j];
        var fel = null;
        try { fel = document.querySelector(fsel); } catch (e) {}
        if (!fel || fel.getClientRects().length === 0) {
          frames[fsel] = null;
          continue;
        }
        var bb = fel.getBBox ? fel.getBBox() : null;
        var ctm = fel.getScreenCTM ? fel.getScreenCTM() : null;
        if (bb && ctm) {
          frames[fsel] = {
            box: { x: bb.x, y: bb.y, width: bb.width, height: bb.height },
            m: [ctm.a, ctm.b, ctm.c, ctm.d, ctm.e, ctm.f],
          };
        } else {
          var fr = fel.getBoundingClientRect();
          frames[fsel] = {
            box: { x: fr.left, y: fr.top, width: fr.width, height: fr.height },
            m: [1, 0, 0, 1, 0, 0],
          };
        }
      }
      parent.postMessage(
        { type: ${JSON.stringify(CANVAS_RECTS_TYPE)}, rects: rects, frames: frames },
        '*',
      );
    } catch (e) {}
  })();
})();
</script>`
    : '';

  // Error capture + template JS go right before </body> so the DOM exists when functions run.
  if (/<\/body>/i.test(html)) {
    html = html.replace(
      /<\/body>/i,
      `${captureTag}\n${jsTag}${settleTag}${liveControlTag}${simulateTag}${canvasControlTag}\n</body>`,
    );
  } else {
    html = html + captureTag + jsTag + settleTag + liveControlTag + simulateTag + canvasControlTag;
  }

  return html;
}
