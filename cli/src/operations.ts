// THE OPERATION JOURNAL: which operation id a set of graphics was sent under, so that sending the
// same set again - a retry after a timeout, an agent that restarted, the same command run twice -
// reuses that id, and the deployment answers the first delivery instead of saving a second copy
// (`POST /api/me/graphic-sets`, docs/AGENT_SAVE.md §10).
//
// The id is written here BEFORE the set is sent, so a process killed mid-write still finds it.
// An entry is keyed by a fingerprint of the deployment, the key and the records' content (the
// same content the deployment hashes: everything but the ids and timestamps the bridge mints each
// time), and is reused for a day. `--operation <id>` names one explicitly; `--new` starts a fresh
// one for a set the user really wants twice. The file holds fingerprints and ids, never a key.

import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { credentialsDir } from './config.js';

/** How long the same set keeps its operation: long enough for any retry, short enough that a set
 *  made again next week is a new delivery. */
export const OPERATION_REUSE_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 200;

interface Entry {
  fingerprint: string;
  operationId: string;
  at: string;
}

interface Journal {
  version: 1;
  entries: Entry[];
}

export function journalPath(): string {
  return path.join(credentialsDir(), 'operations.json');
}

async function readJournal(): Promise<Journal> {
  try {
    const raw = JSON.parse(await fs.readFile(journalPath(), 'utf8')) as Partial<Journal>;
    if (raw && raw.version === 1 && Array.isArray(raw.entries)) return { version: 1, entries: raw.entries };
  } catch {
    /* absent or unreadable = nothing sent yet */
  }
  return { version: 1, entries: [] };
}

async function writeJournal(journal: Journal): Promise<void> {
  const target = journalPath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(journal, null, 2)}\n`);
  await fs.rename(tmp, target);
}

/** JSON with every object's keys sorted (the deployment's `canonicalJson`, api/_lib/me/graphicSets.ts). */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : canonicalJson(v))).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** The set as "the same set": where it goes, by which key, and its content without the ids and
 *  timestamps the bridge mints on every build. */
export function setFingerprint(origin: string, key: string, docs: Array<Record<string, unknown>>): string {
  const content = docs.map(({ id: _id, createdAt: _c, updatedAt: _u, ...rest }) => rest);
  const keyHash = createHash('sha256').update(key).digest('hex');
  return createHash('sha256').update(`${origin}\n${keyHash}\n${canonicalJson(content)}`).digest('hex');
}

export interface ChosenOperation {
  operationId: string;
  /** True when this set was sent before under this id: the deployment will answer that delivery. */
  resumed: boolean;
}

/**
 * The operation to send a set under, recorded before anything is sent: the one named, a fresh one
 * when asked, else the one this set was sent under in the last day, else a new one.
 */
export async function operationFor(
  fingerprint: string,
  choice: { operation?: string; fresh?: boolean } = {},
  now = Date.now(),
): Promise<ChosenOperation> {
  const journal = await readJournal();
  const live = journal.entries.filter((e) => now - Date.parse(e.at) < OPERATION_REUSE_MS);
  const known = live.find((e) => e.fingerprint === fingerprint);
  let chosen: ChosenOperation;
  if (choice.operation) chosen = { operationId: choice.operation.toLowerCase(), resumed: known?.operationId === choice.operation.toLowerCase() };
  else if (known && !choice.fresh) chosen = { operationId: known.operationId, resumed: true };
  else chosen = { operationId: randomUUID(), resumed: false };
  const entries = live.filter((e) => e.fingerprint !== fingerprint);
  entries.push({ fingerprint, operationId: chosen.operationId, at: known && chosen.resumed ? known.at : new Date(now).toISOString() });
  await writeJournal({ version: 1, entries: entries.slice(-MAX_ENTRIES) });
  return chosen;
}
