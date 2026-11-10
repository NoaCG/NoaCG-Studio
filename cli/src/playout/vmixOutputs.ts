import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { configDir } from '../config.js';

export const VMIX_INPUT_KEY = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const VMIX_ALIAS = /^noacg-[0-9a-f]{32}\.localhost$/;
const DIGEST = /^[0-9a-f]{64}$/;
const INPUT_PATH = '/input?output=';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export function vmixOutputAddress(address: string): URL | undefined {
  if (!URL.canParse(address)) return;
  const url = new URL(address);
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password || VMIX_ALIAS.test(url.hostname)) return;
  return url;
}

/** A renderer's display name can change without changing its address. Keep no URL in the store. */
export function vmixOutputId(address: string): string | undefined {
  const url = vmixOutputAddress(address);
  if (!url) return;
  url.searchParams.delete('name');
  return sha256(url.href);
}

interface RedirectBinding {
  alias: string;
  digest: string;
}

const authority = (alias: string, port: number) => port === 80 ? alias : alias + ':' + port;
const redirectDigest = (output: string, port: number) => sha256(port + '\n' + output);

/** The marker is in the hostname because vMix's live XML exposes only that part of the URL. */
export function newVmixBrowser(output: string, port: number) {
  const alias = 'noacg-' + randomBytes(16).toString('hex') + '.localhost';
  return {
    binding: { alias, digest: redirectDigest(output, port) },
    address: 'http://' + authority(alias, port) + INPUT_PATH + encodeURIComponent(output),
  };
}

export function vmixRedirectRequest(host: string | undefined, path: string | undefined, port: number) {
  const alias = host?.split(':', 1)[0];
  if (!alias || !VMIX_ALIAS.test(alias) || host !== authority(alias, port) || !path?.startsWith(INPUT_PATH)) return;
  const encoded = path.slice(INPUT_PATH.length);
  try {
    const output = vmixOutputAddress(decodeURIComponent(encoded))?.href;
    if (output && encodeURIComponent(output) === encoded) {
      return { alias, output, digest: redirectDigest(output, port) };
    }
  } catch {
    // Malformed request encoding has no binding.
  }
}

interface VmixOutputs {
  keys: Record<string, string>;
  /** Listener that owns each Browser address, indexed by the same output digest as its key. */
  bridgePorts?: Record<string, number>;
}

interface Document {
  v: 2;
  ports: Record<string, VmixOutputs>;
  /** A saved preset can still use the address after its live key has been forgotten. */
  redirects: Record<string, string>;
}

export interface VmixOutputStore {
  read(port: number): Promise<VmixOutputs>;
  redirect(alias: string): Promise<string | undefined>;
  save(port: number, outputs: VmixOutputs, binding?: RedirectBinding): Promise<void>;
}

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

function parse(text: string): Document {
  const data: unknown = JSON.parse(text);
  if (!record(data) || data.v !== 2 || !record(data.ports) || !record(data.redirects)) {
    throw new Error('Unexpected vMix output store format.');
  }
  for (const outputs of Object.values(data.ports)) {
    if (!record(outputs) || !record(outputs.keys) || !Object.entries(outputs.keys).every(([id, key]) =>
      DIGEST.test(id) && typeof key === 'string' && VMIX_INPUT_KEY.test(key))) {
      throw new Error('Invalid vMix output keys.');
    }
    const keys = outputs.keys;
    const inputKeys = Object.values(keys).map(key => String(key).toLowerCase());
    if (new Set(inputKeys).size !== inputKeys.length) throw new Error('A vMix Browser key has more than one owner.');
    if (outputs.bridgePorts !== undefined && (!record(outputs.bridgePorts) || !Object.entries(outputs.bridgePorts).every(([id, port]) =>
      Object.hasOwn(keys, id) && typeof port === 'number' && Number.isInteger(port) && port >= 1 && port <= 65535))) {
      throw new Error('Invalid vMix Browser listener ports.');
    }
  }
  if (!Object.entries(data.redirects).every(([alias, digest]) => VMIX_ALIAS.test(alias) && typeof digest === 'string' && DIGEST.test(digest))) {
    throw new Error('Invalid vMix Browser addresses.');
  }
  return data as unknown as Document;
}

const empty = (): Document => ({ v: 2, ports: {}, redirects: {} });

/** One store per Bridge. The command keeps it beside the token. A direct adapter can use memory. */
export function vmixOutputStore(file?: string): VmixOutputStore {
  let memory = empty();
  const read = async (): Promise<Document> => {
    if (!file) return memory;
    try {
      return parse(await fs.readFile(file, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return empty();
    }
  };

  // The adapter serializes actions per port. Serialize replacements across ports too.
  let writing: Promise<unknown> = Promise.resolve();
  return {
    async read(port) {
      return (await read()).ports[port] ?? { keys: {} };
    },
    async redirect(alias) {
      return (await read()).redirects[alias];
    },
    save(port, outputs, binding) {
      const done = writing.then(async () => {
        const data = await read();
        if (binding && data.redirects[binding.alias]) throw new Error('The vMix Browser address already exists.');
        const next: Document = {
          v: 2,
          ports: { ...data.ports, [port]: outputs },
          redirects: binding ? { ...data.redirects, [binding.alias]: binding.digest } : data.redirects,
        };
        if (!file) {
          memory = next;
          return;
        }
        await fs.mkdir(path.dirname(file), { recursive: true });
        const temp = file + '.' + randomUUID() + '.tmp';
        try {
          await fs.writeFile(temp, JSON.stringify(next) + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
          await fs.rename(temp, file);
        } catch (error) {
          await fs.rm(temp, { force: true }).catch(() => undefined);
          throw error;
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
