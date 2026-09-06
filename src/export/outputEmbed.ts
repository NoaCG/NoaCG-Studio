// The OUTPUT EMBED - one HTML file that puts a published production's browser output
// (docs/CLOUD_PLAYOUT.md §3) inside a playout host that loads TEMPLATE FILES rather than URLs.
//
// SPX is the case it exists for. An SPX rundown lists template files out of ASSETS/templates -
// there is no "paste a URL" input anywhere in it - so the cloud output URL, which OBS and vMix
// take directly, had no door into SPX at all. This file IS that door: a legal SPX template
// (window.SPXGCTemplateDefinition + the classic play/stop/update/next globals, the convention
// docs/SPX_TEMPLATE_FORMAT.md §4 pins) whose whole body is a full-frame iframe pointed at the
// production's own output URL. SPX plays out the file; the graphics inside it are cued from the
// production page, the hosted control page, or a phone, exactly as they are for a browser source.
//
// So the split of duties is: the HOST owns whether the frame is up, NoaCG owns what is in it.
// SPX's Play/Stop show and hide the frame; they never take a cue, because a cue is a command on
// the shared log and this file deliberately holds the OUTPUT capability only - the slug that
// authorizes RENDERING a production and nothing else (docs/CLOUD_PLAYOUT.md §2). A template able
// to operate the show would have to carry the control slug, and this one is copied onto playout
// machines.
//
// It is not SPX-only by construction: the same file opens in a CasparCG HTML template folder, an
// OBS/vMix browser source pointed at a local file, or a plain browser tab. Nothing in it is SPX
// except the definition, which every other host ignores.
//
// TWO RULES THE EMITTED CODE OBEYS, both learned on real hardware (docs/CLOUD_PLAYOUT.md §3):
//   1. ES5 ONLY - no `?.`, no `??`, no arrow functions, no `const`/`let`. CasparCG 2.3.x embeds a
//      ~Chromium 65 CEF that rejects the whole file on the first modern token, showing a dead
//      layer with nothing on air and no clue why.
//   2. THE COLOR-SCHEME PAIR - the page declares <meta name="color-scheme" content="dark"> and
//      paints every surface transparent. Chromium paints an iframe opaque when the schemes
//      disagree, which here would be a white 1920x1080 card over the video.

import type { Resolution } from '../model/types';
import { slug } from '../model/slug';

export interface OutputEmbedOptions {
  /** The production's name - the template's description in an SPX rundown. */
  production: string;
  /** The production's browser-output URL (control/hostedControl.ts `outputPageUrl`). */
  outputUrl: string;
  /** The production's design canvas, quoted to the operator so the source is sized right. */
  resolution?: Resolution;
  /** SPX playout/web layer. Defaults to the pool's own default (model/shows.ts): this one file
   *  carries EVERY graphic of the production, each on its own layer inside the frame, so it is
   *  one frontmost layer in the host rather than one layer per graphic. */
  layer?: number;
}

const DEFAULT_LAYER = 20;

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** JSON for a `<script>` body: a `</script>` inside a string would close the block. */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/** The file name an SPX rundown lists. SPX names TEMPLATES BY FILE (src/export/targets/
 *  spxStarter.ts learned the same thing), so an index.html would list as "index". */
export function outputEmbedFileName(production: string): string {
  return `${slug(production)}_output.html`;
}

export function outputEmbedHtml(opts: OutputEmbedOptions): string {
  const layer = String(opts.layer ?? DEFAULT_LAYER);
  const width = opts.resolution ? opts.resolution.width : 1920;
  const height = opts.resolution ? opts.resolution.height : 1080;
  const definition = {
    description: `${opts.production} - NoaCG output`,
    playserver: 'OVERLAY',
    playchannel: '1',
    playlayer: layer,
    webplayout: layer,
    out: 'manual',
    steps: '1',
    dataformat: 'json',
    uicolor: '7',
    DataFields: [
      {
        ftype: 'instruction',
        value:
          'This item is the whole NoaCG production, live. Play puts the output frame up and Stop ' +
          'takes it down; which graphic is on air is cued from the NoaCG production page or its ' +
          `control link, not from this rundown. Designed at ${width}x${height} - give the output ` +
          'the same size.',
      },
      { field: 'f0', ftype: 'textfield', title: 'Output URL', value: opts.outputUrl },
      {
        field: 'f1',
        ftype: 'checkbox',
        title: 'Debug overlay (setup only - it draws over the picture)',
        value: '0',
      },
      {
        field: 'f2',
        ftype: 'checkbox',
        title: 'Stay dark until Play (otherwise the frame shows what is on air as soon as it loads)',
        value: '0',
      },
      { ftype: 'divider' },
      {
        field: 'f3',
        ftype: 'button',
        title: 'Reload output',
        descr: 'Rebuilds the connection. The output recovers on its own; this is for a stuck layer.',
        fcall: 'noacgReloadOutput()',
      },
    ],
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<!-- Paired with the transparent surfaces below: Chromium paints an iframe OPAQUE when the page's
     color-scheme and the framed document's disagree, and the output page declares dark. -->
<meta name="color-scheme" content="dark" />
<title>${escapeHtml(opts.production)} - NoaCG output</title>
<style>
  /* Everything is transparent: the graphics render over video, and this file adds no picture of
     its own. top/left/width/height rather than the inset shorthand - that one needs Chromium 87
     and CasparCG 2.3.x is older than it. */
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; }
  #noacg-output {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: transparent;
    /* A CUT, never a fade: the graphics inside animate themselves, and a host taking the layer
       down mid-air should look like a cut rather than like a graphic dissolving. */
    opacity: 1;
  }
  #noacg-output.noacg-hidden { opacity: 0; }
  #noacg-frame { display: block; width: 100%; height: 100%; border: 0; background: transparent; }
</style>
<!-- The template definition, last in <head> as SPX wants it. -->
<script id="spx-template-definition" type="text/javascript">
window.SPXGCTemplateDefinition = ${jsonForScript(definition)};
</script>
</head>
<body>
<div id="noacg-output">
  <!-- Not sandboxed on purpose: this is the production's own output page, and it needs its real
       origin to reach the command log. What this file controls is same-document visibility, never
       the framed document - no cross-origin scripting is involved. -->
  <iframe id="noacg-frame" title="NoaCG production output" src="about:blank"
          allowtransparency="true" scrolling="no" frameborder="0" allow="autoplay"></iframe>
</div>
<script type="text/javascript">
(function () {
  'use strict';

  // The production this file was downloaded for. The Output URL field can point it somewhere
  // else - one copy of this file can serve every production a rundown touches.
  var DEFAULT_URL = ${jsonForScript(opts.outputUrl)};

  var box = document.getElementById('noacg-output');
  var frame = document.getElementById('noacg-frame');
  var current = '';        // the URL the iframe is actually showing
  var played = false;      // has the host taken this item on air yet
  var holdDark = false;    // f2: stay dark until Play

  // CasparCG delivers missing values as the literal strings "undefined" / "null".
  function validString(value) {
    return typeof value === 'string' && value !== '' && value !== 'undefined' && value !== 'null';
  }

  function fieldsOf(data) {
    if (!data) return {};
    if (typeof data === 'object') return data;
    try {
      var parsed = JSON.parse(data);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function isOn(value) {
    return value === '1' || value === 1 || value === true || value === 'true';
  }

  function withDebug(url, debug) {
    var clean = url.replace(/([?&])debug=1(&|$)/, function (all, before, after) {
      return after ? before : '';
    });
    if (!debug) return clean;
    return clean + (clean.indexOf('?') >= 0 ? '&' : '?') + 'debug=1';
  }

  // Only ever RELOAD on a real change. The output page recovers its on-air state by rebuilding
  // from the command log, which costs a moment - so an update repeating the same URL (the usual
  // case: the operator edited something else, or pressed Update out of habit) must not throw the
  // connection away.
  function load(url) {
    if (url === current) return;
    current = url;
    frame.src = url;
  }

  function show(on) {
    box.className = on ? '' : 'noacg-hidden';
  }

  // The host's verbs. Idempotent, because SPX may drive this file through EITHER the classic
  // globals or the renderer's events (docs/SPX_TEMPLATE_FORMAT.md §7) and some builds do both.
  window.update = function (data) {
    var fields = fieldsOf(data);
    var url = validString(fields.f0) ? fields.f0 : DEFAULT_URL;
    holdDark = isOn(fields.f2);
    load(withDebug(url, isOn(fields.f1)));
    show(!holdDark || played);
  };

  window.play = function () {
    played = true;
    if (!current) load(DEFAULT_URL);
    show(true);
  };

  window.stop = function () {
    played = false;
    show(false);
  };

  // One phase (steps: "1"), so Continue is disabled in the rundown - walking a graphic's steps is
  // the NoaCG operator's Next, on the layer they picked.
  window.next = function () {};

  // The "Reload output" button. The page recovers by itself after a network drop; this is the
  // manual door for a layer that is stuck for some other reason.
  window.noacgReloadOutput = function () {
    var url = current || DEFAULT_URL;
    current = '';
    frame.src = 'about:blank';
    window.setTimeout(function () { load(url); }, 50);
  };

  // PRELOAD. The output page has to fetch the production and rebuild whatever is on air, so it
  // connects the moment this file is parsed rather than when the item is taken - by the time
  // anyone presses Play it is already following the log.
  load(DEFAULT_URL);
  show(true);

  // The SPX web renderer's event style, for builds that use it instead of the globals. Reaching
  // window.top throws when the host frames this file from another origin, hence the guard.
  try {
    var renderer = window.top && window.top.spxRenderer;
    if (renderer && renderer.on) {
      renderer.on('play', function () { window.play(); });
      renderer.on('stop', function () { window.stop(); });
      renderer.on('continue', function () { window.next(); });
    }
  } catch (err) {
    /* cross-origin top - the classic globals above are what drives us then */
  }
})();
</script>
</body>
</html>
`;
}
