import { prepareOutRuntime } from '../../blocks/animMigration';
// SPX export: the canonical package. The exported files mirror exactly what you see in the
// editor (<slug>.html + css/ + js/ + assets), wrapped in one project folder that drops straight
// into an SPX/CasparCG templates directory. Plug-and-play: relative paths, bundled GSAP.
// The template file carries the GRAPHIC'S OWN NAME — real SPX packs name every template file
// (bw_simple/left.html, Template_Pack_1.1/NAME_LEFT.html); an index.html-per-folder package
// listed every NoaCG template as "index" in an SPX rundown.

import JSZip from 'jszip';
import {
  addControlPanel,
  addSharedAssets,
  appendToBody,
  injectControlReceiver,
  injectProjectFormatMeta,
  spxReadme,
} from '../common';
import { ensureExternalRefs } from '../../model/externalRefs';
import { ensureFlexGapShimRef } from '../../assets/flexGapSupport';
import { slug } from '../../model/slug';
import { onAirGuideMd } from '../onAirGuide';
import { fieldReferenceMd } from '../fieldReference';
import type { ExportTarget } from '../registry';
import type { ControlEntry } from '../../model/library';
import { replaceDefinitionInHtml } from '../../model/spxDefinition';
import type { SpxTemplate, TemplateType } from '../../model/types';
import { expandInset } from '../../assets/cssCompat';
import { spxTextScript } from '../spxText';

/**
 * The operator page's file name in an SPX package. SPX's template browser lists every `.htm` and
 * `.html` file in a folder as a template, so `controlpanel.html` sat beside every graphic and
 * choosing it failed with SPX's "template definition missing" (docs/SPX_ON_A_REAL_SERVER.md §2).
 * `.shtml` is the one name measured to stay out of the list on every SPX tried and still open:
 * SPX 1.4.1 also skips names starting with `_` or `.`, but 1.2.1 skips only `.`, and SPX refuses
 * to serve a dot file at all (404), which would leave the panel unopenable from SPX's own server.
 * Both SPX versions (and Python's http.server) serve `.shtml` as text/html; nothing in the page
 * uses server-side includes. A CasparCG server lists only `.html` too, so it stays out there.
 */
const SPX_PANEL_FILE = 'controlpanel.shtml';

/**
 * The SPX layer each kind of graphic lands on. SPX 1.4 Solo, the free edition, has five layers
 * and caps anything higher to 5 on import, so packages that all declared 7 put every graphic on
 * one layer (5 in 1.4, 7 in 1.2) and each Play took the last one off air
 * (docs/SPX_ON_A_REAL_SERVER.md §2). A higher layer draws on top in SPX's renderer. Kinds that
 * are on air together get different numbers: a frame or full screen at the back, then the
 * lower-third band, the ticker, the mid-screen boards, and the corner bugs and scores on top.
 * Ticker 3 and holding/credits 4 are what those generators already declare. Total over
 * TemplateType, so a new kind without a layer is a compile error.
 */
const SPX_LAYER_BY_TYPE: Record<TemplateType, number> = {
  frame: 1,
  fullscreen: 1,
  picture: 1,
  transition: 1,
  'lower-third': 2,
  'info-card': 2,
  'public-info': 2,
  'info-box': 2,
  alert: 2,
  'stream-notification': 2,
  audience: 2,
  'imported-design': 2,
  blank: 2,
  ticker: 3,
  quiz: 4,
  poll: 4,
  infographic: 4,
  matchup: 4,
  'results-board': 4,
  reveal: 4,
  'starting-soon': 4,
  'end-credits': 4,
  bug: 5,
  scoreboard: 5,
  'esports-score': 5,
  countdown: 5,
};

/** The layers SPX Solo offers. */
const SPX_SOLO_LAYERS = 5;

/** SPX's highest web-renderer layer (1.2 and the paid 1.4 editions). */
const SPX_MAX_LAYERS = 20;

/**
 * The SPX layers for a production's graphics, from the layers the operator stored: the same
 * order renumbered from 1, so the stacking and any deliberately shared layer survive while the
 * numbers fit SPX. Five distinct layers or fewer all stay distinct in SPX 1.4 Solo. Capped at 20.
 */
export function spxLayersInOrder(stored: number[]): number[] {
  const distinct = [...new Set(stored)].sort((a, b) => a - b);
  return stored.map((layer) => Math.min(SPX_MAX_LAYERS, distinct.indexOf(layer) + 1));
}

/** The production README's layer list: both numbers per graphic, so the dashboard's 20 and
 *  SPX's 1 read as one fact, and a line when SPX Solo cannot hold them all. */
export function spxLayerListMd(rows: { file: string; spx: number; stored: number }[]): string {
  const list = rows.map((r) => `- ${r.file}  (SPX layer ${r.spx}, production layer ${r.stored})`).join('\n');
  const tooMany = Math.max(0, ...rows.map((r) => r.spx)) > SPX_SOLO_LAYERS;
  return (
    `Each folder is one plug-and-play template (rundown order). The SPX layer is the\n` +
    `production's own layer order, numbered from 1 so it fits SPX's range:\n\n${list}` +
    (tooMany
      ? `\n\nSPX 1.4 Solo has ${SPX_SOLO_LAYERS} layers and puts anything higher on layer ${SPX_SOLO_LAYERS}, so there\n` +
        `the graphics above layer ${SPX_SOLO_LAYERS} replace each other on air. SPX 1.2 and the paid SPX editions\n` +
        `hold them all.`
      : '')
  );
}

/** The layer a single graphic's SPX package declares: the template's own number when SPX Solo
 *  can hold it (1 to 5, so a number somebody chose survives), else its kind's. */
export function spxLayerFor(template: Pick<SpxTemplate, 'type' | 'settings'>): number {
  const declared = Number(template.settings.webplayout);
  if (Number.isInteger(declared) && declared >= 1 && declared <= SPX_SOLO_LAYERS) return declared;
  return SPX_LAYER_BY_TYPE[template.type] ?? 2;
}

/** One template, re-declared onto one playout layer (definition block + parsed settings). */
export function withPlayoutLayer(template: SpxTemplate, layer: number): SpxTemplate {
  const settings = { ...template.settings, playlayer: String(layer), webplayout: String(layer) };
  return { ...template, settings, html: replaceDefinitionInHtml(template.html, settings, template.fields) };
}

/**
 * ONE CONTINUE TOO MANY. `steps` counts phases, so an operator gets `steps - 1` Continues and
 * SPX treats one more as the end of the item. SPX 1.4 sends `stop` for it; SPX 1.2.1 sends a
 * further `next` (`nextItem` in its static js/spx_gc.js) and shows the item as stopped, while the
 * template's next() has nothing left to advance to, so the graphic stayed on air with no Stop
 * offered for it (docs/SPX_ON_A_REAL_SERVER.md §2). This guard counts Continues from each play()
 * and turns that one into stop(), which is what SPX's rundown already says happened. ES5, for
 * CasparCG 2.3.x's Chromium 71. Stripped on import by its id, like the control receiver.
 */
function spxStepGuardScript(steps: number): string {
  return `<script id="noacg-spx-steps">
/* SPX: the Continue after the last step takes the graphic out, as SPX's rundown shows it. */
(function () {
  var steps = ${steps};
  var continues = 0;
  var play = window.play, stop = window.stop, next = window.next;
  if (typeof play !== 'function' || typeof stop !== 'function' || typeof next !== 'function') return;
  window.play = function () { continues = 0; return play.apply(this, arguments); };
  window.stop = function () { continues = 0; return stop.apply(this, arguments); };
  window.next = function () {
    continues += 1;
    if (continues >= steps) return window.stop();
    return next.apply(this, arguments);
  };
})();
</script>`;
}

/**
 * template.css ships one level down (css/template.css) while assets unpack at the project
 * root (images/, fonts/, lottie/) — a stylesheet-relative url("images/…") would resolve into
 * css/images/. The AUTHORED css stays root-relative (the editor preview and the single-file
 * exports resolve it there); only this packaged copy gets the ../ hop.
 */
function cssForSubfolder(css: string): string {
  // `(?:\.\/)?` matters: every other reader of these references accepts a "./" prefix
  // (assetUtils inlineAssetRefs, validateTemplate, bundledFonts FONT_REF_RE), so a stylesheet
  // written with one would be left un-hopped here while addReferencedFonts still wrote the file
  // at the package root — the reference and the file disagreeing inside one package build.
  return css.replace(/url\(\s*(['"]?)(?:\.\/)?(images|fonts|lottie|assets)\//g, 'url($1../$2/');
}

/** Write one SPX-format template into the given zip folder (reused by the show export).
 *  `entries` are the graphic's saved control-panel data rows, resolved out of the library by
 *  the caller — baked into the bundled operator page as a switcher (docs/SAVED_CONTENT_MODEL.md
 *  §4). Omitted where there is no library link (a bare template export). `fileName` lets the
 *  show export keep a collision-suffixed folder and file in agreement (ticker_2/ticker_2.html). */
export async function buildStarterInto(
  root: JSZip,
  template: Parameters<ExportTarget['build']>[0],
  opts?: {
    entries?: ControlEntry[];
    fileName?: string;
    /** An SPX package: the operator page is SPX_PANEL_FILE and a stepped graphic carries the
     *  Continue guard. The dual graphic package leaves it off and keeps `controlpanel.html`,
     *  the name its CLI and skill document. */
    forSpx?: boolean;
  },
): Promise<void> {
  template = { ...template, js: prepareOutRuntime(template.js) };
  const fileName = opts?.fileName ?? `${slug(template.name)}.html`;
  const panelFile = opts?.forSpx ? SPX_PANEL_FILE : 'controlpanel.html';
  // The flex-gap shim's reference goes in at export, like the receiver: SPX hands this file to
  // CasparCG's own engine, which on 2.3.x has no flex gap, and the template's code stays as the
  // person wrote it - one script line more, pointing at the file addSharedAssets writes.
  let html = injectControlReceiver(
    injectProjectFormatMeta(ensureFlexGapShimRef(ensureExternalRefs(template.html)), template),
    template,
  );
  const steps = Number(template.settings.steps);
  if (opts?.forSpx && steps >= 2) html = appendToBody(html, spxStepGuardScript(steps));
  // Every package of this layout plays in SPX, the dual one included, and SPX hands each value
  // over HTML-escaped: the text script writes it as typed (spxText.ts).
  html = appendToBody(html, spxTextScript(template));
  root.file(fileName, html);
  // SPX plays it on CasparCG, which on 2.3 is Chromium 71: no `inset` (assets/cssCompat.ts).
  root.file('css/template.css', cssForSubfolder(expandInset(template.css)));
  root.file('js/template.js', template.js);
  root.file('README.md', spxReadme(template, fileName, panelFile));
  // The field/ID table, its own file: an operator at a CasparCG client reads ids, and nothing
  // on that screen says which id is the title (docs: src/export/fieldReference.ts).
  root.file(
    'FIELDS.md',
    fieldReferenceMd(
      template,
      'In an SPX rundown the fields appear by name and you never type an id. A CasparCG client ' +
        'sends the ids below directly — that is what this table is for.',
    ),
  );
  addControlPanel(root, template, { entries: opts?.entries, fileName: panelFile }); // operator page — open beside the graphic to drive it
  await addSharedAssets(root, template);
}

export const spxTarget: ExportTarget = {
  id: 'spx',
  label: 'SPX export',
  description: 'The plug-and-play SPX package — drops straight into your SPX templates folder.',
  successMessage: '✓ Exported. Drop the unzipped folder into your SPX templates.',
  async build(template, ctx) {
    const zip = new JSZip();
    // Everything lives inside one project folder, so extracting into the SPX/CasparCG
    // templates folder yields  [TemplatesFolder]/your_project/your_project.html + images/…
    const root = zip.folder(slug(template.name))!;
    // An SPX-safe layer of its own (SPX_LAYER_BY_TYPE), so two NoaCG graphics in one SPX
    // rundown are on air together rather than evicting each other.
    await buildStarterInto(root, withPlayoutLayer(template, spxLayerFor(template)), {
      entries: ctx?.entries,
      forSpx: true,
    });
    root.file('GETTING-ON-AIR.md', onAirGuideMd({ controlPanel: SPX_PANEL_FILE }));
    return zip;
  },
};
