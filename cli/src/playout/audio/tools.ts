// WHERE THE BRIDGE'S FFMPEG LIVES (docs/AUDIO_TIMELINE_LOUDNESS_PLAN.md §3.3).
//
// The Windows exe carries an audio-only LGPL ffmpeg and ffprobe (cli/ffmpeg/build.sh) as
// single-executable assets. On first use they are written to a versioned folder in the user's
// profile, named by their checksum, and every time a job is about to start one, its checksum is
// read again: a file someone replaced is rewritten from the exe, never run.
//
// Outside the exe (the npm CLI, the tests), NOACG_FFMPEG_DIR names a folder holding the same two
// programs, built by the same recipe. With neither, there are no tools: the Bridge does not offer
// the waveform or measure jobs, and everything else works as before.

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface AudioTools {
  ffmpeg: string;
  ffprobe: string;
  /** Where they came from: unpacked from this exe, or the folder NOACG_FFMPEG_DIR names. */
  source: 'embedded' | 'env';
  /** Called before every start: resolves when each program is still the file it should be. */
  verify(): Promise<void>;
}

/** The manifest the exe build embeds beside the two programs (cli/scripts/build-bridge-exe.mjs). */
export interface EmbeddedManifest {
  version: string;
  files: Record<string, string>;
}

export const MANIFEST_ASSET = 'ffmpeg/manifest.json';
const PROGRAMS = ['ffmpeg', 'ffprobe'] as const;

const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

interface SeaModule {
  isSea(): boolean;
  getAsset(key: string): ArrayBuffer;
}

function seaModule(): SeaModule | null {
  try {
    // getBuiltinModule works in the exe's CommonJS bundle, where import.meta.url is empty.
    const sea = process.getBuiltinModule('node:sea') as SeaModule | undefined;
    return sea?.isSea() ? sea : null;
  } catch {
    return null;
  }
}

/** The user's own cache folder for the unpacked programs. */
export function toolsHome(env: NodeJS.ProcessEnv = process.env, platform = process.platform): string {
  if (platform === 'win32') return path.join(env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'NoaCG', 'Bridge', 'ffmpeg');
  return path.join(env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'noacg-bridge', 'ffmpeg');
}

/**
 * Write each embedded program into `<home>/<version>-<checksum>/` unless an identical file is
 * there already, and return a `verify` that re-reads them before each start.
 */
export async function unpackTools(
  manifest: EmbeddedManifest,
  read: (name: string) => Uint8Array,
  home: string,
  exe = process.platform === 'win32' ? '.exe' : '',
): Promise<AudioTools> {
  const key = sha256(Buffer.from(JSON.stringify(manifest))).slice(0, 12);
  const dir = path.join(home, `${manifest.version}-${key}`);
  await fs.mkdir(dir, { recursive: true });
  const paths: Record<string, string> = {};
  const ensure = async (name: string) => {
    const want = manifest.files[name];
    if (!want) throw new Error(`the Bridge exe carries no ${name}`);
    const file = path.join(dir, name + exe);
    paths[name] = file;
    const have = await fs.readFile(file).then(sha256, () => null);
    if (have === want) return;
    const data = read(name);
    if (sha256(data) !== want) throw new Error(`the ${name} inside the Bridge exe does not match its checksum`);
    // Written beside, then renamed: a half-written program is never left under the real name.
    const temp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(temp, data, { mode: 0o755 });
    await fs.rename(temp, file);
  };
  for (const name of PROGRAMS) await ensure(name);
  return {
    ffmpeg: paths.ffmpeg,
    ffprobe: paths.ffprobe,
    source: 'embedded',
    async verify() {
      for (const name of PROGRAMS) await ensure(name);
    },
  };
}

let found: Promise<AudioTools | null> | null = null;

/** The tools this Bridge can use, or null. Looked up once per process. */
export function audioTools(): Promise<AudioTools | null> {
  found ??= locate();
  return found;
}

async function locate(): Promise<AudioTools | null> {
  const sea = seaModule();
  if (sea) {
    let manifest: EmbeddedManifest;
    try {
      manifest = JSON.parse(Buffer.from(sea.getAsset(MANIFEST_ASSET)).toString('utf8')) as EmbeddedManifest;
    } catch {
      return null;
    }
    return unpackTools(manifest, (name) => new Uint8Array(sea.getAsset(`ffmpeg/${name}`)), toolsHome());
  }
  const dir = process.env.NOACG_FFMPEG_DIR;
  if (!dir) return null;
  const exe = process.platform === 'win32' ? '.exe' : '';
  const ffmpeg = path.join(dir, 'ffmpeg' + exe);
  const ffprobe = path.join(dir, 'ffprobe' + exe);
  const exists = async (f: string) => fs.access(f).then(() => true, () => false);
  if (!(await exists(ffmpeg)) || !(await exists(ffprobe))) return null;
  return { ffmpeg, ffprobe, source: 'env', async verify() {} };
}
