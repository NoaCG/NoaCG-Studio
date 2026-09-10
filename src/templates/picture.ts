// The PICTURE graphic — a full-frame still with a fade in and out.
//
// What it is for: a production needs to put a picture on air (a holding slide, a photo, a
// sponsor card) without anybody opening the editor. SPX answers this with a template carrying a
// `filelist` field pointed at a folder on the SPX machine; this is the same answer with the
// upload where their copy-a-file-into-ASSETS step is.
//
// It is deliberately NOT a catalog design: nothing routes to it, the wizard never offers it, and
// the catalog gates never sweep it. It is generated on demand by the production page, which is
// the only surface that creates one.
//
// ONE picture graphic holds MANY pictures: each upload adds an asset, and each picture gets a
// cue whose `f0` value names it. That is the cue model working as designed (docs/CLOUD_PLAYOUT.md
// §2 — many cues over one pool graphic), so taking picture 3 replaces picture 1 on the same
// layer rather than stacking a second still on top of it.
//
// The emitted runtime must parse on CasparCG 2.3.x's CEF (Chromium 71): no `?.`, no `??`, no
// arrow functions, no template literals in the template's own JS. Vite never transpiles this
// string — it is emitted text (docs/CLOUD_PLAYOUT.md §3).

import { parseDefinition } from '../model/spxDefinition';
import { extOf } from '../assets/assetUtils';
import { DEFAULT_SETTINGS, type Resolution, type SpxTemplate } from '../model/types';
import { DEFAULT_GRAPHICS_FORMAT, DEFAULT_GRAPHICS_RESOLUTION } from '../model/projectFormat';

/** The pool name a production's picture graphic always carries. `addGraphicToShow` replaces by
 *  NAME and keeps the pool id, the layer and every cue prepared against it — which is exactly
 *  what adding picture number two has to do. */
export const PICTURE_GRAPHIC_NAME = 'Pictures';

/** How many pictures one production may hold.
 *
 *  Not a taste limit — a real one. Every asset is base64'd into the published `output` jsonb row
 *  (control/hostedControl.ts `serializeAssets`), and that row is read on every renderer load AND
 *  every hosted operator page load (docs/CLOUD_PLAYOUT.md "Known limits"). Uploads are already
 *  downscaled to the frame's long edge, which puts a picture at roughly 0.5-1 MB once base64'd,
 *  so twenty is about 15 MB — heavy but survivable, and past it the honest fix is externalizing
 *  assets to a bucket rather than a bigger number here. */
export const MAX_PICTURES = 20;

/** The folder uploaded pictures live in, matching the `assetfolder` the field declares. */
const PICTURE_FOLDER = 'images/';

/** A file name safe to use as an asset path: lowercased, non-alphanumerics collapsed to `-`. */
function slugForFile(name: string): string {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const slug = stem.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'picture';
}

/** The picture's display name — the file's own stem, which is what the operator recognises in a
 *  cue list. Falls back to a number when the name carries nothing readable. */
export function pictureLabel(fileName: string, index: number): string {
  const dot = fileName.lastIndexOf('.');
  const stem = (dot > 0 ? fileName.slice(0, dot) : fileName).trim();
  return stem || `Picture ${index + 1}`;
}

/** A unique asset path for a newly uploaded picture, keeping the file's own extension (the
 *  runtime resolves by path, and an honest extension is what makes an exported package
 *  openable). */
export function picturePath(existing: SpxTemplate['assets'], fileName: string): string {
  const ext = extOf(fileName) || 'png';
  const base = `${PICTURE_FOLDER}${slugForFile(fileName)}`;
  let path = `${base}.${ext}`;
  let n = 2;
  while (existing.some((a) => a.path === path)) {
    path = `${base}-${n}.${ext}`;
    n += 1;
  }
  return path;
}

/**
 * Build the picture graphic. `firstPicture` is the path of the picture the graphic opens with —
 * it becomes the `f0` DEFAULT, so the cue `addGraphicToShow` seeds already carries a picture
 * instead of pointing at nothing.
 */
export function createPictureTemplate(
  firstPicture = '',
  res: Resolution = DEFAULT_GRAPHICS_RESOLUTION,
  fps = DEFAULT_GRAPHICS_FORMAT.fps,
): SpxTemplate {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${PICTURE_GRAPHIC_NAME}</title>

  <!-- GSAP animation library (bundled — no network at playout). -->
  <script src="js/gsap.min.js"></script>

  <link rel="stylesheet" href="css/template.css" />
  <script src="js/template.js"></script>

  <!-- SPX template definition. One field: which picture to show. -->
  <script id="spx-template-definition" type="text/javascript">
  window.SPXGCTemplateDefinition = {
      "description": "A full-frame picture, faded in and out",
      "playserver": "OVERLAY",
      "playchannel": "1",
      "playlayer": "1",
      "webplayout": "1",
      "out": "manual",
      "steps": "0",
      "dataformat": "json",
      "uicolor": "7",
      "DataFields": [
          { "field": "f0", "ftype": "filelist", "title": "Picture",
            "assetfolder": "./${PICTURE_FOLDER}", "extension": "png",
            "value": "${firstPicture}" }
      ]
  };
  </script>
</head>
<body>
  <!--
    The stage. It starts hidden (opacity: 0) like every SPX template: nothing paints until
    play() runs, so a graphic sitting idle on a playout layer shows nothing.
  -->
  <div id="picture-stage">
    <img id="f0" alt="" />
  </div>
</body>
</html>
`;

  const css = `/* Transparent ${res.width}x${res.height} stage — a broadcast graphic renders over video. */
* { margin: 0; padding: 0; box-sizing: border-box; }

html, body {
  width: ${res.width}px;
  height: ${res.height}px;
  overflow: hidden;
  background: transparent;
}

/* The stage fades as one, so the picture never animates independently of its own frame. */
#picture-stage {
  position: absolute;
  inset: 0;
  opacity: 0;              /* hidden until play() — the SPX contract */
}

/* contain, never cover: a picture is shown whole. A frame that does not match the picture's
   shape leaves the stage transparent at the edges, which shows the video underneath rather
   than cropping somebody's photograph. */
#f0 {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}
`;

  const js = `// A full-frame picture with a fade in and out.
//
// SPX (and the NoaCG browser output) call play(), stop() and update(data). update() carries the
// chosen picture as field f0 — its path inside this template's images/ folder.

var STAGE_ID = 'picture-stage';
var FADE_IN = 0.5;
var FADE_OUT = 0.4;

// update(data): SPX sends field values as JSON, e.g. {"f0":"images/opening-slide.jpg"}.
function update(data) {
  var fields = (typeof data === 'string') ? JSON.parse(data) : data;
  var img = document.getElementById('f0');
  if (!img) return;
  if (Object.prototype.hasOwnProperty.call(fields, 'f0')) {
    var src = fields.f0 ? String(fields.f0) : '';
    // An empty value means "no picture chosen" — hide the element rather than leaving a broken
    // image box on air. (The same rule the browser output enforces after a recovery snap.)
    if (src) {
      img.setAttribute('src', src);
      img.style.display = 'block';
    } else {
      img.removeAttribute('src');
      img.style.display = 'none';
    }
  }
}

// play(): fade the picture in.
function play() {
  gsap.to('#' + STAGE_ID, { opacity: 1, duration: FADE_IN, ease: 'power2.out' });
}

// stop(): fade it out.
function stop() {
  gsap.to('#' + STAGE_ID, { opacity: 0, duration: FADE_OUT, ease: 'power2.in' });
}

// next(): a picture has one step, so there is nothing to advance to.
function next() {}
`;

  const parsed = parseDefinition(html);
  return {
    name: PICTURE_GRAPHIC_NAME,
    type: 'picture',
    resolution: res,
    fps,
    html,
    css,
    js,
    fields: parsed ? parsed.fields : [],
    settings: parsed ? parsed.settings : { ...DEFAULT_SETTINGS, description: 'A full-frame picture' },
    assets: [],
    layers: [],
  };
}

/** True for the one field a picture graphic carries — used to seed a cue's value. */
export const PICTURE_FIELD = 'f0';

/** Add an uploaded picture to the graphic, returning the new template and the asset's path.
 *  The FIRST picture also becomes the field's default, so the cue seeded alongside the graphic
 *  opens on a real picture rather than on nothing. */
export function addPictureToTemplate(
  template: SpxTemplate,
  picture: { fileName: string; data: string },
): { template: SpxTemplate; path: string } {
  const path = picturePath(template.assets, picture.fileName);
  const assets = [...template.assets, { path, data: picture.data }];
  const isFirst = template.assets.length === 0;
  // The default lives in TWO places by the SPX contract — the definition inside the HTML is the
  // source of truth, and `fields` is the parsed view of it. Writing only one would leave the
  // template disagreeing with its own code.
  const html = isFirst
    ? template.html.replace(/("value":\s*)""(\s*\})/, `$1"${path}"$2`)
    : template.html;
  const fields = isFirst
    ? template.fields.map((f) => (f.field === PICTURE_FIELD ? { ...f, value: path } : f))
    : template.fields;
  return { template: { ...template, html, fields, assets }, path };
}
