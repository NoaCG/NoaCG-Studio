import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs, type Stats } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { VMIX_INPUT_KEY, type ListItem, type VmixPlayer } from './protocol.js';

const run = promisify(execFile);
const WINDOWS = process.platform === 'win32';
const VIDEOS = path.join(homedir(), 'Videos');
const MEDIA_KINDS = {
  movie: new Set(['.avi', '.m4v', '.mov', '.mp4', '.mpeg', '.mpg', '.mxf', '.qt', '.wmv']),
  still: new Set(['.bmp', '.jpeg', '.jpg', '.png', '.tif', '.tiff']),
  audio: new Set(['.mp3', '.wav']),
};
type MediaKind = keyof typeof MEDIA_KINDS;
export const VMIX_PLAYERS: readonly VmixPlayer[] = ['clips', 'audio'];
export const VMIX_PLAYER_TITLE: Record<VmixPlayer, string> = { clips: 'NoaCG Clips', audio: 'NoaCG Audio' };

export function vmixMediaKind(name: string): MediaKind | undefined {
  const ext = path.extname(name).toLowerCase();
  return (Object.keys(MEDIA_KINDS) as MediaKind[]).find(kind => MEDIA_KINDS[kind].has(ext));
}

const errorCode = (error: unknown) => (error as NodeJS.ErrnoException).code;
const missing = (error: unknown) => errorCode(error) === 'ENOENT';
const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

export class VmixMediaError extends Error {}

const badPath = () => new VmixMediaError('Use a path inside the vMix media folder.');
const unavailable = () => new VmixMediaError('NoaCG Bridge could not read or keep its vMix setup. Check vmix-setup.json.');

function safePart(part: string): boolean {
  return !!part && !/[<>:"\\|?*\p{Cc}\p{Cs}]/u.test(part) && !/[. ]$/.test(part) &&
    !/^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\s*\.|$)/i.test(part);
}

export function vmixMediaName(name: string): boolean {
  return name.split('/').every(safePart);
}

export function sameVmixPath(a: string, b: string): boolean {
  return path.relative(a, b) === '';
}

function relativeName(root: string, file: string): string | undefined {
  if (!path.isAbsolute(file)) return;
  const name = path.relative(root, file).split(path.sep).join('/');
  if (vmixMediaName(name)) return name;
}

interface VmixPlayerSetup {
  key: string;
  ready: boolean;
}
interface PortSetup {
  root?: string;
  players: Partial<Record<VmixPlayer, VmixPlayerSetup>>;
  adding: Partial<Record<VmixPlayer, true>>;
}
type Setup = Record<string, PortSetup>;

function emptyPort(): PortSetup {
  return { players: {}, adding: {} };
}

function readSetup(text: string): Setup {
  const data: unknown = JSON.parse(text);
  if (!isRecord(data) || data.v !== 1 || !isRecord(data.ports)) throw unavailable();
  for (const port of Object.values(data.ports)) {
    if (!isRecord(port) || (port.root !== undefined && (typeof port.root !== 'string' || !path.isAbsolute(port.root))) ||
        !isRecord(port.players) || !isRecord(port.adding)) throw unavailable();
    const keys = new Set<string>();
    for (const [player, saved] of Object.entries(port.players)) {
      if ((player !== 'clips' && player !== 'audio') || !isRecord(saved) || typeof saved.key !== 'string' ||
          !VMIX_INPUT_KEY.test(saved.key) || typeof saved.ready !== 'boolean' || keys.has(saved.key.toLowerCase())) throw unavailable();
      keys.add(saved.key.toLowerCase());
    }
    for (const [player, pending] of Object.entries(port.adding)) {
      if ((player !== 'clips' && player !== 'audio') || pending !== true) throw unavailable();
    }
  }
  return data.ports as Setup;
}

async function powershell(script: string, initial?: string, signal?: AbortSignal): Promise<string> {
  const executable = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const { stdout } = await run(executable, [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-Command',
    "$ErrorActionPreference = 'Stop'; [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); " + script,
  ], {
    windowsHide: true,
    signal,
    timeout: initial === undefined ? 5000 : 0,
    env: { ...process.env, NOACG_VMX_PICKER_INITIAL: initial },
    maxBuffer: 65536,
  });
  return stdout.trimEnd();
}

async function windowsVideos(): Promise<string> {
  if (!WINDOWS) return VIDEOS;
  const folder = await powershell('[Environment]::GetFolderPath([Environment+SpecialFolder]::MyVideos, [Environment+SpecialFolderOption]::DoNotVerify)');
  return folder || VIDEOS;
}

async function windowsFolderPicker(initial: string, signal?: AbortSignal): Promise<string | undefined> {
  if (!WINDOWS) throw new VmixMediaError('Choose the media folder on the Windows computer running vMix.');
  const answer = await powershell([
    'Add-Type -AssemblyName System.Windows.Forms',
    '$owner = [Windows.Forms.Form]::new()',
    '$owner.TopMost = $true',
    '$owner.ShowInTaskbar = $false',
    '$owner.Opacity = 0',
    '$picker = [Windows.Forms.FolderBrowserDialog]::new()',
    "$picker.Description = 'Choose the NoaCG vMix media folder'",
    '$picker.SelectedPath = $env:NOACG_VMX_PICKER_INITIAL',
    'try { if ($picker.ShowDialog($owner) -eq [Windows.Forms.DialogResult]::OK) { ConvertTo-Json -Compress -InputObject $picker.SelectedPath } }',
    'finally { $picker.Dispose(); $owner.Dispose() }',
  ].join('\n'), initial, signal);
  return answer ? JSON.parse(answer) as string : undefined;
}

async function resolveChild(root: string, name: string, allowMissingLeaf = false): Promise<{ file: string; stat?: Stats }> {
  if (!vmixMediaName(name)) throw badPath();
  const parts = name.split('/');
  let parent = root;
  for (const [index, part] of parts.entries()) {
    const child = path.join(parent, part);
    const leaf = index === parts.length - 1;
    try {
      await fs.lstat(child);
    } catch (error) {
      if (allowMissingLeaf && leaf && missing(error)) return { file: child };
      throw badPath();
    }
    let file: string;
    let stat: Stats;
    try {
      file = await fs.realpath(child);
      if (!relativeName(root, file)) throw badPath();
      stat = await fs.stat(file);
    } catch {
      throw badPath();
    }
    if (leaf) return { file, stat };
    if (!stat.isDirectory()) throw badPath();
    parent = file;
  }
  throw badPath();
}

export function createVmixMedia(options: {
  file?: string;
  ownershipProblem?: () => string | undefined;
  defaultFolder?: () => Promise<string>;
  picker?: (initial: string, signal?: AbortSignal) => Promise<string | undefined>;
} = {}) {
  const { file, ownershipProblem } = options;
  let memory: Setup = {};
  let writes: Promise<unknown> = Promise.resolve();
  let picking = false;
  let pickerController: AbortController | undefined;
  let defaultFolder: Promise<string> | undefined;

  async function setups(): Promise<Setup> {
    if (!file) return memory;
    try {
      return readSetup(await fs.readFile(file, 'utf8'));
    } catch (error) {
      if (missing(error)) return {};
      throw unavailable();
    }
  }

  const setup = async (port: number): Promise<PortSetup> => (await setups())[port] ?? emptyPort();

  function update(port: number, change: (previous: PortSetup) => PortSetup): Promise<void> {
    const done = writes.then(async () => {
      const problem = ownershipProblem?.();
      if (problem) throw new VmixMediaError(problem);
      const data = await setups();
      const next = { ...data, [port]: change(data[port] ?? emptyPort()) };
      if (!file) {
        memory = next;
        return;
      }
      const temp = file + '.' + randomUUID() + '.tmp';
      try {
        await fs.writeFile(temp, JSON.stringify({ v: 1, ports: next }) + '\n', { encoding: 'utf8', flag: 'wx', mode: 0o600 });
        await fs.rename(temp, file);
      } catch {
        await fs.rm(temp, { force: true }).catch(() => undefined);
        throw unavailable();
      }
    });
    writes = done.catch(() => undefined);
    return done;
  }

  const configuredFolder = () => defaultFolder ??= (options.defaultFolder ?? windowsVideos)().then(async dir => {
    if (!path.isAbsolute(dir)) throw badPath();
    return fs.realpath(dir).catch(error => {
      if (missing(error)) return dir;
      throw error;
    });
  }).catch(error => {
    defaultFolder = undefined;
    throw error;
  });

  async function folder(port: number): Promise<string> {
    return (await setup(port)).root ?? configuredFolder();
  }

  async function root(port: number): Promise<string> {
    const dir = await folder(port);
    const canonical = await fs.realpath(dir);
    if (!sameVmixPath(dir, canonical) || !(await fs.stat(canonical)).isDirectory()) throw badPath();
    return canonical;
  }

  return {
    setup,
    folder,
    close() { pickerController?.abort(); },

    markAdding(port: number, player: VmixPlayer, adding: boolean) {
      return update(port, previous => {
        const pending = { ...previous.adding };
        if (adding) pending[player] = true;
        else delete pending[player];
        return { ...previous, adding: pending };
      });
    },

    keepPlayer(port: number, player: VmixPlayer, key: string, ready: boolean) {
      return update(port, previous => {
        const adding = { ...previous.adding };
        delete adding[player];
        return { ...previous, adding, players: { ...previous.players, [player]: { key, ready } } };
      });
    },

    async chooseFolder(
      port: number, publish: (save: () => Promise<string>) => Promise<string> = save => save(),
    ): Promise<{ mediaFolder: string; cancelled?: true }> {
      const problem = ownershipProblem?.();
      if (problem) throw new VmixMediaError(problem);
      if (picking) throw new VmixMediaError('The vMix media folder picker is already open.');
      picking = true;
      const controller = new AbortController();
      pickerController = controller;
      try {
        const current = await folder(port);
        const chosen = await (options.picker ?? windowsFolderPicker)(current, controller.signal);
        if (controller.signal.aborted) throw new VmixMediaError('The media folder picker was closed with Bridge.');
        if (chosen === undefined) return { mediaFolder: current, cancelled: true };
        if (!path.isAbsolute(chosen)) throw badPath();
        // The dialog did not hold the port turn. Join it only to publish the chosen root.
        const mediaFolder = await publish(async () => {
          if (controller.signal.aborted) throw new VmixMediaError('The media folder picker was closed with Bridge.');
          const canonical = await fs.realpath(chosen);
          if (!(await fs.stat(canonical)).isDirectory()) throw badPath();
          await update(port, previous => ({ ...previous, root: canonical }));
          return canonical;
        });
        return { mediaFolder };
      } catch (error) {
        if (error instanceof VmixMediaError) throw error;
        throw new VmixMediaError('NoaCG Bridge could not open the folder picker or use the folder it selected.');
      } finally {
        picking = false;
        pickerController = undefined;
      }
    },

    async file(port: number, name: string): Promise<string> {
      try {
        const { file: resolved, stat } = await resolveChild(await root(port), name, true);
        if (stat && (!stat.isFile() || vmixMediaKind(resolved) !== vmixMediaKind(name))) throw badPath();
        return resolved;
      } catch (error) {
        if (error instanceof VmixMediaError) throw error;
        throw badPath();
      }
    },

    async relativeFile(port: number, file: string): Promise<string | undefined> {
      try {
        const dir = await root(port);
        const name = relativeName(dir, file);
        if (!name) return;
        const resolved = await resolveChild(dir, name);
        if (resolved.stat?.isFile() && sameVmixPath(resolved.file, file)) return name;
      } catch {
        // An external or now-missing path is not a media name Bridge can publish.
      }
    },

    async list(port: number, name = ''): Promise<ListItem[]> {
      if (name && !vmixMediaName(name)) throw badPath();
      let dir: string;
      try {
        dir = await root(port);
      } catch (error) {
        if (name === '' && missing(error)) return [];
        throw badPath();
      }
      const browse = name === '' ? { file: dir } : await resolveChild(dir, name);
      if (browse.stat && !browse.stat.isDirectory()) throw badPath();
      let names: string[];
      try {
        names = await fs.readdir(browse.file);
      } catch {
        throw badPath();
      }
      const items: ListItem[] = [];
      for (const label of names.sort((a, b) => a.localeCompare(b))) {
        if (!safePart(label)) continue;
        const relative = name ? name + '/' + label : label;
        let child;
        try {
          child = await resolveChild(dir, relative);
        } catch {
          // A link outside the root or an entry removed during a list does not belong in the reply.
          continue;
        }
        const kind = child.stat?.isDirectory() ? 'folder' : child.stat?.isFile() ? vmixMediaKind(label) : undefined;
        if (!kind || (kind !== 'folder' && vmixMediaKind(child.file) !== kind)) continue;
        const time = kind === 'folder' ? undefined : await headerTime(child.file, child.stat!.size);
        items.push({ name: relative, path: relative, label, kind, ...time });
      }
      return items;
    },
  };
}

export type VmixMedia = ReturnType<typeof createVmixMedia>;
type MediaTime = Pick<ListItem, 'frames' | 'fps'>;
const MAX_HEADERS = 2048;

async function readAt(file: FileHandle, at: number, length: number): Promise<Buffer | undefined> {
  const data = Buffer.alloc(length);
  const { bytesRead } = await file.read(data, 0, length, at);
  if (bytesRead === length) return data;
}

async function wavTime(file: FileHandle, size: number): Promise<MediaTime | undefined> {
  const header = await readAt(file, 0, 12);
  if (header?.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE') return;
  const end = header.readUInt32LE(4) + 8;
  if (end > size) return;
  let byteRate: number | undefined;
  let dataSize: number | undefined;
  for (let at = 12, count = 0; at + 8 <= end && count < MAX_HEADERS; count += 1) {
    const chunk = await readAt(file, at, 8);
    if (!chunk) return;
    const kind = chunk.toString('ascii', 0, 4);
    const length = chunk.readUInt32LE(4);
    const body = at + 8;
    if (body + length > end) return;
    if (kind === 'fmt ' && length >= 16) byteRate = (await readAt(file, body, 16))?.readUInt32LE(8);
    if (kind === 'data') dataSize = length;
    if (byteRate && dataSize !== undefined) return { frames: dataSize, fps: byteRate };
    at = body + length + length % 2;
  }
}

async function movieTime(file: FileHandle, size: number): Promise<MediaTime | undefined> {
  let at = 0;
  let end = size;
  let inMovie = false;
  for (let count = 0; at + 8 <= end && count < MAX_HEADERS; count += 1) {
    const box = await readAt(file, at, 8);
    if (!box) return;
    const kind = box.toString('ascii', 4, 8);
    let length = box.readUInt32BE();
    let header = 8;
    if (length === 1) {
      const extended = await readAt(file, at + header, 8);
      if (!extended) return;
      length = Number(extended.readBigUInt64BE());
      header = 16;
    } else if (length === 0) length = end - at;
    if (!Number.isSafeInteger(length) || length < header || length > end - at) return;
    if (kind === 'moov' && !inMovie) {
      inMovie = true;
      end = at + length;
      at += header;
    } else if (kind === 'mvhd' && inMovie) {
      if (length - header < 20) return;
      const body = await readAt(file, at + header, Math.min(length - header, 32));
      if (!body || (body[0] !== 0 && body[0] !== 1)) return;
      const long = body[0] === 1;
      if (long && body.length < 32) return;
      const fps = body.readUInt32BE(long ? 20 : 12);
      const frames = long ? Number(body.readBigUInt64BE(24)) : body.readUInt32BE(16);
      // These two fields carry a time base. The movie header does not contain a frame rate.
      if (fps && frames !== 0xffffffff && Number.isSafeInteger(frames)) return { frames, fps };
      return;
    } else at += length;
  }
}

async function headerTime(name: string, size: number): Promise<MediaTime | undefined> {
  const ext = path.extname(name).toLowerCase();
  if (ext !== '.wav' && ext !== '.mov' && ext !== '.mp4') return;
  try {
    const file = await fs.open(name, 'r');
    try {
      return await (ext === '.wav' ? wavTime(file, size) : movieTime(file, size));
    } finally {
      await file.close();
    }
  } catch {
    // An unreadable or incomplete header does not keep the file out of the browser.
  }
}
