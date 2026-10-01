// The SPX PROJECT a production package carries: `DATAROOT/<project>/profile.json` (the project's
// templates, as SPX's own template browser would import them) and `data/<rundown>.json` (one
// rundown item per cue, with the cue's values). SPX keeps projects and rundowns as plain JSON
// files and lists whatever folders it finds in its DATAROOT, so writing them is the one route
// that works on every edition: SPX Solo answers 501 to most of its API.
//
// The shape is SPX's own, read off the sample project SPX ships (DATAROOT/MyFirstProject) and off
// the files SPX 1.2.1 and 1.4.1 wrote when NoaCG packages were imported and added by hand
// (docs/SPX_ON_A_REAL_SERVER.md §9). A profile template is the template's definition plus
// `onair`, `imported` and `relpath` (`addTemplateToProfile` in SPX's routes-application.js); a
// rundown item is that same object with the item's own values and an `itemID`
// (`addAllItemsToRundown`). The written files were walked on both servers (same record, §11).
//
// This module imports nothing at run time, so scripts/spx-rundown.test.mjs runs it in Node.

import type { SpxField, SpxSettings } from '../model/types';

/** The rundown's file name inside the project's `data/` folder. */
export const SPX_RUNDOWN_NAME = 'rundown';

/** One template of the project: where it sits under SPX's ASSETS/templates, and its definition. */
export interface SpxProjectTemplate {
  /** From SPX's templates folder, with a leading slash: `/my_show/hairline/hairline.html`. */
  relpath: string;
  settings: SpxSettings;
  fields: SpxField[];
}

/** One rundown item: which template (index into the project's templates), the name SPX shows
 *  beside the template's, and the values it plays with (field id to value). */
export interface SpxRundownEntry {
  template: number;
  description: string;
  values: Record<string, string>;
}

/** The line SPX writes at the top of both files; kept so a file reads as SPX's own. */
const SPX_WARNING = 'Modifications done in the SPX will overwrite this file.';

/** SPX's controller ticks a checkbox when its value is "1" and saves "1" or "0"; NoaCG keeps
 *  "true" or "false". */
function spxCheckbox(value: string): string {
  return /^(1|true|yes|on)$/i.test(value.trim()) ? '1' : '0';
}

/** The DataFields SPX reads from a definition, with `values` in place of the defaults. */
function dataFields(fields: SpxField[], values: Record<string, string> = {}): Record<string, unknown>[] {
  // SPX's import gives a template without fields this one instruction row.
  if (fields.length === 0) return [{ ftype: 'instruction', value: 'No editable fields' }];
  return fields.map((f) => {
    let value = f.field && values[f.field] !== undefined ? values[f.field] : f.value;
    if (f.ftype === 'checkbox') value = spxCheckbox(value);
    const entry: Record<string, unknown> = { field: f.field, ftype: f.ftype, title: f.title, value };
    if (f.prvar !== undefined) entry.prvar = f.prvar;
    if (f.items) entry.items = f.items;
    if (f.assetfolder !== undefined) entry.assetfolder = f.assetfolder;
    if (f.extension !== undefined) entry.extension = f.extension;
    if (f.fcall !== undefined) entry.fcall = f.fcall;
    if (f.descr !== undefined) entry.descr = f.descr;
    return entry;
  });
}

/** A template as SPX's import writes it into the profile, keys in SPX's order. */
function profileTemplate(t: SpxProjectTemplate, imported: string, values?: Record<string, string>, description?: string) {
  const s = t.settings;
  return {
    description: description ?? s.description,
    playserver: s.playserver,
    playchannel: s.playchannel,
    playlayer: s.playlayer,
    webplayout: s.webplayout,
    out: s.out,
    steps: s.steps,
    dataformat: s.dataformat,
    uicolor: s.uicolor,
    DataFields: dataFields(t.fields, values),
    onair: 'false',
    imported,
    relpath: t.relpath,
  };
}

/** `profile.json`: the project's templates with their default values, in package order. */
export function spxProfileJson(templates: SpxProjectTemplate[], now = Date.now()): object {
  return {
    projectFormat: 'SPX',
    warning: SPX_WARNING,
    updated: new Date(now).toISOString(),
    templates: templates.map((t, i) => profileTemplate(t, String(now + i))),
  };
}

/** The project's two files, by their path inside the project folder, as written text. */
export function spxProjectFiles(templates: SpxProjectTemplate[], entries: SpxRundownEntry[], now = Date.now()): Record<string, string> {
  return {
    'profile.json': JSON.stringify(spxProfileJson(templates, now), null, 2),
    [`data/${SPX_RUNDOWN_NAME}.json`]: JSON.stringify(spxRundownJson(templates, entries, now), null, 2),
  };
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** The package README's section on the project: where its two folders go, and what opens.
 *  `folder` is both the package folder's name and the project's. */
export function spxProjectReadmeMd(folder: string, items: number, clipCues: number): string {
  return (
    `\n## The SPX project and rundown (DATAROOT/${folder})\n` +
    `A ready SPX project: every graphic above, and a rundown named "${SPX_RUNDOWN_NAME}" with ${items}\n` +
    `${plural(items, 'item', 'items')} in the production's order, each with its saved values, on the SPX layers above.\n\n` +
    `1. Copy this whole \`${folder}\` folder into SPX's \`ASSETS/templates\` folder, so the graphics\n` +
    `   are at \`ASSETS/templates/${folder}/\`. The rundown looks for them there.\n` +
    `2. Copy \`DATAROOT/${folder}\` into SPX's own \`DATAROOT\` folder, beside its other projects.\n` +
    `   A project of the same name already there is replaced.\n` +
    `3. In SPX, open the project \`${folder}\` and its rundown \`${SPX_RUNDOWN_NAME}\`. Play, Continue and\n` +
    `   Stop work as for any SPX template.\n` +
    (clipCues
      ? `\n${clipCues} ${plural(clipCues, 'cue', 'cues')} of this production ${plural(clipCues, 'plays', 'play')} a clip from the playout server\n` +
        `through NoaCG Bridge and ${plural(clipCues, 'is', 'are')} not in the SPX rundown.\n`
      : '')
  );
}

/** The line GETTING-ON-AIR.md's SPX section gets, pointing at the README. */
export function spxProjectGuideNote(folder: string): string {
  return `This package also carries a ready SPX project with the production's rundown,\n` +
    `\`DATAROOT/${folder}\`. The README says where its folders go.\n`;
}

/** `data/<rundown>.json`: one item per entry, each a copy of its profile template carrying the
 *  entry's values and name, and a unique `itemID` the way SPX's "Add all" makes them. */
export function spxRundownJson(templates: SpxProjectTemplate[], entries: SpxRundownEntry[], now = Date.now()): object {
  return {
    warning: SPX_WARNING,
    updated: new Date(now).toISOString(),
    projectFormat: 'SPX',
    templates: entries.map((e, i) => ({
      ...profileTemplate(templates[e.template], String(now + e.template), e.values, e.description),
      itemID: String(now + i),
    })),
  };
}
