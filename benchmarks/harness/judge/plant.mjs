// PLANTED DEFECTS for the judge's calibration (docs/work-specs/noacg-harness/spec.md 4.3): a
// graphic the owner aired, with one basic mistake injected into its saved sources and rendered
// again exactly as the original was. The pair (original, planted) differs in that mistake alone,
// so a judge that prefers the original is reading the mistake, not the rendering.
//
// The injection is a script appended to the graphic's own `js/template.js`, in ES5 like the rest
// of a NoaCG graphic. It runs on every frame (the graphic may re-lay itself out on an update), finds
// the live text on the page and applies one of:
//
//   overlap    the second-largest text is moved onto the largest one: text over text
//   clipped    the largest text loses the right 40% of its glyphs to a hard clip: a clipped title
//   contrast   every text and every painted surface turns mid-grey: grey-on-grey text
//
// `changedFraction` reads two PNG frames and says how much of the picture moved, so a plant that
// did nothing is caught by measurement rather than by looking at it.

import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

export const DEFECTS = ['overlap', 'clipped', 'contrast'];

/** The basic-mistake kind each planted defect is (benchmarks/harness/judge/rubric.json). */
export const DEFECT_KIND = { overlap: 'text-over-text', clipped: 'clipped-or-escaping-text', contrast: 'unreadable-contrast' };

export function injection(defect) {
  if (!DEFECTS.includes(defect)) throw new Error(`no planted defect "${defect}"`);
  return `
/* PLANTED DEFECT (${defect}) for the NoaCG judge's calibration - not part of the graphic. */
;(function () {
  var DEFECT = ${JSON.stringify(defect)};
  function ownText(el) {
    var s = '';
    for (var c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 3) s += c.nodeValue;
    return s.replace(/\\s+/g, '');
  }
  function textBox(el) {
    var r = document.createRange();
    r.selectNodeContents(el);
    return r.getBoundingClientRect();
  }
  function texts() {
    var out = [];
    var all = document.body ? document.body.getElementsByTagName('*') : [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (/^(SCRIPT|STYLE|TEMPLATE)$/.test(el.tagName) || !ownText(el)) continue;
      var cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      var r = textBox(el);
      if (r.width < 4 || r.height < 4) continue;
      out.push({ el: el, r: r, size: parseFloat(cs.fontSize) || 0 });
    }
    out.sort(function (a, b) { return b.size - a.size || b.r.width * b.r.height - a.r.width * a.r.height; });
    return out;
  }
  var moved = null;
  function apply() {
    var t = texts();
    if (!t.length) return;
    if (DEFECT === 'clipped') {
      var a = t[0];
      var box = a.el.getBoundingClientRect();
      var keep = a.r.left + a.r.width * 0.6;
      a.el.style.setProperty('clip-path', 'inset(-50px ' + Math.max(0, box.right - keep) + 'px -50px -50px)', 'important');
    } else if (DEFECT === 'contrast') {
      for (var i = 0; i < t.length; i++) {
        t[i].el.style.setProperty('color', '#7d7d7d', 'important');
        t[i].el.style.setProperty('-webkit-text-fill-color', '#7d7d7d', 'important');
        t[i].el.style.setProperty('text-shadow', 'none', 'important');
      }
      var all = document.body.getElementsByTagName('*');
      for (var j = 0; j < all.length; j++) {
        var cs = window.getComputedStyle(all[j]);
        var painted = (cs.backgroundColor && cs.backgroundColor !== 'transparent' && !/rgba\\([^)]*,\\s*0\\)$/.test(cs.backgroundColor)) || (cs.backgroundImage && cs.backgroundImage !== 'none');
        if (painted) {
          all[j].style.setProperty('background-color', '#737373', 'important');
          all[j].style.setProperty('background-image', 'none', 'important');
        }
      }
    } else if (DEFECT === 'overlap' && t.length > 1) {
      var big = t[0];
      var other = t[1];
      if (moved && moved.el !== other.el) moved.el.style.removeProperty('translate');
      var dx = moved && moved.el === other.el ? moved.dx : 0;
      var dy = moved && moved.el === other.el ? moved.dy : 0;
      var nx = big.r.left + big.r.width * 0.12 - (other.r.left - dx);
      var ny = big.r.top + big.r.height * 0.3 - (other.r.top - dy);
      other.el.style.setProperty('translate', nx + 'px ' + ny + 'px', 'important');
      moved = { el: other.el, dx: nx, dy: ny };
    }
  }
  setInterval(apply, 40);
  if (document.readyState !== 'loading') apply();
  else document.addEventListener('DOMContentLoaded', apply);
})();
`;
}

// ── a PNG reader, enough to compare two frames ─────────────────────────────────────────────

/** RGBA pixels of an 8-bit, non-interlaced PNG (what the CLI's frames are). */
export function readPng(file) {
  const buf = readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file} is not a PNG`);
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[12] !== 0) throw new Error(`${file}: only 8-bit non-interlaced PNGs are read here`);
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const channels = { 2: 3, 6: 4, 0: 1, 4: 2 }[colorType];
  if (!channels) throw new Error(`${file}: colour type ${colorType} is not read here`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = v & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const s = x * channels;
      const d = (y * width + x) * 4;
      if (channels >= 3) {
        out[d] = line[s];
        out[d + 1] = line[s + 1];
        out[d + 2] = line[s + 2];
        out[d + 3] = channels === 4 ? line[s + 3] : 255;
      } else {
        out[d] = out[d + 1] = out[d + 2] = line[s];
        out[d + 3] = channels === 2 ? line[s + 1] : 255;
      }
    }
    prev = line;
  }
  return { width, height, pixels: out };
}

/** The share of pixels whose colour moved by more than `tolerance` (0-255) in any channel. */
export function changedFraction(fileA, fileB, tolerance = 24) {
  const a = readPng(fileA);
  const b = readPng(fileB);
  if (a.width !== b.width || a.height !== b.height) return 1;
  let changed = 0;
  for (let i = 0; i < a.pixels.length; i += 4) {
    if (Math.abs(a.pixels[i] - b.pixels[i]) > tolerance || Math.abs(a.pixels[i + 1] - b.pixels[i + 1]) > tolerance || Math.abs(a.pixels[i + 2] - b.pixels[i + 2]) > tolerance || Math.abs(a.pixels[i + 3] - b.pixels[i + 3]) > tolerance) changed++;
  }
  return changed / (a.width * a.height);
}
