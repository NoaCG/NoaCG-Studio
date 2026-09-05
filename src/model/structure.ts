// The structure-contract detectors + the TemplatePart registry — THE shared element-identity
// contract. Every surface that names or targets a template element (the timeline strip, the
// canvas selection layer, step assignment) goes through getTemplateParts; nothing else may
// invent element naming. The registry is DERIVED from the HTML on every call — recomputed,
// never stored — so hand edits can shrink it but never make it stale, and the code stays the
// single source of truth.

import type { SpxField } from './types';
import { isHiddenNode, svgLayerLabel } from '../assets/svgImport';

/**
 * An imported SVG's LAYERS: the top-level named `<g>`s of the inlined artwork (docs/
 * SVG_IMPORT_PLAN.md P2) — direct children only, because deeper structure is the design's
 * internals and offering every nested group would bury the layers that matter under dozens
 * of anonymous ones. Ids are the designer's own, so only a CSS-safe, document-unique one
 * becomes an identity (the single-token contract every part follows), never one shaped like
 * a field id. A group that is HIDDEN is not a layer — it is not on screen, so a timeline row or a
 * stagger slot for it would be a phantom. That covers every way a group gets hidden, and the list
 * grew twice by finding one missing: `<prefix>-outlined` (a live field replaced its outlined text)
 * and `<prefix>-removed` (the reader took that text off the artwork), which are separate
 * statements in templates/importedDesign/svg.ts; and then the designer's OWN hiding, which is how
 * every drawn moment layer arrives and is the majority of the groups in any graphic that does
 * something.
 * THE one definition: the part registry and the preset emitters both read it here.
 */
export function svgLayerElements(art: Element): Element[] {
  const doc = art.ownerDocument;
  const out: Element[] = [];
  for (const child of Array.from(art.children)) {
    if (child.tagName.toLowerCase() !== 'g') continue;
    const id = child.getAttribute('id');
    if (!id || /^f\d+$/.test(id) || !/^[A-Za-z_][\w-]*$/.test(id)) continue;
    if (doc.querySelectorAll(`#${id}`).length !== 1) continue;
    // Hidden BY THE IMPORT: a live field replaced this outlined text, or the reader took it off.
    if (/(?:^|\s)[\w-]+-(?:outlined|removed)(?:\s|$)/.test(child.getAttribute('class') ?? '')) continue;
    // Hidden BY THE DESIGNER, which is the other half of the same rule and was missing until
    // 2026-09-05. Every drawn moment layer is hidden - `docs/SVG_AUTHORING.md` §5b tells authors
    // to switch them off with the eye, and a bound behaviour then hides them by stylesheet class
    // (`<prefix>-qstate` and its siblings) instead. On the shipped quiz-board sample that is 14 of
    // 19 layers, so the per-layer stagger spent fourteen of its nineteen beats on nothing anybody
    // could see - the owner read the result, correctly, as a stagger that does not stagger.
    // `<prefix>-look` is the one pair every recipe uses since the binding table
    // (docs/SVG_BEHAVIOUR_PLAN.md §5); the `-qstate` family is what the module era emitted.
    if (/(?:^|\s)[\w-]+-(?:[a-z]+state|look)(?:\s|$)/.test(child.getAttribute('class') ?? '')) continue;
    if (isHiddenNode(child, art)) continue;
    out.push(child);
  }
  return out;
}

/** The one artwork element of a template whose design is an inlined SVG, or null. */
function svgArtOf(html: string): Element | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const prefix = boxPrefix(doc);
  if (!prefix) return null;
  const arts = doc.querySelectorAll(`.${prefix}-art`);
  const art = arts.length === 1 ? arts[0] : null;
  return art && art.tagName.toLowerCase() === 'svg' ? art : null;
}

/** The same layers as SELECTORS, read off a template's HTML — `PresetConfig.layers` for the
 *  per-layer stagger (blocks/presetRegistry emitPresetRegion and the SVG assembler both call
 *  this, so a preset re-applied after creation targets what create-time targeted). Empty for
 *  any template whose artwork is not an inlined SVG. */
export function svgLayerSelectors(html: string): string[] {
  const art = svgArtOf(html);
  return art ? svgLayerElements(art).map((g) => `#${g.getAttribute('id')}`) : [];
}

/**
 * The artwork's FIELDS as selectors, in document order — `#f0`, `#f1`, … (`PresetConfig.fields`).
 *
 * Read the same way and at the same moments as the layers above, so a preset re-applied after
 * creation targets what create-time targeted. A field HIDDEN by the import is skipped for the
 * same reason a hidden layer is: a beat spent on something nobody can see is a beat missing from
 * the cascade. A field nested inside a layer is still its own member — the layer carries the
 * plate it is drawn on, the field carries the word, and they arrive one after the other.
 */
export function svgFieldSelectors(html: string): string[] {
  const art = svgArtOf(html);
  if (!art) return [];
  const out: string[] = [];
  for (const el of Array.from(art.querySelectorAll('[id]'))) {
    const id = el.getAttribute('id') ?? '';
    if (!/^f\d+$/.test(id)) continue;
    if (art.ownerDocument.querySelectorAll(`#${id}`).length !== 1) continue;
    if (isHiddenNode(el, art)) continue;
    out.push(`#${id}`);
  }
  return out;
}

/**
 * The structure contract's spine: the token before `-box` on the first element carrying a
 * `<prefix>-box` class. Resolved against the PARSED DOM (never a raw-text match), so other
 * classes on the same element are fine (`class="lower-third-box glass"` still yields
 * `lower-third`) — the classList lookup is what makes it robust. This is the ONE definition
 * of the prefix; detectPrefix and getTemplateParts both read it here so they can never
 * disagree about whether a template is house-shaped.
 */
function boxPrefix(doc: Document): string | null {
  const box = doc.querySelector('[class*="-box"]');
  const boxClass = box ? Array.from(box.classList).find((c) => c.endsWith('-box')) : undefined;
  return boxClass ? boxClass.slice(0, -'-box'.length) : null;
}

/** The template's class prefix, or null when the HTML has no standard-contract box. Parses
 *  the HTML because the prefix is a DOM fact (a `-box` class among others on an element), not
 *  a text pattern — matching getTemplateParts exactly. */
export function detectPrefix(html: string): string | null {
  return boxPrefix(new DOMParser().parseFromString(html, 'text/html'));
}

/**
 * One addressable element of the graphic.
 *
 * `selector` is a SINGLE TOKEN by contract — `#id` or `.one-class`, never descendant,
 * compound, or attribute selectors: the animation-region parsers (blocks/timelineModel.ts)
 * strip whitespace and split target lists on commas, so anything richer cannot round-trip
 * through the emitted code.
 */
export interface TemplatePart {
  selector: string;
  kind: 'root' | 'panel' | 'accent' | 'line' | 'image' | 'block';
  /** The human name every surface shows ('Whole graphic', 'Panel', field titles, …). */
  label: string;
  /** How the element can be revealed: 'mask' = slide within its overflow-hidden line mask
   *  (only true text lines qualify); 'rise' = generic fade+rise for everything else. */
  channel: 'mask' | 'rise';
  /** True when the part belongs to an INSERTED graphic — a `data-gfx` root carrying its own
   *  structure contract (blocks/templateInsert.ts). It is a full part like any other; the
   *  flag exists so questions about THIS graphic's own shape (how many lines the design has)
   *  don't count a guest's. */
  inserted?: boolean;
}

/**
 * The structure-contract prefixes of INSERTED graphics: a `data-gfx` root carrying its own
 * `-box` element. templateInsert namespaces a donor's classes (`info-card` -> `info-card-2`),
 * so the guest keeps the same house contract under a different spine — and its masked text
 * lines are real, addressable lines, exactly like the host's. Without this the host prefix was
 * the only one recognised and every inserted line was invisible to the canvas and the timeline.
 */
function insertedPrefixes(doc: Document): Array<{ root: Element; prefix: string }> {
  const found: Array<{ root: Element; prefix: string }> = [];
  for (const root of Array.from(doc.querySelectorAll('[data-gfx]'))) {
    const box = root.querySelector('[class*="-box"]');
    const boxClass = box ? Array.from(box.classList).find((c) => c.endsWith('-box')) : undefined;
    if (boxClass) found.push({ root, prefix: boxClass.slice(0, -'-box'.length) });
  }
  return found;
}

/**
 * Derive the template's addressable parts from its HTML. DOMParser-based on purpose: a
 * part's KIND needs real element/parent inspection — to a regex, an `<img id="f2">` logo
 * slot and a masked line span look identical, and that miscount shipped as a real bug
 * (corner bugs offered a step reveal that shoved the unmasked logo around).
 *
 * Rules:
 * - a selector only counts as an identity if it matches exactly ONE element (duplicate
 *   classes in hand-edited/AI HTML exclude that part rather than guessing);
 * - `line` means "mask-slide capable": an `fN` element whose PARENT carries the
 *   `<prefix>-mask` class;
 * - hidden data holders (`.noacg-data-source` divs SPX writes into) are not parts; empty logo
 *   `<img>` slots ARE (the slot exists — a value shows it).
 */
export function getTemplateParts(html: string, fields: SpxField[] = []): TemplatePart[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const parts: TemplatePart[] = [];

  const unique = (selector: string): Element | null => {
    const found = doc.querySelectorAll(selector);
    return found.length === 1 ? found[0] : null;
  };
  const fieldTitle = (id: string) => fields.find((f) => f.field === id)?.title;

  // The structure contract's spine: .<prefix>-box inside .<prefix> (shared/standard.ts).
  const prefix = boxPrefix(doc);

  if (prefix) {
    if (unique(`.${prefix}`)) {
      parts.push({ selector: `.${prefix}`, kind: 'root', label: 'Whole graphic', channel: 'rise' });
    }
    if (unique(`.${prefix}-box`)) {
      // An imported design's box is the user's own artwork with its text — "Panel" (the house
      // word for a generated background box) would misname it on every surface that shows it.
      const label = prefix === 'imported-design' ? 'Design' : 'Panel';
      parts.push({ selector: `.${prefix}-box`, kind: 'panel', label, channel: 'rise' });
    }
    if (unique(`.${prefix}-accent`)) {
      parts.push({ selector: `.${prefix}-accent`, kind: 'accent', label: 'Accent line', channel: 'rise' });
    }
    // An imported design's artwork (`.imported-design-art` — the PNG the user brought). Its
    // own identity on purpose: the design presets move the whole box, but the artwork and the
    // text placed on it are separate layers, so each can be styled and animated independently
    // (docs/IMPORT_MVP.md). Catalog templates emit no `-art` element, so nothing else changes.
    if (unique(`.${prefix}-art`)) {
      parts.push({ selector: `.${prefix}-art`, kind: 'image', label: 'Artwork', channel: 'rise' });
    }
    // An imported SVG's TOP-LEVEL NAMED GROUPS (docs/SVG_IMPORT_PLAN.md P2): the layers the
    // designer made — a backplate, a text group — each its own part, so per-layer motion
    // (the entrance stagger) has real targets. Direct children only: deeper structure is the
    // design's internals, and offering every nested group would bury the layers that matter
    // under dozens of anonymous ones. Labelled with the same words the mapping step showed
    // (svgLayerLabel — data-name over the decoded id). Ids are the designer's own, so only a
    // CSS-safe one becomes a selector (the single-token contract above), and only a unique
    // one becomes an identity, same as every other part.
    const art = unique(`.${prefix}-art`);
    if (art && art.tagName.toLowerCase() === 'svg') {
      for (const child of svgLayerElements(art)) {
        parts.push({
          selector: `#${child.getAttribute('id')}`,
          kind: 'block',
          label: svgLayerLabel(child) || child.getAttribute('id')!,
          channel: 'rise',
        });
      }
    }
  }

  // Field elements, in document order: masked text lines and image slots. A line is masked
  // under ITS OWN graphic's prefix — the host's, or an inserted guest's namespaced one.
  const guests = insertedPrefixes(doc);
  for (const el of Array.from(doc.querySelectorAll('[id]'))) {
    const id = el.id;
    if (!/^f\d+$/.test(id) || !unique(`#${id}`)) continue;
    const guest = guests.find((g) => g.root.contains(el));
    const flag = guest ? { inserted: true } : {};
    // Its own graphic's mask: the guest's namespaced one, or the host's.
    const maskedBy = guest?.prefix ?? prefix;
    if (el.tagName === 'IMG') {
      parts.push({ selector: `#${id}`, kind: 'image', label: fieldTitle(id) ?? 'Image', channel: 'rise', ...flag });
    } else if (maskedBy && el.parentElement?.classList.contains(`${maskedBy}-mask`)) {
      parts.push({ selector: `#${id}`, kind: 'line', label: fieldTitle(id) ?? `#${id}`, channel: 'mask', ...flag });
    } else if (
      // A bound layer of an imported SVG (docs/SVG_IMPORT_PLAN.md): the field element IS one
      // of the artwork's own <text>/<tspan>/<image> nodes, so it is fully visual and
      // animatable — GSAP tweens SVG elements like any other. There is no overflow-hidden
      // mask around SVG text (it does not clip), so the reveal channel is 'rise', never
      // 'mask'; a bound <image> is a picture slot exactly like an <img> field.
      maskedBy &&
      el.closest(`.${maskedBy}-art`) &&
      ['text', 'tspan', 'image'].includes(el.tagName.toLowerCase())
    ) {
      const isPicture = el.tagName.toLowerCase() === 'image';
      parts.push({
        selector: `#${id}`,
        kind: isPicture ? 'image' : 'line',
        label: fieldTitle(id) ?? (isPicture ? 'Picture' : `#${id}`),
        channel: 'rise',
        ...flag,
      });
    }
    // Other unmasked fN elements (hidden data sources, free-standing value fields) are not
    // registry parts — they are either not visual or not reveal-capable yet.
  }

  // Answer ROWS (the quiz structure contract): sibling `.<prefix>-option` rows, each a letter
  // chip plus its answer field, NUMBERED so every row is its own identity. They must be: the
  // entrance walks them in one after another, and a stagger only survives the keyframe model as
  // per-target keyframe OFFSETS (docs/PRESET_MODEL_REVIEW.md gap 4 — the model has no stagger
  // field, and one class matching four elements has nowhere to put four different start times).
  // Numbering them buys the honest version of that: four rows, four editable tracks. Labelled by
  // the field each row holds, so every surface says "Answer B", never ".quiz-option-2".
  if (prefix) {
    for (let n = 1; unique(`.${prefix}-option-${n}`); n++) {
      const row = unique(`.${prefix}-option-${n}`)!;
      const field = Array.from(row.querySelectorAll('[id]')).find((el) => /^f\d+$/.test(el.id));
      parts.push({
        selector: `.${prefix}-option-${n}`,
        kind: 'block',
        label: (field && fieldTitle(field.id)) ?? `Answer ${n}`,
        channel: 'rise',
      });
    }
  }

  // SEVERITY LEVELS (the alert structure contract): sibling `.<prefix>-level-N` blocks, one
  // per severity, stacked in the alert's flag. They are numbered for the same reason the quiz's
  // answer rows are: the level machine gives each one its own opacity track, and one shared
  // class matching four elements has nowhere to put four different values. Labelled by the
  // level word the block itself carries, so every surface says "Warning", never
  // ".alert-level-3".
  if (prefix) {
    for (let n = 1; unique(`.${prefix}-level-${n}`); n++) {
      const block = unique(`.${prefix}-level-${n}`)!;
      const word = (block.textContent ?? '').trim();
      parts.push({
        selector: `.${prefix}-level-${n}`,
        kind: 'block',
        label: word || `Level ${n}`,
        channel: 'rise',
      });
    }
  }

  // RECONSTRUCTED PANELS (the NoaCG Pro reconstruction contract): sibling
  // `.<prefix>-panel-N` shapes the Pro compiler rebuilds out of a concept image - the
  // primary strap, an accent bar - each its own part so a rebuilt shape is selectable,
  // styleable and animatable exactly like the design elements it stands in for. Numbered
  // like the quiz's answer rows and the alert's levels, and for the same reason: each shape
  // gets its own timeline tracks. No catalog template emits this class, so nothing else
  // changes.
  if (prefix) {
    for (let n = 1; unique(`.${prefix}-panel-${n}`); n++) {
      parts.push({
        selector: `.${prefix}-panel-${n}`,
        kind: 'block',
        label: `Panel ${n}`,
        channel: 'rise',
      });
    }
  }

  // Building-block inserted elements (blocks tag them data-gfx and give them an id).
  for (const el of Array.from(doc.querySelectorAll('[data-gfx][id]'))) {
    if (/^f\d+$/.test(el.id) || !unique(`#${el.id}`)) continue; // field imgs handled above
    parts.push({ selector: `#${el.id}`, kind: 'block', label: el.id, channel: 'rise' });
  }

  return parts;
}

/** Visible text lines OF THIS GRAPHIC: the mask-slide-capable `line` parts (steps and line
 *  presets rely on the mask structure, so ONLY these count — logo slots and data holders never
 *  do). An inserted guest's lines are excluded: this answers "how many lines does the design
 *  have", which is what the preset emitters size their choreography from. */
export function countLines(html: string): number {
  return getTemplateParts(html).filter((p) => p.kind === 'line' && !p.inserted).length;
}
