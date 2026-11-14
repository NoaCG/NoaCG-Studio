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

/** Repo-relative source files the functions starting at `offsets` in a built chunk came from.
 *  `chunk` is the chunk's path under `dist` (`assets/x.js`); a chunk with no map gives nothing. */
export function sourcesOf(root, dist, chunk, offsets) {
  const file = path.join(root, dist, chunk);
  if (!chunks.has(file)) {
    const mapFile = `${file}.map`;
    if (!existsSync(file) || !existsSync(mapFile)) {
      chunks.set(file, null);
    } else {
      const map = JSON.parse(readFileSync(mapFile, 'utf8'));
      chunks.set(file, { lookup: sourceLookup(map), starts: lineStarts(readFileSync(file, 'utf8')), dir: path.dirname(file), sourceRoot: map.sourceRoot ?? '' });
    }
  }
  const parsed = chunks.get(file);
  if (!parsed) return [];
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
    if (!source) continue;
    const rel = path.relative(root, path.resolve(parsed.dir, parsed.sourceRoot, source)).replaceAll('\\', '/');
    if (!rel.startsWith('..') && !rel.startsWith('node_modules/') && !path.isAbsolute(rel)) found.add(rel);
  }
  return [...found];
}
