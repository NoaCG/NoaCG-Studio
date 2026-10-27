// A DROPPED TEMPLATE FILE, read for both wizard doors that take one (the Import graphic card and
// Create with AI). A stranger's OGraf package (export/targets/ografForeign.ts) becomes the entry
// that IS the package, or is refused with its reason; anything else is the native importer's.
// A foreign entry has nothing to edit and no native document to preview: the doors read
// `isForeignGraphic` to leave the artwork door and the preview out, and Create with AI sends it
// straight to Finish rather than to an AI.

import { importTemplateFile, type ImportedTemplateResult } from '../../model/importTemplate';
import { importForeignOgraf } from '../../export/targets/ografForeign';

import { foreignFormatStated } from '../../model/foreignPackage';

export { foreignFormatStated, isForeignGraphic } from '../../model/foreignPackage';

export async function importDroppedTemplate(file: File): Promise<ImportedTemplateResult> {
  if (!/\.zip$/i.test(file.name)) return importTemplateFile(file);
  const data = await file.arrayBuffer();
  const read = await importForeignOgraf(file.name, data);
  if (!read) return importTemplateFile(new File([data], file.name));
  if (!read.ok) throw new Error(`This OGraf package cannot be imported. ${read.reason}`);
  const { resolution } = read.template;
  const stated = foreignFormatStated(read.template);
  return { template: read.template, detection: { resolution, fps: stated ? read.template.fps : null, certain: stated, messages: [] }, noacg: null };
}
