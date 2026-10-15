// `noacg docs` - print the skill and its reference texts (shipped in the package under skill/).
// `docs skill` is the procedure itself, so a session that never installed the plugin (the
// Downloads prompt says "read docs skill") follows the same loop, delivery and reporting rules.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXIT_OK, refuseStrayArgs, UsageError, type Out, type ParsedArgs } from '../output.js';

const TOPICS = ['skill', 'contract', 'package', 'validator', 'control', 'design-notes'] as const;
export type DocTopic = (typeof TOPICS)[number];

/** The skill directory: `<package>/skill/noacg-graphic`, resolved beside dist/. */
export function skillDir(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'skill', 'noacg-graphic');
}

export async function readDoc(topic: string): Promise<string> {
  if (!(TOPICS as readonly string[]).includes(topic)) {
    throw new UsageError(`Unknown topic "${topic}". Topics: ${TOPICS.join(', ')}.`);
  }
  if (topic === 'skill') {
    // The skill without its front matter, which only a plugin loader reads.
    return (await fs.readFile(path.join(skillDir(), 'SKILL.md'), 'utf8')).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n+/, '');
  }
  return fs.readFile(path.join(skillDir(), 'references', `${topic}.md`), 'utf8');
}

export function docTopics(): readonly string[] {
  return TOPICS;
}

export async function runDocs(args: ParsedArgs, out: Out): Promise<number> {
  refuseStrayArgs(args, 1);
  const topic = args._[1];
  if (!topic) {
    out.result({ ok: true, topics: TOPICS });
    out.say(`Topics: ${TOPICS.join(', ')}  (noacg docs <topic>)`);
    return EXIT_OK;
  }
  const text = await readDoc(topic);
  out.result({ ok: true, topic, text });
  out.say(text);
  return EXIT_OK;
}
