// The production's look, reduced to the four values a join page can use.
//
// It lives in the AUDIENCE domain because the audience plane owns the shape: the join surface
// reads it, migration 0035 stores it, and the publish path is only the courier. A copy of this
// mapping inside the publish code would be a second opinion about what a viewer's page looks
// like, held by the module least likely to be edited when the join page changes.

import { fontById, fontStack } from '../model/fonts';
import type { ProjectBrand } from '../model/brand';
import type { AudienceBrand } from './audienceTypes';

/**
 * Map a production's look onto the join page's four variables, or null when the production has
 * chosen no look (the page then renders in the studio's own control-room colours, which is the
 * honest answer rather than a guessed one).
 */
export function audienceBrandFor(look: ProjectBrand | undefined): AudienceBrand | null {
  if (!look) return null;
  return {
    accent: look.palette.accent,
    text: look.palette.text,
    panel: look.palette.panel,
    // An imported face cannot travel to a phone (its bytes live in the template's assets, not
    // on this page), so a custom font contributes its FAMILY NAME plus the page's own fallback:
    // a device that happens to have the face uses it, and every other one reads the default.
    // A BUNDLED face does travel: joinSurface.ts declares an `@font-face` for every one of them
    // against /fonts, so the name below resolves to a real file on the viewer's phone.
    font: look.customFont
      ? `"${look.customFont.family}", system-ui, sans-serif`
      : look.fontId
        ? fontStack(fontById(look.fontId))
        : null,
  };
}
