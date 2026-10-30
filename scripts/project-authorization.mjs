// Project metadata lives in the existing wave file. This is validation, not a launcher.
import { createHash } from 'node:crypto';

export const DAY_MS = 24 * 60 * 60_000;
const LINE = /^Project: (.+)$/m;
const nonempty = (s) => typeof s === 'string' && s.trim() && !/[\r\n]/.test(s);
export const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value)) return NaN;
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !== value.slice(0, 10)) return NaN;
  return time;
}

export function validateAuthorization(auth, { now = Date.now(), open = true, kind = 'plan' } = {}) {
  if (!['plan', 'wave'].includes(kind)) throw Error('Authorization kind must be plan or wave');
  if (!auth || !['source', 'scope', 'permissionPolicy'].every((key) => nonempty(auth[key]))) throw Error('Explicit owner authorization, scope and permission policy required');
  // Standing permissions (block renewal, migrations, auto-merge) are the owner's words, kept verbatim.
  if (auth.standing !== undefined && (!auth.standing || typeof auth.standing !== 'object' || Array.isArray(auth.standing)
      || !Object.keys(auth.standing).length || Object.values(auth.standing).some((words) => !nonempty(words)))) throw Error('Standing permissions are the owner\'s words, one line each');
  const start = instant(auth.startedAt), end = instant(auth.deadline);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || start > now
      || (open && now >= end)) throw Error('Original finite authorization is invalid or expired');
  if (kind !== 'plan' && end - start > DAY_MS) throw Error('A wave remains limited to 24 hours');
  return { start, end };
}

export function validateProject(project, now = Date.now()) {
  if (project?.version !== 1 || !/^[\w-]+$/.test(project.id ?? '')
      || project.ownership !== 'local-single-owner') throw Error('Project requires stable identity and its single-owner marker (ownership: local-single-owner)');
  validateAuthorization(project.authorization, { now, open: false });
  const phases = project.phases;
  if (!Array.isArray(phases) || !phases.length) throw Error('Owner-defined phases and acceptance required');
  const seen = new Set();
  for (const phase of phases) {
    if (!nonempty(phase.id) || seen.has(phase.id) || !nonempty(phase.title)
        || !Array.isArray(phase.acceptance) || !phase.acceptance.length || phase.acceptance.some((s) => !nonempty(s))
        || new Set(phase.acceptance).size !== phase.acceptance.length || !nonempty(phase.environment)
        || !Array.isArray(phase.dependsOn) || phase.dependsOn.some((id) => !seen.has(id))) throw Error('Preserve phase order, dependencies, acceptance and required environment');
    seen.add(phase.id);
  }
  if (!['active', 'paused', 'blocked', 'cancelled', 'finished'].includes(project.status)) throw Error('Invalid project state');
  if (project.block) {
    const { block } = project;
    const start = instant(block.startedAt), end = instant(block.deadline);
    if (!nonempty(block.id) || !nonempty(block.owner) || !Number.isSafeInteger(block.epoch) || block.epoch < 1
        || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > DAY_MS
        || start < instant(project.authorization.startedAt) || end > instant(project.authorization.deadline)) throw Error('Work block must be bounded within original project authorization');
  }
  return project;
}

export function readProject(text, now = Date.now()) {
  const lines = text.match(/^Project:.*$/gm);
  if (!lines) return null;
  if (lines.length !== 1) throw Error('Ambiguous project metadata');
  let project;
  try { project = JSON.parse(LINE.exec(text)?.[1]); } catch { throw Error('Unreadable project metadata'); }
  validateProject(project, now);
  if (instant(/^Window starts: (\S+)/m.exec(text)?.[1]) !== instant(project.authorization.startedAt)
      || instant(/^Window ends: (\S+)/m.exec(text)?.[1]) !== instant(project.authorization.deadline)) throw Error('Project deadline differs from original authorization');
  const section = /^## Phases[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text.replace(/\r\n/g, '\n'))?.[1] ?? '';
  const titles = [...section.matchAll(/^\d+\.\s+(.+)$/gm)].map((m) => m[1].trim());
  if (JSON.stringify(titles) !== JSON.stringify(project.phases.map((p) => p.title))) throw Error('Authorized phase set or order changed');
  return project;
}

/** The 1-based row of a phase named by its project id or its row. A number that is one phase's id
 * and another phase's row is refused, never guessed: that mix-up is what one id everywhere ends. */
export function phaseRow(phases, name) {
  const byId = phases.findIndex((phase) => phase.id === name) + 1;
  const row = /^\d+$/.test(name ?? '') ? Number(name) : 0;
  if (byId && row >= 1 && row <= phases.length && byId !== row) throw Error(`Ambiguous phase "${name}": it is the id of row ${byId} and also row ${row}; name the first by row ${byId}, the second by its id`);
  if (byId) return byId;
  if (row >= 1 && row <= phases.length) return row;
  throw Error(`No phase "${name}": name its project id or its row number`);
}

export function writeProject(text, project) {
  const line = `Project: ${JSON.stringify(project)}`;
  return LINE.test(text) ? text.replace(LINE, () => line) : `${text.trimEnd()}\n${line}\n`;
}

export function projectBoundary(project, now = Date.now()) {
  if (['cancelled', 'finished'].includes(project.status)) return { action: project.status, why: project.reason ?? project.status };
  if (now >= instant(project.authorization.deadline)) return { action: 'expired', why: 'original project deadline expired; checkpoint and stop' };
  if (project.status !== 'active') return { action: project.status, why: project.reason ?? 'explicit resume with reconciliation required' };
  if (!project.block || now < instant(project.block.startedAt) || now >= instant(project.block.deadline)) return { action: 'paused', why: 'work block ended; checkpoint, stop launches and block-specific wakes' };
  return null;
}

export function immutableProject(project) {
  return digest({ id: project.id, ownership: project.ownership, authorization: project.authorization, phases: project.phases, authorityStore: project.authorityStore });
}
