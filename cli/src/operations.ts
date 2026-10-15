// THE OPERATION JOURNAL: which operation id a set of graphics was sent under, so that sending the
// same set again - a retry after a timeout, an agent that restarted, the same command run twice -
// reuses that id, and the deployment answers the first delivery instead of saving a second copy
// (`POST /api/me/graphic-sets`, docs/AGENT_SAVE.md §10).
//
// The id is written here BEFORE the set is sent, so a process killed mid-write still finds it.
// An entry is keyed by a fingerprint of the deployment, the key and the records' content (the
// same content the deployment hashes: everything but the ids and timestamps the bridge mints each
// time), and is reused for a day. A replay that finds the set's graphics deleted since forgets it
// (save.ts), so saving the set again puts it back. The file holds fingerprints and ids, never a key.

import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { credentialsDir } from './config.js';
import { canonicalJson } from './digest.js';

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

/** The set as "the same set": where it goes, by which key, its content without the ids and
 *  timestamps the bridge mints on every build, and the production it asks for - the same graphics
 *  for the library alone and as a production are two deliveries. */
export function setFingerprint(origin: string, key: string, docs: Array<Record<string, unknown>>, production?: unknown): string {
  const records = docs.map(({ id: _id, createdAt: _c, updatedAt: _u, ...rest }) => rest);
  const content = production ? { graphics: records, production } : records;
  const keyHash = createHash('sha256').update(key).digest('hex');
  return createHash('sha256').update(`${origin}\n${keyHash}\n${canonicalJson(content)}`).digest('hex');
}

export interface ChosenOperation {
  operationId: string;
  /** True when this set was sent before under this id: the deployment will answer that delivery. */
  resumed: boolean;
}

/** The operation to send a set under, recorded before anything is sent: the one this set was sent
 *  under in the last day, else a new one. */
export async function operationFor(fingerprint: string, now = Date.now()): Promise<ChosenOperation> {
  return withJournalLock(async () => {
    const journal = await readJournal();
    const live = journal.entries.filter((e) => now - Date.parse(e.at) < OPERATION_REUSE_MS);
    const known = live.find((e) => e.fingerprint === fingerprint);
    if (known) return { operationId: known.operationId, resumed: true };
    const operationId = randomUUID();
    await writeJournal({ version: 1, entries: [...live, { fingerprint, operationId, at: new Date(now).toISOString() }].slice(-MAX_ENTRIES) });
    return { operationId, resumed: false };
  });
}

/** Forget the operation a set was tied to, after the deployment refused it as a conflict, so the
 *  next plain run starts a new one instead of meeting the same refusal for a day. */
export async function forgetOperation(fingerprint: string, operationId: string): Promise<void> {
  await withJournalLock(async () => {
    const journal = await readJournal();
    const entries = journal.entries.filter((e) => !(e.fingerprint === fingerprint && e.operationId === operationId));
    if (entries.length !== journal.entries.length) await writeJournal({ version: 1, entries });
  });
}

/** A lock held longer than this is a crashed process's, and is taken over. */
const LOCK_STALE_MS = 10_000;

/**
 * Run `fn` holding the journal's lock file, so two saves at once in processes sharing this
 * directory cannot both mint an operation for the same set (two copies) or drop each other's
 * entry. The lock is an exclusively created file; one older than LOCK_STALE_MS is a crashed
 * holder's and is removed. Waiting longer than that is a failure, said in words.
 */
export async function withJournalLock<T>(fn: () => Promise<T>): Promise<T> {
  const lock = `${journalPath()}.lock`;
  await fs.mkdir(path.dirname(lock), { recursive: true });
  const deadline = Date.now() + LOCK_STALE_MS * 2;
  for (;;) {
    try {
      const handle = await fs.open(lock, 'wx');
      await handle.close();
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      const held = await fs.stat(lock).catch(() => null);
      if (held && Date.now() - held.mtimeMs > LOCK_STALE_MS) await fs.rm(lock, { force: true });
      else if (Date.now() > deadline) throw new Error(`Another noacg save is holding ${lock}; try again when it has finished.`);
      else await new Promise((r) => setTimeout(r, 50));
    }
  }
  try {
    return await fn();
  } finally {
    await fs.rm(lock, { force: true });
  }
}
