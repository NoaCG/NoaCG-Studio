// The template catalog: one place that knows every category's variants. The wizard,
// Motion panel, and sweep script all resolve variants through here.

import type { AssemblerId, TemplateVariant } from '../model/wizard';
import { LOWER_THIRDS } from './lowerThirds';
import { INFO_CARDS } from './infoCards';
import { END_CREDITS } from './endCredits';
import { TICKERS } from './tickers';
import { ALERTS } from './alerts';
import { PUBLIC_INFO } from './publicInfo';
import { STARTING_SOON } from './startingSoon';
import { GAME_TIMERS } from './gameTimers';
import { SCOREBOARDS } from './scoreboards';
import { CORNER_BUGS } from './cornerBug';
import { INFOGRAPHICS } from './infographics';
import { VERSUS } from './versus';
import { QUIZ } from './quiz';
import { FRAMES } from './frames';
import { TRANSITIONS } from './transitions';
import { ESPORTS_SCORES } from './competition/esports';
import { MATCHUPS } from './competition/matchup';
import { RESULTS_BOARDS } from './competition/results';
import { REVEALS } from './competition/reveal';
import { POLLS } from './poll';
import { AUDIENCE } from './audience';
import { STREAM_NOTIFICATIONS } from './streamNotifications';
import { IMPORTED_VARIANTS } from './importedDesign/variants';
import { mergeCatalog, typeVariants } from './types/registry';

/**
 * The hand-written variants — a category's own files, in their curated browse order.
 *
 * Exported because the PRE-MERGE list is the only place a promoted design's OWN authored
 * capabilities survive: `mergeCatalog` replaces the entry with the type-compiled one. Comparing
 * the two is what makes the capabilities gate checkable at all (docs/GRAPHIC_TYPES.md §5), and
 * `scripts/factory.mjs` reads it for exactly that.
 */
export const HAND_WRITTEN: Partial<Record<AssemblerId, TemplateVariant[]>> = {
  'lower-third': LOWER_THIRDS,
  'info-card': INFO_CARDS,
  'end-credits': END_CREDITS,
  'ticker': TICKERS,
  'alert': ALERTS,
  'public-info': PUBLIC_INFO,
  'starting-soon': STARTING_SOON,
  'game-timer': GAME_TIMERS,
  'scoreboard': SCOREBOARDS,
  'corner-bug': CORNER_BUGS,
  'infographic': INFOGRAPHICS,
  'versus': VERSUS,
  'quiz': QUIZ,
  'frame': FRAMES,
  'transition': TRANSITIONS,
  // The competition pack (docs/COMPETITION_PACK.md).
  'esports-score': ESPORTS_SCORES,
  'matchup': MATCHUPS,
  'results-board': RESULTS_BOARDS,
  'reveal': REVEALS,
  'poll': POLLS,
  'audience': AUDIENCE,
  'stream-notification': STREAM_NOTIFICATIONS,
  // Not browsable in the category grid — the Import Graphic entry is its only way in.
  // The raster variant (imp01) and the SVG variant (svg01) live in one list, because they
  // are one door: which one a drop creates is decided by the FILE (docs/SVG_IMPORT_PLAN.md).
  'imported-design': IMPORTED_VARIANTS,
};

/**
 * The catalog: the hand-written lists with every registered GRAPHIC TYPE's designs merged in.
 * A type that PROMOTES an existing variant replaces it by id and in place, so a promoted
 * design keeps its position in the grid and its identity everywhere else it is referenced.
 */
export const CATALOG: Partial<Record<AssemblerId, TemplateVariant[]>> = mergeCatalog(
  HAND_WRITTEN,
  typeVariants(),
);

export function variantsFor(category: AssemblerId | null): TemplateVariant[] {
  return (category && CATALOG[category]) || [];
}

export function variantById(id: string): TemplateVariant | undefined {
  for (const list of Object.values(CATALOG)) {
    const hit = list?.find((v) => v.id === id);
    if (hit) return hit;
  }
  return undefined;
}
