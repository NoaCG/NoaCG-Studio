// REIMPORT: changed artwork imported over a saved graphic keeps the work made on the earlier one
// (docs/work-specs/jev-svg-import/spec.md, "Reimport", AC-15; phase notes evidence/phase-27.md).
//
// A field id is POSITIONAL at build (`f${i}`, svgBind.ts), so one text layer added in front of a
// picture or a behaviour field moves every id after it, and a production binding, a cue value or a
// control entry addressed by id would then drive a different layer. This module matches the
// earlier graphic's layers to the new build, gives every verified match back its earlier id, and
// carries the keys and labels made after the import. What it cannot verify it NAMES, and the
// caller keeps the earlier graphic rather than writing over it.
//
// Pure: templates and animation data in, templates and animation data out. The canonical
// animation serializer and the artwork identity patch live in blocks/, and this folder adds no
// new import from blocks/ (the `templates/add-imports-sanctioned-animation-data-importer` rule),
// so components/wizard/import/draft.ts `svgReimported` is the glue.

import type { SpxField, SpxTemplate } from '../../model/types';
import type { AnimData, AnimStep } from '../../blocks/animData';
import { replaceDefinitionInHtml } from '../../model/spxDefinition';
import { PREFIX } from './shared';

/** One piece of earlier work this reimport cannot carry on its own. `label` is what the reader
 *  recognises: a field's title or a keyed layer's selector. */
export interface ReimportItem {
  kind: 'removed' | 'ambiguous' | 'key';
  label: string;
}

const FIELD_ID = /^f\d+$/;
/** Ids and stamps the build or the editor writes, never the designer: the source key skips them. */
const OUR_ATTR = /^(?:id|data-noacg-[\w-]*|data-count|data-start)$/;

/** The inlined artwork of a built SVG import, or null for anything else. */
export function artOf(doc: Document): Element | null {
  const arts = doc.querySelectorAll(`svg.${PREFIX}-art`);
  return arts.length === 1 ? arts[0] : null;
}

export function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

/** A designer's id, as the build may have moved it: `layer-` is the build's collision prefix,
 *  and a bound field id or an editor-minted identity names nothing the designer drew. */
function designerId(el: Element): string | null {
  const id = el.getAttribute('id');
  if (!id || FIELD_ID.test(id) || /^artwork-\d+$/.test(id)) return null;
  return id.replace(/^layer-/, '');
}

/**
 * THE SOURCE KEY of one drawn layer: its tag, the designer-named groups it sits in, and every
 * attribute the designer exported on it. Never its words (a sample is content and changes) and
 * never its id (the build replaced it). Two builds of the same layer give the same key; a layer
 * the designer moved, restyled or regrouped gives a different one, and is then unresolved rather
 * than guessed. Exact equality only - no similarity score, no fallback.
 */
export function sourceKey(el: Element, art: Element): string {
  const groups: string[] = [];
  for (let up = el.parentElement; up && up !== art; up = up.parentElement) {
    const id = designerId(up);
    if (id) groups.unshift(id);
  }
  const attrs = Array.from(el.attributes)
    .filter((a) => !OUR_ATTR.test(a.name))
    .map((a) => {
      const name = a.name === 'xlink:href' ? 'href' : a.name;
      const value = name === 'class'
        ? a.value.split(/\s+/).filter((c) => c && !c.startsWith(`${PREFIX}-`)).join(' ')
        : a.value;
      return `${name}=${value}`;
    })
    .filter((pair) => pair !== 'class=')
    .sort();
  return [el.tagName.toLowerCase(), groups.join('/'), ...attrs].join('|');
}

/** Each field's key: a drawn field by its layer, a data holder (a behaviour's hidden field, a
 *  clock or credits holder) by its kind and title, which its recipe declares. */
function fieldKeys(template: SpxTemplate, titleOf: (f: SpxField) => string): Map<string, string> {
  const doc = parseHtml(template.html);
  const art = artOf(doc);
  const out = new Map<string, string>();
  for (const f of template.fields) {
    const el = doc.getElementById(f.field);
    out.set(f.field, el && art?.contains(el) ? sourceKey(el, art) : `holder|${f.ftype}|${titleOf(f)}`);
  }
  return out;
}

function counts(keys: Iterable<string>): Map<string, number> {
  const n = new Map<string, number>();
  for (const k of keys) n.set(k, (n.get(k) ?? 0) + 1);
  return n;
}

/** How often each key occurs among a template's fields AND every drawn layer of its artwork: an
 *  unbound twin of a bound layer makes that layer ambiguous too (R2). A field's own node is
 *  counted once. */
function keyCounts(template: SpxTemplate, keys: Map<string, string>): Map<string, number> {
  const doc = parseHtml(template.html);
  const art = artOf(doc);
  const drawn = art ? Array.from(art.querySelectorAll('*')).map((el) => sourceKey(el, art)) : [];
  const holders = [...keys.values()].filter((k) => k.startsWith('holder|'));
  return counts([...drawn, ...holders]);
}

export interface ReimportMatch {
  /** Built field id -> the id it takes: its earlier id for a match, a fresh one where the
   *  earlier graphic used that id for something else. Ids absent here keep their own. */
  rename: Map<string, string>;
  /** Earlier field id -> built field id, the verified matches. */
  matched: Map<string, string>;
  /** Earlier field ids with no verified match (removed or ambiguous). */
  gone: string[];
  unresolved: ReimportItem[];
}

/**
 * Match the earlier graphic's fields to the new build's. A match is VERIFIED when the key occurs
 * exactly once on each side. An earlier field whose key is missing is `removed`; one whose key
 * repeats on either side is `ambiguous` (two look-alike layers, phase 6's S4). Added fields are
 * fine: they simply take ids the earlier graphic never used, so nothing addressed to a removed
 * field can land on them.
 */
export function matchReimport(prior: SpxTemplate, priorBaseline: SpxTemplate | undefined, built: SpxTemplate): ReimportMatch {
  // A holder's title is matched as the import made it, before any later relabel.
  const firstTitle = new Map((priorBaseline?.fields ?? []).map((f) => [f.field, f.title]));
  const before = fieldKeys(prior, (f) => firstTitle.get(f.field) ?? f.title);
  const after = fieldKeys(built, (f) => f.title);
  const nBefore = keyCounts(prior, before);
  const nAfter = keyCounts(built, after);
  const byKey = new Map([...after].map(([id, k]) => [k, id]));
  const matched = new Map<string, string>();
  const gone: string[] = [];
  const unresolved: ReimportItem[] = [];
  for (const f of prior.fields) {
    const k = before.get(f.field)!;
    const n = nAfter.get(k) ?? 0;
    // The match must also be one of the new build's FIELDS: a layer the new walk left unbound is
    // not where the earlier field went.
    if (n === 1 && nBefore.get(k) === 1 && byKey.has(k)) {
      matched.set(f.field, byKey.get(k)!);
      continue;
    }
    gone.push(f.field);
    unresolved.push({ kind: n === 0 || (n === 1 && !byKey.has(k)) ? 'removed' : 'ambiguous', label: f.title || f.field });
  }
  const rename = new Map<string, string>();
  for (const [was, now] of matched) if (was !== now) rename.set(now, was);
  // An added field keeps its own id unless the earlier graphic used it (for a match or for a
  // field now gone: nothing addressed to a removed field may land on a new one); then it takes the
  // lowest id no field and no other node holds.
  const priorIds = new Set(prior.fields.map((f) => f.field));
  const builtIds = new Set(built.fields.map((f) => f.field));
  const matchedBuilt = new Set(matched.values());
  const added = built.fields.map((f) => f.field).filter((id) => !matchedBuilt.has(id));
  const used = new Set([...priorIds, ...added.filter((id) => !priorIds.has(id))]);
  const free = (id: string) => !used.has(id) && (builtIds.has(id) || !built.html.includes(`id="${id}"`));
  let next = 0;
  for (const id of added.filter((a) => priorIds.has(a))) {
    while (!free(`f${next}`)) next++;
    rename.set(id, `f${next}`);
    used.add(`f${next}`);
  }
  return { rename, matched, gone, unresolved };
}

/**
 * Rename field ids across a built template, all at once (a swap never chains). Ids are written in
 * a fixed set of places - an id attribute, a `#ref` and the definition in the markup, the
 * stylesheet and the script (animation selectors, the layout table, the behaviour tables) - and
 * only an exact quoted or `#`-prefixed token is touched, never a word that merely contains one.
 */
export function renameFields(template: SpxTemplate, rename: Map<string, string>): SpxTemplate {
  if (rename.size === 0) return template;
  const swap = (id: string) => rename.get(id) ?? id;
  // ONE pass over each text: a quoted id and a bare `#id` are two branches of one pattern, so no
  // position is renamed twice (two passes chained `"#f1"` -> `"#f0"` -> `"#f2"` on a cycle).
  const code = (s: string) => s.replace(
    /(["'])(#?)(f\d+)\1|#(f\d+)(?![\w-])/g,
    (_, q: string | undefined, hash: string, id: string, bare: string | undefined) => (bare ? '#' + swap(bare) : q + hash + swap(id) + q),
  );
  // In the markup only the attributes that hold an id, `url(#…)` and the definition's `field`, so
  // a designer's colour such as `fill="#f12"` is never read as a field.
  const markup = (s: string) => s
    .replace(/(\s(?:id|href|xlink:href)\s*=\s*)(["'])(#?)(f\d+)\2/g, (_, a: string, q: string, hash: string, id: string) => a + q + hash + swap(id) + q)
    .replace(/url\(#(f\d+)\)/g, (_, id: string) => `url(#${swap(id)})`)
    .replace(/("field"\s*:\s*)"(f\d+)"/g, (_, a: string, id: string) => `${a}"${swap(id)}"`);
  return {
    ...template,
    html: markup(template.html),
    css: code(template.css),
    js: code(template.js),
    fields: template.fields.map((f) => ({ ...f, field: swap(f.field) })),
    layers: template.layers.map((l) => ({ ...l, id: swap(l.id), ...(l.fieldId ? { fieldId: swap(l.fieldId) } : {}) })),
  };
}

/** Every timeline in a block, keyed so the same timeline is found in another build. */
function timelines(data: AnimData): Map<string, AnimStep> {
  const out = new Map<string, AnimStep>();
  data.steps.forEach((s) => out.set(`step:${s.name}`, s));
  for (const g of data.machine?.groups ?? []) {
    for (const s of g.states) if (s.timeline) out.set(`state:${g.id}/${s.id}`, s.timeline);
  }
  return out;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Carry the KEYS made after the import: every track of the earlier graphic that differs from the
 * one its import made (the baseline) replaces the new build's track for that selector and
 * property, and a track deleted after the import stays deleted. An untouched track is the
 * import's own motion and the new walk's choice stands. A timeline the new build lacks keeps its
 * keys unresolved. Returns the selectors it wrote, so the
 * caller can check each still addresses the artwork.
 */
export function carryKeys(prior: AnimData, baseline: AnimData | null, built: AnimData): { data: AnimData; selectors: string[]; unresolved: ReimportItem[] } {
  const data = structuredClone(built);
  const into = timelines(data);
  const was = baseline ? timelines(baseline) : new Map<string, AnimStep>();
  const selectors = new Set<string>();
  const unresolved: ReimportItem[] = [];
  for (const [at, step] of timelines(prior)) {
    for (const [selector, tracks] of Object.entries(step.layers)) {
      for (const [prop, keys] of Object.entries(tracks)) {
        if (same(keys, was.get(at)?.layers[selector]?.[prop])) continue;
        const target = into.get(at);
        if (!target) {
          unresolved.push({ kind: 'key', label: `${selector} ${prop}` });
          continue;
        }
        (target.layers[selector] ??= {})[prop] = structuredClone(keys);
        selectors.add(selector);
      }
    }
  }
  // A track the reader DELETED after the import stays deleted.
  const now = timelines(prior);
  for (const [at, step] of was) {
    for (const [selector, tracks] of Object.entries(step.layers)) {
      for (const prop of Object.keys(tracks)) {
        if (now.get(at)?.layers[selector]?.[prop] !== undefined) continue;
        const target = into.get(at)?.layers[selector];
        if (target) delete target[prop];
      }
    }
  }
  return { data, selectors: [...selectors], unresolved };
}

/** A label the reader changed after the import (earlier title differs from its baseline) wins
 *  over the new walk's, on every verified match. */
export function carryTitles(template: SpxTemplate, prior: SpxTemplate, priorBaseline: SpxTemplate | undefined, matched: Map<string, string>): SpxTemplate {
  const first = new Map((priorBaseline?.fields ?? []).map((f) => [f.field, f.title]));
  const relabelled = new Map(
    prior.fields.filter((f) => matched.has(f.field) && first.has(f.field) && first.get(f.field) !== f.title).map((f) => [f.field, f.title]),
  );
  if (relabelled.size === 0) return template;
  const fields = template.fields.map((f) => (relabelled.has(f.field) ? { ...f, title: relabelled.get(f.field)! } : f));
  // The definition in the markup is the fields' source of truth, so it is rewritten with them.
  return { ...template, fields, html: replaceDefinitionInHtml(template.html, template.settings, fields) };
}
