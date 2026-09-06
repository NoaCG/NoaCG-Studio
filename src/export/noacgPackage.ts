// THE GRAPHIC PACKAGE - one folder that is BOTH a valid OGraf v1 Graphic and the SPX package,
// and the workspace an external coding agent edits (docs/OGRAF.md, docs/AGENT_CLI.md).
//
// Two halves, one folder:
//
//   SOURCES (the SPX layout - edit these)          GENERATED (never edit - rebuilt from the sources)
//     <slug>.html                                     <slug>.ograf.json   the OGraf manifest (+ v_noacg)
//     css/template.css                                graphic.mjs         the Web Component wrapping the runtime
//     js/template.js                                  FIELDS.md, README.md, controlpanel.html
//     js/gsap.min.js  images/  fonts/   (shared by both halves)
//
// Why one folder rather than two exports: a renderer reads the manifest + `graphic.mjs` and
// ignores the rest; NoaCG reads the sources (+ the manifest's `v_noacg` for the type) and ignores
// the generated half; SPX/CasparCG read `<slug>.html` + css/ + js/ exactly as they always have.
// So the same bytes drop into an OGraf renderer, an SPX templates folder and the NoaCG Import
// door - and an agent edits plain html/css/js with its ordinary tools while `noacg validate`
// regenerates the OGraf half. The manifest's `v_noacg.sourceHash` is the hash of the three
// source FILES as written, so a reader can tell a stale generated half from a fresh one.
//
// It is a composition of the two existing targets, never a third way to build either: the SPX
// half is `buildStarterInto` (the `spx` target's own writer) and the OGraf half is
// `addOgrafPackage` (the `ograf` target's own writer, told to share `js/gsap.min.js` instead of
// shipping a second copy under `lib/`). Both gates run: the OGraf manifest and package checks
// inside `addOgrafPackage`, and whatever validation the caller ran on the template first.

import JSZip from 'jszip';
import type { SpxTemplate } from '../model/types';
import type { ControlEntry } from '../model/library';
import { sourceHash } from '../model/contentHash';
import { buildStarterInto } from './targets/spxStarter';
import {
  addOgrafPackage,
  noacgSourcePaths,
  noacgVendorBlock,
  type OgrafPackageOptions,
} from './targets/ograf';
import { projectFormatReadme, spxReadme } from './common';
import { slug } from '../model/slug';
import { onAirGuideMd } from './onAirGuide';

export interface GraphicPackageOptions {
  /** A preview raster for the manifest's `thumbnails` - the bridge's bench shot. */
  thumbnail?: OgrafPackageOptions['thumbnail'];
  /** The graphic's saved control-panel entries, baked into controlpanel.html (as for SPX). */
  entries?: ControlEntry[];
}

/** The libraries the OGraf half loads from the SPX layout instead of a second `lib/` copy. */
const SHARED_LIB = { gsap: 'js/gsap.min.js', lottie: 'js/lottie.min.js' };

/**
 * Write the dual package into `root` (the per-graphic folder). The SPX half first - it IS the
 * sources - then the OGraf half generated from the template, stamped with the hash of the
 * source files as they landed in the zip.
 */
export async function addGraphicPackage(
  root: JSZip,
  template: SpxTemplate,
  opts: GraphicPackageOptions = {},
): Promise<void> {
  await buildStarterInto(root, template, { entries: opts.entries });
  const source = noacgSourcePaths(template);
  const [html, css, js] = await Promise.all(
    [source.html, source.css, source.js].map((path) => root.file(path)?.async('string') ?? Promise.resolve('')),
  );
  await addOgrafPackage(root, template, 'live', {
    lib: SHARED_LIB,
    noacg: noacgVendorBlock(template, { source, sourceHash: sourceHash({ html, css, js }) }),
    thumbnail: opts.thumbnail,
  });
  // One README for both doors (each half wrote its own; the last writer wins the name).
  root.file('README.md', graphicPackageReadme(template));
  // buildStarterInto above wrote the panel, so the guide may name it.
  root.file('GETTING-ON-AIR.md', onAirGuideMd({ controlPanel: 'controlpanel.html' }));
}

/** The whole package as a zip, under the graphic's slug folder - the download shape. */
export async function buildGraphicPackage(template: SpxTemplate, opts: GraphicPackageOptions = {}): Promise<JSZip> {
  const zip = new JSZip();
  const root = zip.folder(slug(template.name))!;
  await addGraphicPackage(root, template, opts);
  return zip;
}

/** The README: the SPX half's text plus the OGraf door and the editing rule. */
export function graphicPackageReadme(template: SpxTemplate): string {
  const s = slug(template.name);
  return (
    spxReadme(template) +
    `
## Also an OGraf v1 Graphic
This folder is a complete EBU OGraf v1 package as well: load \`${s}.ograf.json\` in any OGraf
v1 compatible renderer. \`graphic.mjs\` wraps the same template runtime (load/updateAction ->
update(), playAction -> play()/next(), stopAction -> stop(); the state machine's operator events
are the manifest's customActions). Authored format: ${projectFormatReadme(template)}.

## Editing this package
The SOURCES are \`${s}.html\`, \`css/template.css\` and \`js/template.js\` (plus images/ and
fonts/). \`${s}.ograf.json\`, \`graphic.mjs\`, FIELDS.md and controlpanel.html are GENERATED from
them - regenerate with NoaCG Studio (or \`noacg validate\`) after editing the sources, or the
OGraf half goes stale. The manifest's \`v_noacg.sourceHash\` is how a reader tells.
`
  );
}
