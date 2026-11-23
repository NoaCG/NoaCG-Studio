import { useState } from 'react';
import type { PreviewBoxOverlay } from './WizardPreview';

/**
 * WHAT THE SVG MAPPING STEP SHOWS ON THE PREVIEW, held by the wizard because the highlight is
 * drawn on the PREVIEW - the step's one canvas, and the only one carrying the fit runtime
 * (docs/SVG_IMPORT_PLAN.md §6a step 1) - and reported by the step, which holds the artwork.
 */
export function useSvgMapPreview() {
  // Which layer the checklist is pointing at.
  const [hoverId, setHoverId] = useState<string | null>(null);
  // The lines lit while a text box is being set (MapSvgFieldsStep `onMarks`).
  const [marks, setMarks] = useState<string[]>([]);
  // And the BOX that layer lives in, with the room round it and the alignment the file drew -
  // what the preview's box overlay draws (docs/TEXT_BOX_BINDING.md).
  const [boxOverlay, setBoxOverlay] = useState<PreviewBoxOverlay | null>(null);
  return { hoverId, setHoverId, marks, setMarks, boxOverlay, setBoxOverlay };
}
