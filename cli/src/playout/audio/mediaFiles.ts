// FROM A SERVER'S MEDIA NAME TO A FILE IN ITS SHARED FOLDER (docs/AUDIO_TIMELINE_LOUDNESS_PLAN.md
// §3.2). CasparCG lists `SPORTS/GOAL_REPLAY`: subfolders kept, no extension, its own letter case.
// The file on the share is `Sports\Goal_Replay.mov`. The rule is strict, because a wrong match draws
// the wrong waveform and sets the wrong level without anybody noticing:
//
//   - each subfolder is found by name, ignoring letter case, and must be the only one of that name;
//   - in the last folder, the files whose name without extension equals the leaf, ignoring case;
//   - of those, exactly one with the size the server lists. None: `missing` (no such name) or
//     `differs` (the name, not the size). More than one: `ambiguous`.
//
// Nothing is ever searched by bare file name elsewhere in the folder, so a renamed file is reported
// missing, never guessed. Only names read from the folder itself are joined to it, and the result's
// real path must still lie inside the folder's, so a link out of the share is refused too.

import { promises as fs, type Dirent } from 'node:fs';
import path from 'node:path';
import type { AudioJobProblem, MediaFolderCheck, MediaFolderState } from '../protocol.js';

export class MediaFileError extends Error {
  constructor(readonly code: AudioJobProblem, message: string) {
    super(message);
  }
}

/** What a failed read of the folder itself means for the operator. */
function folderProblem(e: unknown, folder: string): MediaFileError {
  const code = (e as NodeJS.ErrnoException | undefined)?.code ?? '';
  if (code === 'EACCES' || code === 'EPERM') {
    return new MediaFileError('access-denied', `Windows refused this user access to ${folder}. Sign in to the share as this Windows user, then try again.`);
  }
  return new MediaFileError('offline', `${folder} cannot be reached. Check that the playout computer is on and the share is available.`);
}

const lower = (s: string) => s.toLocaleLowerCase('en-US');
const stem = (name: string) => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
};

async function entries(dir: string, folder: string, top: boolean): Promise<Dirent[]> {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch (e) {
    if (top) throw folderProblem(e, folder);
    throw new MediaFileError('missing', `The folder ${dir} could not be read.`);
  }
}

export interface ResolvedFile {
  file: string;
  bytes: number;
  /** Modified time in ms, for the check after a read. */
  mtimeMs: number;
}

/**
 * The one file in `folder` the server's `name` is, or a MediaFileError saying why not. `bytes` is the
 * size the server lists; without it, the name alone must be unique.
 */
export async function resolveMediaFile(folder: string, name: string, bytes?: number): Promise<ResolvedFile> {
  if (!folder) throw new MediaFileError('not-linked', 'Link the server\'s media folder in Settings, Playout to read its files.');
  const parts = name.split(/[\\/]+/).filter(Boolean);
  if (!parts.length || parts.some((p) => p === '.' || p === '..')) throw new MediaFileError('missing', `"${name}" is not a media name.`);
  let dir = folder;
  for (const [i, part] of parts.slice(0, -1).entries()) {
    const found = (await entries(dir, folder, i === 0)).filter((d) => d.isDirectory() && lower(d.name) === lower(part));
    if (found.length !== 1) {
      throw new MediaFileError(found.length ? 'ambiguous' : 'missing', found.length ? `More than one folder in ${dir} is named ${part}.` : `There is no folder ${part} in ${dir}.`);
    }
    dir = path.join(dir, found[0].name);
  }
  const leaf = lower(parts[parts.length - 1]);
  const named = (await entries(dir, folder, parts.length === 1)).filter((d) => (d.isFile() || d.isSymbolicLink()) && lower(stem(d.name)) === leaf);
  if (!named.length) throw new MediaFileError('missing', `There is no file named ${parts[parts.length - 1]} in ${dir}. A renamed or moved file is not searched for.`);
  const sized: ResolvedFile[] = [];
  for (const d of named) {
    const file = path.join(dir, d.name);
    const stat = await fs.stat(file).catch(() => null);
    if (stat?.isFile() && (bytes === undefined || stat.size === bytes)) sized.push({ file, bytes: stat.size, mtimeMs: stat.mtimeMs });
  }
  if (sized.length > 1) throw new MediaFileError('ambiguous', `${sized.map((f) => path.basename(f.file)).join(' and ')} in ${dir} could each be ${name}. Rename one so the server's name is one file.`);
  if (!sized.length) throw new MediaFileError('differs', `${named[0].name} in ${dir} is not the size the server lists for ${name}: it is a different copy.`);
  const [one] = sized;
  // Inside the folder, links resolved: a file reached through a link out of the share is not read.
  const real = async (p: string) => fs.realpath(p).catch(() => path.resolve(p));
  const root = await real(folder);
  const where = await real(one.file);
  const rel = path.relative(root, where);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new MediaFileError('missing', `${name} leads outside ${folder}.`);
  return one;
}

/** The file is still what was read: the same size and modified time. */
export async function unchanged(f: ResolvedFile): Promise<boolean> {
  const stat = await fs.stat(f.file).catch(() => null);
  return !!stat && stat.size === f.bytes && stat.mtimeMs === f.mtimeMs;
}

const STATE_OF: Partial<Record<AudioJobProblem, MediaFolderState>> = { 'not-linked': 'not-linked', 'access-denied': 'access-denied', offline: 'offline' };

/**
 * Whether `folder` holds the server's files: a few of the listed files with a known size are looked
 * up. Linked when at least one is found and none is a different copy; `not-this-server` when the
 * folder answers but holds none of them, or other copies.
 */
export async function checkMediaFolder(folder: string | undefined, listed: { name: string; bytes?: number }[], sample = 5): Promise<MediaFolderCheck> {
  if (!folder) return { state: 'not-linked', detail: 'No media folder is linked for this server.' };
  try {
    await fs.readdir(folder);
  } catch (e) {
    const p = folderProblem(e, folder);
    return { state: STATE_OF[p.code] ?? 'offline', folder, detail: p.message };
  }
  const known = listed.filter((i) => typeof i.bytes === 'number' && i.bytes > 0).slice(0, sample);
  if (!known.length) return { state: 'linked', folder, detail: `${folder} can be read. The server lists no files to compare yet.` };
  let found = 0;
  for (const item of known) {
    try {
      await resolveMediaFile(folder, item.name, item.bytes);
      found++;
    } catch (e) {
      const p = e instanceof MediaFileError ? e : null;
      if (p && STATE_OF[p.code]) return { state: STATE_OF[p.code]!, folder, detail: p.message };
      if (p?.code === 'differs') return { state: 'not-this-server', folder, detail: `${folder} holds a different copy of ${item.name} than the server plays. Link the server's own media folder.` };
    }
  }
  if (!found) return { state: 'not-this-server', folder, detail: `None of the server's files were found in ${folder}. Link the folder CasparCG plays its media from.` };
  return { state: 'linked', folder, detail: `${folder} holds the server's files (${found} of ${known.length} checked).` };
}
