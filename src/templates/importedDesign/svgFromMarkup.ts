// SVG MARKUP TO AN IMPORTED GRAPHIC, with no wizard: the path the `noacg` CLI takes
// (`scaffold --svg`, through the bridge), so artwork made outside the studio gets the same
// contract the mapping step applies by default (interaction spec AC-13, "the same from the CLI").
//
// The layer names decide everything, exactly as the step's first proposal does
// (`behaviours/naming.ts bestProposal`): a vote board's Question, Option N, Bar N and Vote count
// layers become a live vote, a layer named QR becomes the code (svgQr.ts). Every other text layer
// becomes an operator field. A layer a behaviour writes is NOT a field, because two writers on
// one layer means an operator watching their own typing be overwritten. A proposed countdown's
// clock layer ticks, and bundled fonts resolve, as in the step. Pictures, outlined text and
// fonts that are not bundled stay as drawn; the studio's mapping step is where they are chosen.

import { importSvgMarkup } from '../../assets/svgImport';
import type { DesignSvg, DesignSvgRecipeBehaviour, WizardOptions } from '../../model/wizard';
import type { SpxTemplate } from '../../model/types';
import { FONTS, fontNameKey } from '../../model/fonts';
import { bestProposal } from '../behaviours/naming';
import { recipeById } from '../behaviours/registry';
import { IMPORTED_SVG } from './svg';

export interface SvgMarkupGraphic {
  template: SpxTemplate;
  /** The behaviour the layer names proposed (`vote`, `quiz`, ...), or null for plain artwork. */
  behaviour: string | null;
  /** The operator fields, by title, in field order. */
  fields: string[];
}

function candidateIds(map: Record<string, string | Record<string, string>>): string[] {
  return Object.values(map).flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v)));
}

/** Build an imported SVG graphic from markup alone. Throws the importer's own message on markup it
 *  refuses. */
export function graphicFromSvgMarkup(markup: string, options: WizardOptions = {}): SvgMarkupGraphic {
  const imported = importSvgMarkup(markup);
  const proposal = bestProposal(imported);
  const written = new Set(proposal ? candidateIds(proposal.layers) : []);
  const offered = imported.candidates.filter((c) => !written.has(c.id));
  // A proposed countdown's clock layer is the ticking readout, as the step arms it for a proposed
  // timer (components/wizard/import/draft.ts `armTimerClock`): bound by kind, not by name.
  const clockRole = proposal ? recipeById(proposal.recipe)?.roles.find((r) => r.countdown) : undefined;
  const clockId = clockRole && proposal ? proposal.fields[clockRole.id] : undefined;
  const fields = offered.map((c) => ({
    candidateId: c.id,
    title: c.label,
    sample: c.sample,
    numeric: c.numeric,
    ...(typeof clockId === 'string' && c.id === clockId ? { countdown: true } : {}),
  }));
  let behaviour: DesignSvgRecipeBehaviour | undefined;
  if (proposal) {
    // A field role points at a text layer the operator types into: its index among the fields.
    const index = (id: string) => fields.findIndex((f) => f.candidateId === id);
    const roleFields: Record<string, number | Record<string, number>> = {};
    for (const [role, v] of Object.entries(proposal.fields)) {
      roleFields[role] = typeof v === 'string' ? index(v) : Object.fromEntries(Object.entries(v).map(([k, id]) => [k, index(id)]));
    }
    behaviour = {
      kind: 'recipe',
      recipe: proposal.recipe,
      layers: proposal.layers,
      ...(Object.keys(roleFields).length ? { fields: roleFields } : {}),
      ...(proposal.rows.length ? { rows: proposal.rows } : {}),
    };
  }
  const designSvg: DesignSvg = {
    markup: imported.markup,
    width: imported.width,
    height: imported.height,
    fields,
    images: [],
    outlines: [],
    // Bundled faces matched on the lookup name, the artwork's own family and weight kept, exactly
    // as the step's draft does (svgDraftFromImport), so the face the artwork asks for is the one
    // the graphic declares.
    fonts: imported.fonts.map((f) => {
      const fontId = FONTS.find((b) => fontNameKey(b.family) === fontNameKey(f.lookup))?.id;
      return { family: f.family, ...(fontId ? { fontId } : {}), ...(f.weight !== null ? { weight: f.weight } : {}) };
    }),
    ...(behaviour ? { behaviour } : {}),
  };
  const template = IMPORTED_SVG.create({ ...options, designSvg });
  return { template, behaviour: proposal?.recipe ?? null, fields: template.fields.map((f) => f.title) };
}
