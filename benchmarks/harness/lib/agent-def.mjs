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

/** An agent file: `agent.md` (the harness agent) or `critic.md` (the subagent it lists, D4). */
export function readAgentDefinition(dir, file = 'agent.md') {
  const text = readFileSync(path.join(dir, file), 'utf8').replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!m) throw new Error(`${path.join(dir, file)} has no frontmatter`);
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

/** The agent files a definition lists as its subagents (`multiagent.subagents.predefined_agents`
 *  entries naming a file beside it, such as `critic.md`). */
export function subagentFiles(def) {
  return (def.config.multiagent?.subagents?.predefined_agents ?? []).filter((a) => typeof a === 'string' && a.endsWith('.md'));
}

/** The agents.create body: the frontmatter, the system prompt and the pinned skill version, and
 *  each subagent file resolved to the agent and version the sync made of it (`synced[file]`). */
export function agentCreateBody(def, skill, synced = {}) {
  const { skills: _declared, ...rest } = def.config;
  const body = { ...rest, system: def.system, skills: skill ? [{ type: 'custom', skill_id: skill.id, version: skill.version }] : [] };
  const listed = subagentFiles(def);
  if (listed.length) {
    const predefined = def.config.multiagent.subagents.predefined_agents.map((a) => {
      if (!listed.includes(a)) return a;
      if (!synced[a]) throw new Error(`${a} is listed as a subagent and has not been synced`);
      return { type: 'agent', id: synced[a].id, version: synced[a].version };
    });
    body.multiagent = { ...def.config.multiagent, subagents: { ...def.config.multiagent.subagents, predefined_agents: predefined } };
  }
  return body;
}

/** The fields agents.update keeps when they are not sent, and clears when sent as null. */
const CLEARABLE = ['description', 'mcp_servers', 'multiagent', 'tools'];

/** The agents.update body: the create body, with every clearable field the definition leaves out
 *  sent as null and every metadata key the server has and the definition does not sent as null.
 *  agents.update keeps whatever it is not sent, so without this a block taken out of agent.md
 *  stays on the new version (H6's v5 kept v4's critic). */
export function agentUpdateBody(def, skill, synced = {}, current = null) {
  const body = agentCreateBody(def, skill, synced);
  for (const field of CLEARABLE) if (body[field] === undefined) body[field] = null;
  const dropped = Object.keys(current?.metadata ?? {}).filter((k) => !(k in (body.metadata ?? {})));
  if (dropped.length) body.metadata = { ...(body.metadata ?? {}), ...Object.fromEntries(dropped.map((k) => [k, null])) };
  return body;
}

/** The fields of an agent version on the server that differ from the body the sync sends. The
 *  server fills defaults in (tool configs, model speed, effort as an object), so a sent object
 *  only has to be contained in the server's; a field the body leaves out must be empty there. */
export function serverDrift(body, server) {
  const empty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);
  const contained = (want, have) => {
    if (want === null || typeof want !== 'object') return want === have;
    if (Array.isArray(want)) return Array.isArray(have) && want.length === have.length && want.every((w, i) => contained(w, have[i]));
    return have !== null && typeof have === 'object' && Object.entries(want).every(([k, w]) => w === undefined || contained(w, have[k]));
  };
  const model = (m) => (typeof m === 'string' ? { id: m } : { ...m, effort: typeof m?.effort === 'object' ? m.effort?.type : m?.effort });
  const metadata = (m) => Object.fromEntries(Object.entries(m ?? {}).filter(([, v]) => v !== null));
  const skills = (list) => (list ?? []).map((s) => `${s.skill_id}@${s.version}`);
  const drift = [];
  for (const field of ['name', 'description', 'system', 'mcp_servers', 'multiagent', 'tools']) {
    const want = body[field];
    if (empty(want) ? !empty(server[field]) : !contained(want, server[field])) drift.push(field);
  }
  if (!contained(model(body.model), model(server.model))) drift.push('model');
  if (definitionHash(skills(body.skills)) !== definitionHash(skills(server.skills))) drift.push('skills');
  if (definitionHash(metadata(body.metadata)) !== definitionHash(metadata(server.metadata))) drift.push('metadata');
  return drift;
}
