// The release notes of one @noacg/cli version, read from cli/CHANGELOG.md.
//
// WHY THIS EXISTS. The GitHub Release of 0.3.4 was written by `gh release create
// --generate-notes`: thirty-four lines of "<pull request title> by @<owner> in <url>", one for
// every pull request the whole REPOSITORY had merged since the last CLI tag. Two of them were
// about the CLI. Somebody deciding whether to update learned nothing, and the page the agent door
// sends developers to first read as noise. A changelog nobody has to write cannot say what
// changed FOR THE READER, so the text is written by hand, in the same commit as the version bump,
// and this script is what makes that unskippable:
//
//   node cli/scripts/release-notes.mjs            print the section of cli/package.json's version
//   node cli/scripts/release-notes.mjs 0.3.3      print another version's section
//   node cli/scripts/release-notes.mjs --check    exit 1 unless that section exists and reads as
//                                                 prose for a person (run by `npm run build`, so a
//                                                 version bump with no notes cannot land, and by
//                                                 the release workflow before anything is built)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CHANGELOG = fileURLToPath(new URL('../CHANGELOG.md', import.meta.url));
const PACKAGE = fileURLToPath(new URL('../package.json', import.meta.url));

/** The body of `## <version>` in a changelog, without its heading, or null when there is none. */
export function sectionOf(changelog, version) {
  const lines = changelog.split(/\r?\n/);
  const heading = (line) => /^##\s+/.test(line);
  const start = lines.findIndex((line) => heading(line) && line.replace(/^##\s+/, '').split(/\s/)[0] === version);
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(heading);
  return (end < 0 ? rest : rest.slice(0, end)).join('\n').trim();
}

/**
 * Pure: why these notes are not fit to publish - an empty list when they are.
 *
 * Each rule is one of the ways the generated text failed its reader, so that a hand-written
 * section cannot drift back into the same shape.
 */
export function problemsWith(notes, version) {
  if (notes === null) return [`cli/CHANGELOG.md has no "## ${version}" section - write what changed for someone who uses the CLI`];
  const problems = [];
  const words = notes.split(/\s+/).filter(Boolean).length;
  if (words < 25) problems.push(`the ${version} section is ${words} word(s) - say what was wrong or missing, what it does now, and what the reader has to do`);
  if (/(^|\s)@[a-z\d](?:[a-z\d-]*[a-z\d])?(?=[\s.,;:)]|$)/im.test(notes.replace(/@noacg\/[\w-]+/g, ''))) {
    problems.push('it names somebody by @username - a reader does not need to know who merged what');
  }
  if (/github\.com\/[^\s)]+\/pull\/\d+/.test(notes) || /(^|\s)#\d+\b/m.test(notes)) {
    problems.push('it points at pull requests - say the change itself; the pull request is not the explanation');
  }
  if (/what'?s changed|full changelog/i.test(notes)) problems.push('it carries the headings of a generated changelog');
  if (/—/.test(notes)) problems.push('it uses an em dash - this project writes a plain dash');
  return problems;
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const version = args.find((a) => !a.startsWith('--')) ?? JSON.parse(readFileSync(PACKAGE, 'utf8')).version;
  const notes = sectionOf(readFileSync(CHANGELOG, 'utf8'), version);
  const problems = problemsWith(notes, version);
  if (problems.length > 0) {
    console.error(`release-notes: @noacg/cli ${version} cannot be released with these notes:`);
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }
  if (check) console.log(`release-notes: ${version} has notes a person can read (${notes.split(/\s+/).length} words).`);
  else console.log(notes);
  return 0;
}

if (process.argv[1] && process.argv[1].replaceAll('\\', '/').endsWith('/scripts/release-notes.mjs')) {
  process.exit(main());
}
