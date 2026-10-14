// The harness agent's definition files (docs/work-specs/noacg-harness/spec.md D1, D2, AC-16):
// `agents/noacg-harness/agent.md` (frontmatter = the agent's create body, Markdown body = its
// system prompt) and `environment.yaml` (the environment's create body), the layout `ant apply`
// reads. The `ant` CLI is not installed here, so scripts/harness-agent-sync.mjs reads the same
// files through the SDK.
//
// Both are written in YAML's JSON form (YAML 1.2 is a superset of JSON): `ant apply` reads them
// as they are, and this repository needs no YAML parser to read them too.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** AC-16: the container's system prompt is plumbing, and plumbing fits in this many lines. */
export const SYSTEM_PROMPT_MAX_LINES = 25;

export function readAgentDefinition(dir) {
  const text = readFileSync(path.join(dir, 'agent.md'), 'utf8').replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!m) throw new Error(`${path.join(dir, 'agent.md')} has no frontmatter`);
  const config = JSON.parse(m[1].replace(/^#.*$/gm, ''));
  const system = m[2].trim();
  return { config, system, systemLines: system.split('\n').length };
}

export function readEnvironmentDefinition(dir) {
  const text = readFileSync(path.join(dir, 'environment.yaml'), 'utf8');
  return JSON.parse(text.replace(/^#.*$/gm, ''));
}

/** A stable hash of a definition, for the lock file: a change means a new version to sync. */
export function definitionHash(value) {
  // The same canonical form as the CLI's source digest (cli/src/digest.ts `canonicalJson`):
  // object keys sorted, undefined members left out.
  const canonical = (v) => {
    if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
    if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
    const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  };
  return createHash('sha256').update(canonical(value)).digest('hex');
}

/** The agents.create body: the frontmatter, the system prompt and the pinned skill version. */
export function agentCreateBody(def, skill) {
  const { skills: _declared, ...rest } = def.config;
  return { ...rest, system: def.system, skills: skill ? [{ type: 'custom', skill_id: skill.id, version: skill.version }] : [] };
}
