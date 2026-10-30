// WHICH CHARACTERS A WOFF2 FILE CAN DRAW, read from its own `cmap`, in Node with no font library.
//
// A WOFF2 file is a header, a table directory and ONE brotli stream holding every table back to
// back (only glyf, loca and hmtx are ever transformed, never cmap). So: read the directory, inflate
// the stream, walk to the cmap and read its Unicode subtable (format 12, else format 4). Used by
// scripts/bundled-font-glyphs.test.mjs to prove a bundled face supplies a string's every letter.
import { brotliDecompressSync } from 'node:zlib';

/** WOFF2's known-table index (the spec's table of 63 tags); only the first one matters here. */
const CMAP_INDEX = 0;

function base128(buf, at) {
  let value = 0;
  for (let i = 0; i < 5; i += 1) {
    const byte = buf[at.pos++];
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) return value;
  }
  throw new Error('woff2: UIntBase128 longer than five bytes');
}

/** The raw `cmap` table of a WOFF2 file. */
function cmapTable(file) {
  if (file.toString('latin1', 0, 4) !== 'wOF2') throw new Error('not a WOFF2 file');
  const numTables = file.readUInt16BE(12);
  const compressedSize = file.readUInt32BE(20);
  const at = { pos: 48 };
  let offset = 0;
  let cmap = null;
  for (let i = 0; i < numTables; i += 1) {
    const flags = file[at.pos++];
    const index = flags & 0x3f;
    let tag = null;
    if (index === 63) { tag = file.toString('latin1', at.pos, at.pos + 4); at.pos += 4; }
    const version = (flags >> 6) & 3;
    const origLength = base128(file, at);
    // glyf and loca are transformed at version 0; every other table at a version other than 0.
    const transformed = index === 10 || index === 11 ? version === 0 : version !== 0;
    const length = transformed ? base128(file, at) : origLength;
    if (index === CMAP_INDEX || tag === 'cmap') cmap = { offset, length };
    offset += length;
  }
  if (!cmap) throw new Error('woff2: no cmap table');
  const stream = brotliDecompressSync(file.subarray(at.pos, at.pos + compressedSize));
  return stream.subarray(cmap.offset, cmap.offset + cmap.length);
}

/** Every code point the file maps to a real glyph (glyph 0 is .notdef, which draws nothing). */
export function woff2CodePoints(file) {
  const t = cmapTable(file);
  const records = [];
  for (let i = 0; i < t.readUInt16BE(2); i += 1) {
    const r = 4 + i * 8;
    records.push({ platform: t.readUInt16BE(r), encoding: t.readUInt16BE(r + 2), offset: t.readUInt32BE(r + 4) });
  }
  const pick = (p, e) => records.find((r) => r.platform === p && r.encoding === e);
  const full = pick(3, 10) ?? pick(0, 4) ?? pick(0, 6);
  const bmp = pick(3, 1) ?? pick(0, 3);
  const points = new Set();
  if (full && t.readUInt16BE(full.offset) === 12) {
    const groups = t.readUInt32BE(full.offset + 12);
    for (let g = 0; g < groups; g += 1) {
      const o = full.offset + 16 + g * 12;
      const start = t.readUInt32BE(o);
      const end = t.readUInt32BE(o + 4);
      const glyph = t.readUInt32BE(o + 8);
      for (let c = start; c <= end; c += 1) if (glyph + (c - start) !== 0) points.add(c);
    }
    return points;
  }
  if (!bmp || t.readUInt16BE(bmp.offset) !== 4) throw new Error('woff2: no Unicode cmap subtable of format 4 or 12');
  const o = bmp.offset;
  const segments = t.readUInt16BE(o + 6) / 2;
  const ends = o + 14;
  const starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2;
  const ranges = deltas + segments * 2;
  for (let s = 0; s < segments; s += 1) {
    const end = t.readUInt16BE(ends + s * 2);
    const start = t.readUInt16BE(starts + s * 2);
    const delta = t.readInt16BE(deltas + s * 2);
    const rangeAt = ranges + s * 2;
    const range = t.readUInt16BE(rangeAt);
    for (let c = start; c <= end && c !== 0xffff; c += 1) {
      let glyph;
      if (range === 0) glyph = (c + delta) & 0xffff;
      else {
        const raw = t.readUInt16BE(rangeAt + range + (c - start) * 2);
        glyph = raw === 0 ? 0 : (raw + delta) & 0xffff;
      }
      if (glyph !== 0) points.add(c);
    }
  }
  return points;
}

/** Whether a CSS `unicode-range` value (`U+0100-02BA, U+0304, ...`) includes a code point. */
export function inUnicodeRange(range, codePoint) {
  return range.split(',').some((part) => {
    const m = /U\+([0-9A-F?]+)(?:-([0-9A-F]+))?/i.exec(part.trim());
    if (!m) return false;
    const low = parseInt(m[1].replace(/\?/g, '0'), 16);
    const high = m[2] ? parseInt(m[2], 16) : parseInt(m[1].replace(/\?/g, 'F'), 16);
    return codePoint >= low && codePoint <= high;
  });
}
