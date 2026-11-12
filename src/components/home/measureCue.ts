// MEASURE A CUE THAT IS NOT ON PREVIEW (docs/work-specs/playout-adjustments/spec.md, "Where the box
// lives"): the graphic composed in a hidden frame of its own resolution, settled with the cue's
// values and measured twice 250 ms apart (preview/settleGraphic.ts `measureGraphic`, qualified by
// control/cueAdjust.ts `qualifyStep`). The browser half of control/adjustGeometry.ts `createMeasurer`.
//
// The frame and its measurement are preview/measureDocument.ts's, shared with an output.

import { composeDocument } from '../../preview/composeDocument';
import { measureDocument } from '../../preview/measureDocument';
import { MEASURE_QUALIFY, type Measurement } from '../../control/cueAdjust';
import type { SpxTemplate } from '../../model/types';

/** How long one cue may take before it has no measurement. */
const MEASURE_CAP_MS = 5_000;

/** The type and colour a document is told to draw in (previewProtocol.ts `style`). */
export interface PreviewStyle {
  /** The style's identity (control/cueAdjust.ts `styleKey`), so a surface compares it, not the bytes. */
  id: string;
  vars: Record<string, string> | null;
  faces: string;
}

export function measureCue(template: SpxTemplate, values: Record<string, string>, style: PreviewStyle | null = null): Promise<Measurement | null> {
  return measureDocument({
    srcdoc: composeDocument(template, { liveControl: true }),
    size: template.resolution,
    values,
    style: style ? { vars: style.vars, faces: style.faces } : null,
    capMs: MEASURE_CAP_MS,
  }, MEASURE_QUALIFY);
}
