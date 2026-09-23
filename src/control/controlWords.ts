// HOW A ⚡ BUTTON NAMES ITSELF, in the words the operator can already see.
//
// Two pure functions, split out of `controlModel.ts` for one reason: THIS MODULE IMPORTS NOTHING.
// That is what lets `scripts/control-name.test.mjs` load it with a single `transpileModule` call
// and pin the cases no fixture in the Playwright suite happens to carry (the `combine.ts` and
// `control-profile.test.mjs` pattern). Keep it dependency-free, or that test is the thing that
// breaks.
//
// WHAT THEY ARE FOR. The agent-made proof case's totals board labels five separate presses "+1",
// one per panelist, and the hover used to open with the machine's own event id (`plus3`) and then
// say "moves Points 3 +1 with it". So it named the button in a vocabulary no operator has seen,
// and made them read the same number twice. The heading drawn over the row is the word that
// actually tells those five apart, and the button itself is what says how much.

/** The shape of a declaration these two read. Spelled out here rather than imported, so the
 *  module keeps its own list of what it touches and stays loadable on its own. */
export interface AdjustingButton {
  adjust?: Record<string, number>;
}

/**
 * The name a hover opens with: the heading over the button, then its label.
 *
 * `section` is the heading the panel actually DRAWS, passed in by the surface rather than derived
 * here. A control with none over it - a pinned one, which `arrangeControls` lifts out of its
 * section by design, or a lone "Actions" group whose heading the dashboard suppresses - keeps its
 * bare label, because a hover must not name something the operator cannot see.
 *
 * A label that already opens with its section's words is left alone rather than saying them
 * twice: a "Match" section holding "Match final" reads "Fires Match final", never "Fires Match
 * Match final".
 */
export function controlName(label: string, section?: string): string {
  const head = section?.trim();
  if (!head) return label;
  const plain = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  return plain(label).startsWith(plain(head)) ? label : `${head} ${label}`;
}

/**
 * Does the button's own word already say HOW MUCH it moves?
 *
 * When it does, the clause that follows only has to say WHAT moves: "Fires Panelist 3 +1 on the
 * live graphic and moves Points 3 with it", rather than spending its most useful words repeating
 * the button.
 *
 * Minus signs are normalised first, because a designer types the typographic one (−1, U+2212)
 * into a label while the delta is arithmetic, and a straight comparison called those two
 * different. EVERY delta must appear: a press moving two figures under one word is not described
 * by that word, so it keeps its numbers.
 */
export function labelCarriesDelta(button: AdjustingButton, label: string): boolean {
  const deltas = Object.values(button.adjust ?? {});
  if (deltas.length === 0) return false;
  const plain = label.replace(/[−–—]/g, '-');
  return deltas.every((delta) => plain.includes(`${delta > 0 ? '+' : ''}${delta}`));
}
