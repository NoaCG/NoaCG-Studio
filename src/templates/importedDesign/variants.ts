// The Import graphic door's two variants in one list: the raster one (imp01) and the SVG one
// (svg01). They are one door, and which one a drop creates is decided by the FILE
// (docs/SVG_IMPORT_PLAN.md). The catalog lists them under 'imported-design'; the wizard resolves
// them from here, so a dropped graphic previews without loading the whole catalog.

import type { TemplateVariant } from '../../model/wizard';
import { IMPORTED_DESIGNS } from './shared';
import { IMPORTED_SVG } from './svg';

export const IMPORTED_VARIANTS: TemplateVariant[] = [...IMPORTED_DESIGNS, IMPORTED_SVG];
