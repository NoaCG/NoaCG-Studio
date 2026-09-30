// HTML overlay export: one SELF-CONTAINED HTML file for plain browser-source playout —
// OBS Browser Source, vMix Web Browser input, or any tool that renders a web page over
// video. Unlike SPX/CasparCG there is no playout server to call the globals, so the file
// autoplays on load: it fills the fields (values baked from the Data panel at export time,
// falling back to the SPX definition's defaults) and calls play(). The BroadcastChannel
// control receiver + the bundled controlpanel.html let an operator drive it live.

import JSZip from 'jszip';
import type { SpxTemplate } from '../../model/types';
import { composeSelfContainedHtml } from '../selfContained';
import { addControlPanel, withControlReceiver } from '../common';
import { slug } from '../../model/slug';
import { hasRealtimeControl } from '../../control/realtimeControl';
import { localReceiverJs } from '../../control/localReceiver';
import { addLocalControlBundle } from '../localControl';
import { onAirGuideMd } from '../onAirGuide';
import { fieldReferenceMd } from '../fieldReference';
import type { ExportContext, ExportTarget } from '../registry';

/** The autoplay block appended after the template's JS. Teachable ES5, same voice as the
 *  generated template code. `baked` carries the Data panel's values at export time;
 *  `outMs` is the SPX `out` setting when it is an auto-out delay (null otherwise) — the
 *  overlay honors it exactly like the editor preview and a real playout server do. */
function autoplayScript(baked: Record<string, string>, outMs: number | null): string {
  const autoOut =
    outMs !== null
      ? `
    // The template's out setting is ${outMs} ms: hold that long AFTER the entrance
    // settles, then leave by itself (a Stop from controlpanel.html still works sooner).
    // The entrance length is measured from a paused throwaway timeline.
    var entranceMs = 0;
    if (typeof window.buildInTimeline === 'function') {
      var probe = window.buildInTimeline();
      probe.pause();
      entranceMs = probe.duration() * 1000;
      probe.kill();
    }
    outTimer = setTimeout(function () {
      call('stop');
    }, entranceMs + ${outMs});`
      : '';
  return `// ── Autoplay for browser sources (OBS / vMix) ────────────────────────────
// A playout server (SPX, CasparCG) calls update() and play() itself. A plain
// browser source has no operator, so this block does it on page load: fill the
// fields with the values below (baked in at export time; any field missing
// there falls back to its default in the SPX definition), then start the
// graphic. Edit the values here or drive them live with controlpanel.html.
//
// In OBS the page loads when the scene collection opens, not when you cut to the
// scene, so there the entrance waits for the source to go ON PROGRAM (OBS's
// obsSourceActiveChanged event) and the graphic resets when it leaves, so the
// next time it goes on air the entrance plays again. "Active" rather than
// "visible": in studio mode a scene on preview is visible but not on air. Once
// the panel or the relay plays or stops the graphic, the operator is in charge
// and cuts no longer move it.
(function () {
  var outTimer = null;
  var own = false; // true while this block itself calls play() or stop()
  function call(name) {
    own = true;
    try {
      if (typeof window[name] === 'function') window[name]();
    } finally {
      own = false;
    }
  }
  var baked = ${JSON.stringify(baked, null, 2).replace(/\n/g, '\n  ')};
  function startData() {
    var data = {};
    var def = window.SPXGCTemplateDefinition || {};
    var fields = def.DataFields || [];
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (!f.field) continue;
      data[f.field] = baked[f.field] !== undefined ? baked[f.field] : (f.value || '');
    }
    return data;
  }
  function start() {
    clearTimeout(outTimer);
    call('play');${autoOut}
  }
  function followProgram() {
    var operated = false; // a panel or the relay has played or stopped the graphic
    var onAir = false;    // OBS has said the source is on program
    var shown = false;    // the entrance has run since the last reset
    function watch(name) {
      var fn = window[name];
      if (typeof fn !== 'function') return;
      window[name] = function () {
        if (!own) operated = true;
        return fn.apply(this, arguments);
      };
    }
    watch('play');
    watch('stop');
    function enter() {
      shown = true;
      start();
    }
    function reset() {
      shown = false;
      clearTimeout(outTimer);
      call('stop');
      // Nobody sees this exit, and a hidden page may not animate at all: finish it now, so
      // the next cut starts the entrance from rest instead of racing a half-run exit. An
      // endless loop (GSAP reports 1e10 s) has no end to jump to, and play() rebuilds it.
      if (window.gsap) {
        var running = window.gsap.globalTimeline.getChildren(false, true, true);
        for (var i = 0; i < running.length; i++) {
          var end = running[i].totalDuration();
          if (end < 1e9) running[i].totalTime(end);
        }
      }
    }
    window.addEventListener('obsSourceActiveChanged', function (e) {
      if (operated) return;
      var active = !!(e.detail && e.detail.active);
      if (active && !onAir) enter();
      else if (!active && shown) reset();
      onAir = active;
    });
    // OBS sends no event for the state a page loads in. A page that loads visible starts at
    // once; if that was only a studio-mode preview, the take to program plays it again.
    if (document.visibilityState !== 'hidden') enter();
  }
  window.addEventListener('load', function () {
    // A STREAM-ADDRESSED instance (…?stream=program / preview) is MANAGED: it belongs to a
    // production run through the local relay's ordered log (a controller monitor, or an
    // OBS source in a cue-driven show), so it loads at rest and waits for commands instead
    // of popping on air by itself. The plain file keeps the classic single-overlay autoplay.
    if (/[?&]stream=/.test(location.search)) return;
    if (typeof window.update === 'function') window.update(JSON.stringify(startData()));
    if (window.obsstudio) followProgram();
    else start();
  });
})();`;
}

function overlayReadme(template: SpxTemplate): string {
  const name = slug(template.name);
  return `# ${template.name} — HTML overlay (OBS / vMix / any browser source)

Generated by NoaCG Studio.

One self-contained file: ${name}.html — CSS, JS, GSAP, fonts and images are all inlined.
The background is transparent, so it composites straight over your video. On load it fills
the fields with the exported values and plays automatically.

## OBS Studio
1. Sources → + → **Browser**.
2. Tick **Local file** and pick ${name}.html.
3. Width ${template.resolution.width}, Height ${template.resolution.height}.

In OBS the entrance plays each time the source goes on program, and the graphic resets when it
leaves, so cutting back to the scene plays it again. Everywhere else it plays on load.
To operate it from inside OBS with the panel as a Custom Browser Dock, start the launcher and
point the source at the graphic's http address instead of ticking Local file (see Live control
below): a Local file source cannot pair with a dock. Once the panel plays or stops it, cuts no
longer move it.

## vMix
1. Add Input → **More** → **Web Browser**.
2. URL: the full path to ${name}.html (e.g. file:///C:/overlays/${name}.html).
3. Width ${template.resolution.width}, Height ${template.resolution.height}. Use it like any input (usually on an overlay channel).

## Changing the text/data
- Quick edit: open ${name}.html in a text editor — the values live in the marked
  "Autoplay for browser sources" block at the bottom.
- Live control, the easy way: double-click **"Start controller.cmd"** (Windows) or
  **"start-controller.command"** (macOS) — the bundled LOCAL RELAY serves this folder at
  http://localhost:<port>/, opens the panel, and relays commands into a graphic loaded by
  OBS or vMix. Point the browser source at the graphic ON that address, not at the file on
  disk. Fully offline. Details in GETTING-ON-AIR.md.
- Operating from inside OBS: Docks → Custom Browser Docks, and give the dock the panel's
  address on the launcher, http://localhost:<port>/controlpanel.html.
- Without the launcher the panel still pairs over a same-origin browser channel (both pages
  from ONE http address in ONE browser; an OBS Custom Browser Dock and a browser source on the
  same address count as one browser). Files opened straight from disk (file://) can never
  pair, and the panel says so when nothing is answering.
${hasRealtimeControl(template.js) ? `- Remote control (enabled): this graphic also listens on a Supabase Realtime channel, so
  controlpanel.html works from ANOTHER device too. The channel topic baked into both files
  is a shared secret — keep it private. The machine running the overlay must be allowed to
  reach wss://*.supabase.co.
` : `- Any-device control: enable **Remote control** in the Control tab before exporting and the
  control panel can drive the graphic from another device over the cloud.
`}
## Data fields
${template.fields.map((f) => `- ${f.field} (${f.ftype}): ${f.title}`).join('\n') || '- (none)'}

Everything is inlined — no other files are needed at playout.
`;
}

export const htmlOverlayTarget: ExportTarget = {
  id: 'html-overlay',
  label: 'HTML overlay (OBS / vMix)',
  description:
    'One self-contained .html that autoplays as a browser source — OBS, vMix, or any tool that renders a web page. Includes a control panel for live edits.',
  successMessage: '✓ Exported. Unzip and add the .html as a browser source (see README.md).',
  async build(template, ctx?: ExportContext) {
    const zip = new JSZip();
    const name = slug(template.name);
    const root = zip.folder(name)!;
    // Receiver first (it lands at the end of the body), then the compose inlines everything and
    // appends the autoplay block after the template JS. An auto-out `out` setting rides
    // along so the overlay leaves by itself — same behavior as the editor preview.
    const withReceiver = withControlReceiver(template);
    const outMs = /^\d+$/.test(template.settings.out ?? '') ? Number(template.settings.out) : null;
    // Two receivers, two transports: the BroadcastChannel one (same-origin tabs) and the
    // LOCAL RELAY one (through the bundled localhost service, the route into a graphic loaded
    // by vMix's own browser engine, and into OBS from a panel outside it). Both are inert where
    // they cannot work.
    root.file(
      `${name}.html`,
      await composeSelfContainedHtml(withReceiver, [
        localReceiverJs(template.name),
        autoplayScript(ctx?.sampleData ?? {}, outMs),
      ]),
    );
    // This package is ONE graphic file: there is no images/ folder beside the panel, so its
    // picker sends the embedded bytes rather than a path that resolves at neither end.
    addControlPanel(root, template, { inlineAssets: true, entries: ctx?.entries });
    root.file('README.md', overlayReadme(template));
    root.file(
      'FIELDS.md',
      fieldReferenceMd(
        template,
        'The bundled control panel shows these by name, so you never type an id here — the table ' +
          'is for anything that drives the graphic from outside (a CasparCG client, your own script).',
      ),
    );
    // This flavour DOES bundle the relay + launchers below, so the guide may describe them.
    root.file('GETTING-ON-AIR.md', onAirGuideMd({ localController: true, controlPanel: 'controlpanel.html' }));
    addLocalControlBundle(root, {
      v: 1,
      show: { name: template.name },
      graphics: [{ name: template.name, file: `${name}.html`, layer: Number(template.settings.playlayer) || 1 }],
    });
    return zip;
  },
};
