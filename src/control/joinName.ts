// Turning a production's NAME into the readable audience link it should already have had.
//
// The owner's rule (docs/INTERACTIVE_PLAYOUT_PLAN.md, Phase 5): a link must exist the moment a
// production is published, derived from its name, without anyone typing an ending. The
// hand-picked name stays - it is just no longer the only way to get a readable URL.
//
// This module holds exactly ONE rule, the slug SHAPE we propose. Every rule about what is
// ACCEPTABLE - the 3-40 length, the character class, the reserved-word list, global uniqueness -
// lives on the column in migration 0035, and `claimJoinName` says at length why a second copy in
// TypeScript would be wrong. So this file never validates a candidate: it proposes one, the
// database answers, and a refusal is simply the next candidate's turn. A base that comes out too
// short ("TV" -> "tv") or reserved ("Admin" -> "admin") is refused and healed by the same retry
// that handles a name someone else already took, with no list here to drift from that one.

/** Room for the `-9` a collision retry appends, inside 0035's 40-character ceiling. */
const BASE_MAX = 38;

/** Combining marks, which is what NFKD leaves behind once an accented letter is decomposed. */
const COMBINING = /[̀-ͯ]/g;

/**
 * The slug a production of this name should get, or null when its name has no letters or digits
 * to build one from (an emoji-only name is a real thing, and a made-up slug for it would be
 * worse than the random one the database already minted).
 */
export function deriveJoinName(productionName: string): string | null {
  const base = (productionName ?? '')
    // Fold accents rather than dropping the letters under them: "Futbol Nocturno" spelled with
    // an accent has to come out "futbol-nocturno", not "f-tbol-nocturno".
    .normalize('NFKD')
    .replace(COMBINING, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, BASE_MAX)
    // Slicing can land on a hyphen, and a trailing one reads as a typo in a URL said out loud.
    .replace(/-+$/g, '');
  return base || null;
}

/**
 * The candidates to try, in order: the name itself, then `-2`, `-3`... Collision is handled by
 * RETRY rather than by asking first, because there is deliberately no availability check to ask
 * (owner RLS means a lookup sees only your own rows, and a function that read everyone's would
 * be an enumeration oracle over every production's public URL). Trying the claim is the check.
 */
export function joinNameCandidates(productionName: string, attempts = 6): string[] {
  const base = deriveJoinName(productionName);
  if (!base) return [];
  const list = [base];
  for (let n = 2; n <= attempts; n += 1) list.push(`${base}-${n}`);
  return list;
}

/** The link phones open: `<origin>/j/<name>`. On noacg.studio that is `https://noacg.studio/j/<name>`;
 *  a self-hosted or local build hands out its own origin, so the link opens the page that made it. */
export function joinShortUrl(origin: string, name: string): string {
  return `${origin.replace(/\/+$/, '')}/j/${encodeURIComponent(name)}`;
}
