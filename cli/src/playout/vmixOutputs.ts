import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { configDir } from '../config.js';

export const VMIX_INPUT_KEY = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** A renderer's display name can change without changing its address. Keep no URL in the store. */
export function vmixOutputId(address: string): string | undefined {
  if (!URL.canParse(address)) return;
  const url = new URL(address);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  url.searchParams.delete('name');
  return createHash('sha256').update(url.href).digest('hex');
}

interface VmixOutputs {
  keys: Record<string, string>;
  /** A previous AddInput could not be attributed. Keep the stop across Bridge restarts. */
  pending?: true;
}

interface Document {
  v: 1;
  ports: Record<string, VmixOutputs>;
}

export interface VmixOutputStore {
  read(port: number): Promise<VmixOutputs>;
  save(port: number, outputs: VmixOutputs): Promise<void>;
}

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

function parse(text: string): Document {
  const data: unknown = JSON.parse(text);
  if (!record(data) || data.v !== 1 || !record(data.ports)) throw new Error('Unexpected vMix output store format.');
  for (const outputs of Object.values(data.ports)) {
    if (!record(outputs) || !record(outputs.keys) || !Object.entries(outputs.keys).every(([id, key]) =>
      /^[0-9a-f]{64}$/.test(id) && typeof key === 'string' && VMIX_INPUT_KEY.test(key))) {
      throw new Error('Invalid vMix output keys.');
    }
    const keys = Object.values(outputs.keys);
    if (new Set(keys).size !== keys.length) throw new Error('A vMix Browser key has more than one owner.');
    if (outputs.pending !== undefined && outputs.pending !== true) {
      throw new Error('Invalid pending vMix Browser addition.');
    }
  }
  return data as unknown as Document;
}

/** One store per Bridge. The command keeps it beside the token. A direct adapter can use memory. */
export function vmixOutputStore(file?: string): VmixOutputStore {
  let memory: Document = { v: 1, ports: {} };
  const read = async (): Promise<Document> => {
    if (!file) return memory;
    try {
      return parse(await fs.readFile(file, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return { v: 1, ports: {} };
    }
  };

  // The adapter serializes actions per port. Serialize replacements across ports too.
  let writing: Promise<unknown> = Promise.resolve();
  return {
    async read(port) {
      return (await read()).ports[port] ?? { keys: {} };
    },
    save(port, outputs) {
      const done = writing.then(async () => {
        const data = await read();
        const next: Document = { v: 1, ports: { ...data.ports, [port]: outputs } };
        if (!file) {
          memory = next;
          return;
        }
        await fs.mkdir(path.dirname(file), { recursive: true });
        const temp = file + '.' + randomUUID() + '.tmp';
        try {
          await fs.writeFile(temp, JSON.stringify(next) + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
          await fs.rename(temp, file);
        } finally {
          await fs.rm(temp, { force: true });
        }
      });
      writing = done.catch(() => undefined);
      return done;
    },
  };
}

export function fileVmixOutputStore(): VmixOutputStore {
  return vmixOutputStore(path.join(configDir(), 'vmix-outputs.json'));
}
