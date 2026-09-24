// Contrast-aware reference selection, shared by the harnesses.
//
// WHY THIS EXISTS. Keyword-matching a reference library returns whatever matched FIRST, so
// the same cards win repeatedly and every generation drifts toward one look. Asking a model
// for "three different directions" in one pass has the same failure: it returns three points
// near one attractor. Diversity has to come from the SELECTION step, deterministically -
// which also costs zero tokens and zero latency, because nothing here calls a model.
//
// It doubles as the legal mitigation: blending several orthogonal references means no single
// source dominates an output (docs/BROADCAST_DESIGN_SYSTEM_RESEARCH.md §7.4). The variety
// mechanism and the trade-dress mitigation are the same mechanism.

// `.js` because the API runtime loads this module too (api/_lib via ai/lite/contract.ts).
import { accountKey } from '../model/accountScope.js';

/**
 * The axes a reference is scored on. Defined HERE, not with the cards, because this is the
 * selector's contract - a card library conforms to it.
 *
 * `infoLayers` and `graphicImageRelation` are weighted double: they separate design cultures
 * far more sharply than colour or typography (a 1-2 layer graphic sitting beside the picture
 * and a 6-layer graphic annotating it are different design worlds, whatever their palettes),
 * and they are exactly what a model's default prior gets wrong.
 */
export interface ReferenceAxes {
  infoLayers: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  graphicImageRelation: 'beside' | 'is-the-image' | 'overlay-annotated' | 'fused-3d';
  density: 1 | 2 | 3 | 4 | 5;
  geometry: 'orthogonal' | 'skewed' | 'chamfered' | 'circular' | 'organic';
  typeVoice:
    | 'condensed-caps'
    | 'geometric-sans'
    | 'humanist'
    | 'serif-editorial'
    | 'mono-technical'
    | 'display-expressive';
  colorBehavior: 'restrained' | 'committed' | 'full-palette' | 'drenched';
  motionLanguage: 'snap' | 'glide' | 'mechanical' | 'organic' | 'cut';
  surface: 'flat-graphic' | 'lit-material' | 'glass' | 'paper-texture' | 'screen-native';
  holdCharacter: 'none' | 'brief' | 'dramatised';
  idleLoop: boolean;
  reducesVideoWindow: boolean;
}

/**
 * A/B switch for the PoC. Three arms, not two, and the third one is the point.
 *
 *  - `contrast`  the feature: strongest-match anchor, then a max-min contrasting companion.
 *  - `padded`    THE CONTROL. The keyword pick's choice rule - declaration order, no contrast,
 *                no recency - but always widened to two cards from the same genre-compatible
 *                field `contrast` draws from.
 *  - `legacy`    what shipped: `filter(...).slice(0, 2)`, byte for byte.
 *
 * `legacy` is NOT a usable control, which is why `padded` exists. A brief matching one card is
 * handed ONE card by the keyword pick, while contrast anchors one and always widens to two - so
 * the two arms differ in how much reference prose is injected, not only in which cards. On the
 * bench bank that is 9 of 21 generations. A gallery win measured against `legacy` could then be
 * explained by "two cards of design DNA beat one", which costs a one-line change rather than the
 * whole contrast mechanism. Benching `contrast` against `padded` holds the dosage constant and
 * leaves only the choice of companion varying, which is the thing under test.
 *
 * See docs/BROADCAST_DESIGN_SYSTEM_RESEARCH.md §8.3f and scripts/reference-select-simulate.mjs.
 * Typed wide so every branch stays live for the compiler.
 *
 * SHIPPING ON `legacy`, DELIBERATELY - do not flip this to run an experiment and forget it.
 * `contrast` is measured but not justified: it concentrates 62% of companion slots onto two
 * cards no brief ever matches, and the free proxy that appeared to endorse it is maximised by
 * exactly that concentration (§8.3f). The paid pass (§8.3h) withdrew the claim that the
 * concentration produces visibly WRONG output, but it vindicated nothing - the Motion Director
 * filtered the companion out entirely, so what it measured was the Director, not the cards.
 * `padded` is untested for output quality in either direction. The part of this work that
 * earned its place is the reference POOL (6 cards -> 14), which every arm benefits from.
 * Flipping this line changes what every user's video generation is prompted with.
 */
export type SelectionMode = 'contrast' | 'padded' | 'legacy';
export const SELECTION_MODE: SelectionMode = 'legacy';

// Ordinal axes: distance is how far apart the steps are, not merely whether they differ.
const COLOR_ORDER = ['restrained', 'committed', 'full-palette', 'drenched'] as const;
const HOLD_ORDER = ['none', 'brief', 'dramatised'] as const;

function step(order: readonly string[], value: string): number {
  const i = order.indexOf(value);
  return i < 0 ? 0 : i;
}

/** Weighted axis distance in 0..1. 0 = same design world, 1 = maximally unlike. */
export function axisDistance(a: ReferenceAxes, b: ReferenceAxes): number {
  let sum = 0;
  let total = 0;
  const add = (weight: number, d: number): void => {
    sum += weight * d;
    total += weight;
  };
  const differs = (x: string, y: string): number => (x === y ? 0 : 1);

  add(2, Math.abs(a.infoLayers - b.infoLayers) / 6);
  add(2, differs(a.graphicImageRelation, b.graphicImageRelation));
  add(1, Math.abs(a.density - b.density) / 4);
  add(1, differs(a.geometry, b.geometry));
  add(1, differs(a.typeVoice, b.typeVoice));
  add(1, Math.abs(step(COLOR_ORDER, a.colorBehavior) - step(COLOR_ORDER, b.colorBehavior)) / 3);
  add(1, differs(a.motionLanguage, b.motionLanguage));
  add(1, differs(a.surface, b.surface));
  add(1, Math.abs(step(HOLD_ORDER, a.holdCharacter) - step(HOLD_ORDER, b.holdCharacter)) / 2);
  add(0.5, a.idleLoop === b.idleLoop ? 0 : 1);
  add(0.5, a.reducesVideoWindow === b.reducesVideoWindow ? 0 : 1);

  return sum / total;
}

/**
 * Greedy max-min: repeatedly add whichever candidate has the largest MINIMUM distance to
 * everything already chosen. Maximising the minimum (rather than the average) is what stops
 * a later pick from hiding next to an earlier one - precisely the "three options that only
 * change colour" failure.
 *
 * `seed` PINS cards that must appear in the result. This matters more than it looks: with no
 * seed the function returns the most mutually-unlike cards in the pool, which - measured on
 * real briefs - happily discards the one card that actually matched the brief and returns two
 * extremes instead. Callers that have a relevance signal should pin it and let contrast
 * choose only the companions.
 *
 * `penalty` is subtracted from a candidate's score, letting a caller discourage a card without
 * banning it. Plain argmax-distance has no notion of what OTHER calls chose, so whichever card
 * sits furthest out on the axes wins the companion slot almost every time - measured: the single
 * card at a unique axis position took 9 of 33 companion slots. A continuous penalty rotates that
 * winner; a hard exclusion filter cannot, because it still argmaxes over whatever survives it.
 *
 * Fully deterministic: ties resolve to the earlier card in the input order.
 */
export function pickContrasting<T extends { axes: ReferenceAxes }>(
  pool: T[],
  n: number,
  seed: T[] = [],
  penalty: (item: T) => number = () => 0,
): T[] {
  if (n <= 0) return [];
  const chosen: T[] = seed.slice(0, n);

  if (chosen.length === 0) {
    if (pool.length <= n) return pool.slice();
    if (n === 1) return [pool[0]];
    let widest = -1;
    let pair: [T, T] = [pool[0], pool[1]];
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const d = axisDistance(pool[i].axes, pool[j].axes);
        if (d > widest) {
          widest = d;
          pair = [pool[i], pool[j]];
        }
      }
    }
    chosen.push(pair[0], pair[1]);
  }

  while (chosen.length < n) {
    let best: T | null = null;
    let bestScore = -Infinity;
    for (const candidate of pool) {
      if (chosen.includes(candidate)) continue;
      let minD = Infinity;
      for (const already of chosen) {
        minD = Math.min(minD, axisDistance(candidate.axes, already.axes));
      }
      const score = minD - penalty(candidate);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    if (!best) break;
    chosen.push(best);
  }
  return chosen;
}

/** Relevance-first max-min selection for a small grounded reference set.
 *
 * The highest-relevance item is pinned. Further items balance normalized relevance with their
 * minimum semantic distance from everything already selected. This keeps the shortlist on brief
 * while avoiding three references that differ only by color. The caller owns both scoring
 * functions, so Lite and video keep their own vocabularies without a parallel selector. */
export function pickRelevantDiverse<T>(
  pool: readonly T[],
  count: number,
  relevance: (item: T) => number,
  distance: (a: T, b: T) => number,
): T[] {
  if (count <= 0 || pool.length === 0) return [];
  const ranked = pool
    .map((item, index) => ({ item, index, relevance: Math.max(0, relevance(item)) }))
    .sort((a, b) => b.relevance - a.relevance || a.index - b.index);
  const maxRelevance = ranked[0]?.relevance || 1;
  const selected = [ranked[0].item];
  while (selected.length < Math.min(count, pool.length)) {
    let best: { item: T; score: number; index: number } | null = null;
    for (const candidate of ranked) {
      if (selected.includes(candidate.item)) continue;
      const fit = candidate.relevance / maxRelevance;
      const diversity = Math.min(...selected.map((item) => distance(candidate.item, item)));
      // Relevance owns the majority. Diversity breaks attractors inside the relevant band.
      const score = fit * 0.7 + diversity * 0.3;
      if (!best || score > best.score || (score === best.score && candidate.index < best.index)) {
        best = { item: candidate.item, score, index: candidate.index };
      }
    }
    if (!best) break;
    selected.push(best.item);
  }
  return selected;
}

// ── Anti-dominance ledger ────────────────────────────────────────────────────
// Same posture as preferences.ts: localStorage, local only, never a hard dependency.

const RECENCY_KEY = 'spx-gfx-ai-reference-recency';
const RECENCY_DEPTH = 6;

/**
 * How hard a recent use counts against a card, in the same units as `axisDistance` (0..1).
 *
 * This is the one tuned number in the file, so here is the reasoning rather than just the value.
 * Among genre-compatible candidates the distance from an anchor typically spans about 0.3 to 0.9,
 * so 0.25 is large enough to displace the leader when the runner-up is within roughly a quarter
 * of that range - which is the case that produces the same companion over and over - and too
 * small to promote a card that is genuinely much closer to the anchor. It discourages; it never
 * decides on its own.
 */
export const RECENCY_WEIGHT = 0.25;

/** Penalty for a card given the current ledger: freshest use hurts most, decaying to nothing. */
export function recencyPenaltyFor(id: string, recent: string[]): number {
  const i = recent.indexOf(id);
  return i < 0 ? 0 : RECENCY_WEIGHT * (1 - i / RECENCY_DEPTH);
}

export function recentReferenceIds(): string[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(accountKey(RECENCY_KEY));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function noteReferenceUse(ids: string[]): void {
  if (ids.length === 0) return;
  try {
    if (typeof localStorage === 'undefined') return;
    const kept = recentReferenceIds().filter((id) => !ids.includes(id));
    localStorage.setItem(accountKey(RECENCY_KEY), JSON.stringify([...ids, ...kept].slice(0, RECENCY_DEPTH)));
  } catch {
    // Storage unavailable (private mode, quota). Recency is a nicety, never a requirement.
  }
}
