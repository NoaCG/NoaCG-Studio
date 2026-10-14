#!/usr/bin/env node
// SYNC THE HARNESS AGENT: agents/noacg-harness/ to a Console workspace, the way `ant apply` would
// (docs/work-specs/noacg-harness/spec.md D1, D2). The `ant` CLI is not installed on this machine,
// so this reads the same files through @anthropic-ai/sdk:
//
//   environment.yaml  -> the environment (create once, update in place when it changes)
//   cli/skill/noacg-graphic, as `cli/scripts/build-skill.mjs --skills-api` bundles it
//                     -> a custom skill (create once, a new version when its bytes change)
//   agent.md          -> the agent, its system prompt and that skill version pinned
//                        (create once, a new agent version when anything changes)
//
// and records the ids, versions and the hash of what was synced in
// `agents/noacg-harness/claude-lock.<bench|production>.json`. A step whose hash equals the lock's
// is skipped, so re-running changes nothing. Creating and updating these costs no credit.
//
//   node scripts/harness-agent-sync.mjs --workspace bench               the plan, from the lock; no key, no call
//   node scripts/harness-agent-sync.mjs --workspace bench --apply       carry it out on the bench key
//   node scripts/harness-agent-sync.mjs --workspace production --apply  the production key (H9)
//
// Revert (D1): install `ant` and run `ant apply` on the same files.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentCreateBody, definitionHash, readAgentDefinition, readEnvironmentDefinition, SYSTEM_PROMPT_MAX_LINES } from '../benchmarks/harness/lib/agent-def.mjs';
import { benchEnv, mainEnv } from './lite-eval-paths.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const AGENT_DIR = path.join(ROOT, 'agents', 'noacg-harness');
export const WORKSPACES = ['bench', 'production'];

export const lockPath = (workspace) => path.join(AGENT_DIR, `claude-lock.${workspace}.json`);

/** What a sync would do, from the definitions and the lock alone. */
export function syncPlan({ lock, environment, agent, bundle }) {
  if (agent.systemLines > SYSTEM_PROMPT_MAX_LINES) throw new Error(`the system prompt is ${agent.systemLines} lines; plumbing fits in ${SYSTEM_PROMPT_MAX_LINES} (AC-16) - move guidance into the skill or the CLI`);
  const envHash = definitionHash(environment);
  const steps = [];
  steps.push({ resource: 'environment', action: !lock?.environment ? 'create' : lock.environment.sha256 !== envHash ? 'update' : 'keep', sha256: envHash });
  steps.push({ resource: 'skill', action: !lock?.skill ? 'create' : lock.skill.bundleSha256 !== bundle.sha256 ? 'version' : 'keep', sha256: bundle.sha256 });
  // The agent pins the skill version, so a new skill version is a new agent version too.
  const agentHash = definitionHash({ config: agent.config, system: agent.system, skillBundle: bundle.sha256 });
  steps.push({ resource: 'agent', action: !lock?.agent ? 'create' : lock.agent.sha256 !== agentHash || steps[1].action !== 'keep' ? 'update' : 'keep', sha256: agentHash });
  return steps;
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

async function apply({ workspace, steps, environment, agent, bundle, bundleDir, lock, save }) {
  const key = keyFor(workspace);
  if (!key) throw new Error(`no key for the ${workspace} workspace in .env (${workspace === 'bench' ? 'ANTHROPIC_BENCH_API_KEY' : 'ANTHROPIC_API_KEY'})`);
  const { default: Anthropic, toFile } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: key });
  const next = { workspace, ...(lock ?? {}) };
  const [envStep, skillStep, agentStep] = steps;

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

  const body = agentCreateBody(agent, next.skill);
  if (agentStep.action === 'create') {
    const created = await client.beta.agents.create(body);
    next.agent = { id: created.id, version: created.version };
  } else if (agentStep.action === 'update') {
    const updated = await client.beta.agents.update(lock.agent.id, { ...body, version: lock.agent.version });
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
  const environment = readEnvironmentDefinition(AGENT_DIR);
  const agent = readAgentDefinition(AGENT_DIR);
  const lockFile = lockPath(workspace);
  const lock = existsSync(lockFile) ? JSON.parse(readFileSync(lockFile, 'utf8')) : null;
  const bundleDir = mkdtempSync(path.join(os.tmpdir(), 'noacg-skill-'));
  try {
    const bundle = skillBundle(bundleDir);
    const steps = syncPlan({ lock, environment, agent, bundle });
    console.log(`Plan for the ${workspace} workspace (${path.relative(ROOT, lockFile)}${lock ? '' : ', none yet'}):`);
    for (const s of steps) console.log(`  ${s.resource.padEnd(12)} ${s.action}`);
    console.log(`  system prompt ${agent.systemLines} of ${SYSTEM_PROMPT_MAX_LINES} lines; skill ${bundle.files.length} file(s) of noacg v${bundle.cliVersion}`);
    if (!argv.includes('--apply')) {
      console.log('Nothing changed: add --apply to carry it out.');
    } else if (steps.every((s) => s.action === 'keep')) {
      console.log('Everything matches the lock; nothing to do.');
    } else {
      const save = (state) => writeFileSync(lockFile, `${JSON.stringify(state, null, 2)}\n`);
      const next = await apply({ workspace, steps, environment, agent, bundle, bundleDir, lock, save });
      save(next);
      console.log(`Synced: agent ${next.agent.id} v${next.agent.version}, environment ${next.environment.id}, skill ${next.skill.id} ${next.skill.version}. Lock: ${path.relative(ROOT, lockFile)}`);
    }
  } finally {
    rmSync(bundleDir, { recursive: true, force: true });
  }
}
