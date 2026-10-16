// `noacg docs` - print the skill and its reference texts (shipped in the package under skill/).
// `docs skill` is the procedure itself, so a session that never installed the plugin (the
// Downloads prompt says "read docs skill") follows the same loop, delivery and reporting rules.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXIT_OK, refuseStrayArgs, UsageError, type Out, type ParsedArgs } from '../output.js';

/** The reference texts, one file each under references/ (benchmarks/harness/lib/skill-pin.mjs reads
 *  this list as written). `skill` is SKILL.md itself, listed before them. */
const TOPICS = ['contract', 'package', 'validator', 'control', 'design-notes'] as const;
const ALL_TOPICS = ['skill', ...TOPICS] as const;
export type DocTopic = (typeof ALL_TOPICS)[number];

/** The skill directory: `<package>/skill/noacg-graphic`, resolved beside dist/. */
export function skillDir(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'skill', 'noacg-graphic');
}

/** Said before the skill's text: without the plugin, its `references/<name>.md` are docs topics. */
const SKILL_PREFACE = 'Each `references/<name>.md` this text names prints with `noacg docs <name>` (for example `noacg docs setup`).\n\n';

export async function readDoc(topic: string): Promise<string> {
  if (topic === 'skill') {
    // The skill without its front matter, which only a plugin loader reads.
    return SKILL_PREFACE + (await fs.readFile(path.join(skillDir(), 'SKILL.md'), 'utf8')).replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n)+/, '');
  }
  // The listed topics, and any other reference the skill names (setup, critique, share).
  const file = path.join(skillDir(), 'references', `${topic}.md`);
  if (!(TOPICS as readonly string[]).includes(topic) && !(/^[a-z][a-z-]*$/.test(topic) && (await fs.stat(file).catch(() => null)))) {
    throw new UsageError(`Unknown topic "${topic}". Topics: ${ALL_TOPICS.join(', ')}.`);
  }
  return fs.readFile(file, 'utf8');
}

export function docTopics(): readonly string[] {
  return ALL_TOPICS;
}

export async function runDocs(args: ParsedArgs, out: Out): Promise<number> {
  refuseStrayArgs(args, 1);
  const topic = args._[1];
  if (!topic) {
    out.result({ ok: true, topics: ALL_TOPICS });
    out.say(`Topics: ${ALL_TOPICS.join(', ')}  (noacg docs <topic>)`);
    return EXIT_OK;
  }
  const text = await readDoc(topic);
  out.result({ ok: true, topic, text });
  out.say(text);
  return EXIT_OK;
}
