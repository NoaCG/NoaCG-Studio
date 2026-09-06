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
  injectControlReceiver,
  injectProjectFormatMeta,
  spxReadme,
} from '../common';
import { ensureExternalRefs } from '../../model/externalRefs';
import { slug } from '../../model/slug';
import { onAirGuideMd } from '../onAirGuide';
import { fieldReferenceMd } from '../fieldReference';
import type { ExportTarget } from '../registry';
import type { ControlEntry } from '../../model/library';

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
  opts?: { entries?: ControlEntry[]; fileName?: string },
): Promise<void> {
  const fileName = opts?.fileName ?? `${slug(template.name)}.html`;
  root.file(
    fileName,
    injectControlReceiver(injectProjectFormatMeta(ensureExternalRefs(template.html), template), template),
  );
  root.file('css/template.css', cssForSubfolder(template.css));
  root.file('js/template.js', template.js);
  root.file('README.md', spxReadme(template, fileName));
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
  addControlPanel(root, template, { entries: opts?.entries }); // operator page — open beside the graphic to drive it
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
    await buildStarterInto(root, template, { entries: ctx?.entries });
    root.file('GETTING-ON-AIR.md', onAirGuideMd({ controlPanel: 'controlpanel.html' }));
    return zip;
  },
};
