// THE SPEC HEADERS - what each e2e spec covers, read from the spec itself.
//
// Each offline spec (`e2e/*.spec.ts`) says in its LEADING comment block which source paths it
// covers, the way scripts/gates.mjs reads `// gate:` and `// guards:` off a gate's header:
//
//   // covers: src/components/home/CueRundown.tsx, src/styles/playout-dashboard.css
//   // covers: src/components/wizard/**, !src/components/wizard/import/**
//   // covers: none - <why no source change should select this spec>
//   // focus
//
// - `covers:` takes comma-separated globs (`*`, `**`, `?`, `[...]`, `{a,b}`; dotfiles match).
//   Several lines are a union. A glob written `!glob` EXCLUDES, and only from the globs on its
//   own line - so one line can say "the wizard except its import folder" without narrowing what
//   another line of the same spec covers.
// - `covers: none - <why>` is the honest answer for a spec no source change should select (it
//   still runs when it is edited itself, on a full escalation and at night). The reason is required.
// - `focus` puts the spec in the sprint FOCUS set: while E2E_SPRINT_FOCUS=1, a change that would
//   escalate to the FULL suite runs that set instead (scripts/e2e-affected.mjs), and the nightly
//   verdict classifies failures as focus vs paused (scripts/nightly-triage.mjs).
//
// Configured specs (`e2e/configured/*.spec.ts`) may carry `covers:` too: those globs are the
// CONFIGURED TRIGGERS - files whose behaviour the offline suite structurally cannot cover, so the
// affected run prints "also run npm run test:e2e:live:queued". It REPORTS and never runs.
//
// Adding or re-mapping a spec therefore edits that spec and nothing shared. What stays central is
// only what no one spec owns: the full-suite escalation (CORE), the ignore list, the catalog gate's
// triggers and the known source that selects no spec (CENTRAL), all in scripts/e2e-affected.mjs,
// and the configured suite's own files (below). `auditSpecHeaders` is the build's refusal
// (scripts/e2e-affected.test.mjs runs it on the repo).
//
// WHEN THE STUDENT-RELEASE SPRINT ENDS: drop the `// focus` lines from the spec headers, the FOCUS
// export here, the E2E_SPRINT_FOCUS env in ci.yml, the focus branch in e2e-affected.mjs and the
// focus/paused split in scripts/nightly-triage.mjs.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Shortest reason a `covers: none - <why>` may give; "nightly" alone is not a reason. */
const NONE_REASON_MIN = 12;

/** Why a glob is not one this reader accepts, or null when it is. */
function globProblem(glob) {
  if (!glob) return 'an empty glob';
  if (/\s/.test(glob)) return `"${glob}" contains whitespace`;
  if (glob.includes('\\')) return `"${glob}" uses a backslash - write repo paths with forward slashes`;
  if (glob.startsWith('/') || glob.startsWith('./')) return `"${glob}" is not repo-relative`;
  if (glob.split('/').includes('..')) return `"${glob}" climbs out of the repo`;
  let depth = 0;
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '{') depth++;
    else if (c === '}' && --depth < 0) return `"${glob}" closes a brace it never opened`;
    else if (c === '[') {
      const end = glob.indexOf(']', i);
      if (end < 0) return `"${glob}" opens a [class] it never closes`;
      if (glob.slice(i, end).includes('/')) return `"${glob}" puts a slash in a [class] - a class stays inside one path segment`;
    }
  }
  return depth === 0 ? null : `"${glob}" leaves a brace open`;
}

/**
 * One glob as a RegExp over repo-relative paths: `*` and `?` stay inside a path segment, `**`
 * crosses them (`a/**` is everything under `a/`, `a/**\/b` includes `a/b`), `{a,b}` nests and may
 * hold slashes, `[...]` is a character class. Dotfiles are ordinary names here.
 */
export function globToRegExp(glob) {
  const problem = globProblem(glob);
  if (problem) throw new Error(`not a glob: ${problem}`);
  let re = '';
  let depth = 0;
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      i++;
      if (glob[i + 1] === '/') {
        i++;
        re += '(?:.*/)?';
      } else re += '.*';
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '{') {
      depth++;
      re += '(?:';
    } else if (c === '}' && depth > 0) {
      depth--;
      re += ')';
    } else if (c === ',' && depth > 0) re += '|';
    else if (c === '[') {
      const end = glob.indexOf(']', i);
      // `[!x]` is the glob spelling of a negated class, `[^x]` the regex one.
      re += `[${glob.slice(i + 1, end).replace(/^!/, '^')}]`;
      i = end;
    } else re += c.replace(/[.+^$()|\\\]]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/** A `covers:` value split on its top-level commas - a comma inside `{a,b}` belongs to the glob. */
function splitList(value) {
  const out = [''];
  let depth = 0;
  for (const c of value) {
    if (c === '{') depth++;
    else if (c === '}') depth--;
    if (c === ',' && depth === 0) out.push('');
    else out[out.length - 1] += c;
  }
  return out.map((g) => g.trim());
}

/** One `covers:` line as a matcher: any include, and none of the same line's excludes. */
function lineMatcher(globs) {
  const include = globs.filter((g) => !g.startsWith('!')).map(globToRegExp);
  const exclude = globs.filter((g) => g.startsWith('!')).map((g) => globToRegExp(g.slice(1)));
  return { globs, test: (file) => include.some((r) => r.test(file)) && !exclude.some((r) => r.test(file)) };
}

/**
 * The declarations in a spec's header: `{ covers: [{ globs, test }], none, focus }`.
 *
 * Read from the LEADING comment block only - `//` lines and blank lines before the first line of
 * code - so prose further down that happens to say "covers" is never a declaration. Inside that
 * block a line that STARTS like a declaration and does not parse is refused, naming the file and
 * the line: a misspelt `// cover:` quietly covering nothing is the failure this exists to stop.
 */
export function parseSpecHeader(text, file = '<spec>') {
  const out = { covers: [], none: null, focus: false };
  const lines = String(text ?? '').split(/\r?\n/);
  const refuse = (n, why) => {
    throw new Error(`${file}:${n + 1}: malformed spec header - ${why}`);
  };
  let afterCovers = false;
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n].trim();
    if (line === '') continue;
    if (!line.startsWith('//')) break;
    const body = line.replace(/^\/\/+\s*/, '');
    // A covers list wrapped onto the next line would read as prose and quietly cover less, so a
    // line of bare paths right after a covers line is refused: each line says `covers:` itself.
    if (afterCovers && /^!?[^\s,]*[/*][^\s,]*(?:\s*,\s*!?[^\s,]+)*,?$/.test(body)) {
      refuse(n, `a wrapped covers list - start the continuation with its own \`// covers:\`, got \`${line}\``);
    }
    afterCovers = false;
    // What LOOKS like a declaration: the keyword with a colon, a covers keyword followed by a
    // path, the focus keyword alone or with a colon, or `focus - <reason>`. Prose that merely
    // starts with the word ("covers the viewport", "focus set, like...") is left alone.
    const word = /^(?:(covers?|covered)\s*(?::|\S*[/*])|(focus)\s*(?::|$)|(focus)\s+-\s)/i.exec(body);
    if (!word || (word[3] && !/^focus/.test(body))) continue;
    if (word[3]) refuse(n, `write the focus flag as \`// focus\` alone, got \`${line}\``);
    if (word[2]) {
      if (body !== 'focus') refuse(n, `write the focus flag as \`// focus\` alone, got \`${line}\``);
      out.focus = true;
      continue;
    }
    const decl = /^covers:\s*(.*)$/.exec(body);
    if (!decl) refuse(n, `write \`// covers: <glob>, <glob>\`, got \`${line}\``);
    const value = decl[1].trim();
    const none = /^none(?:\s+-\s+(.*))?$/.exec(value);
    if (none) {
      if (!none[1] || none[1].trim().length < NONE_REASON_MIN) refuse(n, '`covers: none` needs a reason a reader can act on: `// covers: none - <why>`');
      out.none = none[1].trim();
      continue;
    }
    const globs = splitList(value);
    for (const glob of globs) {
      const problem = globProblem(glob.replace(/^!/, ''));
      if (problem) refuse(n, problem);
    }
    if (!globs.some((g) => !g.startsWith('!'))) refuse(n, 'a covers line of exclusions alone covers nothing');
    out.covers.push(lineMatcher(globs));
    afterCovers = true;
  }
  if (out.none !== null && out.covers.length > 0) {
    throw new Error(`${file}: malformed spec header - it declares \`covers: none\` and covers globs as well; keep one`);
  }
  return out;
}

/**
 * Every spec header in one directory, as `Map<spec name, header>`. A header that does not parse
 * THROWS, and that is deliberate: a planner that skipped it would plan without that spec's
 * coverage, which is the silent under-run this whole file is arranged to prevent.
 */
export function readSpecHeaders(dir = 'e2e', root = ROOT) {
  const headers = new Map();
  for (const name of readdirSync(join(root, dir)).filter((f) => f.endsWith('.spec.ts')).sort()) {
    headers.set(name, parseSpecHeader(readFileSync(join(root, dir, name), 'utf8'), `${dir}/${name}`));
  }
  return headers;
}

/** The offline specs' headers - what the planner selects from. */
export const SPEC_HEADERS = readSpecHeaders('e2e');

/** Which specs a changed file selects, from the headers: `[{ spec, test }]`, one per spec. */
export function coverageOf(headers) {
  return [...headers]
    .filter(([, h]) => h.covers.length > 0)
    .map(([spec, h]) => ({ spec, test: (file) => h.covers.some((line) => line.test(file)) }));
}

export const COVERAGE = coverageOf(SPEC_HEADERS);

/** SPRINT FOCUS - the student-critical spec set (docs/GOALS_ARCHIVE.md "Student release"). */
export const FOCUS = [...SPEC_HEADERS].filter(([, h]) => h.focus).map(([spec]) => spec);

// THE CONFIGURED SUITE'S OWN FILES. These trigger the configured-suite line for every change, not
// for one spec's sake, so they are the one part of the trigger list no configured spec's header
// holds. `e2e/configured/**` is ignored by the offline plan outright (those specs need a real
// Supabase project and a throwaway account), which is exactly why a change there must still say
// the configured suite is owed.
export const CONFIGURED_SUITE_FILES = [/^e2e\/configured\//, /^playwright\.live\.config\.ts$/];

/**
 * THE CONFIGURED SUITE'S TRIGGERS: its own files, plus every `covers:` line a configured spec
 * declares. The offline plan pins the ABSENCE of a hosted-only surface, so a change to one of
 * these reports "covered" while the live path breaks; naming the trigger turns that hole into a
 * printed line, and it is then a decision rather than an oversight.
 */
export const CONFIGURED_HEADERS = readSpecHeaders('e2e/configured');
export const CONFIGURED_TRIGGERS = [...CONFIGURED_SUITE_FILES, ...[...CONFIGURED_HEADERS.values()].flatMap((h) => h.covers)];

/**
 * THE BUILD'S REFUSALS, as a pure function so each one can be driven with a fixture.
 *
 * 1. Every offline spec declares `covers:` - globs, or `none - <why>` - or a central rule names it.
 *    A spec in neither place ran only at night, and the branch that added it landed on a gate that
 *    never ran it (the finding three handoffs repeated before this refusal existed).
 * 2. Every glob, and every `!` exclusion, matches at least one file in the repository. A rule
 *    naming a path that moved matches nothing and is silent - the file then falls through to
 *    whatever else covers it, which is the run-FEWER failure with no alarm attached.
 * 3. Every spec a central rule names exists on disk.
 *
 * @param {{ headers: Map<string, object>, configured?: Map<string, object>, files: string[],
 *           specsOnDisk: string[], central?: [RegExp, string[]][] }} input
 * @returns {string[]} one line per problem; empty when the headers are sound
 */
export function auditSpecHeaders({ headers, configured = new Map(), files, specsOnDisk, central = [] }) {
  const problems = [];
  const onDisk = new Set(specsOnDisk);
  const centralSpecs = new Set(central.flatMap(([, specs]) => specs));
  for (const [spec, h] of headers) {
    if (h.covers.length === 0 && h.none === null && !centralSpecs.has(spec)) {
      problems.push(`e2e/${spec} declares no \`// covers:\` - name the source it covers (\`// covers: src/area/**\`), or say \`// covers: none - <why>\``);
    }
  }
  const lists = [...[...headers].map(([s, h]) => [`e2e/${s}`, h]), ...[...configured].map(([s, h]) => [`e2e/configured/${s}`, h])];
  for (const [where, h] of lists) {
    for (const line of h.covers) {
      const includes = line.globs.filter((g) => !g.startsWith('!')).map(globToRegExp);
      for (const glob of line.globs) {
        const re = globToRegExp(glob.replace(/^!/, ''));
        if (!files.some((f) => re.test(f))) problems.push(`${where} covers \`${glob}\`, which matches no file in the repository`);
        // An exclusion that takes nothing away from its own line is a misread waiting to happen.
        else if (glob.startsWith('!') && !files.some((f) => re.test(f) && includes.some((r) => r.test(f)))) {
          problems.push(`${where} excludes \`${glob}\`, which removes no file its own covers line includes`);
        }
      }
    }
  }
  for (const [rule, specs] of central) {
    for (const spec of specs) {
      if (!onDisk.has(spec)) problems.push(`the central rule ${rule} names ${spec}, which is not a spec in e2e/`);
    }
  }
  return problems;
}
