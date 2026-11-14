// WHICH SOURCE FILES A BUNDLED FUNCTION CAME FROM, for the traced spec map on the e2e build.
//
// The trace fixture (e2e/_trace.ts) records the scripts a test executed functions in. On the dev
// server each script URL is a source file. On the e2e build (playwright.config.ts) it is a chunk,
// `/assets/<name>-<hash>.js`, holding many modules, so the fixture keeps the start offset of each
// function that ran and asks this module which source file each one was written in, through the
// build's own source maps (vite.config.ts writes them for the e2e build only). The answer is
// repo-relative paths, which scripts/e2e-traced.mjs maps exactly as it maps dev-server URLs.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const DIGIT = new Map([...B64].map((c, i) => [c, i]));

/** One mapping line's segments as `[generatedColumn, sourceIndex]` pairs, columns ascending.
 *  `state` carries the source index across lines, as the format requires. */
function decodeLine(line, state) {
  const out = [];
  let column = 0;
  for (const segment of line.split(',')) {
    if (!segment) continue;
    const fields = [];
    let value = 0;
    let shift = 0;
    for (const char of segment) {
      const digit = DIGIT.get(char);
      if (digit === undefined) throw new Error(`bad source map character ${char}`);
      value += (digit & 31) << shift;
      if (digit & 32) {
        shift += 5;
      } else {
        fields.push(value & 1 ? -(value >>> 1) : value >>> 1);
        value = 0;
        shift = 0;
      }
    }
    column += fields[0];
    if (fields.length >= 4) {
      state.source += fields[1];
      out.push([column, state.source]);
    }
  }
  return out;
}

/** A lookup from a generated (line, column) to the source path, over one parsed source map. */
export function sourceLookup(map) {
  const state = { source: 0 };
  const lines = map.mappings.split(';').map((line) => decodeLine(line, state));
  return (line, column) => {
    const segments = lines[line] ?? [];
    let found = null;
    for (const [col, source] of segments) {
      if (col > column) break;
      found = source;
    }
    return found === null ? null : map.sources[found];
  };
}

/** Line starts of a text, for turning a character offset into (line, column). */
function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

const chunks = new Map();

const checkedBuilds = new Set();

/** Fails unless the build wrote source maps at all, read off the app entry's chunk. A single chunk
 *  without a map is generated code (Vite's preload helper, a Babel helper) with no source to
 *  credit; a build without maps would leave every trace nearly empty, and the planner would count
 *  those specs as freshly traced (scripts/e2e-traced.mjs), so that fails loudly instead. */
function requireMaps(root, dist) {
  const key = path.join(root, dist);
  if (checkedBuilds.has(key)) return;
  const manifest = JSON.parse(readFileSync(path.join(key, '.vite/manifest.json'), 'utf8'));
  const entry = manifest['app.html']?.file;
  if (!entry || !existsSync(path.join(key, `${entry}.map`))) {
    throw new Error(`${dist} has no source map for the app entry (${entry ?? 'not in the manifest'}), so the trace cannot tell source files (vite.config.ts writes maps for the e2e build)`);
  }
  checkedBuilds.add(key);
}

/** Repo-relative path of a map source, or null for one outside the repo or in node_modules. */
function repoPath(root, parsed, source) {
  const rel = path.relative(root, path.resolve(parsed.dir, parsed.sourceRoot, source)).replaceAll('\\', '/');
  return rel.startsWith('..') || rel.startsWith('node_modules/') || path.isAbsolute(rel) ? null : rel;
}

/** A built chunk with its source map, parsed once per process; a generated chunk with no map has
 *  no sources (requireMaps fails a build that wrote none). */
function parsedChunk(root, dist, chunk) {
  const file = path.join(root, dist, chunk);
  requireMaps(root, dist);
  if (!chunks.has(file)) {
    const mapFile = `${file}.map`;
    if (!existsSync(file) || !existsSync(mapFile)) {
      chunks.set(file, { map: { sources: [] }, lookup: () => null, starts: [0], dir: path.dirname(file), sourceRoot: '' });
    } else {
      const map = JSON.parse(readFileSync(mapFile, 'utf8'));
      chunks.set(file, { map, lookup: sourceLookup(map), starts: lineStarts(readFileSync(file, 'utf8')), dir: path.dirname(file), sourceRoot: map.sourceRoot ?? '' });
    }
  }
  return chunks.get(file);
}

/** Repo-relative source files the functions starting at `offsets` in a built chunk came from.
 *  `chunk` is the chunk's path under `dist` (`assets/x.js`). */
export function sourcesOf(root, dist, chunk, offsets) {
  const parsed = parsedChunk(root, dist, chunk);
  const found = new Set();
  for (const offset of offsets) {
    let lo = 0;
    let hi = parsed.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (parsed.starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    const source = parsed.lookup(lo, offset - parsed.starts[lo]);
    const rel = source && repoPath(root, parsed, source);
    if (rel) found.add(rel);
  }
  return [...found];
}

/** The component modules (.tsx, .jsx) bundled into a built chunk. The dev server's map counts a
 *  component file as soon as it LOADS: @vitejs/plugin-react appends React Refresh code to it that
 *  runs a function on load. The build has no such code, so a trace on the build counts every
 *  component in a chunk the page loaded, which keeps its map a superset of the dev server's. */
export function componentsOf(root, dist, chunk) {
  const parsed = parsedChunk(root, dist, chunk);
  return parsed.map.sources.filter((s) => /\.(tsx|jsx)$/.test(s)).map((s) => repoPath(root, parsed, s)).filter(Boolean);
}
