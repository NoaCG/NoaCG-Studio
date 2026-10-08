// THE COPY PATH of the e2e planner: a changed file whose edit is only WORDING, or only how a class
// looks, is planned by the specs that name what changed instead of by every spec covering the file.
//
// Why: a covers header answers "which specs drive this file", and for a wizard step that is about
// forty spec files, because the wizard is the main creation flow. That is the right answer for a
// change to what a step DOES. It is the wrong one for a sentence: the 2026-10-07 wave's wizard copy
// rows planned 43-51 spec files, 652 tests on a laptop, to prove that two paragraphs had gone. A
// sentence can only break a spec that reads that sentence.
//
// THE CLASSIFICATION IS CONSERVATIVE BY CONSTRUCTION. A file takes this path only when the code
// that is left once its words are set aside is IDENTICAL before and after - token for token, so a
// changed condition, handler, prop expression, test id or class name all fall back to the normal
// plan. Anything the scanners below do not fully understand (an unterminated string, a tag that
// does not close, a template it cannot follow) is an abort, and an abort is the normal plan too.
// What counts as wording, exactly:
//
//   .tsx / .jsx   JSX text; a prose string literal (`'Saved to this browser.'`) where a value goes
//                 (`=`, `:`, `?`, `return`, `=>`, `+`, `||`, `??`, `&&`, an array element) and is not
//                 compared, indexed or called on; a prose JSX attribute (`title`, `aria-label`,
//                 `placeholder`, or any component prop not named like an id, key, class or path),
//                 including adding or removing one; and a STATIC text element (`<p className="hint">`,
//                 `<b>`, `<code>`, `<br />` ... with no handler, test id, key or expression inside),
//                 only added or only removed, never reshaped. "Prose" means words with a capital or sentence
//                 punctuation and nothing selector-, path- or markup-shaped, so `'wz-step hint'` or
//                 `'.wz-step .hint'` is never prose.
//   .html         text nodes, inline formatting tags (`<b>`, `<em>`, `<br>` ...) and prose `title`,
//                 `alt`, `aria-label`, `placeholder` and `<meta content>`. Scripts and styles are code.
//   .css          declarations in rules whose every selector carries a class, provided no changed
//                 declaration is a custom property or decides what is visible or reachable
//                 (`display`, `visibility`, `pointer-events`, `position`, `z-index`, `opacity`,
//                 `overflow`, `transform`, `animation`, ...). Those are behaviour, not appearance.
//
// Plain .ts/.js never takes the path: a prose string there is as likely an AI prompt or a matched
// message as a label. Nor does anything the catalog gate watches (`src/templates`, `src/blocks`,
// `src/assets`): there the text IS the product output the catalog specs measure.
//
// WHAT A COPY EDIT SELECTS: the specs whose source holds a string or a regex run that meets the old
// or new wording - equal to it, or one inside the other at word boundaries and case-insensitively,
// the way Playwright's text matching reads, where the inner one is distinctive (two words, eight
// letters) - or, for CSS, a class from a changed rule. Plus every spec with
// screenshot baselines among the file's normal coverage, because a picture compares every pixel.
// No smoke spec is added: the scanner proved the code is unchanged, and `npm run build` compiles it.
// The nightly still runs everything.

export const COPY_PATH_FILE = /^src\/.+\.(tsx|jsx|css)$|^[^/]+\.html$|^src\/.+\.html$/;
// Where wording IS the measured product output, never copy.
const NEVER_COPY = /^src\/(templates|blocks|assets)\//;

class Abort extends Error {}

// ── Prose ────────────────────────────────────────────────────────────────────

/** Selector-, path-, markup- or code-shaped. Any of these makes a string NOT prose. */
function codeish(v) {
  return (
    /[.#][A-Za-z_]/.test(v) || // `.hint`, `#id`, also "e.g." - conservative
    /[[\]{}<>=\\@$*|^~`]/.test(v) ||
    /(^|\s)\//.test(v) || // a path
    /\/\//.test(v) || // a URL
    /(^|\s)--?[a-z]/.test(v) // a flag or a custom property
  );
}

/** Words a person reads: two words, a capital or sentence punctuation, nothing code-shaped. */
export function isProse(v) {
  return /\p{L}{2,}\s+\S*\p{L}/u.test(v) && /[\p{Lu}.,!?;:'’"…()]/u.test(v) && !codeish(v);
}

const INTRINSIC_COPY_ATTRS = new Set([
  'title', 'alt', 'placeholder', 'label',
  'aria-label', 'aria-description', 'aria-placeholder', 'aria-roledescription', 'aria-valuetext',
]);
const NON_COPY_PROP =
  /^(className|class|style|id|key|ref|href|src|type|role|name|value|defaultValue|accept|htmlFor|to|path|url|kind|mode|variant|testId|testid|idPrefix|lang|dir|pattern|autoComplete|inputMode)$|^data-|^on[A-Z]|(Id|Key|Url|Href|Src|Class|ClassName|Path|Kind|Mode|Type)$/;

function attrIsCopy(attr, element) {
  if (!element || !/^[A-Z]/.test(element)) return INTRINSIC_COPY_ATTRS.has(attr);
  return !NON_COPY_PROP.test(attr); // a component prop
}

// ── The script scanner (TSX / JSX) ───────────────────────────────────────────

const PUNCT = [
  '>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=',
  '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=',
  '&=', '|=', '^=', '**', '<<', '>>',
];
const EXPR_KEYWORDS = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'yield', 'await', 'instanceof']);
const IDENT = /[\p{L}\p{N}_$]/u;

/** May an expression start after this token? Decides regex-vs-divide and JSX-vs-less-than. */
function exprMayStart(prev, before) {
  if (!prev) return true;
  if (prev.t !== 'code') return false;
  const v = prev.v;
  if (v === ')' || v === ']') return false;
  if (IDENT.test(v[0])) return EXPR_KEYWORDS.has(v);
  // `value! / 2`: a TypeScript non-null assertion ends an operand.
  if (v === '!' && before?.t === 'code' && (before.v === ')' || before.v === ']' || (IDENT.test(before.v[0]) && !EXPR_KEYWORDS.has(before.v)))) return false;
  return true;
}

/**
 * Tokenise a TSX/JSX source into code tokens, strings, template pieces, JSX structure and JSX text.
 * Comments and whitespace are dropped. Throws `Abort` on anything it cannot follow.
 */
export function scanScript(src) {
  const out = [];
  const frames = [{ type: 'code', depth: [], closer: null }];
  let i = 0;
  const n = src.length;
  const lastSig = () => out[out.length - 1];
  const beforeLast = () => out[out.length - 2];
  const emit = (tok) => out.push(tok);
  const top = () => frames[frames.length - 1];

  function readQuoted(q, escapes) {
    let v = '';
    i++;
    for (;;) {
      if (i >= n) throw new Abort('unterminated string');
      const c = src[i];
      if (c === q) { i++; return v; }
      if (escapes && c === '\\') { v += src.slice(i, i + 2); i += 2; continue; }
      if (escapes && c === '\n') throw new Abort('newline in string');
      v += c;
      i++;
    }
  }

  function readName() {
    const start = i;
    while (i < n && /[\p{L}\p{N}_$:.-]/u.test(src[i])) i++;
    if (i === start) throw new Abort('expected a name');
    return src.slice(start, i);
  }

  function openJsx() {
    i++; // '<'
    if (src[i] === '>') {
      i++;
      emit({ t: 'jsxopen', name: '' });
      emit({ t: 'jsxopenend', self: false });
      frames.push({ type: 'jsx', name: '', phase: 'children' });
      return;
    }
    const name = readName();
    emit({ t: 'jsxopen', name });
    frames.push({ type: 'jsx', name, phase: 'tag' });
  }

  function skipWs() {
    while (i < n && /\s/.test(src[i])) i++;
  }

  try {
    scan();
  } catch (error) {
    if (error instanceof Abort) error.message += ` (line ${src.slice(0, i).split('\n').length})`;
    throw error;
  }
  return out;

  function scan() {
  while (i < n) {
    const f = top();
    const c = src[i];

    if (f.type === 'tpl') {
      let chunk = '';
      for (;;) {
        if (i >= n) throw new Abort('unterminated template');
        const d = src[i];
        if (d === '\\') { chunk += src.slice(i, i + 2); i += 2; continue; }
        if (d === '`') { emit({ t: 'chunk', v: chunk }); emit({ t: 'tplend' }); frames.pop(); i++; break; }
        if (d === '$' && src[i + 1] === '{') {
          emit({ t: 'chunk', v: chunk });
          emit({ t: 'code', v: '${' });
          frames.push({ type: 'code', depth: [], closer: 'tpl' });
          i += 2;
          break;
        }
        chunk += d;
        i++;
      }
      continue;
    }

    if (f.type === 'jsx' && f.phase === 'tag') {
      if (/\s/.test(c)) { i++; continue; }
      if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') {
        const end = src.indexOf('*/', i + 2);
        if (end < 0) throw new Abort('unterminated comment');
        i = end + 2;
        continue;
      }
      if (c === '/' && src[i + 1] === '>') { emit({ t: 'jsxopenend', self: true }); frames.pop(); i += 2; continue; }
      if (c === '>') { emit({ t: 'jsxopenend', self: false }); f.phase = 'children'; i++; continue; }
      if (c === '{') { emit({ t: 'code', v: '{' }); frames.push({ type: 'code', depth: [], closer: 'jsx' }); i++; continue; }
      if (/[\p{L}_$]/u.test(c)) {
        const name = readName();
        emit({ t: 'jsxattr', name, el: f.name });
        skipWs();
        if (src[i] !== '=') continue;
        i++;
        skipWs();
        if (src[i] === '"' || src[i] === "'") {
          emit({ t: 'str', v: readQuoted(src[i], false), attr: name, el: f.name });
        } else if (src[i] === '{') {
          emit({ t: 'code', v: '{' });
          frames.push({ type: 'code', depth: [], closer: 'jsx' });
          i++;
        } else throw new Abort('unexpected attribute value');
        continue;
      }
      throw new Abort(`unexpected ${c} in a tag`);
    }

    if (f.type === 'jsx') {
      if (c === '<' && src[i + 1] === '/') {
        i += 2;
        skipWs();
        const name = src[i] === '>' ? '' : readName();
        skipWs();
        if (src[i] !== '>' || name !== f.name) throw new Abort(`closing ${name} does not match ${f.name}`);
        i++;
        emit({ t: 'jsxclose', name });
        frames.pop();
        continue;
      }
      if (c === '<') { openJsx(); continue; }
      if (c === '{') {
        // A container holding only a string, or only a comment, is TEXT: `{' '}`, `{'—'}`.
        let j = i + 1;
        const ws = () => { while (j < n && /\s/.test(src[j])) j++; };
        ws();
        if (src.startsWith('/*', j)) {
          const end = src.indexOf('*/', j + 2);
          if (end < 0) throw new Abort('unterminated comment');
          j = end + 2;
          ws();
          if (src[j] === '}') { i = j + 1; continue; }
        } else if (src[j] === '}') {
          i = j + 1;
          continue;
        } else if (src[j] === '"' || src[j] === "'") {
          const save = i;
          i = j;
          const v = readQuoted(src[j], true);
          j = i;
          ws();
          if (src[j] === '}') { emit({ t: 'jsxtext', v }); i = j + 1; continue; }
          i = save;
        }
        emit({ t: 'code', v: '{' });
        frames.push({ type: 'code', depth: [], closer: 'jsx' });
        i++;
        continue;
      }
      const start = i;
      while (i < n && src[i] !== '<' && src[i] !== '{') i++;
      emit({ t: 'jsxtext', v: src.slice(start, i) });
      continue;
    }

    // code
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) throw new Abort('unterminated comment');
      i = end + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const enc = f.depth.length ? f.depth[f.depth.length - 1] : f.closer;
      emit({ t: 'str', v: readQuoted(c, true), enc });
      continue;
    }
    if (c === '`') { emit({ t: 'tplstart' }); frames.push({ type: 'tpl' }); i++; continue; }
    if (c === '{' || c === '(' || c === '[') { f.depth.push(c); emit({ t: 'code', v: c }); i++; continue; }
    if (c === '}' || c === ')' || c === ']') {
      if (f.depth.length === 0) {
        if (c !== '}' || !f.closer) throw new Abort(`unbalanced ${c}`);
        emit({ t: 'code', v: '}' });
        frames.pop();
        i++;
        continue;
      }
      const open = f.depth.pop();
      if ({ '}': '{', ')': '(', ']': '[' }[c] !== open) throw new Abort(`mismatched ${c}`);
      emit({ t: 'code', v: c });
      i++;
      continue;
    }
    if (c === '<' && exprMayStart(lastSig(), beforeLast()) && /[\p{L}_$>]/u.test(src[i + 1] ?? '')) {
      // `<T,>(x) => ...` and `<T extends U>` are generics, not elements.
      const m = /^<[\p{L}_$][\p{L}\p{N}_$]*\s*(,|extends\b)/u.exec(src.slice(i, i + 80));
      if (!m) { openJsx(); continue; }
    }
    if (c === '/' && exprMayStart(lastSig(), beforeLast())) {
      // A regex literal: to the closing slash outside a class, on one line.
      let j = i + 1;
      let inClass = false;
      for (;;) {
        if (j >= n || src[j] === '\n') throw new Abort('unterminated regex');
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        else if (src[j] === '/' && !inClass) break;
        j++;
      }
      j++;
      while (j < n && /[a-z]/.test(src[j])) j++;
      emit({ t: 'code', v: src.slice(i, j) });
      i = j;
      continue;
    }
    if (IDENT.test(c)) {
      const start = i;
      if (/[0-9]/.test(c)) while (i < n && /[\w.]/.test(src[i])) i++;
      else while (i < n && IDENT.test(src[i])) i++;
      emit({ t: 'code', v: src.slice(start, i) });
      continue;
    }
    const p = PUNCT.find((s) => src.startsWith(s, i)) ?? c;
    emit({ t: 'code', v: p });
    i += p.length;
  }
  if (frames.length !== 1 || frames[0].depth.length !== 0) throw new Abort('unbalanced at end of file');
  }
}

const PROSE_PREV = new Set([':', '?', '+', '=', 'return', '=>', '||', '??', '&&']);
const NOT_PROSE_NEXT = new Set(['.', '?.', '[', '(', '===', '!==', '==', '!=', 'in', 'instanceof', '<', '>', '<=', '>=']);
const TEXT_TAGS = new Set(['p', 'span', 'strong', 'b', 'em', 'i', 'small', 'br', 'code', 'kbd', 'abbr', 'sup', 'sub', 'mark', 'q', 'cite', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

/** Is the string at `k` a value position a reader sees, rather than a key, a comparison or a call? */
function proseSlot(toks, k, prevIndex, nextIndex) {
  const prev = toks[prevIndex];
  const next = toks[nextIndex];
  if (next && next.t === 'code' && NOT_PROSE_NEXT.has(next.v)) return false;
  if (!prev || prev.t !== 'code') return false;
  if (PROSE_PREV.has(prev.v)) return true;
  return (prev.v === ',' || prev.v === '[') && toks[k].enc === '[';
}

/** The index of the matching end of the JSX element opened at `a` (its jsxclose, or its self-closing jsxopenend). */
function elementEnd(toks, a) {
  let depth = 0;
  for (let k = a; k < toks.length; k++) {
    const t = toks[k];
    if (t.t === 'jsxopen') depth++;
    else if (t.t === 'jsxopenend' && t.self) { depth--; if (depth === 0) return k; }
    else if (t.t === 'jsxclose') { depth--; if (depth === 0) return k; }
  }
  throw new Abort('element never closes');
}

/** A `style={{ marginTop: 6, margin: '0 0 6px' }}` - keys and literals only, no variables. */
function staticStyle(toks, from, to) {
  for (let k = from; k <= to; k++) {
    const t = toks[k];
    if (t.t === 'str') continue;
    if (t.t !== 'code') return false;
    if (/^[{},:-]$/.test(t.v) || /^[0-9.]+$/.test(t.v)) continue;
    if (IDENT.test(t.v[0]) && toks[k + 1]?.t === 'code' && toks[k + 1].v === ':') continue; // a key
    return false;
  }
  return true;
}

/**
 * The token ranges of STATIC TEXT ELEMENTS: an intrinsic text tag whose attributes are a plain
 * className, a literal style or prose copy attributes, and whose children are text or more of the
 * same. Removing or adding one changes words, not behaviour.
 */
function staticElements(toks) {
  const ranges = [];
  const isStatic = (a) => {
    const open = toks[a];
    if (open.t !== 'jsxopen' || !TEXT_TAGS.has(open.name)) return -1;
    const end = elementEnd(toks, a);
    let k = a + 1;
    // attributes
    while (toks[k].t !== 'jsxopenend') {
      const t = toks[k];
      if (t.t !== 'jsxattr') return -1;
      const val = toks[k + 1];
      if (t.name === 'className' && val?.t === 'str') { k += 2; continue; }
      if (val?.t === 'str' && attrIsCopy(t.name, open.name) && isProse(val.v)) { k += 2; continue; }
      if (t.name === 'style' && val?.t === 'code' && val.v === '{') {
        // { { ... } } - find the attribute's closing brace
        let depth = 0;
        let m = k + 1;
        for (; m < toks.length; m++) {
          if (toks[m].t === 'code' && (toks[m].v === '{')) depth++;
          if (toks[m].t === 'code' && (toks[m].v === '}')) { depth--; if (depth === 0) break; }
        }
        if (!staticStyle(toks, k + 2, m - 1)) return -1;
        k = m + 1;
        continue;
      }
      return -1;
    }
    if (toks[k].self) return end;
    k++;
    while (k < end) {
      const t = toks[k];
      if (t.t === 'jsxtext') { k++; continue; }
      if (t.t === 'jsxopen') {
        const inner = isStatic(k);
        if (inner < 0) return -1;
        k = inner + 1;
        continue;
      }
      return -1;
    }
    return end;
  };
  for (let a = 0; a < toks.length; a++) {
    if (toks[a].t !== 'jsxopen') continue;
    const end = isStatic(a);
    if (end >= 0) { ranges.push([a, end]); a = end; }
  }
  return ranges;
}

const norm = (s) => s.replace(/\s+/g, ' ').trim();

/**
 * The SKELETON of a script - every token that can change behaviour, with wording set aside - and
 * the wording itself. Two versions with equal skeletons differ only in their words.
 *
 * @returns {{ skeleton: string, words: string[] }}
 */
export function scriptSkeleton(src) {
  const toks = scanScript(src);
  const drop = new Array(toks.length).fill(false);
  const words = [];
  const skel = [];

  // Each static element leaves the skeleton, but its SHAPE - tags, classes, style - is kept in
  // order beside it, so a changed class on a hint that stays is still a change (see `sameShapes`).
  const shapes = [];
  for (const [a, b] of staticElements(toks)) {
    // The element's text reads as ONE string, the way the page shows it: `You get <b>real</b>,
    // editable code` is asserted as "real, editable code", never as three pieces.
    let text = '';
    const shape = [];
    for (let k = a; k <= b; k++) {
      drop[k] = true;
      const t = toks[k];
      if (t.t === 'jsxtext') text += t.v;
      else if (t.t === 'jsxopen') { shape.push(`<${t.name}`); if (t.name === 'br') text += ' '; }
      else if (t.t === 'jsxclose') shape.push(`</${t.name}>`);
      else if (t.t === 'jsxattr' && (t.name === 'className' || t.name === 'style')) shape.push(`@${t.name}`);
      else if (t.t === 'str' && (t.attr === 'className' || t.attr === 'style')) shape.push(JSON.stringify(t.v));
      else if (t.t === 'str' && isProse(t.v)) words.push(t.v);
      else if (t.t === 'code') shape.push(t.v);
    }
    words.push(text);
    shapes.push(shape.join(' '));
  }

  const prevKept = (k) => { let j = k - 1; while (j >= 0 && drop[j]) j--; return j; };
  const nextKept = (k) => { let j = k + 1; while (j < toks.length && drop[j]) j++; return j; };

  // A template literal is prose or not AS A WHOLE: its own static chunks (not those of a template
  // nested in a substitution) read as words, and it stands where a value a reader sees goes.
  const chunkIsProse = new Map();
  {
    const stack = [];
    toks.forEach((t, k) => {
      if (t.t === 'tplstart') stack.push({ start: k, chunks: [] });
      else if (t.t === 'chunk') stack[stack.length - 1].chunks.push(k);
      else if (t.t === 'tplend') {
        const { start, chunks } = stack.pop();
        const prose = isProse(chunks.map((c) => toks[c].v).join(' ')) && proseSlot(toks, start, prevKept(start), nextKept(k));
        for (const c of chunks) chunkIsProse.set(c, prose);
      }
    });
  }

  for (let k = 0; k < toks.length; k++) {
    if (drop[k]) continue;
    const t = toks[k];
    switch (t.t) {
      case 'jsxtext':
        words.push(t.v);
        break;
      case 'jsxattr': {
        const val = toks[k + 1];
        if (val?.t === 'str' && attrIsCopy(t.name, t.el) && isProse(val.v)) {
          words.push(val.v);
          k++; // the attribute and its value leave the skeleton together
          break;
        }
        skel.push(`@${t.name}`);
        break;
      }
      case 'str':
        if (t.attr === undefined && isProse(t.v) && proseSlot(toks, k, prevKept(k), nextKept(k))) {
          words.push(t.v);
          skel.push('\u2026');
        } else skel.push(JSON.stringify(t.v));
        break;
      case 'tplstart':
      case 'tplend':
        skel.push('`');
        break;
      case 'chunk':
        if (chunkIsProse.get(k)) {
          words.push(t.v);
          skel.push('\u2026');
        } else skel.push(JSON.stringify(t.v));
        break;
      case 'jsxopen':
        skel.push(`<${t.name}`);
        break;
      case 'jsxopenend':
        skel.push(t.self ? '/>' : '>');
        break;
      case 'jsxclose':
        skel.push(`</${t.name}>`);
        break;
      default:
        skel.push(t.v);
    }
  }

  // A sentence split over a concatenation is still one sentence: `'a ' + 'b'` reads as `'a b'`.
  const collapsed = [];
  for (const s of skel) {
    const len = collapsed.length;
    if (s === '\u2026' && len >= 2 && collapsed[len - 1] === '+' && collapsed[len - 2] === '\u2026') collapsed.pop();
    else collapsed.push(s);
  }
  return { skeleton: collapsed.join('\u0001'), shapes, words: words.map(norm).filter((w) => /\p{L}/u.test(w)) };
}

/** `small` in order inside `big`. */
function isSubsequence(small, big) {
  let i = 0;
  for (const x of big) if (i < small.length && small[i] === x) i++;
  return i === small.length;
}

/**
 * Static text elements were only REMOVED, or only ADDED - never reshaped. Removing a hint and
 * adding one are both wording; one hint losing a class while another appears is not something
 * this can tell apart from restyling, so it is not wording.
 */
function sameShapes(before, after) {
  return isSubsequence(after, before) || isSubsequence(before, after);
}

// ── HTML ─────────────────────────────────────────────────────────────────────

const HTML_INLINE = new Set(['b', 'strong', 'em', 'i', 'small', 'br', 'code', 'kbd', 'abbr', 'sup', 'sub', 'mark']);
const HTML_COPY_ATTRS = new Set(['title', 'alt', 'placeholder', 'aria-label', 'aria-description']);

/** The skeleton of an HTML page: tags and attributes verbatim except words, inline formatting and prose labels. */
export function htmlSkeleton(src) {
  const skel = [];
  const words = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4);
      if (end < 0) throw new Abort('unterminated comment');
      i = end + 3;
      continue;
    }
    if (src[i] === '<' && /[A-Za-z/!]/.test(src[i + 1] ?? '')) {
      const end = src.indexOf('>', i);
      if (end < 0) throw new Abort('unterminated tag');
      const raw = src.slice(i + 1, end);
      i = end + 1;
      const m = /^(\/?)([A-Za-z][\w-]*)/.exec(raw);
      if (!m) { skel.push(raw); continue; } // a doctype
      const [, closing, tagRaw] = m;
      const tag = tagRaw.toLowerCase();
      const attrs = [];
      let allClass = true;
      for (const a of raw.slice(m[0].length).matchAll(/([^\s=/]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|[^\s>]+))?/g)) {
        const name = a[1].toLowerCase();
        const value = a[3] ?? a[4] ?? a[2] ?? null;
        if (name !== 'class') allClass = false;
        const copy = (HTML_COPY_ATTRS.has(name) || (tag === 'meta' && name === 'content')) && value !== null && isProse(value);
        if (copy) words.push(value);
        else attrs.push(`${name}=${value ?? ''}`);
      }
      if (HTML_INLINE.has(tag) && allClass) continue; // inline formatting is wording
      skel.push(`<${closing}${tag} ${attrs.join(' ')}>`);
      if (!closing && (tag === 'script' || tag === 'style')) {
        const close = src.toLowerCase().indexOf(`</${tag}`, i);
        if (close < 0) throw new Abort(`unterminated ${tag}`);
        skel.push(src.slice(i, close));
        i = close;
      }
      continue;
    }
    const start = i;
    i++;
    while (i < n && !(src[i] === '<' && /[A-Za-z/!]/.test(src[i + 1] ?? ''))) i++;
    words.push(src.slice(start, i));
  }
  return { skeleton: skel.join('\u0001'), words: words.map(norm).filter((w) => /\p{L}/u.test(w)) };
}

// ── CSS ──────────────────────────────────────────────────────────────────────

const BEHAVIOUR_PROPS = /^(display|visibility|pointer-events|position|z-index|content|content-visibility|opacity|overflow(-x|-y)?|transform|translate|rotate|scale|inset(-.+)?|top|right|bottom|left|float|clip|clip-path|mask(-.+)?|user-select|touch-action|appearance|all|animation(-.+)?|transition(-.+)?|order|contain)$/;
const GROUP_AT = /^@(media|supports|container|layer)\b/;

/**
 * The rules of a stylesheet, in order: each style rule's selector chain (group at-rules included)
 * and its own declarations. A block this cannot read as either is an abort.
 */
export function cssRules(src) {
  const text = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  const chain = [];
  const declStack = [];
  let buf = '';
  const flushDecl = () => {
    const d = buf.trim();
    buf = '';
    if (!d) return;
    if (chain.length === 0) { rules.push({ chain: [`@stmt ${d}`], decls: [] }); return; }
    const colon = d.indexOf(':');
    if (colon < 0) throw new Abort(`not a declaration: ${d}`);
    declStack[declStack.length - 1].push(`${d.slice(0, colon).trim().toLowerCase()}:${norm(d.slice(colon + 1))}`);
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'") {
      const end = text.indexOf(c, i + 1);
      if (end < 0) throw new Abort('unterminated string');
      buf += text.slice(i, end + 1);
      i = end;
      continue;
    }
    if (c === '{') {
      const prelude = norm(buf);
      buf = '';
      if (!prelude) throw new Abort('a block with no prelude');
      if (prelude.startsWith('@') && !GROUP_AT.test(prelude)) {
        // @keyframes, @font-face, @property, @page: kept whole, never copy.
        let depth = 1;
        let j = i + 1;
        for (; j < text.length && depth > 0; j++) {
          if (text[j] === '{') depth++;
          else if (text[j] === '}') depth--;
        }
        if (depth !== 0) throw new Abort('unterminated at-rule');
        rules.push({ chain: [...chain, prelude], decls: [norm(text.slice(i + 1, j - 1))], atRule: true });
        i = j - 1;
        continue;
      }
      chain.push(prelude);
      const decls = [];
      declStack.push(decls);
      rules.push({ chain: [...chain], decls });
      continue;
    }
    if (c === ';') { flushDecl(); continue; }
    if (c === '}') {
      flushDecl();
      if (chain.length === 0) throw new Abort('unbalanced }');
      chain.pop();
      declStack.pop();
      continue;
    }
    buf += c;
  }
  if (chain.length !== 0 || buf.trim()) throw new Abort('unbalanced at end of file');
  return rules.filter((r) => !GROUP_AT.test(r.chain[r.chain.length - 1]) || r.decls.length > 0);
}

/** The class names in a selector chain. */
function classesOf(chain) {
  return [...new Set(chain.flatMap((p) => [...p.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map((m) => m[1])))];
}

/** Every comma-separated selector of every style prelude carries a class (or nests under one). */
function classAnchored(chain) {
  return chain
    .filter((p) => !GROUP_AT.test(p))
    .every((p) => p.split(',').every((s) => /\.[A-Za-z_-]/.test(s) || /^\s*&/.test(s)));
}

/**
 * A stylesheet edit that only restyles classed elements: the class names it touches, or null when
 * the edit could change what is shown or reachable (see BEHAVIOUR_PROPS) or reaches unclassed
 * elements, custom properties, or at-rules.
 */
export function cssEditClasses(oldSrc, newSrc) {
  const before = cssRules(oldSrc);
  const after = cssRules(newSrc);
  const keyed = (rules) => {
    const seen = new Map();
    return rules.map((r) => {
      const base = r.chain.join(' >> ');
      const nth = seen.get(base) ?? 0;
      seen.set(base, nth + 1);
      return { key: `${base} #${nth}`, rule: r };
    });
  };
  const a = keyed(before);
  const b = keyed(after);
  const aMap = new Map(a.map((x) => [x.key, x.rule]));
  const bMap = new Map(b.map((x) => [x.key, x.rule]));
  // The cascade is order: the rules both sides share must keep their order.
  const commonA = a.filter((x) => bMap.has(x.key)).map((x) => x.key);
  const commonB = b.filter((x) => aMap.has(x.key)).map((x) => x.key);
  if (commonA.join('\n') !== commonB.join('\n')) return null;

  const classes = new Set();
  for (const key of new Set([...aMap.keys(), ...bMap.keys()])) {
    const ra = aMap.get(key);
    const rb = bMap.get(key);
    const da = ra?.decls ?? [];
    const db = rb?.decls ?? [];
    const changed = [...da.filter((d) => !db.includes(d)), ...db.filter((d) => !da.includes(d))];
    if (changed.length === 0 && ra && rb) continue;
    const rule = ra ?? rb;
    if (rule.atRule || rule.chain[0].startsWith('@stmt')) return null;
    if (!classAnchored(rule.chain)) return null;
    for (const d of changed) {
      const prop = d.slice(0, d.indexOf(':'));
      if (prop.startsWith('--') || BEHAVIOUR_PROPS.test(prop)) return null;
    }
    for (const c of classesOf(rule.chain)) classes.add(c);
  }
  return [...classes];
}

// ── The classification ───────────────────────────────────────────────────────

function multisetDiff(a, b) {
  const count = new Map();
  for (const w of a) count.set(w, (count.get(w) ?? 0) + 1);
  for (const w of b) count.set(w, (count.get(w) ?? 0) - 1);
  return [...count].filter(([, c]) => c !== 0).map(([w]) => w);
}

/**
 * WHAT ONE FILE'S EDIT IS: `{ kind: 'text', terms }` for wording, `{ kind: 'class', terms }` for a
 * class-only restyle, or `null` - the normal plan - for anything else, including a file that is
 * new, deleted, outside the copy path, or that a scanner could not follow.
 *
 * @param {string} file repo-relative path, forward slashes
 * @param {string|null} oldText the file at the diff base
 * @param {string|null} newText the file now
 * @returns {{ kind: 'text'|'class', terms: string[] } | null}
 */
export function copyEdit(file, oldText, newText) {
  if (oldText === null || newText === null || oldText === newText) return null;
  if (!COPY_PATH_FILE.test(file) || NEVER_COPY.test(file)) return null;
  try {
    if (file.endsWith('.css')) {
      const terms = cssEditClasses(oldText, newText);
      return terms ? { kind: 'class', terms } : null;
    }
    const read = file.endsWith('.html') ? htmlSkeleton : scriptSkeleton;
    const before = read(oldText);
    const after = read(newText);
    if (before.skeleton !== after.skeleton) return null;
    if (before.shapes && !sameShapes(before.shapes, after.shapes)) return null;
    return { kind: 'text', terms: multisetDiff(before.words, after.words) };
  } catch (error) {
    if (error instanceof Abort) return null;
    throw error;
  }
}

// ── Which specs name what changed ────────────────────────────────────────────

/**
 * The wording a spec reads: its string literals and the literal runs of its regexes, normalised.
 * Over-inclusive by design - a comment-like literal that matches only costs a spec run.
 */
export function specPhrases(text) {
  const out = new Set();
  const add = (s) => {
    const v = norm(s.replace(/\\[sS]\+?\*?/g, ' ').replace(/\\(.)/g, '$1'));
    if (v.length >= 4 && /\p{L}/u.test(v)) out.add(v.toLowerCase());
  };
  for (const m of text.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
    const body = m[1] ?? m[2] ?? m[3] ?? '';
    for (const part of body.split(/\$\{[^}]*\}/)) add(part);
  }
  for (const m of text.matchAll(/[(,:=[!&|]\s*\/((?:[^/\\\n[]|\\.|\[(?:[^\]\\\n]|\\.)*\])+)\/[a-z]*/g)) {
    for (const part of m[1].replace(/\\[sS][+*?]?/g, ' ').split(/(?<!\\)[\^$*+?()[\]{}|]/)) add(part);
  }
  return out;
}

const WORDY = /[\p{L}\p{N}]/u;
/** `needle` inside `hay`, case-insensitively, not as part of a longer word. */
function containsPhrase(hay, needle) {
  if (needle.length < 4) return false;
  let from = 0;
  for (;;) {
    const at = hay.indexOf(needle, from);
    if (at < 0) return false;
    const before = hay[at - 1];
    const after = hay[at + needle.length];
    const okBefore = !before || !WORDY.test(needle[0]) || !WORDY.test(before);
    const okAfter = !after || !WORDY.test(needle[needle.length - 1]) || !WORDY.test(after);
    if (okBefore && okAfter) return true;
    from = at + 1;
  }
}

/**
 * The specs that name a copy edit's terms: for wording, a spec phrase inside a term or a term
 * inside a spec phrase; for a class, the class name anywhere in the spec as a whole name.
 *
 * @param {{ kind: 'text'|'class', terms: string[] }} edit
 * @param {Map<string, string>} specTexts planner spec name -> source
 * @returns {string[]}
 */
export function specsNaming(edit, specTexts) {
  const hits = [];
  if (edit.terms.length === 0) return hits;
  for (const [spec, text] of specTexts) {
    if (edit.kind === 'class') {
      if (edit.terms.some((c) => new RegExp(`(^|[^\\w-])${c.replace(/[-]/g, '\\-')}($|[^\\w-])`).test(text))) hits.push(spec);
      continue;
    }
    const terms = edit.terms.map((t) => t.toLowerCase());
    for (const p of specPhrases(text)) {
      if (terms.some((t) => phraseMeets(p, t))) { hits.push(spec); break; }
    }
  }
  return hits;
}

/**
 * Does a spec phrase read this wording? Equal, or one inside the other - but only a DISTINCTIVE
 * phrase counts inside another: two words or more and eight letters or more. `'image'`, `'on air'`
 * or `', then'` in a spec does not read every sentence that happens to contain it, while
 * `'Rows here are CONTENT'` does read the paragraph that starts with it.
 */
export function phraseMeets(phrase, term) {
  if (phrase === term) return true;
  return (distinctive(phrase) && containsPhrase(term, phrase)) || (distinctive(term) && containsPhrase(phrase, term));
}

function distinctive(s) {
  const words = s.match(/\p{L}+/gu) ?? [];
  return words.length >= 2 && words.join('').length >= 8;
}
