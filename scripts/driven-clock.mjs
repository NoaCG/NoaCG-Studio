// A clock, frames and timers a test advances by hand, for running catalog designs in a page.
// `installDrivenPage(page)` puts it, and the two helpers every such test needs, on a page from
// `withBundledPage` (scripts/catalog-emit.mjs).
//
// GSAP reads `Date.now` and `requestAnimationFrame` when it loads, and a hidden iframe's frames
// are throttled, so real time would be both slow and flaky. `DRIVEN_CLOCK` is a <script> to put
// ahead of everything else in a composed document; it replaces the clock, the frame callback and
// the timers, and `window.__advance(ms)` then moves them in 40 ms steps. `new Date()` stays real,
// so a time-of-day readout is not driven.

export const DRIVEN_CLOCK = `<script id="test-clock">
(function () {
  var origin = 1700000000000, now = origin, seq = 0, timers = [], frames = [];
  Date.now = function () { return now; };
  performance.now = function () { return now - origin; };
  window.requestAnimationFrame = function (cb) { frames.push({ id: ++seq, cb: cb }); return seq; };
  window.cancelAnimationFrame = function (id) { frames = frames.filter(function (f) { return f.id !== id; }); };
  function add(cb, ms, args, repeat) {
    if (typeof cb !== 'function') return 0;
    var wait = Math.max(0, Number(ms) || 0);
    timers.push({ id: ++seq, cb: cb, at: now + wait, every: Math.max(1, wait), args: args, repeat: repeat });
    return seq;
  }
  window.setTimeout = function (cb, ms) { return add(cb, ms, [].slice.call(arguments, 2), false); };
  window.setInterval = function (cb, ms) { return add(cb, ms, [].slice.call(arguments, 2), true); };
  window.clearTimeout = window.clearInterval = function (id) { timers = timers.filter(function (t) { return t.id !== id; }); };
  // A callback that throws must not stop the others, as in a real frame.
  function run(fn, args) { try { fn.apply(window, args); } catch (e) { /* the template's own error */ } }
  window.__advance = function (ms) {
    var end = now + ms;
    while (now < end) {
      now = Math.min(end, now + 40);
      // Capped, so a zero-delay timer that re-arms itself cannot hold one step for ever.
      for (var fired = 0; fired < 1000; fired++) {
        var due = null;
        for (var i = 0; i < timers.length; i++) if (timers[i].at <= now && (!due || timers[i].at < due.at)) due = timers[i];
        if (!due) break;
        if (due.repeat) due.at += due.every; else timers.splice(timers.indexOf(due), 1);
        run(due.cb, due.args);
      }
      var batch = frames; frames = [];
      for (var j = 0; j < batch.length; j++) run(batch[j].cb, [now - origin]);
    }
  };
})();
</script>`;

/** Runs in the browser. `__mountDesign(template, head)` composes a design (NOACG_COMPOSE must be on
 *  the page) into a fresh iframe of its own size with the driven clock and `head` (optional
 *  markup, such as a test's font faces) ahead of everything, and hands back its window.
 *
 *  `__importDraft(svg, behaviour)` is the draft the wizard builds when a file is dropped
 *  (`CreationWizard.tsx`, the import step's `onSvg`), for building an imported design without
 *  the wizard: fitted to the default 1920x1080 frame; every text a field and ON except furniture (`static:`,
 *  or a letter tile no behaviour writes) and text outside the canvas; furniture listed last; a
 *  proposed countdown's clock armed; pictures and outlined text OFF unless marked `f:`; the extras
 *  the names declare; growth off on the widest shape; fonts matched to the bundled faces by lookup
 *  name. It needs NOACG_DRAFT on the page, and matches fonts only where `model/fonts.ts` is
 *  bundled as NOACG_FONTS. The behaviour is the caller's, proposed the wizard's way
 *  (`proposeSvgBehaviour` over the candidates inside the canvas). A copy of the wizard's assembly
 *  until that assembly is one function in `import/draft.ts`, so the two change together. */
const PAGE_HELPERS = (clock) => {
  window.__TEST_CLOCK = clock;
  window.__mountDesign = async (template, head = '') => {
    const html = window.NOACG_COMPOSE.composeDocument(template);
    const first = clock + head;
    const srcdoc = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + first) : first + html;
    document.getElementById('fx')?.remove();
    const frame = document.createElement('iframe');
    frame.id = 'fx';
    frame.style.cssText = `position:fixed;left:0;top:0;width:${template.resolution.width}px;height:${template.resolution.height}px;border:0;`;
    await new Promise((resolve) => { frame.onload = resolve; frame.srcdoc = srcdoc; document.body.appendChild(frame); });
    return frame.contentWindow;
  };
  window.__importDraft = (svg, behaviour) => {
    const resolution = { width: 1920, height: 1080 };
    const D = window.NOACG_DRAFT;
    const fonts = window.NOACG_FONTS;
    const fit = svg.width > resolution.width || svg.height > resolution.height
      ? Math.min(resolution.width / svg.width, resolution.height / svg.height)
      : 1;
    const written = D.pollDrivenLayers(behaviour);
    const furniture = (c) => c.drawing && !written.has(c.id);
    const rows = [...svg.candidates.filter((c) => !furniture(c)), ...svg.candidates.filter(furniture)];
    return {
      designSvg: { ...svg, width: Math.round(svg.width * fit), height: Math.round(svg.height * fit) },
      svgFields: D.armTimerClock(rows.map((c) => ({
        candidateId: c.id,
        on: !furniture(c) && !c.outsideCanvas,
        ...(c.outsideCanvas ? { whenOff: 'keep' } : {}),
        title: c.label,
        sample: c.sample,
        numeric: c.numeric,
        clock: c.clock,
        kind: 'text',
      })), behaviour),
      svgImages: svg.images.map((c) => ({ candidateId: c.id, on: c.marked, title: c.label })),
      svgOutlines: svg.outlines.map((c) => ({
        candidateId: c.id, on: c.marked, title: c.label, sample: c.label, box: null, color: null, looksLikeText: null,
      })),
      svgBehaviour: behaviour,
      svgExtras: D.proposeSvgExtras(svg),
      svgStretch: { on: false, shapeId: svg.shapes[0]?.id ?? null },
      svgFonts: svg.fonts.map((f) => ({
        family: f.family,
        lookup: f.lookup,
        weight: f.weight,
        fontId: fonts?.FONTS.find((b) => fonts.fontNameKey(b.family) === fonts.fontNameKey(f.lookup))?.id ?? null,
        customFont: null,
      })),
      designArt: null,
      importedImages: [],
      designOriginal: null,
      designErases: [],
      designFields: [],
    };
  };
};

/** Put the driven clock and the helpers above on a 1920x1080 page. */
export async function installDrivenPage(page) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.evaluate(PAGE_HELPERS, DRIVEN_CLOCK);
}
