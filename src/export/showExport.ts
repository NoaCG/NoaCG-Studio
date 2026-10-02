// Whole-show export (Phase 5): one zip with every graphic of the show as its own SPX
// Starter folder PLUS one aggregated show_controlpanel.shtml at the root — the show's
// control page, generated from every graphic's fields and state machine. Run each
// graphic's own .html as a browser source and open the show panel FROM THE SAME
// http(s) ORIGIN in the same browser: every card drives its graphic over that graphic's
// own BroadcastChannel (same-origin only — file:// pages cannot pair).
//
// Each graphic's saved control-panel ENTRIES live in the library, not in the show's embedded
// copy — they are resolved out of the library at export time (entriesForSavedGraphic, by
// graphicId with a unique-name fallback, the same resolver the hosted control page uses) and
// baked into both the aggregated panel and each graphic's own panel.
//
//   <show>/show_controlpanel.shtml
//   <show>/GETTING-ON-AIR.md
//   <show>/<graphic>/<graphic>.html + css/ js/ images/ fonts/ + controlpanel.shtml
//   <show>/DATAROOT/<show>/profile.json + data/rundown.json   (a ready SPX project, spxProject.ts)
//
// The operator pages are `.shtml` so SPX's template browser skips them: it lists every .html in
// a folder as a template (targets/spxStarter.ts, the panel file name).
//
// TWO PLAYOUT RULES this exporter owns (student-release acceptance findings, 2026-08-05):
// 1. NO HOSTED RECEIVER. SPX/CasparCG are the controller for these files — a baked log
//    follower is a second controller fighting the host: its boot recovery snaps the graphic
//    to its last REPORTED state (usually off) one RPC round-trip after the host's play(),
//    which read as "the graphic flashes in and disappears" on a real CasparCG server.
//    Cloud-driven browser sources are the HTML-overlay flavor's job, opt-in, not this one's.
// 2. DISTINCT LAYERS. Every generated template used to declare playlayer/webplayout '7', so
//    two templates in one SPX rundown silently evicted each other. Each pool graphic carries
//    the layer the operator gave it, and in THIS package that order is mapped onto SPX's own
//    range, 1 upward (`spxShowLayers`), because SPX 1.4 Solo has five layers and caps anything
//    higher to 5, which put the operator's 20, 21, 22 all on layer 5.

import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { slug } from '../model/slug';
import { buildStarterInto, spxLayerListMd, spxLayersInOrder, withPlayoutLayer } from './targets/spxStarter';
import { onAirGuideMd } from './onAirGuide';
import { spxLeftBehindMd, spxReportedFieldRulesMd, type PackagedGraphic } from './spxLeftBehind';
import { showFieldReferenceMd, type ProductionFieldGraphic } from './fieldReference';
import { addLocalControlBundle } from './localControl';
import {
  spxProjectFiles,
  spxProjectGuideNote,
  spxProjectReadmeMd,
  type SpxProjectTemplate,
  type SpxRundownEntry,
} from './spxProject';
import { EXPORT_TARGETS } from './registry';
import { emitGraphic, renderShowControlPanelHtml } from '../control/controlPanelHtml';
import { arrangeFor } from '../control/controlModel';
import { renderProductionControllerHtml, type EmittedCue } from '../control/productionControllerHtml';
import { stripHostedReceiver } from '../control/hostedReceiver';
// The library->air gate (docs/ARCHITECTURE.md §3, export -> validation): a production export is
// the other door a library draft leaves through, and it is gated like the publish.
import { assertProductionGate } from '../validation/productionGate';
import {
  loadGraphics,
  entriesForSavedGraphic,
  resolveSavedGraphicDoc,
  templateForSavedGraphic,
  type GraphicDoc,
} from '../model/library';
import type { SpxTemplate } from '../model/types';
import type { SavedGraphic } from '../model/packets';
import { graphicLayer, type Show } from '../model/shows';

/** Kept for API compatibility with callers/specs that passed backend coordinates; the
 *  production package no longer bakes any hosted receiver (rule 1 above), so the value is
 *  accepted and ignored. */
export interface ShowExportOptions {
  hostedBackend?: { ref: string; key: string } | null;
}

/**
 * The playout layer a pool graphic's package declares — the number the OPERATOR chose on the
 * production dashboard (docs/PLAYOUT_DASHBOARD.md §5), not one derived from pool position.
 *
 * It used to be `5 + index`, capped at 20. That guaranteed distinct layers (the round-1 fix for
 * every template declaring playlayer 7 and evicting its neighbour) but it made the layer an
 * accident of ordering, adjustable only with ↑/↓ arrows. Now the number is stored, typed, and
 * defaulted to 20; the dashboard flags a duplicate rather than the export inventing uniqueness.
 */
export function showGraphicLayer(graphic: Pick<SavedGraphic, 'layer'>): number {
  return graphicLayer(graphic);
}

/** The layer each pool graphic lands on in the SPX package (targets/spxStarter.ts
 *  `spxLayersInOrder`): the operator's stored layers in their own order, renumbered from 1. */
export function spxShowLayers(graphics: Pick<SavedGraphic, 'layer'>[]): number[] {
  return spxLayersInOrder(graphics.map(showGraphicLayer));
}

/** A pool graphic's export-ready template: the LIVE library record (embedded snapshot only as
 *  the fallback), NO hosted receiver (rule 1), its own playout layer (rule 2), and — on a slug
 *  collision inside the package — a suffixed NAME, so every per-target packager that derives
 *  paths from slug(template.name) lands each graphic in its own folder/file. */
function exportTemplateFor(
  graphic: SavedGraphic,
  library: GraphicDoc[],
  usedSlugs: Set<string>,
  layer = showGraphicLayer(graphic),
): SpxTemplate {
  let template = templateForSavedGraphic(graphic, library);
  let name = graphic.name;
  let n = 2;
  while (usedSlugs.has(slug(name))) name = `${graphic.name} ${n++}`;
  usedSlugs.add(slug(name));
  if (name !== template.name) template = { ...template, name };
  template = { ...template, js: stripHostedReceiver(template.js) };
  return withPlayoutLayer(template, layer);
}

/** The values a serverless flavor bakes as on-load data: the operator's ACTIVE entry on the
 *  library record, when there is one — the same values the graphic's own thumbnail shows. */
function activeEntryValues(graphic: SavedGraphic, library: GraphicDoc[]): Record<string, string> {
  const doc = resolveSavedGraphicDoc(graphic, library);
  return doc?.entries.find((e) => e.id === doc.activeEntryId)?.values ?? {};
}

/** The aggregated operator page in the SPX production package, `.shtml` like the per-graphic
 *  ones so SPX's template browser skips it (targets/spxStarter.ts). */
const SHOW_PANEL_FILE = 'show_controlpanel.shtml';

export async function buildShowZip(show: Show, _opts?: ShowExportOptions): Promise<JSZip> {
  // Each graphic's saved control-panel entries live in the library, not in the show's embedded
  // copy — resolve them once here (by graphicId, unique-name fallback) so both the aggregated
  // show panel and each graphic's own controlpanel.html bake them in. Authoring stays in the
  // app; a change reaches the package on the next export (docs/SAVED_CONTENT_MODEL.md §4).
  const library = loadGraphics();
  // An invalid graphic cannot export (validation/productionGate.ts) - enforced HERE so it holds
  // for every caller, not only the dialog that happens to show the verdict.
  assertProductionGate(show.graphics, library);
  const zip = new JSZip();
  const folder = slug(show.name);
  const root = zip.folder(folder)!;
  const usedSlugs = new Set<string>();
  const folderNames: string[] = [];
  const projectTemplates: SpxProjectTemplate[] = [];
  const fieldGraphics: ProductionFieldGraphic[] = [];
  const packaged: PackagedGraphic[] = [];
  const spxLayers = spxShowLayers(show.graphics);
  for (const [i, graphic] of show.graphics.entries()) {
    const template = exportTemplateFor(graphic, library, usedSlugs, spxLayers[i]);
    const name = slug(template.name);
    folderNames.push(name);
    packaged.push({ poolId: graphic.id, poolName: graphic.name, template });
    fieldGraphics.push({ template, layer: spxLayers[i], file: `${name}/${name}.html` });
    projectTemplates.push({ relpath: `/${folder}/${name}/${name}.html`, settings: template.settings, fields: template.fields });
    await buildStarterInto(root.folder(name)!, template, {
      entries: entriesForSavedGraphic(graphic, library),
      fileName: `${name}.html`,
      forSpx: true,
    });
  }
  root.file(
    SHOW_PANEL_FILE,
    renderShowControlPanelHtml(
      show.name,
      show.graphics.map((g) => ({ template: templateForSavedGraphic(g, library), entries: entriesForSavedGraphic(g, library) })),
    ),
  );
  // What the production uses that SPX cannot carry, and the Update-after-Continue rule, in the
  // SPX operator's own actions (§6h). Both are '' when there is nothing to say, so a plain
  // production's README and guide read exactly as before.
  const spxNotes = [spxLeftBehindMd(show, packaged), spxReportedFieldRulesMd(packaged)].filter(Boolean).join('\n');
  // The SPX project: the templates as SPX imports them, and the production's cues as a rundown,
  // so the operator opens the show in SPX instead of building it again (spxProject.ts).
  const rundown = spxRundownEntries(show, library, projectTemplates);
  const project = root.folder('DATAROOT')!.folder(folder)!;
  for (const [path, text] of Object.entries(spxProjectFiles(projectTemplates, rundown.entries))) project.file(path, text);
  // The aggregated panel written just above is the one a reader standing at this root wants;
  // each graphic folder carries its own as well.
  root.file(
    'GETTING-ON-AIR.md',
    onAirGuideMd({
      controlPanel: SHOW_PANEL_FILE,
      spxNotes: spxProjectGuideNote(folder) + (spxNotes ? `\n${spxNotes}` : ''),
    }),
  );
  // ONE table for the whole production: which graphic is on which layer, and every field ID it
  // answers to. The package is driven by SPX or a CasparCG client here, and both speak ids.
  root.file(
    'FIELDS.md',
    showFieldReferenceMd(show.name, fieldGraphics, {
      usage:
        'In an SPX rundown the fields appear by name and you never type an id. A CasparCG ' +
        'client sends the ids below directly — that is what these tables are for, and each ' +
        "graphic below carries the CasparCG Client's own steps.",
      clientSteps: true,
    }),
  );
  root.file(
    'README.md',
    `# ${show.name} — show package\n\nGenerated by NoaCG Studio.\n\n` +
      spxLayerListMd(
        folderNames.map((name, i) => ({ file: `${name}/${name}.html`, spx: spxLayers[i], stored: showGraphicLayer(show.graphics[i]) })),
      ) +
      `\n\n## Operating the show (${SHOW_PANEL_FILE})\n` +
      `Serve this folder over http (SPX's template server, or any local web server), run each\n` +
      `graphic's own .html as a browser source FROM THAT ADDRESS, and open ${SHOW_PANEL_FILE}\n` +
      `from the same address in the same browser. One card per graphic: fields, the state\n` +
      `machine's buttons, and Play/Stop/Update/Next — each card drives its own graphic over a\n` +
      `same-origin BroadcastChannel.\n\n` +
      `Opening the files straight from disk (file://) does NOT connect the panel — browsers give\n` +
      `every local file its own private origin. In an SPX or CasparCG rundown you do not need the\n` +
      `panel: the host is the controller there. See GETTING-ON-AIR.md for the full setup guide.\n` +
      `\n## The fields (FIELDS.md)\n` +
      `Every graphic's fields with the ID a playout client sends them under (f0, f1, …). Keep it\n` +
      `open beside a CasparCG client — the client shows ids, FIELDS.md says what they mean.\n` +
      `\nExtract this folder into your SPX/CasparCG templates directory as-is.\n` +
      spxProjectReadmeMd(folder, rundown.entries.length, rundown.clipCues) +
      (spxNotes ? `\n${spxNotes}` : ''),
  );
  return zip;
}

/** The SPX rundown's items: one per cue over a pool graphic, in rundown order, with the cue's own
 *  values and label. A production with no such cues gets one item per pool graphic with its
 *  active entry's values instead, so the rundown is never empty. A cue of a playout-server clip
 *  plays through NoaCG Bridge and has no SPX template; those are counted for the README. */
function spxRundownEntries(
  show: Show,
  library: GraphicDoc[],
  templates: SpxProjectTemplate[],
): { entries: SpxRundownEntry[]; clipCues: number } {
  const poolIndex = new Map(show.graphics.map((g, i) => [g.id, i]));
  const cues = show.cues ?? [];
  const entries = cues.flatMap((cue): SpxRundownEntry[] => {
    const i = cue.source === 'playout' ? undefined : poolIndex.get(cue.sourceId);
    if (i === undefined) return [];
    return [{ template: i, description: cue.label || templates[i].settings.description, values: cue.values }];
  });
  const clipCues = cues.filter((cue) => cue.source === 'playout').length;
  if (entries.length) return { entries, clipCues };
  return {
    entries: show.graphics.map((g, i) => ({
      template: i,
      description: templates[i].settings.description,
      values: activeEntryValues(g, library),
    })),
    clipCues,
  };
}

/** Download the production package under the one filename every surface agrees on — the two
 *  callers previously named the same zip `_rundown` and `_production`. */
export async function downloadShowZip(show: Show, opts?: ShowExportOptions): Promise<void> {
  const zip = await buildShowZip(show, opts);
  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, `${slug(show.name)}_production.zip`);
}

// ── The target picker's build: one production, ANY registry target ─────────────────────────
//
// The acceptance round's "I wasn't able to choose the platform": the production door shipped
// exactly one flavor (the SPX starter above). Every other flavor reuses the per-graphic
// target packagers VERBATIM — each graphic is built through target.build() and the resulting
// files merge under one show folder — so a fix to a target reaches the production package by
// construction. The same playout rules apply through exportTemplateFor (live template, no
// hosted receiver, per-graphic layers, collision-suffixed names).

/** Per-flavor notes for the aggregated README — what controls this package, honestly. */
const FLAVOR_NOTES: Record<string, string> = {
  'html-overlay':
    'Each .html autoplays as a browser source (OBS/vMix). show_controlpanel.html drives every\n' +
    'graphic — serve the folder over one http address and open panel + graphics from it\n' +
    '(file:// pages cannot pair; see GETTING-ON-AIR.md).',
  casparcg:
    'Each .html is one self-contained CasparCG template — copy them into the server\'s\n' +
    'templates folder and drive them with CG ADD/PLAY/NEXT/STOP per layer (each README\n' +
    'carries the incantation; the graphics already declare distinct layers).',
  h2r: 'Each .html is one H2R Graphics custom HTML — H2R owns control (play() toggles).',
  ograf: 'Each folder is one OGraf v1 graphic — the OGraf host owns loading and control.',
  liveos: 'Each folder is one LiveOS-ready OGraf graphic — NetOn.Live owns loading and control.',
};

/** Per-flavour line in the production's FIELDS.md — WHERE these ids get typed. */
const FIELD_USAGE_NOTES: Record<string, string> = {
  'html-overlay':
    'The bundled controller and control panel show these by name, so you never type an id there. ' +
    'The tables are for anything driving the graphics from outside.',
  casparcg:
    'Each graphic below carries the **CasparCG Client** steps for its own template and layer. ' +
    'Driving it another way? The AMCP form is `CG 1-<layer> ADD 1 "<graphic>" 1 ' +
    '"<templateData>…"`, then `CG 1-<layer> PLAY` / `NEXT` / `STOP`.',
  h2r: 'H2R shows these as named inputs from each graphic\'s embedded GDD.',
  ograf: 'These ids are the keys of the OGraf data object each graphic\'s manifest declares.',
  liveos: 'These ids are the keys of the OGraf data object NetOn.Live sends to each graphic.',
};

/** Build the whole production for one registry target. 'spx' keeps its dedicated builder
 *  (aggregated panel + per-folder starters); every other id runs the generic merge. */
export async function buildShowZipFor(show: Show, targetId: string): Promise<JSZip> {
  if (targetId === 'spx') return buildShowZip(show);
  const target = EXPORT_TARGETS.find((t) => t.id === targetId);
  if (!target) throw new Error(`Unknown export target: ${targetId}`);

  const library = loadGraphics();
  assertProductionGate(show.graphics, library);
  const zip = new JSZip();
  const root = zip.folder(slug(show.name))!;
  const usedSlugs = new Set<string>();
  const panelGraphics: { template: SpxTemplate; entries: ReturnType<typeof entriesForSavedGraphic> }[] = [];
  let subPanel = '';
  for (const graphic of show.graphics) {
    const template = exportTemplateFor(graphic, library, usedSlugs);
    const entries = entriesForSavedGraphic(graphic, library);
    const sub = await target.build(template, {
      entries,
      sampleData: activeEntryValues(graphic, library),
      graphicUsage: 'live',
    });
    for (const [path, file] of Object.entries(sub.files)) {
      if (file.dir) continue;
      // Whether the sub-packages brought an operator page is READ OFF what was written, never
      // assumed from the target id: the SPX and CasparCG flavours bring one per graphic, the
      // OGraf, LiveOS and H2R flavours bring none, and the guide below may only name a file
      // that is really in the zip.
      if (path.endsWith('/controlpanel.html')) subPanel = path;
      root.file(path, await file.async('uint8array'));
    }
    panelGraphics.push({ template, entries });
  }

  // The overlay flavor is the LOCAL-CONTROL package (the OBS/vMix door): the aggregated
  // show panel (inline assets: a single-file package has no images/ folder beside it) PLUS
  // the localhost relay + launchers, so panel-to-OBS control works offline with no
  // command-line setup. The per-graphic sub-packages each carry their own relay copy too
  // (a single folder lifted out keeps working); the root bundle is the one the launcher
  // story documents.
  if (targetId === 'html-overlay') {
    root.file(
      'show_controlpanel.html',
      renderShowControlPanelHtml(show.name, panelGraphics, { inlineAssets: true }),
    );
    // THE PRODUCTION CONTROLLER — the page the launcher opens: cue rundown + verbs +
    // PREVIEW/PROGRAM monitors + per-graphic capability modules, all through the relay.
    const byPoolId = new Map(show.graphics.map((g, i) => [g.id, panelGraphics[i]?.template.name ?? g.name]));
    const cues: EmittedCue[] = (show.cues ?? []).flatMap((cue) => {
      const graphicName = byPoolId.get(cue.sourceId);
      if (!graphicName) return [];
      return [{ id: cue.id, label: cue.label || graphicName, graphic: graphicName, values: { ...cue.values }, note: cue.note ?? '' }];
    });
    const first = panelGraphics[0]?.template;
    root.file(
      'controller.html',
      renderProductionControllerHtml({
        show: show.name,
        graphics: panelGraphics.map(({ template, entries }, i) => ({
          // The production's ARRANGE for this graphic, baked at export (§6e: ARRANGE renders on
          // all three deployments). Keyed by the POOL graphic's name, the same key the bindings
          // and the published panel use — not by the template's, which an imported graphic may
          // have renamed out from under the show.
          //
          // `arrangeFor` applies the version gate itself, which matters most here: a profile a
          // newer build wrote would otherwise be baked into a package that runs offline, with no
          // way to correct it and no build in it that understands the rules it was arranged by.
          ...emitGraphic(template, null, {
            inlineAssets: true,
            entries,
            arrange: arrangeFor(show.profile, show.graphics[i]?.name),
          }),
          file: `${slug(template.name)}/${slug(template.name)}.html`,
          layer: showGraphicLayer(show.graphics[i]),
        })),
        cues,
        width: first?.resolution.width ?? 1920,
        height: first?.resolution.height ?? 1080,
      }),
    );
    addLocalControlBundle(root, {
      v: 1,
      show: { name: show.name },
      graphics: panelGraphics.map(({ template }, i) => ({
        name: template.name,
        file: `${slug(template.name)}/${slug(template.name)}.html`,
        layer: showGraphicLayer(show.graphics[i]),
      })),
    });
  }
  // Only the overlay flavour above actually bundled the relay + launchers, so only its guide
  // may describe them (the acceptance finding: a CasparCG package's guide named a
  // "Start controller.cmd" that was never written into it). The operator page follows the same
  // rule: the overlay flavour writes an aggregated one at this root, the others have whatever
  // their sub-packages brought, and OGraf/LiveOS/H2R have none to name.
  root.file(
    'GETTING-ON-AIR.md',
    onAirGuideMd({
      localController: targetId === 'html-overlay',
      controlPanel: (targetId === 'html-overlay' ? 'show_controlpanel.html' : subPanel) || undefined,
    }),
  );
  root.file(
    'FIELDS.md',
    showFieldReferenceMd(
      show.name,
      panelGraphics.map(({ template }, i) => ({
        template,
        layer: showGraphicLayer(show.graphics[i]),
        file: `${slug(template.name)}/${slug(template.name)}.html`,
      })),
      // Only the CasparCG flavour gets the CLIENT walkthrough: on the others the fields appear
      // by name in the host's own UI and nobody types an id, so the steps would be noise.
      { usage: FIELD_USAGE_NOTES[targetId], clientSteps: targetId === 'casparcg' },
    ),
  );
  root.file(
    'README.md',
    `# ${show.name} — production package (${target.label})\n\nGenerated by NoaCG Studio.\n\n` +
      `One sub-package per graphic, rundown order:\n\n` +
      panelGraphics.map(({ template }, i) => `- ${slug(template.name)}/  (layer ${showGraphicLayer(show.graphics[i])})`).join('\n') +
      `\n\n${FLAVOR_NOTES[targetId] ?? ''}\n\n` +
      `**FIELDS.md** lists every graphic's fields with the ID a playout client sends them under\n` +
      `(f0, f1, …) — the file to keep open beside a CasparCG client.\n`,
  );
  return zip;
}

export async function downloadShowZipFor(show: Show, targetId: string): Promise<void> {
  if (targetId === 'spx') return downloadShowZip(show);
  const zip = await buildShowZipFor(show, targetId);
  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, `${slug(show.name)}_production_${targetId}.zip`);
}
