// A DROPPED TEMPLATE FILE, read for both wizard doors that take one (the Import graphic card and
// Create with AI). A stranger's OGraf package (export/targets/ografForeign.ts) becomes the entry
// that IS the package, or is refused with its reason; anything else is the native importer's.
// A foreign entry has nothing to edit and no native document to preview: the doors read
// `isForeignGraphic` to leave the artwork door and the preview out, and Create with AI sends it
// straight to Finish rather than to an AI.

import { importTemplateFile, type ImportedTemplateResult } from '../../model/importTemplate';
import { importForeignOgraf } from '../../export/targets/ografForeign';
import { prepareOutRuntime } from '../../blocks/animMigration';

import { foreignFormatStated } from '../../model/foreignPackage';

export { foreignFormatStated, isForeignGraphic } from '../../model/foreignPackage';

/** The native importer's read, except NoaCG's own runtime brought current as preview, save and
 *  export bring it (`prepareOutRuntime`, known bodies only). The walk's preview, its re-import
 *  review and its Finish doors then read one source, and a build made before an interpreter change
 *  opens already holding what its first Save writes, so that Save rewrites nothing under the user. */
async function importNative(file: File): Promise<ImportedTemplateResult> {
  const read = await importTemplateFile(file), js = prepareOutRuntime(read.template.js);
  return js === read.template.js ? read : { ...read, template: { ...read.template, js } };
}

export async function importDroppedTemplate(file: File): Promise<ImportedTemplateResult> {
  if (!/\.zip$/i.test(file.name)) return importNative(file);
  const data = await file.arrayBuffer();
  const read = await importForeignOgraf(file.name, data);
  if (!read) return importNative(file);
  if (!read.ok) throw new Error(`This OGraf package cannot be imported. ${read.reason}`);
  const { resolution } = read.template;
  const stated = foreignFormatStated(read.template);
  return { template: read.template, detection: { resolution, fps: stated ? read.template.fps : null, certain: stated, messages: [] }, noacg: null };
}
