// The workspace on disk <-> the package zip the bridge reads and writes.
//
// A package is a folder (docs/AGENT_CLI.md "The graphic package"): SOURCES the agent edits and a
// GENERATED half NoaCG rebuilds. The bridge speaks zip bytes (it is the studio's own importer and
// exporter), so this module zips a folder into the shape an export has - one top folder named
// after the directory - and unzips an exported package back, stripping that top folder. When it
// writes a regenerated package over an existing workspace it touches ONLY the generated files;
// the sources are the agent's and are never overwritten after the first scaffold.

import { promises as fs } from 'node:fs';
import path from 'node:path';

/** The generated half of a package - the files `noacg validate` may overwrite in a workspace. */
const GENERATED = [/\.ograf\.json$/i, /^graphic\.mjs$/, /^FIELDS\.md$/, /^README\.md$/, /^GETTING-ON-AIR\.md$/, /^controlpanel\.html$/, /^thumbnail\.png$/];

// JSZip is loaded on FIRST ZIP, not at import. `mcp.ts` pulls this module in at startup for
// `isEmptyDir`, and a static import made every session pay 4 MB for a zip library most never
// use - the same reason `browser.ts` defers `playwright-core`, which costs far more
// (docs/backlog/cli-mcp-startup-weight.md). Cached after the first call, so repeated packaging
// pays the resolve once.
type JSZipCtor = typeof import('jszip');
let jszip: JSZipCtor | undefined;
async function loadJsZip(): Promise<JSZipCtor> {
  // `jszip` is CommonJS (`export = JSZip`), so Node's ESM loader hangs the class off `.default`
  // while TypeScript types the module as the class itself. Accept either shape rather than
  // asserting one: the wrong guess fails at runtime, in the zip path, far from this line.
  const mod = (await import('jszip')) as unknown as { default?: JSZipCtor };
  jszip ??= mod.default ?? (mod as unknown as JSZipCtor);
  return jszip;
}

export function isGeneratedFile(relPath: string): boolean {
  const name = relPath.split('/').pop() ?? relPath;
  return !relPath.includes('/') && GENERATED.some((re) => re.test(name));
}

/**
 * The file that marks a folder as FRAMES THIS TOOL WROTE - screenshots to look at, never part of
 * the graphic. `validate --screenshots ./shots`, run from inside the package as the scaffold's
 * own hint suggests, puts them in the package folder, and a package is read by zipping that
 * folder. Unmarked, the frames were imported as the graphic's assets, and everything downstream
 * went wrong quietly: the regenerated package was unzipped back over the folder and wrote the
 * OLD frames over the ones just taken (so an edit appeared to change nothing, under a green
 * result), the control page grew from 41 KB to 987 KB, and `save` would have carried them into
 * the library.
 */
export const FRAMES_MARKER = '.noacg-frames';

/** Mark `framesDir` when it sits inside `packageDir` (and is not the package folder itself). */
export async function markFramesDir(framesDir: string, packageDir: string): Promise<boolean> {
  const rel = path.relative(path.resolve(packageDir), path.resolve(framesDir));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return false;
  await fs.mkdir(path.resolve(framesDir), { recursive: true });
  await fs.writeFile(
    path.join(path.resolve(framesDir), FRAMES_MARKER),
    'Screenshots written by the noacg CLI. This folder is not part of the graphic and is never packaged.\n',
  );
  return true;
}

async function walk(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  if (dir !== base && entries.some((e) => e.isFile() && e.name === FRAMES_MARKER)) return out;
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      out.push(...(await walk(full, base)));
    } else if (entry.isFile()) {
      out.push(path.relative(base, full).split(path.sep).join('/'));
    }
  }
  return out.sort();
}

/** Zip a workspace directory under one top folder (its basename) - the shape of an export. */
export async function zipDirectory(dir: string): Promise<Uint8Array> {
  const abs = path.resolve(dir);
  const top = path.basename(abs);
  const JSZip = await loadJsZip();
  const zip = new JSZip();
  for (const rel of await walk(abs)) {
    // The thumbnail is an OUTPUT of the last validate, never an input to this one. Read back in,
    // it came out of the regenerated package again and was written over the fresh one, so the
    // thumbnail a graphic was saved with was the frame of its very first validate.
    if (rel === 'thumbnail.png') continue;
    zip.file(`${top}/${rel}`, await fs.readFile(path.join(abs, rel)));
  }
  return zip.generateAsync({ type: 'uint8array' });
}

/** Read a package argument: a `.zip` file as-is, or a directory zipped. */
export async function readPackageInput(input: string): Promise<{ bytes: Uint8Array; fileName: string; isDirectory: boolean }> {
  const abs = path.resolve(input);
  const stat = await fs.stat(abs).catch(() => null);
  if (!stat) throw new Error(`${input}: no such file or directory.`);
  if (stat.isDirectory()) return { bytes: await zipDirectory(abs), fileName: `${path.basename(abs)}.zip`, isDirectory: true };
  if (!/\.zip$/i.test(abs)) throw new Error(`${input}: expected a package directory or a .zip file.`);
  return { bytes: new Uint8Array(await fs.readFile(abs)), fileName: path.basename(abs), isDirectory: false };
}

/** The entries of a package zip, keyed by path with the top folder stripped. */
export async function packageEntries(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const zip = await (await loadJsZip()).loadAsync(bytes);
  const entries = Object.keys(zip.files)
    .filter((p) => !zip.files[p].dir)
    // A zip path is ALWAYS `/`-separated (APPNOTE 4.4.17), but PowerShell's Compress-Archive and
    // a few other Windows tools write `\` anyway. Normalizing here is what makes such a package
    // read the same on every platform - without it, Linux writes one file literally named
    // `pkg\graphic.mjs` while Windows silently treats it as a directory - and it is also what
    // brings a `..\..` entry under the same containment check as `../..` (JSZip resolves `../`
    // on read, but leaves `..\` exactly as it found it).
    .map((p) => ({ zipPath: p, rel: p.replace(/\\/g, '/') }));
  // Strip ONE common top folder when every entry shares it (an export's `<slug>/`).
  const firstSegments = new Set(entries.map((e) => e.rel.split('/')[0]));
  const strip = firstSegments.size === 1 && entries.every((e) => e.rel.includes('/')) ? `${[...firstSegments][0]}/` : '';
  const out = new Map<string, Uint8Array>();
  for (const e of entries) out.set(e.rel.slice(strip.length), await zip.files[e.zipPath].async('uint8array'));
  return out;
}

export interface UnzipOptions {
  /** Write the generated half only (never a source) - for regenerating into an existing workspace. */
  generatedOnly?: boolean;
}

/** Write a package zip into a directory (top folder stripped). Returns the files written. */
export async function unzipTo(bytes: Uint8Array, dir: string, opts: UnzipOptions = {}): Promise<string[]> {
  const abs = path.resolve(dir);
  await fs.mkdir(abs, { recursive: true });
  const written: string[] = [];
  for (const [rel, data] of await packageEntries(bytes)) {
    if (opts.generatedOnly && !isGeneratedFile(rel)) continue;
    const target = path.join(abs, ...rel.split('/'));
    // A zip entry escaping the directory is refused (zip slip). Compare against `abs` WITH a
    // trailing separator: a bare `startsWith(abs)` accepts a SIBLING whose name merely begins with
    // the target's - unzipping into /tmp/pkg, an entry `../pkg-evil/x` resolves to /tmp/pkg-evil/x,
    // which starts with /tmp/pkg and would have been written outside the workspace.
    if (target !== abs && !target.startsWith(abs + path.sep)) continue;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, data);
    written.push(rel);
  }
  return written;
}

/**
 * After a regenerate, drop the generated pair of the package's PREVIOUS name. A package is named
 * by its html (`<title>`, then the SPX definition's description); when that name changes - the
 * agent retitled the graphic, or an older scaffold carried its design's name in the sources - the
 * bridge writes `<new-slug>.html` + `<new-slug>.ograf.json`, and the old pair would stay behind:
 * a folder with two manifests that no renderer and no importer can call one graphic (found
 * 2026-08-22 walking a scaffolded package through validate). Only NoaCG's own generated manifests
 * are touched (`v_noacg.format`), and only the html such a manifest itself points at; nothing
 * else in the folder is ever removed.
 */
export async function removeStaleGenerated(dir: string, written: string[]): Promise<Array<{ file: string; kind: 'manifest' | 'html' }>> {
  const abs = path.resolve(dir);
  const keep = new Set(written);
  const removed: Array<{ file: string; kind: 'manifest' | 'html' }> = [];
  type StaleManifest = { v_noacg?: { format?: string; source?: { html?: string } } };
  for (const name of await fs.readdir(abs)) {
    if (!/\.ograf\.json$/i.test(name) || keep.has(name)) continue;
    let manifest: StaleManifest;
    try {
      manifest = JSON.parse(await fs.readFile(path.join(abs, name), 'utf8')) as StaleManifest;
    } catch {
      continue;
    }
    if (manifest?.v_noacg?.format !== 'noacg-graphic') continue;
    await fs.rm(path.join(abs, name));
    removed.push({ file: name, kind: 'manifest' });
    const html = manifest.v_noacg.source?.html;
    if (html && !html.includes('/') && !keep.has(html) && /\.html?$/i.test(html)) {
      await fs.rm(path.join(abs, html), { force: true });
      removed.push({ file: html, kind: 'html' });
    }
  }
  return removed;
}

/** Is the directory empty or absent (a fresh scaffold target)? */
export async function isEmptyDir(dir: string): Promise<boolean> {
  const abs = path.resolve(dir);
  const stat = await fs.stat(abs).catch(() => null);
  if (!stat) return true;
  if (!stat.isDirectory()) throw new Error(`${dir}: exists and is not a directory.`);
  return (await fs.readdir(abs)).length === 0;
}
