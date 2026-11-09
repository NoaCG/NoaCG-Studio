// The production's look, reduced to the four values a join page can use.
//
// It lives in the AUDIENCE domain because the audience plane owns the shape: the join surface
// reads it, migration 0035 stores it, and the publish path is only the courier. A copy of this
// mapping inside the publish code would be a second opinion about what a viewer's page looks
// like, held by the module least likely to be edited when the join page changes.

import { fontById, fontStack } from '../model/fonts';
import type { ProjectBrand } from '../model/brand';
import type { AudienceBrand } from './audienceTypes';
import { JOIN_PAGE_LIMITS } from '../model/joinPage';

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

/** The page's own words as a page shows them: trimmed and capped, or null for the default. */
export const pageWords = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

/**
 * Everything the phone page takes from the production (interaction spec D4): the look's colours
 * and face, the page's title and waiting text, and the look's logo as the caller resolved it (the
 * published https URL, or the data URL in the studio's own preview). Empty words are left out, so
 * the page shows its defaults.
 */
export function joinPageBrand(
  show: { look?: ProjectBrand; joinPage?: { title?: string; waiting?: string } },
  logo: string | null,
): AudienceBrand {
  const look = audienceBrandFor(show.look);
  return {
    accent: look?.accent ?? null,
    text: look?.text ?? null,
    panel: look?.panel ?? null,
    font: look?.font ?? null,
    logo,
    title: pageWords(show.joinPage?.title, JOIN_PAGE_LIMITS.title),
    waiting: pageWords(show.joinPage?.waiting, JOIN_PAGE_LIMITS.waiting),
  };
}

/** The look's logo as a data URL, or null when it has none. */
export async function lookLogoDataUrl(look: ProjectBrand | undefined): Promise<string | null> {
  const data = look?.logo?.data;
  if (!data) return null;
  if (typeof data === 'string') return data.startsWith('data:image/') ? data : null;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(data);
  });
}
