// THE STUDIO SVG DROP'S DEFAULTS, as one pure function: what the mapping step would build from a
// dropped SVG if nobody touched it. The `noacg` CLI's `scaffold --svg` (src/bridge) calls exactly
// this, so a graphic made from the command line is the studio's own default by construction,
// never a second copy of its rules (interaction spec AC-13, "the same from the CLI").
//
// Its own file, beside the index rather than through it, because the index also carries the
// step components and the bridge page must not load React to answer a scaffold
// (`.dependency-cruiser.cjs`, the bridge -> wizard/import edge names this file alone).
//
// What it cannot carry is what the mapping step measures or asks: a lower third's measured
// growth (proposeBannerGrowth needs layout) and any answer an author gives by hand.

import type { SvgImportResult } from '../../../assets/svgImport';
import type { DesignSvg } from '../../../model/wizard';
import { svgDesignOptions, svgDraftFromImport } from './draft';

/** The DesignSvg the studio builds from this import by default, for a frame of this size. */
export function svgDefaultDesign(result: SvgImportResult, resolution: { width: number; height: number }): DesignSvg | undefined {
  const patch = svgDraftFromImport(result, { resolution, previous: { name: '', designSvg: null } });
  return svgDesignOptions({ ...patch, designKeepBakedText: false });
}
