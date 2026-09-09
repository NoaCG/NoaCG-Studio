// `noacg docs` - print the skill's reference texts (shipped in the package under skill/).

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXIT_OK, refuseStrayArgs, UsageError, type Out, type ParsedArgs } from '../output.js';

const TOPICS = ['contract', 'package', 'validator', 'control', 'design-notes'] as const;
export type DocTopic = (typeof TOPICS)[number];

/** The skill directory: `<package>/skill/noacg-graphic`, resolved beside dist/. */
export function skillDir(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'skill', 'noacg-graphic');
}

export async function readDoc(topic: string): Promise<string> {
  if (!(TOPICS as readonly string[]).includes(topic)) {
    throw new UsageError(`Unknown topic "${topic}". Topics: ${TOPICS.join(', ')}.`);
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
