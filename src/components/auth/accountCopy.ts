/**
 * What an account is FOR, said once.
 *
 * Every surface that asks for an account used to answer the question in its own words - the
 * dialog listed "cloud sync, community and AI", the topbar's tooltip listed the same three in a
 * different order, and Settings listed "cloud sync, publishing, and hosted control pages" (a page since retired). Three
 * answers to one question is how a reader concludes nobody knows the answer, and the owner said
 * as much (2026-09-04: "I don't have a really good reason for people to be logged in").
 *
 * The sentence is derived from what a signed-in visitor actually gets today, not from what we
 * would like to promise (src/entitlements/contract.ts FEATURE_KEYS is the full list):
 *   - sync.cloud: the library (graphics, productions, videos) follows the account to any browser;
 *   - ai.*: every AI path on the hosted studio, bring-your-own-key included;
 *   - control.hosted + audience: a published production - its production page on any device
 *     the account signs in on, a phone included, and the persistent output link.
 * Community, teams, agent keys and the ProRes render tier are real too, but they are not what a
 * student two weeks before a show is deciding on, so they stay out of the one sentence. Anything
 * added here must be true of the code, not of the roadmap.
 *
 * The house voice binds (docs.public copy): plain information, no hype, a plain dash never an
 * em dash. scripts/check-copy.mjs gates the tells.
 */
export const ACCOUNT_IS_FOR =
  'A free account keeps your work with you on any computer, adds AI, and puts a production online so you can run it from your phone.';

/** The other half of the same fact, so an ask never reads as a wall
 *  (`root/keep-studio-open-there-login-wall`). "One" is the account the sentence above named. */
export const NO_ACCOUNT_NEEDED = 'Making and exporting graphics never needs one.';
