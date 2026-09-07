// WHY THE IMPORTER REFUSED A HAND-AUTHORED ANIMATION REGION - the marked region's bounds, and the
// first precondition `parseTimeline` (timelineModel.ts, this directory) could not meet.
//
// It lives here, beside the reader it explains, because two doors ask the same question and must
// get the same answer: the Pro Harness's `animation-unconvertible` finding (src/ai/pro/harness/)
// and `bridgeApi.normalize`, which is what a coding agent driving the `noacg` CLI hits
// (docs/AGENT_CLI.md). It was written for the first on 2026-09-06 and the second was still
// handing back the generic sentence the first had just stopped using.
//
// Pure module: string work only, no DOM, no template model.

export const ANIMATION_OPEN = '/* == ANIMATION';
export const ANIMATION_CLOSE = '/* == END ANIMATION == */';

/** The marked ANIMATION region's range in template.js, markers included. */
export function animationRange(js: string): { start: number; end: number } | null {
  const start = js.indexOf(ANIMATION_OPEN);
  if (start < 0) return null;
  const closeAt = js.indexOf(ANIMATION_CLOSE, start);
  if (closeAt < 0) return null;
  return { start, end: closeAt + ANIMATION_CLOSE.length };
}

/**
 * WHY A REGION THE IMPORTER COULD NOT READ WAS REFUSED - the first unmet precondition, quoted in
 * the exact form the importer wants, or `null` when every one of them is met.
 *
 * The importer (`blocks/timelineModel.ts` `parseTimeline`) is a shape reader, not a JavaScript
 * engine: it finds seven literal things in the region's text and gives up on the first it cannot
 * find, silently and with no reason. That silence is what this function ends, and it ends it
 * because of a measurement, not a hunch. On 2026-09-06 `google/gemini-2.5-flash` wrote a correct
 * entrance and exit for `lt-markets`, was told only "the ANIMATION region could not be converted
 * to keyframe data - stay inside the authoring grammar", and spent four rounds and $0.072 guessing
 * before it declared the requirements contradictory and stopped. The whole defect was two absent
 * `var` lines: pasting `var easeIn` and `var easeOut` back into the model's own bytes makes the
 * identical code parse (docs/AI_ATTEMPTS.md, "The Pro Harness animation region as a repairable
 * finding").
 *
 * So this is the repair the standing instruction in that file already asked for - state a
 * machine-checked precondition AS A REQUIREMENT rather than showing it in an example - and it is
 * what docs/PRO_HARNESS_PLAN.md §6 requires of every blocking finding: the reading that produced
 * it, and one fix hint. It relaxes nothing. The parser is shared with the wizard's importer and
 * the whole catalog, so its preconditions are not this lane's to soften; they are this lane's to
 * NAME.
 *
 * The order is the parser's own, so the sentence always describes the check that actually
 * stopped it. `scripts/pro-harness.test.mjs` pins the two together over a table of regions: this
 * function returns `null` exactly when `parseTimeline` returns a model, so the list here cannot
 * drift away from the list there.
 */
export function animationBreach(js: string): string | null {
  const range = animationRange(js);
  if (!range) return 'the ANIMATION region markers are gone - keep `/* == ANIMATION … == */` and `/* == END ANIMATION == */` exactly as the scaffold wrote them.';
  const region = js.slice(range.start, range.end);
  if (!/var animSpeed = [\d.]+/.test(region) || Number(region.match(/var animSpeed = ([\d.]+)/)?.[1] ?? 0) === 0) {
    return 'the region has no `var animSpeed = 1;` - it must declare a non-zero speed on its own line before the builders.';
  }
  for (const name of ['easeIn', 'easeOut'] as const) {
    if (new RegExp(`var ${name} = (?:'[^']+'|"[^"]+")`).test(region)) continue;
    const loose = new RegExp(`var ${name}\\s*=`).test(region);
    return loose
      ? `\`var ${name}\` is declared but not in the form the importer reads - it must be a quoted ease name, e.g. \`var ${name} = 'expo.out';\`.`
      : `the region has no \`var ${name} = 'expo.out';\` - both \`easeIn\` and \`easeOut\` must be declared, even when each tween names its own ease.`;
  }
  for (const [fn, what] of [['buildInTimeline', 'entrance'], ['buildOutTimeline', 'exit']] as const) {
    // The importer's body pattern is `function NAME() {` … newline `}`, so the spacing and the
    // closing brace at the start of a line are both load-bearing.
    const body = region.match(new RegExp(`function ${fn}\\(\\) \\{([\\s\\S]*?)\\n\\}`))?.[1];
    if (body === undefined) {
      return `the ${what} builder is missing or not in the form the importer reads - write it exactly as \`function ${fn}() {\` … and close it with \`}\` at the start of its own line.`;
    }
    const calls = [...body.matchAll(/tl\.(set|to|fromTo)\(([\s\S]*?)\);/g)];
    if (!calls.length) {
      return `\`${fn}\` has no \`tl.set\` / \`tl.to\` / \`tl.fromTo\` call the importer can read - each one must end with \`);\` on the same statement.`;
    }
    // Every tween has to NAME its target as a quoted selector. A variable or an element
    // reference leaves the importer with nothing to write into the data block, and it refuses
    // the whole template rather than invent one (`targetsConvertible`, blocks/timelineModel.ts).
    for (const [, , args] of calls) {
      if (/^\s*(?:'[^']+'|"[^"]+"|\[)/.test(args)) continue;
      return `a tween in \`${fn}\` does not start with a quoted CSS selector - write \`tl.to(".${'${prefix}'}-name", { … })\` or an array of them, never a variable or an element reference.`;
    }
  }
  return null;
}
