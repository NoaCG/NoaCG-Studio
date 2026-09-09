// The writer and the owner report must agree on which ruleset and checks protect main.
// Separate copies let a rename make the report inspect a vanished ruleset or accept a queue
// missing a gate. Keep the API interpretation here, without commands or write capability;
// landing-ruleset.mjs alone owns the desired payload and --apply.

export const RULESET_NAME = 'main is landed by the queue';
export const REQUIRED_CHECKS = Object.freeze(['CI gate', 'Reviewed']);

export function requiredChecks({ withReview = true } = {}) {
  return withReview ? [...REQUIRED_CHECKS] : REQUIRED_CHECKS.slice(0, 1);
}

export function rulesetVerdict(rulesets, detail, required = REQUIRED_CHECKS) {
  if (rulesets === null) return { ruleset: null, 'required-checks': null };
  if (!detail) return { ruleset: false, 'required-checks': false };
  const types = (detail.rules ?? []).map((r) => r.type);
  const contexts = (detail.rules ?? []).find((r) => r.type === 'required_status_checks')?.parameters?.required_status_checks?.map((c) => c.context) ?? [];
  return {
    ruleset: detail.enforcement === 'active' && types.includes('merge_queue'),
    'required-checks': required.every((name) => contexts.includes(name)),
  };
}

export function findExisting(rulesets, name = RULESET_NAME) {
  return (Array.isArray(rulesets) ? rulesets : []).find((r) => r?.name === name) ?? null;
}

/**
 * EVERY field this file sets, flattened to name -> value, so a difference can be NAMED.
 *
 * Generic rather than a list of interesting fields, because a hand-written list is one somebody has
 * to remember to extend: the first draft of this named eight, and each of the six it left out
 * changes how a landing behaves while reporting a clean match - the ref EXCLUDE list (which can
 * make the ruleset govern nothing), `target`, the check timeout (ci.yml's own header says a run
 * takes six to nine minutes, so a five-minute timeout drops every group), both batch sizes and
 * `strict_required_status_checks_policy`.
 *
 * Two normalisations, because a difference in ORDER is not a difference in behaviour: rules are
 * keyed by `type`, and every list is sorted. Without them a ruleset GitHub returned in another
 * order reads as drift, and the advice that follows drift is `--apply`, which needs an owner's
 * login - so a false positive spends a `needs: account` ask on a ruleset that was already right.
 *
 * GitHub's own additions (`id`, `node_id`, timestamps, `_links`, `source`) are absent by
 * construction: nothing here reads a key this file does not set.
 */
export function rulesetFacts(ruleset) {
  const facts = {};
  if (!ruleset) return facts;
  const list = (values) => [...values].sort().join(', ');
  facts.enforcement = String(ruleset.enforcement ?? '');
  facts.target = String(ruleset.target ?? '');
  for (const side of ['include', 'exclude']) {
    facts[`branches ${side}`] = list(ruleset.conditions?.ref_name?.[side] ?? []);
  }
  facts.bypass = list((ruleset.bypass_actors ?? []).map((a) => `${a.actor_type}:${a.actor_id}:${a.bypass_mode}`));
  const rules = new Map((ruleset.rules ?? []).map((r) => [r.type, r.parameters ?? {}]));
  facts.rules = list(rules.keys());
  for (const [type, parameters] of rules) {
    for (const [key, value] of Object.entries(parameters)) {
      // The one array of objects inside a rule; every other parameter is a scalar.
      if (key === 'required_status_checks') facts['required checks'] = list(value.map((c) => c.context));
      else facts[`${type}.${key}`] = String(value);
    }
  }
  return facts;
}

/**
 * Every fact GitHub disagrees with this file about, sorted, as lines somebody can act on.
 *
 * This is the question the script exists to answer and until 2026-09-09 it did not: a plain run
 * printed the ruleset's id and then dumped the WANTED JSON, leaving a person to compare two
 * structures by eye - and the summary it printed came from the LIST endpoint, which carries no
 * `rules` at all, so the merge method was not even on screen to compare against.
 *
 * Only the keys this file sets are compared, so a field GitHub grows later is not drift until this
 * file has an opinion about it. Sorted, so the output does not depend on the order `rulesetFacts`
 * happens to build its keys in.
 *
 * @param {object|null} held the ruleset GitHub holds, read from `repos/{slug}/rulesets/{id}`
 */
export function rulesetDrift(held, wanted) {
  if (!held) return ['no ruleset of this name exists on GitHub'];
  const there = rulesetFacts(held);
  const here = rulesetFacts(wanted);
  return Object.keys(here)
    .filter((key) => there[key] !== here[key])
    .sort()
    .map((key) => `${key}: GitHub has ${there[key] || '(nothing)'}, this file wants ${here[key] || '(nothing)'}`);
}

