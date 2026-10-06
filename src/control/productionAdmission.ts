import { addGraphicToShow, loadShows } from '../model/shows';
import type { SpxTemplate } from '../model/types';
import { validateProductionTemplate } from '../validation/productionGate';

/** Drafts can be saved in the library. Admission to an operational production uses its air gate. */
export function addReadyGraphicToShow(showId: string, template: SpxTemplate, options?: { graphicId?: string | null }) {
  const gate = validateProductionTemplate(template);
  if (!gate.ok) return { shows: loadShows(), error: `${template.name}: ${gate.errors.map(e => e.message).join(' ')} Fix the graphic in the editor before adding it to the rundown.` };
  return addGraphicToShow(showId, template, options);
}
