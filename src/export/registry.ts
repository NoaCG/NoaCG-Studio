// Export target registry. Each target transforms the template into a downloadable zip
// package: SPX (folder), HTML overlay (single autoplay html for OBS/vMix browser sources),
// CasparCG (single self-contained html), OGraf (manifest + Web Component), LiveOS (the
// OGraf package with NetOn.Live install steps — LiveOS's graphics engine is OGraf-compliant).

import type { AppliedAppearance } from '../control/cueAdjust';
import type JSZip from 'jszip';
import type { SpxTemplate } from '../model/types';
import type { ControlEntry } from '../model/library';

export interface ExportContext {
  /** The Data panel's sample values (field id → value) at export time — targets with no
   *  playout server (the HTML overlay) bake these in as the on-load data. */
  sampleData?: Record<string, string>;
  /** The graphic's saved control-panel ENTRIES, resolved from the library by the caller — baked
   *  into the bundled controlpanel.html as a data switcher (docs/SAVED_CONTENT_MODEL.md §4).
   *  Absent when the working project has no library link (never saved), which is the only
   *  honest answer there: entries are authored on the RECORD, not on the code. */
  entries?: ControlEntry[];
  /** OGraf playout intent. Other targets ignore it. */
  graphicUsage?: GraphicUsage;
  /** The production's PLACE AND SIZE for this graphic (docs/work-specs/playout-adjustments/spec.md,
   *  phase 1b): its default resolved at export, baked so the file shows it from load
   *  (common.ts `bakeAppearance`). An identity bakes nothing. Present at all, an identity
   *  included, means the production holds place and size for this graphic, so a relay receiver
   *  also applies what the controller's rows carry. Absent: the package is what it always was. */
  appearance?: AppliedAppearance;
}

export type GraphicUsage = 'live' | 'post-production' | 'both';

export interface ExportTarget {
  id: string;
  label: string;
  description: string;
  /** Success line shown after a download. Each target speaks for its own workflow — SPX says
   *  "drop the folder in", a browser-source target says "add the .html as a source", etc. */
  successMessage: string;
  build: (template: SpxTemplate, ctx?: ExportContext) => Promise<JSZip>;
}

// Imported AFTER the interfaces so targets can import types from here without a cycle.
import { spxTarget } from './targets/spxStarter';
import { htmlOverlayTarget } from './targets/htmlOverlay';
import { h2rTarget } from './targets/h2r';
import { casparTarget } from './targets/casparcg';
import { ografTarget } from './targets/ograf';
import { liveosTarget } from './targets/liveos';

export const EXPORT_TARGETS: ExportTarget[] = [spxTarget, htmlOverlayTarget, h2rTarget, casparTarget, ografTarget, liveosTarget];
