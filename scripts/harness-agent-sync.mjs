#!/usr/bin/env node
// SYNC THE HARNESS AGENT: agents/noacg-harness/ to a Console workspace, the way `ant apply` would
// (docs/work-specs/noacg-harness/spec.md D1, D2). The `ant` CLI is not installed on this machine,
// so this reads the same files through @anthropic-ai/sdk:
//
//   environment.yaml  -> the environment (create once, update in place when it changes)
//   cli/skill/noacg-graphic, as `cli/scripts/build-skill.mjs --skills-api` bundles it
//                     -> a custom skill (create once, a new version when its bytes change)
//   critic.md         -> each subagent agent.md lists (D4), the same way, pinning that skill
//   agent.md          -> the agent, its system prompt, that skill version and each subagent's
//                        version pinned (create once, a new agent version when anything changes)
//
// and records the ids, versions and the hash of what was synced in
// `agents/noacg-harness/claude-lock.<bench|production>.json`. A step whose hash equals the lock's
// is skipped, so re-running changes nothing. Creating and updating these costs no credit.
//
// The lock records what was sent, not what the server kept, so the plan also reads the agent's
// synced version back (free, when the workspace's key is in .env) and updates it when the server
// differs: H6's v5 kept v4's critic though the files and the lock said it was gone.
//
//   node scripts/harness-agent-sync.mjs --workspace bench               the plan, from the lock and a read-back
//   node scripts/harness-agent-sync.mjs --workspace bench --apply       carry it out on the bench key
//   node scripts/harness-agent-sync.mjs --workspace production --apply  the production key (H9)
//
// Revert (D1): install `ant` and run `ant apply` on the same files.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentCreateBody, agentUpdateBody, definitionHash, readAgentDefinition, readEnvironmentDefinition, serverDrift, subagentFiles, SYSTEM_PROMPT_MAX_LINES } from '../benchmarks/harness/lib/agent-def.mjs';
import { benchEnv, mainEnv } from './lite-eval-paths.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const AGENT_DIR = path.join(ROOT, 'agents', 'noacg-harness');
export const WORKSPACES = ['bench', 'production'];

export const lockPath = (workspace) => path.join(AGENT_DIR, `claude-lock.${workspace}.json`);

/** The definitions a sync reads: the environment, the agent, and each subagent file it lists. */
export function readDefinitions(dir = AGENT_DIR) {
  const agent = readAgentDefinition(dir);
  return { environment: readEnvironmentDefinition(dir), agent, subagents: Object.fromEntries(subagentFiles(agent).map((file) => [file, readAgentDefinition(dir, file)])) };
}

/** What a sync would do, from the definitions, the lock and `drift`: the fields in which the
 *  server's copy of the agent's synced version differs (`agentReadBack`). Steps run in order: the
 *  environment, the skill, each subagent (it pins the skill), then the agent (it pins them all). */
export function syncPlan({ lock, environment, agent, bundle, subagents = {}, drift = [] }) {
  for (const [name, def] of [['agent.md', agent], ...Object.entries(subagents)]) {
    if (def.systemLines > SYSTEM_PROMPT_MAX_LINES) throw new Error(`${name}'s system prompt is ${def.systemLines} lines; plumbing fits in ${SYSTEM_PROMPT_MAX_LINES} (AC-16) - move guidance into the skill or the CLI`);
  }
  const envHash = definitionHash(environment);
  const steps = [];
  steps.push({ resource: 'environment', action: !lock?.environment ? 'create' : lock.environment.sha256 !== envHash ? 'update' : 'keep', sha256: envHash });
  const skillStep = { resource: 'skill', action: !lock?.skill ? 'create' : lock.skill.bundleSha256 !== bundle.sha256 ? 'version' : 'keep', sha256: bundle.sha256 };
  steps.push(skillStep);
  // A subagent and the agent pin the skill version, and the agent pins each subagent's version,
  // so a new version of anything below is a new version of what pins it.
  const subagentHashes = {};
  for (const [file, def] of Object.entries(subagents)) {
    const hash = definitionHash({ config: def.config, system: def.system, skillBundle: bundle.sha256 });
    subagentHashes[file] = hash;
    const synced = lock?.subagents?.[file];
    steps.push({ resource: file, action: !synced ? 'create' : synced.sha256 !== hash || skillStep.action !== 'keep' ? 'update' : 'keep', sha256: hash });
  }
  const below = steps.slice(1).some((s) => s.action !== 'keep');
  const agentHash = definitionHash({ config: agent.config, system: agent.system, skillBundle: bundle.sha256, ...(Object.keys(subagentHashes).length ? { subagents: subagentHashes } : {}) });
  steps.push({ resource: 'agent', action: !lock?.agent ? 'create' : lock.agent.sha256 !== agentHash || below || drift.length ? 'update' : 'keep', sha256: agentHash, ...(drift.length ? { drift } : {}) });
  return steps;
}

/** The agent version the lock names, as the server has it, and the fields in which it differs
 *  from what the definition sends with the lock's skill and subagent versions. A free read. A
 *  subagent the lock has not synced yet leaves no body to compare, and the plan updates the agent
 *  for it anyway. */
export async function agentReadBack(client, lock, agent) {
  const server = await client.beta.agents.retrieve(lock.agent.id, { version: lock.agent.version });
  const unsynced = subagentFiles(agent).some((file) => !lock.subagents?.[file]);
  return { server, drift: unsynced ? [] : serverDrift(agentCreateBody(agent, lock.skill, lock.subagents ?? {}), server) };
}

/** An SDK client on the workspace's key, or null when .env has none. */
export async function workspaceClient(workspace) {
  const key = keyFor(workspace);
  if (!key) return null;
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  return new Anthropic({ apiKey: key });
}

/** The skill as the Skills API takes it, written by the one generator of every skill copy. */
export function skillBundle(dir) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'cli', 'scripts', 'build-skill.mjs'), '--skills-api', dir], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error(`build-skill --skills-api failed:\n${r.stderr || r.stdout}`);
  return JSON.parse(readFileSync(path.join(dir, 'bundle.json'), 'utf8'));
}

/** The key a workspace syncs and runs on: the bench workspace's own, or production's. */
export function keyFor(workspace) {
  if (workspace === 'bench') return benchEnv().ANTHROPIC_BENCH_API_KEY || mainEnv().ANTHROPIC_BENCH_API_KEY;
  return mainEnv().ANTHROPIC_API_KEY;
}

/** Carry a plan out on `client`; `current` is the server's copy of the locked agent version. */
export async function applySync({ client, workspace, steps, environment, agent, subagents, bundle, bundleDir, lock, current, save }) {
  const { toFile } = await import('@anthropic-ai/sdk');
  const next = { workspace, ...(lock ?? {}) };
  const [envStep, skillStep] = steps;
  const agentStep = steps[steps.length - 1];

  if (envStep.action === 'create') next.environment = { id: (await client.beta.environments.create(environment)).id };
  else if (envStep.action === 'update') await client.beta.environments.update(lock.environment.id, environment);
  next.environment = { ...next.environment, sha256: envStep.sha256 };
  // The lock is written after every step, so a failure later never loses an id already created
  // and the next run updates it rather than making a second one.
  save(next);

  if (skillStep.action !== 'keep') {
    const files = await Promise.all(bundle.files.map(async (f) => toFile(readFileSync(path.join(bundleDir, ...f.path.split('/'))), f.path, { type: f.path.endsWith('.md') ? 'text/markdown' : 'application/octet-stream' })));
    if (skillStep.action === 'create') {
      const skill = await client.skills.create({ files, display_name: 'NoaCG graphic' });
      next.skill = { id: skill.id, version: skill.latest_version_id };
    } else {
      const version = await client.skills.versions.create(lock.skill.id, { files });
      next.skill = { id: lock.skill.id, version: version.id };
    }
  }
  next.skill = { ...next.skill, bundleSha256: skillStep.sha256, cliVersion: bundle.cliVersion };
  save(next);

  // Each subagent before the agent that pins it.
  for (const step of steps.slice(2, -1)) {
    const synced = next.subagents?.[step.resource];
    let ref = synced ? { id: synced.id, version: synced.version } : null;
    if (step.action === 'create') ref = await client.beta.agents.create(agentCreateBody(subagents[step.resource], next.skill)).then((a) => ({ id: a.id, version: a.version }));
    else if (step.action === 'update') ref = await client.beta.agents.update(synced.id, { ...agentUpdateBody(subagents[step.resource], next.skill, {}, await client.beta.agents.retrieve(synced.id, { version: synced.version })), version: synced.version }).then((a) => ({ id: a.id, version: a.version }));
    next.subagents = { ...(next.subagents ?? {}), [step.resource]: { ...ref, sha256: step.sha256 } };
    save(next);
  }
  // A subagent the agent no longer lists leaves the lock (its agent stays on the server, unused).
  for (const file of Object.keys(next.subagents ?? {})) if (!subagents[file]) delete next.subagents[file];
  if (next.subagents && !Object.keys(next.subagents).length) delete next.subagents;

  if (agentStep.action === 'create') {
    const created = await client.beta.agents.create(agentCreateBody(agent, next.skill, next.subagents ?? {}));
    next.agent = { id: created.id, version: created.version };
  } else if (agentStep.action === 'update') {
    const updated = await client.beta.agents.update(lock.agent.id, { ...agentUpdateBody(agent, next.skill, next.subagents ?? {}, current), version: lock.agent.version });
    next.agent = { id: updated.id, version: updated.version };
  }
  next.agent = { ...next.agent, sha256: agentStep.sha256 };
  next.syncedAt = new Date().toISOString();
  return next;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const at = argv.indexOf('--workspace');
  const workspace = at >= 0 ? argv[at + 1] : undefined;
  if (!WORKSPACES.includes(workspace)) {
    console.error(`harness-agent-sync: --workspace ${WORKSPACES.join('|')}`);
    process.exit(2);
  }
  const { environment, agent, subagents } = readDefinitions();
  const lockFile = lockPath(workspace);
  const lock = existsSync(lockFile) ? JSON.parse(readFileSync(lockFile, 'utf8')) : null;
  const bundleDir = mkdtempSync(path.join(os.tmpdir(), 'noacg-skill-'));
  try {
    const bundle = skillBundle(bundleDir);
    const client = await workspaceClient(workspace);
    let readBack = null;
    let unread = `no key for the ${workspace} workspace in .env`;
    if (lock?.agent && client) {
      try {
        readBack = await agentReadBack(client, lock, agent);
      } catch (e) {
        unread = e instanceof Error ? e.message : String(e);
      }
    }
    const steps = syncPlan({ lock, environment, agent, bundle, subagents, drift: readBack?.drift });
    console.log(`Plan for the ${workspace} workspace (${path.relative(ROOT, lockFile)}${lock ? '' : ', none yet'}):`);
    for (const s of steps) console.log(`  ${s.resource.padEnd(12)} ${s.action}${s.drift ? ` (the server's v${lock.agent.version} differs in ${s.drift.join(', ')})` : ''}`);
    if (lock?.agent && !readBack) console.log(`  the server's v${lock.agent.version} not read back (${unread}): this plan is from the lock alone`);
    for (const [file, def] of Object.entries(subagents)) console.log(`  ${file} system prompt ${def.systemLines} of ${SYSTEM_PROMPT_MAX_LINES} lines`);
    console.log(`  system prompt ${agent.systemLines} of ${SYSTEM_PROMPT_MAX_LINES} lines; skill ${bundle.files.length} file(s) of noacg v${bundle.cliVersion}`);
    if (!argv.includes('--apply')) {
      console.log('Nothing changed: add --apply to carry it out.');
    } else if (steps.every((s) => s.action === 'keep')) {
      console.log('Everything matches the lock; nothing to do.');
    } else {
      if (!client) throw new Error(`no key for the ${workspace} workspace in .env (${workspace === 'bench' ? 'ANTHROPIC_BENCH_API_KEY' : 'ANTHROPIC_API_KEY'})`);
      const save = (state) => writeFileSync(lockFile, `${JSON.stringify(state, null, 2)}\n`);
      const next = await applySync({ client, workspace, steps, environment, agent, subagents, bundle, bundleDir, lock, current: readBack?.server ?? null, save });
      save(next);
      console.log(`Synced: agent ${next.agent.id} v${next.agent.version}, environment ${next.environment.id}, skill ${next.skill.id} ${next.skill.version}. Lock: ${path.relative(ROOT, lockFile)}`);
      // Done only when the server's copy of the new version is what was sent.
      const after = await agentReadBack(client, next, agent);
      console.log(`Read back v${after.server.version}: multiagent ${after.server.multiagent ? JSON.stringify(after.server.multiagent) : 'null'}, system prompt ${(after.server.system ?? '').split('\n').length} lines, skills ${(after.server.skills ?? []).map((s) => `${s.skill_id} ${s.version}`).join(', ')}`);
      if (after.drift.length) throw new Error(`the server's v${after.server.version} differs from the definition in ${after.drift.join(', ')}`);
    }
  } finally {
    rmSync(bundleDir, { recursive: true, force: true });
  }
}
