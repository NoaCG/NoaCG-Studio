// SVG import — parse, sanitize and inventory a dropped SVG file (docs/SVG_IMPORT_PLAN.md).
//
// The promise this module serves: a layered SVG from Illustrator, Figma or Inkscape imported
// VERBATIM is the user's exact graphic; binding its own <text> nodes to data fields makes it a
// playable template. So this module never redraws, reflows or prettifies anything — it parses
// with DOMParser, removes only what the sanitizer must (script, event handlers, foreignObject,
// external references, SMIL), tags each bindable text node with a data-noacg-candidate marker,
// and serializes ONCE. Everything downstream — the mapping step's highlight, the generator's
// id="fN" binding — addresses nodes through those markers, so the artwork itself is never
// touched again.
//
// WHY the sanitizer is here and not only in the validation gate: an imported SVG is untrusted
// input entering srcdoc previews, exports and (later) community sharing. The gate
// (validation/validateTemplate.ts) stays authoritative — it re-checks the emitted template —
// but the import must hand clean markup to the preview in the first place.

import { boxInUserSpace } from './svgGeometry';

export interface SvgTextCandidate {
  /** Stable marker id ("t0", "t1", …) — the value of data-noacg-candidate on the node. */
  id: string;
  /** Operator-facing label, prefilled from the layer name (data-name / id / nearest named
   *  ancestor group). Illustrator writes layer names as element ids (original spelling kept
   *  in data-name when it had to uniquify); Figma writes frame/layer names as group ids. */
  label: string;
  /** The node's current text content — the sample value the field starts with. */
  sample: string;
  /** True when the layer name carried the optional `f:` / `field:` prefix — the power-user
   *  sugar that marks a layer editable by name. For TEXT it is a guarantee, not a filter:
   *  every detected text defaults ON either way. For a PICTURE, which defaults OFF (inside a
   *  design a picture is usually the artwork), the prefix is what turns it on. */
  marked: boolean;
  /** True when the layer name carried the `static:` prefix — the designer saying this text is
   *  FURNITURE, not a slot. The row is still offered, unticked, and the words stay as drawn:
   *  a top ten's rank numerals and a bingo grid's numbers are drawing the operator should
   *  never be handed twenty-five boxes for
   *  (docs/backlog/decorative-numerals-arrive-as-fields.md). */
  drawing: boolean;
  /** True when this layer's own name was its own words, so the label came from the group
   *  around it. The mapping step says so under the box, because otherwise a slot the designer
   *  deliberately named after its placeholder reads as mislabelled with nothing explaining it. */
  namedByGroup: boolean;
  /** A numeric-looking sample proposes ftype "number" (a score, a count, a year). */
  numeric: boolean;
  /** A clock-shaped sample ("10:00", "1:05:00") can be bound as a COUNTDOWN instead of text:
   *  the node becomes the clock display and the operator field its length in minutes
   *  (templates/shared/clock.ts). Offered, never assumed — "22:40" may be the time of day. */
  clock: boolean;
}

/** One bindable picture layer: an SVG `<image>` element the operator could swap by field
 *  (update() rewrites its href; empty restores the drawn picture). Offered OFF by default —
 *  most pictures inside a design are the artwork itself, not a slot. */
export interface SvgImageCandidate {
  /** Stable marker id ("i0", "i1", …) — the value of data-noacg-candidate on the node. */
  id: string;
  /** Operator-facing label, prefilled from the layer name like a text candidate's. */
  label: string;
  /** True when the layer name carried the `f:` / `field:` prefix. */
  marked: boolean;
}

/** One group of glyph-shaped paths that LOOKS like outlined text (docs/SVG_IMPORT_PLAN.md
 *  §1.A): a `<g>` holding nothing but path/polygon shapes. Type converted to outlines at
 *  export has nothing to bind, so the recovery is the raster flow's — hide the group and
 *  place an HTML field over its box. Offered OFF by default: a logo is also a group of paths,
 *  and only the user can tell the two apart (the mapping step's hover highlight shows which
 *  shapes a row means). The box itself is measured in the mapping step, from its rendered
 *  artwork — DOMParser has no layout. */
export interface SvgOutlineCandidate {
  /** Stable marker id ("o0", "o1", …) — the value of data-noacg-candidate on the group. */
  id: string;
  /** Operator-facing label, prefilled from the layer name like a text candidate's. */
  label: string;
  /** True when the layer name carried the `f:` / `field:` prefix. */
  marked: boolean;
}

/**
 * One named `<g>` offered as a BEHAVIOUR LAYER — a drawing that shows what a state looks like
 * (docs/GRAPHIC_BEHAVIOUR_PLAN.md §4, model L2). The designer draws "this answer is selected"
 * as its own Illustrator layer; NoaCG decides WHEN it is visible and never redraws it.
 *
 * Two things separate these from every other candidate kind:
 *
 *  - **A HIDDEN group is offered, and is in fact the likeliest one.** A state layer is drawn
 *    on top of the base look, so a designer hides it in Illustrator to see their artwork -
 *    which is the exact opposite of a hidden TEXT layer, where hidden means "copy nobody can
 *    read, do not offer it as a field". `hidden` is reported rather than filtered so the
 *    mapping step can lead with the layers most likely to be states.
 *  - **Nothing is bound to a field.** A behaviour layer carries no operator value; it is shown
 *    and hidden by the machine's state, so it never takes an `fN` id.
 */
export interface SvgGroupCandidate {
  /** Stable marker id ("g0", "g1", …) — the value of data-noacg-candidate on the group. */
  id: string;
  /** Operator-facing label, prefilled from the layer name like a text candidate's. */
  label: string;
  /** True when the designer had this layer hidden — the usual shape of a drawn state. */
  hidden: boolean;
}

/**
 * One `<rect>` — or a panel-shaped `<path>` — offered as the PANEL that grows with its text
 * (docs/SVG_IMPORT_PLAN.md §3, the hug). A lower third's banner should be as wide as the name
 * on it; a quiz board declares a stage and must never resize. The markup cannot say which this
 * is, and neither can the artboard size - the shipped lower-third sample is a full-frame
 * artboard with a small banner drawn into it, while the scorebug is a small floating object
 * that must stay put - so the mapping step ASKS, and this is the list it asks over.
 *
 * PATHS QUALIFY WHEN THEIR GEOMETRY IS A RECTANGLE (owner walk, 2026-08-28). "Draw the panel
 * as a rectangle" was the advice, and it is unfollowable in Illustrator: a rounded rectangle
 * exports as a `<path>` (Illustrator never writes `rx`), so the archetypal premium lower third
 * silently fell back to shrinking. `panelPathGeometry` reads the path data and accepts a
 * single closed axis-aligned rectangle, rounded corners included; the runtime grows one by
 * shifting the far half of its points, which keeps the drawn radii exactly the designer's
 * (templates/importedDesign/svg.ts). A freeform shape still has no width to change and is
 * still not offered. The geometry travels because the mapping step ranks and labels by it,
 * and `DOMParser` has no layout to measure with.
 */
export interface SvgShapeCandidate {
  /** Stable marker id ("s0", "s1", …) — the value of data-noacg-candidate on the rect. A shape
   *  painted with a placed picture is offered in BOTH inventories and keeps the "i0"-shaped
   *  marker it was given as a picture, so one id here may also appear in `images`. */
  id: string;
  /** Operator-facing label, prefilled from the layer name like a text candidate's. */
  label: string;
  /** The rectangle as drawn, in the artwork's own units. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One font family the SVG references, as written in its own markup. */
export interface SvgFontRef {
  /** VERBATIM, as the markup asks for it ("ArchivoBlack-Bold"). Every `@font-face` the
   *  template emits is declared under this name — it is what the artwork's own CSS asks for,
   *  so a face declared under any other name simply does not apply. */
  family: string;
  /** The same face as a real family NAME ("Archivo Black"), for looking it up in the bundled
   *  library or on Google Fonts. Equal to `family` for a file that already names it plainly. */
  lookup: string;
  /** The weight the name's style suffix implied ("-Bold" → 700), or null when it named none. */
  weight: number | null;
}

export interface SvgImportResult {
  /** The sanitized SVG markup, candidates tagged with data-noacg-candidate. Serialized once
   *  from the parsed document; not prettified, attributes untouched. */
  markup: string;
  /** Design-space size in px, from the viewBox (else width/height attributes). */
  width: number;
  height: number;
  /** Bindable text candidates, in document order. */
  candidates: SvgTextCandidate[];
  /** Bindable picture candidates (`<image>` layers), in document order. */
  images: SvgImageCandidate[];
  /** Groups of glyph-shaped paths that may be outlined text, in document order. */
  outlines: SvgOutlineCandidate[];
  /** Named groups offered as BEHAVIOUR LAYERS (drawn states), in document order. */
  groups: SvgGroupCandidate[];
  /** Rectangles offered as the PANEL that grows with its text, widest first. */
  shapes: SvgShapeCandidate[];
  /** Every font family the markup references, in first-seen order. */
  fonts: SvgFontRef[];
  /** What sanitization removed, in user-facing words. Empty for a clean file. */
  notices: string[];
}

/** Marker attribute connecting a candidate record to its node in the markup. Stripped from
 *  the emitted template at build (templates/importedDesign/svg.ts). */
export const SVG_CANDIDATE_ATTR = 'data-noacg-candidate';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** True when a File is an SVG (by type or extension — a file served without a MIME type
 *  still deserves to open). */
export function isSvgFile(file: File): boolean {
  return file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
}

/** Decode an Illustrator-escaped id back to the layer name the designer typed:
 *  underscores were spaces, `_xNN_` escapes are character codes ("f_x3A_score" -> "f:score"). */
function decodeLayerName(id: string): string {
  return id
    .replace(/_x([0-9A-Fa-f]{2})_/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    // Illustrator uniquifies a repeated name with a long numeric suffix; the original
    // spelling then lives in data-name, but strip the noise for the id fallback too.
    .replace(/_\d{8,}$/, '')
    .replace(/_/g, ' ')
    .trim();
}

/** The layer name of one element: its data-name (verbatim — Illustrator keeps the original
 *  spelling there when it uniquifies the id), else its decoded id. Empty when unnamed.
 *  Exported for model/structure.ts, which labels an imported SVG's top-level groups with the
 *  same words the mapping step used — two spellings of one layer would read as two layers. */
export function svgLayerLabel(el: Element): string {
  return layerName(el);
}

/** The Inkscape namespace, whose `inkscape:label` holds the name the designer typed — Inkscape
 *  puts an auto id ("layer1", "text123") in `id` and the real name here. */
const INKSCAPE_NS = 'http://www.inkscape.org/namespaces/inkscape';
const AFFINITY_NS = 'http://www.serif.com/';

/** An id an editor GENERATED, which names nothing: a tag name plus a number ("text123",
 *  "tspan124", "path1867", "layer1", "g4"). Illustrator and Figma write the layer's name into
 *  `id`, so an id is normally the best label there is — but Inkscape's are serial numbers, and
 *  a candidate labelled "text123" beat the named layer ABOVE it, hiding the one word the
 *  designer actually chose. Treated as unnamed, so `candidateName` keeps climbing. */
function isGeneratedId(id: string): boolean {
  const name = id.trim();
  return (
    /^(?:svg|g|layer|text|textPath|tspan|flowRoot|flowRegion|flowPara|path|rect|circle|ellipse|line|polyline|polygon|use|image|symbol|pattern|clipPath|mask|defs|marker|linearGradient|radialGradient|stop|filter)[-_]?\d+$/i.test(
      name,
    ) || isDefaultObjectName(name)
  );
}

/** The names a DESIGN APP gives an object the designer never named: Figma's "Frame 21",
 *  "Rectangle 118" and "Vector", Illustrator's and Sketch's "Group 3", "Layer 1", "Path 4".
 *
 *  They matter because Figma's auto-layout wraps things in frames it names itself, so the name
 *  the designer DID type sits one level up: a `<g id="Answer D">` holding a `<g id="Frame 21">`
 *  gave the operator a field labelled "Frame 21" while "Answer D" went unused. Read as unnamed,
 *  the climb continues and the designer's word wins - which is the whole rule this function
 *  serves, arriving by a route the serial-id pattern above cannot see (the number is separated
 *  by a space, and "Frame" is not an element name). */
function isDefaultObjectName(name: string): boolean {
  return /^(?:frame|group|rectangle|ellipse|line|vector|polygon|star|arrow|union|subtract|intersect|exclude|slice|layer|path|shape|component|instance|mask group|clip path group)(?:\s+\d+)?$/i.test(
    name,
  );
}

function layerName(el: Element): string {
  const dataName = el.getAttribute('data-name');
  if (dataName?.trim()) return dataName.trim();
  const inkscapeLabel = el.getAttributeNS(INKSCAPE_NS, 'label') ?? el.getAttribute('inkscape:label');
  if (inkscapeLabel?.trim()) return inkscapeLabel.trim();
  // Affinity Designer's own `data-name`: it sanitizes the layer name into `id` ("Answer-A") and
  // keeps the spelling the designer typed in `serif:id` ("Answer A"). Read like Illustrator's and
  // Inkscape's, so an operator's label reads the way it was written rather than the way an
  // exporter had to spell it.
  const serifId = el.getAttributeNS(AFFINITY_NS, 'id') ?? el.getAttribute('serif:id');
  if (serifId?.trim()) return serifId.trim();
  const id = el.getAttribute('id');
  if (id?.trim() && !isGeneratedId(id)) return decodeLayerName(id);
  return '';
}

/** A layer whose NAME IS ITS OWN COPY may be naming nothing. Figma auto-names every text layer
 *  after the words in it, so a Figma quiz board arrives with `<text id="Amsterdam">` inside `<g
 *  id="Answer A">` - and the operator's field would be labelled "Amsterdam", the very thing they
 *  are about to retype, while the name the designer chose sits one level up unused. `candidateName`
 *  climbs past such a name, but only where the name it reaches is BETTER EVIDENCE (see there). */
function namesItsOwnCopy(el: Element, name: string): boolean {
  const copy = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  return copy.length > 0 && copy === name.replace(/\s+/g, ' ').trim();
}

/** The layer-name prefixes (docs/SVG_AUTHORING.md §3): `f:` / `field:` marks a layer editable,
 *  `static:` marks a text layer as DRAWING - offered unticked, its words left as drawn. Either
 *  prefix is stripped from the label. */
function stripFieldPrefix(name: string): { label: string; marked: boolean; drawing: boolean } {
  const field = /^(?:f|field):\s*(.*)$/i.exec(name);
  if (field) return { label: field[1].trim(), marked: true, drawing: false };
  const drawn = /^static:\s*(.*)$/i.exec(name);
  if (drawn) return { label: drawn[1].trim(), marked: false, drawing: true };
  return { label: name, marked: false, drawing: false };
}

/** How many of a kind's candidates one layer holds - the evidence `candidateName` weighs. With
 *  no list to count (the picture, outline and panel inventories, none of which can name their
 *  own copy: a shape has no words) it answers one, which keeps the climb. */
function candidatesUnder(node: Element, peers?: readonly Element[]): number {
  if (!peers) return 1;
  let held = 0;
  for (const peer of peers) if (node.contains(peer)) held++;
  return held;
}

/** The nearest named layer for a candidate: its own name, else the closest named ancestor
 *  group inside the svg (Illustrator/Figma name GROUPS, and the text sits inside one).
 *
 *  CLIMBING PAST A LAYER NAMED AFTER ITS OWN WORDS IS EVIDENCE-LED, not automatic. Figma's
 *  auto-name is worth leaving behind because the wrapper above it names that one text layer and
 *  nothing else. A group holding EIGHT text layers cannot be the name of one of them, so a
 *  bracket's `<text id="Champion">Champion</text>` inside `<g id="Words">` keeps the name its
 *  author typed rather than arriving as "Words"
 *  (docs/backlog/text-layer-named-after-its-own-copy-loses-its-name.md). With nothing named above
 *  it at all, its own words are the only name there is - better than "Text 7". */
function candidateName(el: Element, root: Element, peers?: readonly Element[]): { name: string; fromGroup: boolean } {
  let node: Element | null = el;
  let ownWords = '';
  while (node && node !== root) {
    const name = layerName(node);
    if (name) {
      if (!namesItsOwnCopy(node, name)) {
        if (ownWords && candidatesUnder(node, peers) > 1) return { name: ownWords, fromGroup: false };
        return { name, fromGroup: ownWords !== '' };
      }
      if (!ownWords) ownWords = name;
    }
    node = node.parentElement;
  }
  return { name: ownWords, fromGroup: false };
}

/** Does this sample propose a number field? A PLAIN figure only — an SPX number input can
 *  hold "84" but not "22:40" or "2 – 1", so anything with clock/score furniture stays text.
 *  Exported for the outlined-text overlay, whose sample the user types in the mapping step. */
export function looksNumeric(sample: string): boolean {
  return /^[-+]?\d+([.,]\d+)?$/.test(sample.trim());
}

/** Does this sample look like a clock readout — M:SS or H:MM:SS ("10:00", "1:05:00")?
 *  Such a layer can be bound as a countdown; the mapping step offers the choice. */
export function looksClock(sample: string): boolean {
  return /^\d{1,2}:\d{2}(?::\d{2})?$/.test(sample.trim());
}

/** A clock-shaped sample as a countdown LENGTH in minutes (two decimals): "10:00" is ten
 *  minutes, "1:05:00" sixty-five. A two-part readout reads as M:SS — what a drawn countdown
 *  shows — never as hours:minutes. Not a clock: null. */
export function clockSampleMinutes(sample: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(sample.trim());
  if (!m) return null;
  const [a, b, c] = [Number(m[1]), Number(m[2]), m[3] === undefined ? null : Number(m[3])];
  const seconds = c === null ? a * 60 + b : a * 3600 + b * 60 + c;
  return Math.round((seconds / 60) * 100) / 100;
}

/** Attribute names that run script — removed wholesale. */
const isEventAttr = (name: string) => /^on/i.test(name);

/** External reference: an absolute URL or protocol-relative — anything that would make the
 *  emitted graphic reach the network (root AGENTS.md non-negotiable 3). A local `#id` ref
 *  and a `data:` URL are fine. */
function isExternalRef(value: string): boolean {
  return /^(?:https?:)?\/\//i.test(value.trim());
}

/** SMIL animation elements — stripped with a note: deterministic playout owns time, and a
 *  wall-clock SMIL loop would also fail the OGraf post-production gate (plan §7). */
const SMIL_TAGS = new Set(['animate', 'animatetransform', 'animatemotion', 'set']);

/**
 * Sanitize the parsed SVG in place. Returns user-facing notices for everything removed —
 * the import says what it did rather than silently altering someone's file.
 */
function sanitize(svg: Element): string[] {
  const notices: string[] = [];
  let scripts = 0;
  let foreign = 0;
  let smil = 0;
  let external = 0;
  let handlers = 0;

  const doomed: Element[] = [];
  const all = [svg, ...Array.from(svg.querySelectorAll('*'))];
  for (const el of all) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'script') {
      scripts++;
      doomed.push(el);
      continue;
    }
    if (tag === 'foreignobject') {
      foreign++;
      doomed.push(el);
      continue;
    }
    if (SMIL_TAGS.has(tag)) {
      smil++;
      doomed.push(el);
      continue;
    }
    // Event handlers and javascript: URLs go regardless of the element they sit on.
    for (const attr of Array.from(el.attributes)) {
      if (isEventAttr(attr.name)) {
        handlers++;
        el.removeAttribute(attr.name);
        continue;
      }
      if (/^(?:href|xlink:href)$/i.test(attr.name)) {
        if (/^\s*javascript:/i.test(attr.value)) {
          handlers++;
          el.removeAttribute(attr.name);
        } else if (isExternalRef(attr.value)) {
          // An element whose content IS the external file (<image>, <use>) cannot survive
          // losing it; anything else just loses the attribute.
          external++;
          if (tag === 'image' || tag === 'use') doomed.push(el);
          else el.removeAttribute(attr.name);
        }
      }
    }
    // A <style> block survives (Illustrator writes class-based styles there), minus any
    // external fetch it declares.
    if (tag === 'style' && el.textContent) {
      let cssText = el.textContent;
      const before = cssText;
      cssText = cssText.replace(/@import[^;]+;/gi, '');
      cssText = cssText.replace(/url\(\s*['"]?(?:https?:)?\/\/[^)]*\)/gi, 'none');
      if (cssText !== before) {
        external++;
        el.textContent = cssText;
      }
    }
  }
  for (const el of doomed) el.remove();

  if (scripts) notices.push('Script code inside the SVG was removed — a graphic must not carry its own scripts.');
  if (handlers) notices.push('Event-handler attributes inside the SVG were removed.');
  if (foreign) notices.push('A foreignObject block was removed — embedded HTML cannot ride into playout.');
  if (smil) notices.push('SVG-native (SMIL) animation was removed — motion is added in the Animation step, where the timeline and playout can drive it.');
  if (external) notices.push('References to files on the internet were removed — an exported graphic must play out with no network. Embed images into the SVG before exporting it, or add them as assets.');
  return notices;
}

/** CSS pixels per unit, at the 96dpi the SVG and CSS specs fix. `px` is in the table so the
 *  parse succeeds on it, but it is NOT physical: a px IS the user unit, so it says nothing the
 *  viewBox has not already said. `em`/`ex`/`%` are relative to a context the file does not
 *  carry, so they are not lengths here at all and fall through as unreadable. */
const PHYSICAL_UNIT_PX: Record<string, number> = {
  pt: 96 / 72,
  pc: 16,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  q: 96 / 101.6,
};

/** One `width`/`height` attribute as CSS pixels, keeping the number the file actually wrote
 *  (`stated`) so the viewBox can be compared against it, and whether the unit was PHYSICAL. */
function svgLength(raw: string | null): { px: number; stated: number; physical: boolean } | null {
  const m = /^\s*([\d.]+)\s*([a-z]*)\s*$/i.exec(raw ?? '');
  if (!m) return null; // "100%", "auto", an expression — not a length we can use
  const stated = Number(m[1]);
  if (!(stated > 0)) return null;
  const unit = m[2].toLowerCase();
  if (!unit || unit === 'px') return { px: stated, stated, physical: false };
  const per = PHYSICAL_UNIT_PX[unit];
  return per ? { px: stated * per, stated, physical: true } : null;
}

/** The same measurement to within half a percent — Inkscape writes the page number into both
 *  `width` and the viewBox verbatim, so this is an equality test with room for a rounded digit. */
function sameNumber(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(a, b) * 0.005;
}

/**
 * The design-space size. An SVG usually states a viewBox; width/height attributes cover the
 * rest. A file with neither has no intrinsic geometry to place fields against — refused,
 * like a raster file with no pixel size.
 *
 * A PHYSICAL unit on width/height is the one case where the viewBox's user units are the wrong
 * answer. Inkscape defaults new documents to millimetres and every print-first tool (Affinity,
 * CorelDRAW) defaults to millimetres or points, so a full 1280 × 720 page arrives as
 * `width="338.66666mm" viewBox="0 0 338.66666 190.5"` — the same numbers twice, because the
 * user unit IS the millimetre. Read as pixels that page is 339 × 191 and a whole design lands
 * on the frame as a postage stamp (sweep finding 3, docs/backlog/svg-import-sweep-findings.md).
 *
 * The conversion is deliberately narrow: it fires only when the viewBox's extent MATCHES the
 * physical number, which is what says "one user unit is one millimetre". A designer who drew in
 * a 1920-unit space and set a 10cm output size meant the 1920, and that file is left alone —
 * `width="10cm" viewBox="0 0 1920 1080"` still imports at 1920 × 1080.
 *
 * One deliberate change of answer beyond the units: reading the attributes as LENGTHS rather
 * than with `parseFloat` means a percentage is no longer silently worth its own number. A
 * "responsive SVG" edit that leaves `width="100%"` on a file WITH a viewBox was always fine and
 * still is (the viewBox answers); the same edit on a file with NO viewBox used to import at
 * 100 × 100 — a nineteen-fold error reported as a plausible size — and is now refused by the
 * no-size message, which is what rule 1 of docs/SVG_AUTHORING.md promises and the only honest
 * answer when nothing in the file states a size at all.
 */
function measureSvg(svg: Element): { width: number; height: number } | null {
  const w = svgLength(svg.getAttribute('width'));
  const h = svgLength(svg.getAttribute('height'));
  const viewBox = svg.getAttribute('viewBox');
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      const [, , vw, vh] = parts;
      const userUnitIsPhysical =
        w?.physical && h?.physical && sameNumber(vw, w.stated) && sameNumber(vh, h.stated);
      if (userUnitIsPhysical) return { width: Math.round(w.px), height: Math.round(h.px) };
      return { width: Math.round(vw), height: Math.round(vh) };
    }
  }
  if (w && h) return { width: Math.round(w.px), height: Math.round(h.px) };
  return null;
}

/** Elements whose contents are a DEFINITION, not a drawing: nothing inside them paints where it
 *  stands, and a `<symbol>` painted through `<use>` paints a COPY, so binding the original by id
 *  is not a promise this import can keep. A designer's unused symbol library would otherwise
 *  become a screenful of operator fields for text nobody can see. */
const NON_RENDERED_TAGS = new Set(['defs', 'symbol', 'clippath', 'mask', 'pattern', 'marker']);

/** Does this declaration block switch a layer off? Both properties, because the same click in
 *  the layers panel comes out of Illustrator as `display:none` and out of Inkscape as either. */
const HIDES = /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\s*(?:;|$)/i;

/**
 * The CLASS names the file's own `<style>` blocks switch off.
 *
 * **This is the shape an eye clicked off in Illustrator actually arrives in.** With the export
 * dialog left on its default styling ("Internal CSS") a hidden layer is not `display="none"` on
 * the element — it is `class="st10"` next to a `.st10{display:none;}` rule in a `<style>` block,
 * and an Inkscape layer saved switched off lands the same way. Read exactly as `classFontSizes`
 * reads sizes: class selectors only, which is what all three exporters emit.
 *
 * Cached per root: every text and group candidate asks this question, and the answer is a
 * property of the FILE rather than of the node.
 */
const hiddenClassCache = new WeakMap<Element, Set<string>>();
function hiddenClasses(root: Element): Set<string> {
  const cached = hiddenClassCache.get(root);
  if (cached) return cached;
  const names = new Set<string>();
  for (const style of Array.from(root.querySelectorAll('style'))) {
    for (const rule of (style.textContent ?? '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!HIDES.test(`;${rule[2]};`)) continue;
      for (const selector of rule[1].split(',')) {
        const cls = /\.([A-Za-z0-9_-]+)\s*$/.exec(selector.trim());
        if (cls) names.add(cls[1]);
      }
    }
  }
  hiddenClassCache.set(root, names);
  return names;
}

/** Hidden here means hidden AS EXPORTED — a layer the designer switched off (Illustrator and
 *  Figma both write `display:none` for one, on the element or through a class) or an explicitly
 *  invisible node. Its text is a draft the operator must never be handed a field for. The markup
 *  itself is untouched: hiding is the designer's decision, and it rides into the template exactly
 *  as drawn. */
export function isHiddenNode(el: Element, root: Element): boolean {
  if ((el.getAttribute('display') ?? '').trim().toLowerCase() === 'none') return true;
  if ((el.getAttribute('visibility') ?? '').trim().toLowerCase() === 'hidden') return true;
  const style = el.getAttribute('style');
  if (style && HIDES.test(`;${style};`)) return true;
  const classes = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
  if (classes.length === 0) return false;
  const off = hiddenClasses(root);
  return classes.some((c) => off.has(c));
}

/** Inside `<defs>`, `<symbol>`, `<clipPath>` or a `<mask>` — markup that is machinery rather
 *  than a layer. Split out of `isOffered` because a BEHAVIOUR layer wants this half of the
 *  test and not the hidden half (svgImport `SvgGroupCandidate`). */
function isInNonRendered(el: Element, root: Element): boolean {
  let node: Element | null = el;
  while (node && node !== root) {
    if (NON_RENDERED_TAGS.has(node.tagName.toLowerCase())) return true;
    node = node.parentElement;
  }
  return false;
}

/** Hidden itself, or inside something hidden — the shape a designer leaves a drawn state in. */
function isHiddenSubtree(el: Element, root: Element): boolean {
  let node: Element | null = el;
  while (node && node !== root) {
    if (isHiddenNode(node, root)) return true;
    node = node.parentElement;
  }
  return false;
}

/**
 * THE `<image>` A SHAPE IS PAINTED WITH, when the picture reaches it through a pattern fill.
 *
 * **Figma never writes a positioned `<image>`.** A raster a designer places is a
 * `<rect fill="url(#pattern0)">` whose `<pattern>` `<use>`s an `<image>` parked in `<defs>` —
 * so a picture road that looks for `<image>` elements on the artboard finds one node that
 * paints nowhere by itself, sitting inside two tags `NON_RENDERED_TAGS` correctly excludes.
 * Widening that set would offer every unused symbol and clip shape in the file as a layer; the
 * answer is to RESOLVE the reference instead, which is what this does.
 *
 * Deliberately narrow, because a false positive here mints an operator field that swaps nothing:
 * only a `fill` that is a single `url(#id)`, only a `<pattern>` behind it, and only ONE
 * `<image>` with an href under that pattern, reached directly or through a single `<use>`. A
 * pattern holding a whole drawing is a texture, not a placed picture, and is left alone.
 *
 * An INLINE style outranks the presentation attribute, as it does in rendering — belt and
 * braces at import, where `hoistInlineStyles` has already moved every inline declaration onto a
 * class, and load-bearing for the generator, which reads stored markup. A fill declared in a
 * `<style>` BLOCK is not read: every exporter that writes a placed raster (Figma, Illustrator,
 * Affinity) states its fill on the element, and a rule scan would have to answer specificity.
 */
function patternFillImage(el: Element, root: Element): Element | null {
  const fill =
    /(?:^|;)\s*fill\s*:\s*([^;]+)/i.exec(el.getAttribute('style') ?? '')?.[1] ??
    el.getAttribute('fill') ??
    '';
  const ref = /^\s*url\(\s*['"]?#([^)'"\s]+)['"]?\s*\)\s*$/.exec(fill)?.[1];
  if (!ref) return null;
  const pattern = root.querySelector(`pattern[id="${cssEscapeId(ref)}"]`);
  if (!pattern) return null;
  const images = Array.from(pattern.querySelectorAll('image')).filter(hasHref);
  if (images.length === 1) return images[0];
  // Figma's shape: the pattern holds only a <use>, and the <image> itself is parked at the
  // bottom of <defs> beside it. One hop, never a chain - a <use> pointing at a <use> is not
  // something an exporter writes, and following one would need cycle protection for no gain.
  const uses = Array.from(pattern.querySelectorAll('use'));
  if (images.length > 0 || uses.length !== 1) return null;
  const target = hrefTarget(uses[0], root);
  return target && target.tagName.toLowerCase() === 'image' && hasHref(target) ? target : null;
}

/** A picture node that actually carries a picture. A placeholder with no href has nothing to
 *  restore when the operator clears the field. */
function hasHref(el: Element): boolean {
  return !!(el.getAttribute('href') || el.getAttribute('xlink:href'));
}

/** The element a `href`/`xlink:href="#id"` points at, within this document. */
function hrefTarget(el: Element, root: Element): Element | null {
  const href = el.getAttribute('href') ?? el.getAttribute('xlink:href') ?? '';
  const id = /^#(.+)$/.exec(href.trim())?.[1];
  return id ? root.querySelector(`[id="${cssEscapeId(id)}"]`) : null;
}

/** An exporter's id may hold characters a selector reads as syntax (Illustrator escapes a space
 *  as `_x20_`, but Figma writes a layer's own text, and a hand-edited file can carry anything).
 *  Inside a QUOTED attribute selector only the quote and the backslash need escaping, which is
 *  why this is two characters rather than `CSS.escape` - that one escapes for an identifier
 *  position, and it is not defined in every context this module parses markup in. */
function cssEscapeId(id: string): string {
  return id.replace(/["\\]/g, '\\$&');
}

/**
 * The `<image>` an imported picture FIELD must be bound to - the node whose href `update()`
 * rewrites - given the element the mapping step offered as the candidate.
 *
 * The two are the same node for Illustrator, Inkscape and every exporter that writes the
 * positioned `<image>` the spec describes, and they DIVERGE for Figma. That split is
 * deliberate, and both halves were chosen against a real cost:
 *
 * - **The candidate is the shape the designer drew.** It carries the layer name ("Guest photo"),
 *   and it is the node the mapping step's hover highlight measures. The `<image>` in `<defs>`
 *   is named `image0_44_612` by Figma and has an empty bounding box, so binding the row to it
 *   would label the picture with a serial number and light up nothing on the artwork.
 * - **The binding target is the `<image>`.** It is the only node whose href changing repaints
 *   the shape, and stamping `id="fN"` on it makes the existing `setFieldValue` picture branch
 *   (templates/shared/base.ts) swap and restore it verbatim - no new runtime, and no churn in
 *   the emitted code of every template that ships.
 */
export function svgPictureTarget(candidate: Element, root: Element): Element {
  return pictureNode(candidate, root) ?? candidate;
}

/** The picture this element would bind, or null when it is not a picture layer at all - which
 *  is the question the candidate collection asks and `svgPictureTarget` answers with a
 *  fallback, since a candidate that reached the generator was a picture layer at import. A
 *  placeholder with no picture is not one: there would be nothing to restore on empty. */
function pictureNode(el: Element, root: Element): Element | null {
  if (el.tagName.toLowerCase() === 'image') return hasHref(el) ? el : null;
  return patternFillImage(el, root);
}

/** Is this node offered as a candidate at all? False inside a definition block or a hidden
 *  subtree — both are in the file on purpose and neither is something an operator can type into.
 *  Walks to the root, because either fact is usually stated on an ANCESTOR layer. */
function isOffered(el: Element, root: Element): boolean {
  let node: Element | null = el;
  while (node && node !== root) {
    if (NON_RENDERED_TAGS.has(node.tagName.toLowerCase())) return false;
    if (isHiddenNode(node, root)) return false;
    node = node.parentElement;
  }
  return node ? !isHiddenNode(node, root) : true;
}

/**
 * AN SVG LENGTH MAY BE UNITLESS, AND HTML'S CSS PARSER REFUSES ONE. `letter-spacing:2` in a
 * standalone .svg renders as 2 user units — but this SVG is INLINED into an HTML template,
 * where the same declaration is invalid CSS and silently drops: the tracking the designer set
 * tightens to `normal` the moment the file enters the product (measured on the owner's own
 * walk, 2026-08-28 — Illustrator writes exactly this for Character-panel tracking). Normalizing
 * the number to `px` preserves what the file rendered on its own, which is the exactness
 * promise this import exists for. Style blocks, inline styles and presentation attributes all
 * carry the property, so all three are normalized; a value that already has a unit is left
 * verbatim.
 */
function normalizeSpacingUnits(svg: Element): void {
  const props = /(letter-spacing|word-spacing)(\s*:\s*)(-?\d*\.?\d+)(?=\s*(?:;|\}|!|$))/gi;
  for (const style of Array.from(svg.querySelectorAll('style'))) {
    if (style.textContent) style.textContent = style.textContent.replace(props, '$1$2$3px');
  }
  for (const el of [svg, ...Array.from(svg.querySelectorAll('*'))]) {
    const inline = el.getAttribute('style');
    if (inline) {
      const fixed = inline.replace(props, '$1$2$3px');
      if (fixed !== inline) el.setAttribute('style', fixed);
    }
    for (const name of ['letter-spacing', 'word-spacing']) {
      const attr = el.getAttribute(name);
      if (attr && /^-?\d*\.?\d+$/.test(attr.trim())) el.setAttribute(name, `${attr.trim()}px`);
    }
  }
}

/**
 * INLINE STYLE IS NOT A PLACE TO KEEP A DESIGN, so every declaration the file wrote inline is
 * moved onto a class before anything else reads the markup.
 *
 * A GRAPHIC RESETS BY CLEARING ITS INLINE STYLES. `noacgResetGraphic` (templates/shared/
 * animRuntime.ts) runs `clearProps: 'all'` over the whole root subtree - that is how a snap puts
 * an animated graphic back to its CSS rest, and it is why this area's contract already says
 * "classes, never inline styles" for the drawn states. It cannot tell an animation's leftover
 * transform from a declaration the designer wrote, so anything inline is gone the first time the
 * graphic is reset, snapped or parked.
 *
 * Illustrator and Figma survive that by accident: with "Internal CSS" (or Figma's presentation
 * attributes) their typography is already in a `<style>` block or on attributes. INKSCAPE puts
 * ALL of it inline - `style="font-size:56px;font-family:Archivo;fill:#ffffff;letter-spacing:2px"`
 * on every `<text>`, and nothing anywhere else - so an Inkscape lower third lost its type, its
 * weights and its colours the moment the editor parked it: three layers drawn at 56, 30 and 22px
 * all painted at the browser's default 16 in the fallback face. Measured 2026-09-01 on
 * `inkscape-lower-third-layers`, which the exporter sweep had passed as clean because nothing
 * had ever looked at the rendered TYPE.
 *
 * One class per distinct declaration block, in a `<style>` appended LAST, so it outranks every
 * SINGLE-CLASS rule in the file - which is the only kind Illustrator, Figma and Inkscape write,
 * and the reason this draws the same as the inline attribute it replaces. It does NOT outrank an
 * id or a compound selector, so a hand-edited stylesheet carrying one of those would now win
 * where the inline declaration used to; no exporter emits either. Specificity stays under an
 * inline style, which is what the fit ladder writes when it sizes a line - so the runtime still
 * wins, and now the design survives underneath it.
 *
 * The root `<svg>` keeps its own attribute: it carries the exporter's `enable-background`
 * bookkeeping, never a layer's look, and it is one element rather than every element.
 *
 * THIS IS THE SHALLOWER OF TWO FIXES. The deeper one is for the reset to clear only the
 * properties the animation actually wrote, rather than every inline property on the subtree -
 * which would serve every template family and not only imported artwork. That lives in
 * templates/shared/animRuntime.ts and is nobody's to change from here.
 */
function hoistInlineStyles(svg: Element): void {
  const byDeclaration = new Map<string, string>();
  const rules: string[] = [];
  for (const el of Array.from(svg.querySelectorAll('[style]'))) {
    const declaration = (el.getAttribute('style') ?? '').trim().replace(/;\s*$/, '').trim();
    el.removeAttribute('style');
    if (!declaration) continue;
    let cls = byDeclaration.get(declaration);
    if (!cls) {
      cls = `noacg-s${byDeclaration.size}`;
      byDeclaration.set(declaration, cls);
      rules.push(`.${cls}{${declaration};}`);
    }
    const had = (el.getAttribute('class') ?? '').trim();
    el.setAttribute('class', had ? `${had} ${cls}` : cls);
  }
  if (rules.length === 0) return;
  const style = svg.ownerDocument.createElementNS(SVG_NS, 'style');
  style.textContent = `\n/* Styles this file wrote inline, moved onto classes so a reset cannot\n   clear them. Same declarations, same order, same look. */\n${rules.join('\n')}\n`;
  svg.appendChild(style);
}

/** The whitespace of this text as the renderer would collapse it — nothing at the ends, single
 *  spaces between words. Equal to the raw text exactly when `xml:space="preserve"` is doing no
 *  work on it. */
const collapsesToItself = (raw: string) => raw === raw.replace(/\s+/g, ' ').trim();

/**
 * `xml:space="preserve"` IS BOILERPLATE IN EVERY EXPORT, and it turns the emitted template's own
 * INDENTATION into text the graphic measures.
 *
 * Inkscape writes it on every `<text>` it has ever saved and Illustrator writes it on the root
 * `<svg>`; neither is a designer asking for literal spacing, and in the file as exported there is
 * no whitespace inside the text for it to preserve. Then the template is emitted and FORMATTED,
 * which re-indents the inlined artwork - and a `<text>` that held "OPPILAS-TV" now holds a
 * newline, fourteen spaces, the word, and a newline more, every one of them real. The fit ladder
 * measured that: a 22px strap reported 624 user units of drawn width against its 152, and a 56px
 * name reported 1053 against 394 - wider than the panel it sits in, so no shape contained it, so
 * it had no room, so the panel grew to its cap at rest and the name floored (measured 2026-09-01
 * on inkscape-lower-third-layers).
 *
 * So the attribute is dropped exactly where it is doing nothing: an element whose text already
 * collapses to itself. A designer who really did space something out keeps it, and keeps the
 * literal sample value with it (`spacePreserved`).
 */
function dropIdleSpacePreserve(svg: Element): void {
  // Both spellings, because a document parsed as XML holds the attribute in the xml namespace
  // and one parsed any other way holds it under its qualified name.
  const XML_NS = 'http://www.w3.org/XML/1998/namespace';
  const dropSpace = (el: Element) => {
    el.removeAttributeNS(XML_NS, 'space');
    el.removeAttribute('xml:space');
  };
  let everyTextIdle = true;
  for (const el of Array.from(svg.querySelectorAll('text, tspan, textPath'))) {
    const idle = collapsesToItself(el.textContent ?? '');
    if (!idle) everyTextIdle = false;
    else dropSpace(el);
  }
  // The ROOT states it for the whole file, so it goes only when no text under it needs it. Its
  // own textContent is every text node in the document, indentation included, and testing that
  // would answer about the export's formatting rather than about the artwork.
  if (everyTextIdle) dropSpace(svg);
}

/** Font sizes declared by CLASS in the file's own `<style>` blocks — Illustrator's "Internal
 *  CSS" styling option puts every size there rather than on the element. Only class selectors
 *  are read; that is what Illustrator, Figma and Inkscape all emit. */
function classFontSizes(svg: Element): Map<string, number> {
  const sizes = new Map<string, number>();
  for (const style of Array.from(svg.querySelectorAll('style'))) {
    for (const rule of (style.textContent ?? '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const size = /font-size\s*:\s*([\d.]+)/i.exec(rule[2]);
      if (!size) continue;
      const px = parseFloat(size[1]);
      if (!Number.isFinite(px)) continue;
      for (const selector of rule[1].split(',')) {
        const cls = /\.([A-Za-z0-9_-]+)\s*$/.exec(selector.trim());
        if (cls) sizes.set(cls[1], px);
      }
    }
  }
  return sizes;
}

/**
 * How big is this run's type? Attribute, inline style, then the class rules above, walking up
 * the ancestors the way inheritance does. **16 is not a guess when nothing says** — it is the
 * CSS initial font size, which is exactly what the browser will draw.
 *
 * Only used to judge whether two runs sit flush or apart (`groupRuns`), so a relative unit
 * nobody resolves (`em`, `%`) is skipped rather than approximated: the next ancestor that
 * states a real number is a better answer than arithmetic on a value we cannot see.
 */
function fontSizeResolver(svg: Element): (el: Element) => number {
  const byClass = classFontSizes(svg);
  const read = (raw: string | null | undefined): number | null => {
    if (!raw) return null;
    const m = /^([\d.]+)\s*(px|pt)?$/i.exec(raw.trim());
    if (!m) return null;
    const n = parseFloat(m[1]);
    return Number.isFinite(n) ? n : null;
  };
  return (el: Element): number => {
    let node: Element | null = el;
    while (node) {
      const attr = read(node.getAttribute('font-size'));
      if (attr !== null) return attr;
      const inline = /font-size\s*:\s*([^;]+)/i.exec(node.getAttribute('style') ?? '');
      const styled = read(inline?.[1]);
      if (styled !== null) return styled;
      // LAST CLASS FIRST. Equal-specificity rules are settled by which was declared LAST, and
      // `hoistInlineStyles` appends both its rule and its class name at the end - so a node
      // carrying a file class with a size and a hoisted one with another renders the hoisted
      // size, and reading the list forwards would answer with the size nothing draws.
      const classes = (node.getAttribute('class') ?? '').split(/\s+/);
      for (let i = classes.length - 1; i >= 0; i -= 1) {
        const fromClass = classes[i] && byClass.get(classes[i]);
        if (fromClass) return fromClass;
      }
      node = node.parentElement;
    }
    return 16;
  };
}

/** The leaf `<tspan>`s of one `<text>` — the runs that actually hold characters. A wrapper
 *  tspan around more tspans holds none. */
function leafTspans(text: Element): Element[] {
  return Array.from(text.querySelectorAll('tspan')).filter((t) => !t.querySelector('tspan'));
}

/**
 * THE RUN PROBLEM. A `<tspan>` means three different things, and telling them apart decides how
 * many operator fields a file produces.
 *
 * Illustrator writes one tspan per LINE of a multi-line block; one tspan per KERNED RUN whenever
 * the type carries tracking or manual kerning, several of them on ONE baseline; and one tspan per
 * label when a designer places two labels APART on one baseline (a strap's place and its time).
 * Treating every run as a field turned one headline into three ("A" / "lexandra" / " Riva").
 * Treating every shared baseline as one field merged "Helsinki" and "22:40" into one unusable
 * field.
 *
 * WHAT IS ONE FIELD (owner, 2026-09-01, on a quiz board whose question arrived as three boxes):
 * "A semantic text item such as a question should normally remain one field, with NoaCG handling
 * wrapping, resizing or layout adaptation." So the two axes answer differently:
 *
 *   - DOWN the page, stacked lines of ONE `<text>` are ONE WRAPPING FIELD. A designer pressing
 *     Return twice inside one text object drew one question, not three; the breaks they typed are
 *     where the words happened to fall at the size they drew at, and NoaCG owns that decision
 *     from here (docs/SVG_AUTHORING.md §3, and the ladder in §4). Two `<text>` OBJECTS are still
 *     two fields, whatever they look like - separate objects is the designer saying so.
 *   - ACROSS the baseline the GAP still decides. Runs of one line sit flush against each other -
 *     the next one starts about where the previous one ended - while two placed labels sit a real
 *     distance apart. `groupLine` estimates where each run ends and starts a new SEGMENT only
 *     when the next `x` is more than an em past that.
 *
 * The estimate assumes start-anchored runs, which is the idiom Illustrator's kerning writes.
 * It is deliberately generous: merging two labels a designer meant to keep apart costs them a
 * field, while splitting a kerned headline costs them their headline.
 *
 * A `<text>` that has BOTH - several baselines and a gapped baseline among them - is a composed
 * block (a two-column table typed as one object), and wrapping is meaningless there. That one
 * falls back to the old reading: every segment its own field. It is the rare case, and the rule
 * above is the one that is stated in the docs.
 */
const CHAR_EM = 0.55; // average advance of a mixed-case glyph, in ems - good to ~15%
const GAP_EMS = 1; // a gap wider than one em means a new label, not the next run

interface TextRun {
  el: Element;
  x: number | null;
  y: number | null;
  text: string;
  size: number;
}

/** One field, as the runs that make it: an array of LINES, each an array of runs. A field with
 *  several lines is a block NoaCG re-wraps; the line boundaries are only remembered so its
 *  sample value joins with a space where the designer pressed Return. */
type TextField = TextRun[][];

function numAttr(el: Element, name: string): number | null {
  const raw = (el.getAttribute(name) ?? '').trim();
  if (!raw) return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

/** The runs of one `<text>`, cut into LINES on a change of baseline. A run with no `y` continues
 *  the line it follows - it is the middle of one by definition. */
function groupLines(runs: TextRun[]): TextRun[][] {
  const lines: TextRun[][] = [];
  let current: TextRun[] = [];
  let lineY: number | null = null;
  for (const run of runs) {
    if (current.length && run.y !== null && lineY !== null && run.y !== lineY) {
      lines.push(current);
      current = [];
    }
    current.push(run);
    if (run.y !== null) lineY = run.y;
  }
  if (current.length) lines.push(current);
  return lines;
}

/** One line's runs, cut into SEGMENTS on a horizontal gap wider than `GAP_EMS` - the two labels
 *  a designer placed apart. Runs with no `x` continue whatever they follow. */
function groupLine(line: TextRun[]): TextRun[][] {
  const segments: TextRun[][] = [];
  let current: TextRun[] = [];
  let penEnd: number | null = null; // where the previous run is estimated to end
  for (const run of line) {
    const gapped = run.x !== null && penEnd !== null && run.x - penEnd > run.size * GAP_EMS;
    if (current.length && gapped) {
      segments.push(current);
      current = [];
    }
    current.push(run);
    const start: number = run.x ?? penEnd ?? 0;
    penEnd = start + run.text.length * CHAR_EM * run.size;
  }
  if (current.length) segments.push(current);
  return segments;
}

/**
 * The bindable text nodes, in document order. A `<text>` whose runs each stand alone as a field
 * offers each of them - ids are legal on tspans and getElementById finds them, so a placed label
 * can be its own operator field. Anything else binds the `<text>` whole: `update()` then replaces
 * its content in one write, which is the only write that cannot lose half a line.
 */
function textCandidates(svg: Element, fontSize: (el: Element) => number): Element[] {
  const out: Element[] = [];
  for (const text of Array.from(svg.querySelectorAll('text')).filter((el) => isOffered(el, svg))) {
    // TEXT ON A PATH binds the `<textPath>` itself, not the `<text>` around it. `update()`
    // writes textContent, and writing it on the `<text>` REPLACES the textPath element — the
    // first thing an operator typed would straighten the curve the designer drew.
    const onPath = text.querySelector('textPath');
    if (onPath && text.querySelectorAll('textPath').length === 1) {
      out.push(onPath);
      continue;
    }
    const fields = textFields(text, fontSize);
    const eachOwnRun = fields.every((f) => f.length === 1 && f[0].length === 1);
    if (fields.length > 1 && eachOwnRun) out.push(...fields.map((f) => f[0][0].el));
    else out.push(text);
  }
  return out.filter((el) => candidateSample(el, fontSize).length > 0);
}

/** One `<text>`'s runs, grouped into the fields they read as. A text with one run (or none)
 *  is one field holding itself. */
function textFields(text: Element, fontSize: (el: Element) => number): TextField[] {
  const tspans = leafTspans(text);
  if (tspans.length < 2) {
    return [[[{ el: text, x: null, y: null, text: text.textContent ?? '', size: fontSize(text) }]]];
  }
  const lines = groupLines(
    tspans.map((el) => ({
      el,
      x: numAttr(el, 'x'),
      y: numAttr(el, 'y'),
      text: el.textContent ?? '',
      size: fontSize(el),
    })),
  ).map(groupLine);
  // Stacked lines, none of them holding two placed labels: ONE wrapping field.
  if (lines.every((segments) => segments.length === 1)) return [lines.map((segments) => segments[0])];
  // A composed block. Every segment stands alone, exactly as it did before the wrapping rule.
  return lines.flatMap((segments) => segments.map((segment) => [segment]));
}

/** The attribute the SVG runtime puts on a line IT painted, so it can read a wrapped value back
 *  with its spaces intact (`svgFitValue` in templates/importedDesign/svg.ts). The designer's own
 *  stacked lines are stamped with it at import for exactly the same reason. */
export const SVG_WRAPPED_LINE_ATTR = 'data-noacg-line';

/** Does this `<text>` become ONE field made of several drawn LINES - the case
 *  `markWrappedBlock` exists for? */
function isWrappedBlock(fields: TextField[]): boolean {
  return fields.length === 1 && fields[0].length > 1;
}

/**
 * A WRAPPING BLOCK'S DRAWN LINES ARE STAMPED AS LINES, not left as anonymous runs.
 *
 * Once stacked lines read as ONE field, three things downstream have to agree that the node
 * holds one value spread over several lines, and `textContent` cannot tell them: it joins
 * tspans with nothing between them, so "…hosted the" + "1952 Summer…" comes back as one run-on
 * word, and `getComputedTextLength()` SUMS the three baselines into a budget floor three lines
 * wide, which is a width nothing could ever overflow. Both are exactly the problem the runtime
 * already solved for the lines IT paints, with this stamp - so the drawn lines wear it too, and
 * one rule covers a block before its first `update()` and after it.
 *
 * The artwork itself is untouched: the stamp adds an attribute and moves nothing, so the mapping
 * step and the graphic at rest still show the block the designer drew, line for line. The
 * runtime repaints it at its own leading on the first fit, which is what "NoaCG handles the
 * wrapping" means.
 *
 * A line made of SEVERAL kerned runs cannot be stamped - the stamp is per line, and marking each
 * run would put a space inside a word - so that block is FLATTENED to its one value instead. It
 * loses the hand kerning, which no wrapping block can keep anyway: the moment the words move,
 * the kerning the designer set for their old positions is wrong. The same goes for a line that
 * is not a DIRECT child of the `<text>`: the runtime reads a block off `el.children`, so a line
 * parked inside a wrapper tspan would be stamped here and not recognised there, which is both
 * failures the stamp exists to prevent, arriving silently.
 *
 * NEITHER path touches a `<text>` holding a `<textPath>`. Flattening one would delete the curve
 * the designer drew - the same loss `textCandidates` guards a single textPath against at
 * update() time, and there is no wrapping to be had along a path anyway.
 *
 * A single-line `<text>` is never touched, kerned runs and all: those tspans are the artwork
 * arriving verbatim (src/templates/importedDesign/AGENTS.md), and there is nothing to re-wrap.
 */
function markWrappedBlock(el: Element, lines: TextRun[][], value: string): void {
  if (el.querySelector('textPath')) return;
  if (lines.every((line) => line.length === 1 && line[0].el.parentElement === el)) {
    for (const line of lines) line[0].el.setAttribute(SVG_WRAPPED_LINE_ATTR, '');
    return;
  }
  while (el.firstChild) el.removeChild(el.firstChild);
  el.textContent = value;
}

/**
 * The sample value a candidate starts with — what the layer READS as drawn.
 *
 * `textContent` concatenates runs with nothing between them, which is right INSIDE a line
 * ("A" + "lexandra" + " Riva" is "Alexandra Riva") and wrong across a break or a placed gap,
 * where two words would collapse into one ("Helsinki22:40"). So a `<text>` bound whole joins by
 * the same grouping that decided the fields: runs run together, lines and fields separated by a
 * space.
 *
 * WHITESPACE IS COLLAPSED, as the renderer collapses it. A pretty-printed export wraps a long
 * line across several source lines, so the raw textContent carries newlines and indentation that
 * nothing on screen shows — and that text becomes the FIELD'S DEFAULT VALUE, where a stray run
 * of spaces is real. `xml:space="preserve"` is honoured: a designer who asked for the spacing
 * to be literal gets it literal — except for the breaks BETWEEN the lines of a wrapping block,
 * which are the thing this rule replaces.
 */
function candidateSample(el: Element, fontSize: (element: Element) => number): string {
  const collapse = (s: string) => (spacePreserved(el) ? s.trim() : s.replace(/\s+/g, ' ').trim());
  if (el.tagName.toLowerCase() !== 'text' || leafTspans(el).length < 2) {
    return collapse(el.textContent ?? '');
  }
  return collapse(
    textFields(el, fontSize)
      .map((field) => field.map((line) => line.map((run) => run.text).join('')).join(' '))
      .join(' '),
  );
}

/**
 * WHERE A BOUND `<text>` SITS ONCE ITS RUNS ARE GONE.
 *
 * Illustrator writes a kerned headline as one tspan per run and puts the position on the RUNS,
 * leaving the `<text>` around them with no `x` and no `y` at all. That text is what a merged
 * field binds (see `textCandidates`), and `update()` writes textContent — which replaces the
 * runs and, with them, the only coordinates the line had: the headline snaps to the SVG's
 * origin, off the panel the designer drew it on. On the owner's first walk that read as a
 * field that "didn't affect anything", because the words landed above the top edge.
 *
 * So the run's position is HOISTED onto the text at import: two attributes, on a node that had
 * neither, changing nothing about how the file draws (a tspan's own `x`/`y` still wins) and
 * everything about where the operator's text lands. Taken from the FIRST run, which is where a
 * start-anchored line begins — the same assumption `groupRuns` measures gaps with. A
 * centre-anchored line lands a little left of where it was drawn, and still on its own
 * baseline, which is the difference between a graphic to nudge and a graphic with its headline
 * missing.
 */
function hoistRunPosition(el: Element): void {
  if (el.tagName.toLowerCase() !== 'text') return;
  const first = leafTspans(el)[0];
  if (!first) return;
  // PER AXIS, because a `<text>` stating one and not the other is a real export - a block whose
  // baseline is on the text and whose x is on the runs. Skipping both when either is present
  // left that block with no x at all, and the wrapped lines then restart at the artboard's left
  // edge, which is SVG's default for a missing x.
  for (const axis of ['x', 'y'] as const) {
    if (el.hasAttribute(axis)) continue;
    const value = first.getAttribute(axis);
    if (value !== null && value.trim() !== '') el.setAttribute(axis, value);
  }
}

/** Did the author ask for whitespace to be taken literally, here or on an ancestor? */
function spacePreserved(el: Element): boolean {
  let node: Element | null = el;
  while (node) {
    const value = node.getAttribute('xml:space') ?? node.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'space');
    if (value) return value.trim() === 'preserve';
    node = node.parentElement;
  }
  return false;
}

/**
 * Every `transform` between this element and the root, OUTERMOST FIRST — the order they compose
 * in, and the order `boxInUserSpace` wants them. The root's own transform is excluded: its
 * coordinate system IS the artwork's own units, which is what the whole inventory is written in.
 *
 * A nested `<svg>` in between would add a viewBox scale this does not account for. Left alone
 * deliberately: no exporter this project has met writes one inside a design, and guessing at it
 * would be a second answer to compare against the runtime's, which measures the real thing.
 */
function transformChain(el: Element, root: Element): (string | null)[] {
  const chain: (string | null)[] = [];
  let node: Element | null = el;
  while (node && node !== root) {
    chain.unshift(node.getAttribute('transform'));
    node = node.parentElement;
  }
  return chain;
}

/**
 * IS THIS PATH A RECTANGLE? The geometry test that lets an Illustrator rounded rectangle be
 * the panel that grows (finding 4 of the 2026-08-28 exporter sweep). Illustrator writes a
 * rounded rectangle as `M…h…c…v…c…h…c…v…c…z` — straight axis-aligned runs joined by small
 * corner curves — and never as a `<rect>`. The test is on the path DATA, because DOMParser has
 * no layout: one closed subpath, every segment endpoint on the bounding box's perimeter, and
 * at least one axis-aligned straight run (which is what a circle or a diamond does not have).
 * Returns the box, or null for a shape that is genuinely freeform — those still have no width
 * to change and are still not offered.
 */
export function panelPathGeometry(d: string): { x: number; y: number; width: number; height: number } | null {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/gi);
  if (!tokens) return null;
  // How many numbers each command consumes per repeat, and which of them are an endpoint.
  const ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
  let x = 0;
  let y = 0;
  let subpaths = 0;
  let closed = false;
  let axisRuns = 0;
  const points: { x: number; y: number }[] = [];
  let i = 0;
  let cmd = '';
  while (i < tokens.length) {
    if (/^[a-z]$/i.test(tokens[i])) cmd = tokens[i++];
    const upper = cmd.toUpperCase();
    if (!(upper in ARITY)) return null;
    if (upper === 'Z') {
      closed = true;
      if (points.length) ({ x, y } = points[0]);
      continue;
    }
    const n = ARITY[upper];
    const nums = tokens.slice(i, i + n).map(Number);
    if (nums.length < n || nums.some((v) => !Number.isFinite(v))) return null;
    i += n;
    const rel = cmd !== upper;
    const px = x;
    const py = y;
    if (upper === 'M') {
      if (points.length > 0) return null; // a second subpath: a compound shape, not a panel
      subpaths += 1;
      x = rel ? x + nums[0] : nums[0];
      y = rel ? y + nums[1] : nums[1];
      cmd = rel ? 'l' : 'L'; // subsequent pairs are line segments, per the spec
    } else if (upper === 'H') {
      x = rel ? x + nums[0] : nums[0];
    } else if (upper === 'V') {
      y = rel ? y + nums[0] : nums[0];
    } else {
      // The endpoint is always the LAST coordinate pair of the segment.
      x = rel ? x + nums[n - 2] : nums[n - 2];
      y = rel ? y + nums[n - 1] : nums[n - 1];
    }
    if (upper === 'H' || upper === 'V' || upper === 'L' || upper === 'M') {
      if (points.length > 0 && (Math.abs(x - px) < 0.01 || Math.abs(y - py) < 0.01) && (x !== px || y !== py)) {
        axisRuns += 1;
      }
    }
    points.push({ x, y });
    if (points.length > 32) return null; // a panel is a handful of segments, not an outline
  }
  if (subpaths !== 1 || points.length < 4) return null;
  const first = points[0];
  const last = points[points.length - 1];
  if (!closed && (Math.abs(first.x - last.x) > 0.5 || Math.abs(first.y - last.y) > 0.5)) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const box = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
  if (!(box.width > 0) || !(box.height > 0)) return null;
  if (axisRuns === 0) return null; // a circle or a diamond: every endpoint is on the box, no side is
  // Rectangular: every endpoint sits ON the box's perimeter (a rounded corner's endpoints do —
  // one on each adjacent side). A blob puts points inside the box and fails here.
  const tol = Math.max(1.5, Math.min(box.width, box.height) * 0.02);
  for (const p of points) {
    const onX = Math.abs(p.x - box.x) <= tol || Math.abs(p.x - (box.x + box.width)) <= tol;
    const onY = Math.abs(p.y - box.y) <= tol || Math.abs(p.y - (box.y + box.height)) <= tol;
    if (!onX && !onY) return null;
  }
  return box;
}

/** The shapes a glyph outline is made of. Illustrator's Create Outlines writes one path
 *  per glyph (compound for counters); Inkscape and Figma write paths too, Figma sometimes
 *  polygons. A rect/circle/ellipse is furniture, never a letter. */
const GLYPH_TAGS = new Set(['path', 'polygon']);

/** Cap on the outline rows offered — past this a file is an icon set, not outlined copy,
 *  and a hundred anonymous rows would bury the few that are text. */
const MAX_OUTLINE_CANDIDATES = 24;

/** Cap on the panel rectangles offered. A design with more rectangles than this is a chart or
 *  a table, and its panel is not among the twentieth-widest of them. */
const MAX_SHAPE_CANDIDATES = 12;

/**
 * Groups that may be OUTLINED TEXT (plan §1.A): the `<g>`s whose children are all glyph
 * shapes, at least two of them (one path alone is a shape; a word is several). The root's
 * own loose paths are not offered — a group is what a text object exports as in every
 * editor, and a group is what can be hidden as one thing. Named groups survive the cap
 * first, because a designer who named the layer "Name" has told us what it is.
 */
function outlineCandidates(svg: Element): Element[] {
  const groups = Array.from(svg.querySelectorAll('g')).filter((g) => {
    if (!isOffered(g, svg)) return false;
    const children = Array.from(g.children);
    return children.length >= 2 && children.every((c) => GLYPH_TAGS.has(c.tagName.toLowerCase()));
  });
  if (groups.length <= MAX_OUTLINE_CANDIDATES) return groups;
  const named = groups.filter((g) => layerName(g));
  const rest = groups.filter((g) => !layerName(g));
  // Keep document order inside the cap, so the rows read like the file does.
  const kept = new Set([...named, ...rest].slice(0, MAX_OUTLINE_CANDIDATES));
  return groups.filter((g) => kept.has(g));
}

/** Weight words a PostScript face name ends with, and what each one weighs. Order matters only
 *  for reading; the parser takes the heaviest word it finds. */
const STYLE_WEIGHTS: Record<string, number> = {
  thin: 100, hairline: 100,
  extralight: 200, ultralight: 200,
  light: 300,
  regular: 400, normal: 400, book: 400, roman: 400,
  medium: 500,
  semibold: 600, demibold: 600,
  bold: 700,
  extrabold: 800, ultrabold: 800,
  black: 900, heavy: 900,
};

/** Words that describe a CUT rather than a weight. A face name may end in them, and they must
 *  not stop the suffix from being recognised as a style. */
const STYLE_WORDS = new Set(['italic', 'oblique', 'condensed', 'narrow', 'compressed', 'extended', 'expanded']);

/** Split a PostScript-ish run of words apart: "ArchivoBlack" → "Archivo Black", "PTSans" →
 *  "PT Sans". Only applied to a name that carries no spaces of its own. */
function splitCamel(name: string): string {
  return name.includes(' ')
    ? name
    : name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
}

/**
 * A font name as the LIBRARY knows it, plus the weight the name implied.
 *
 * Illustrator's SVG export writes POSTSCRIPT names — `font-family="Archivo-Bold"`,
 * `"ArchivoBlack-Regular"`, `"HelveticaNeue-CondensedBold"` — where a designer's file names one
 * family. Matched literally, none of those ever finds the bundled face it plainly is, and "Get
 * from Google Fonts" asks Google for a family that does not exist. So the name is read: the part
 * AFTER the last hyphen is the style when every word of it is a style word (which is what keeps
 * "ArchivoBlack-Regular" as the family *Archivo Black* at weight 400, while "Archivo-Black" is
 * *Archivo* at 900), and the family part is split back into words.
 *
 * The verbatim name is never touched — it is what the artwork's own CSS asks for. This is only
 * how the face is looked UP.
 */
function fontLookup(raw: string): { lookup: string; weight: number | null } {
  const name = raw.replace(/_/g, ' ').trim();
  const cut = name.lastIndexOf('-');
  let base = name;
  let weight: number | null = null;
  if (cut > 0) {
    const words = splitCamel(name.slice(cut + 1)).toLowerCase().split(/\s+/).filter(Boolean);
    // A COMPOUND weight is ONE word in the face name and two after splitCamel: "SemiBold"
    // becomes "semi bold", "semi" is not a weight, so the whole suffix stopped reading as a
    // style and `Archivo-SemiBold` never found the bundled Archivo it plainly is - it warned
    // "not available" on a face this project ships. Illustrator writes exactly these names, so
    // the JOINED form is tried first (semibold, extrabold, ultralight, demibold) and the
    // word-by-word reading stays for a suffix that really is two words ("CondensedBold" is a
    // cut AND a weight, and only splitting tells them apart).
    const joined = words.join('');
    const joinedWeight: number | undefined = STYLE_WEIGHTS[joined];
    const isStyle =
      words.length > 0 &&
      (typeof joinedWeight === 'number' || words.every((w) => w in STYLE_WEIGHTS || STYLE_WORDS.has(w)));
    if (isStyle) {
      base = name.slice(0, cut);
      const weights = words.map((w) => STYLE_WEIGHTS[w]).filter((n): n is number => typeof n === 'number');
      weight =
        typeof joinedWeight === 'number' ? joinedWeight : weights.length > 0 ? Math.max(...weights) : null;
    }
  }
  const lookup = splitCamel(base).replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  return { lookup: lookup || name, weight };
}

/** Every font family the markup references: font-family attributes, inline styles, and the
 *  <style> blocks. First-seen order; quotes and fallbacks stripped ("'MyFont', sans-serif"
 *  inventories as MyFont). */
function fontInventory(svg: Element): SvgFontRef[] {
  const seen = new Set<string>();
  const out: SvgFontRef[] = [];
  const add = (value: string) => {
    // The FIRST family of a stack is the one the design was set in; the rest are fallbacks.
    const first = value.split(',')[0]?.replace(/["']/g, '').trim();
    if (!first || /^(sans-serif|serif|monospace|system-ui|cursive|fantasy|inherit)$/i.test(first)) return;
    const key = first.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ family: first, ...fontLookup(first) });
  };
  for (const el of [svg, ...Array.from(svg.querySelectorAll('*'))]) {
    const attr = el.getAttribute('font-family');
    if (attr) add(attr);
    const style = el.getAttribute('style');
    if (style) {
      const m = /font-family\s*:\s*([^;]+)/i.exec(style);
      if (m) add(m[1]);
    }
    if (el.tagName.toLowerCase() === 'style' && el.textContent) {
      for (const m of el.textContent.matchAll(/font-family\s*:\s*([^;}]+)/gi)) add(m[1]);
    }
  }
  return out;
}

/**
 * Turn the browser's own XML parse error into a sentence a designer can act on.
 *
 * Chromium writes `error on line 20 at column 73: EntityRef: expecting ';'` into the parsererror
 * document — it has already located the damage exactly. The refusal used to throw all of that
 * away and say "damaged, or not an SVG at all", which points at the export rather than the file
 * and sends someone back to Illustrator to re-make something that was never the problem
 * (measured on `geometry-unescaped-ampersand`, docs/backlog/svg-import-sweep-findings.md).
 *
 * The AMPERSAND is named because it is far and away the most common cause: an SVG is XML, a
 * bare `&` opens an entity reference, and one arrives every time a web address with a query
 * string is pasted into a `<style>` block or a layer is called "Q&A". One character, one line
 * named, a five-second fix instead of an afternoon.
 */
function svgParseMessage(detail: string): string {
  const where = /error on line (\d+) at column (\d+): (.+)/i.exec(detail);
  if (!where) return 'That file could not be read as SVG — it may be damaged or not an SVG at all.';
  const [, line, column, reason] = where;
  const hint = /entity/i.test(reason)
    ? ' A bare "&" is the usual cause — in SVG it has to be written "&amp;", and one arrives whenever a web address is pasted in or a layer name contains one.'
    : '';
  return `That file could not be read as SVG: line ${line}, column ${column} — ${reason.trim()}.${hint} Fix that spot and drop the file again.`;
}

/**
 * Parse, sanitize and inventory one SVG file's markup. Throws with a user-facing message on
 * a file that is not usable SVG — the caller shows it verbatim.
 */
export function importSvgMarkup(source: string): SvgImportResult {
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  // DOMParser reports XML errors as a parsererror document instead of throwing.
  const parseError = doc.querySelector('parsererror');
  if (parseError) throw new Error(svgParseMessage(parseError.textContent ?? ''));
  const svg = doc.documentElement;
  if (svg.namespaceURI !== SVG_NS || svg.tagName.toLowerCase() !== 'svg') {
    throw new Error('That file is XML but not an SVG document.');
  }

  const size = measureSvg(svg);
  if (!size) {
    throw new Error('This SVG states no size (no viewBox and no width/height). Re-export it with a viewBox — in Illustrator, File > Export > SVG does this — and drop it again.');
  }

  const notices = sanitize(svg);
  normalizeSpacingUnits(svg);
  // Before anything READS the markup: the hidden-layer test, the font-size resolver and the font
  // inventory all take an inline declaration first and a class second, and after this there are
  // no inline ones left for them to take.
  hoistInlineStyles(svg);
  dropIdleSpacePreserve(svg);

  // Inkscape's FLOWED text (`<flowRoot>`) is an SVG 1.2 draft element no browser ever shipped:
  // it draws nothing in Chrome, so the graphic is already missing that copy before we look at
  // it, and there is no node to bind either. Said out loud with the fix, rather than leaving a
  // designer to wonder where their paragraph went. Kept in the markup — removing it would edit
  // someone's file over a rendering opinion.
  if (svg.querySelector('flowRoot')) {
    notices.push(
      'This file uses Inkscape flowed text, which no browser draws — that copy is invisible here and cannot become a field. In Inkscape, select it and use Text > Convert to Text, then export again.',
    );
  }

  // Tag the candidates AFTER sanitizing, so a candidate can never sit inside removed markup.
  const fontSize = fontSizeResolver(svg);
  const nodes = textCandidates(svg, fontSize);
  const candidates: SvgTextCandidate[] = nodes.map((el, i) => {
    const id = `t${i}`;
    el.setAttribute(SVG_CANDIDATE_ATTR, id);
    hoistRunPosition(el);
    // A tspan's own name is rarely set; the nearest named thing is usually its <text> or the
    // group Illustrator made of the layer. The whole inventory rides along, because whether a
    // group's name belongs to ONE text layer is what decides the climb (candidateName).
    const { name, fromGroup } = candidateName(el, svg, nodes);
    const { label, marked, drawing } = stripFieldPrefix(name);
    const sample = candidateSample(el, fontSize);
    // A block that now reads as ONE wrapping field says so in the markup, so the runtime reads
    // one value off it rather than three runs. See markWrappedBlock for why it happens here.
    if (el.tagName.toLowerCase() === 'text') {
      const fields = textFields(el, fontSize);
      if (isWrappedBlock(fields)) markWrappedBlock(el, fields[0], sample);
    }
    return {
      id,
      label: label || `Text ${i + 1}`,
      sample,
      marked,
      drawing,
      namedByGroup: fromGroup,
      numeric: looksNumeric(sample),
      clock: looksClock(sample),
    };
  });

  // Picture layers, in document order: every surviving <image> that is drawn where it stands
  // (the sanitizer already dropped external ones), plus every shape PAINTED with one through a
  // pattern fill - which is the only form Figma ever exports a placed raster in, and the reason
  // a Figma guest photo used to arrive as unswappable artwork (svgPictureTarget above).
  // A placeholder with no picture at all has nothing to restore on empty, so it is skipped.
  //
  // ONE ROW PER PICTURE, not per shape: two shapes filled from the same pattern paint the same
  // `<image>`, and only one node can carry the field id - so a second row would promise a swap
  // that silently moved the first row's picture too.
  const boundPictures = new Set<Element>();
  const images: SvgImageCandidate[] = Array.from(
    svg.querySelectorAll('image, rect, path, circle, ellipse, polygon'),
  )
    .filter((el) => isOffered(el, svg))
    .filter((el) => {
      const picture = pictureNode(el, svg); // resolved once: following a pattern is not free
      if (!picture || boundPictures.has(picture)) return false;
      boundPictures.add(picture);
      return true;
    })
    .map((el, i) => {
      const id = `i${i}`;
      el.setAttribute(SVG_CANDIDATE_ATTR, id);
      const { label, marked } = stripFieldPrefix(candidateName(el, svg).name);
      return { id, label: label || `Picture ${i + 1}`, marked };
    });

  // Outlined-text suspects: tagged like the rest, so the mapping step can highlight and
  // measure them on its rendered artwork, and the generator can hide the chosen ones.
  const outlines: SvgOutlineCandidate[] = outlineCandidates(svg).map((el, i) => {
    const id = `o${i}`;
    el.setAttribute(SVG_CANDIDATE_ATTR, id);
    const { label, marked } = stripFieldPrefix(candidateName(el, svg).name);
    return { id, label: label || `Shapes ${i + 1}`, marked };
  });

  // BEHAVIOUR LAYERS: every NAMED group, tagged last so it can never steal a marker from a
  // text, picture or outline candidate — one element carries one marker, and the kinds above
  // are the ones that bind to a field. (A marker may name two ROLES — the panel shapes below
  // reuse a picture's — but it never names two elements, which is what the selectors rely on.)
  // Deliberately NOT filtered by `isOffered`: a drawn state
  // is normally hidden in Illustrator (that is how the designer sees their base look), so
  // hidden is a hint here rather than a disqualification. A group inside <defs>/<symbol> is
  // still excluded — nothing there is a layer.
  const groups: SvgGroupCandidate[] = Array.from(svg.querySelectorAll('g'))
    .filter((el) => !el.hasAttribute(SVG_CANDIDATE_ATTR))
    .filter((el) => !isInNonRendered(el, svg))
    .filter((el) => layerName(el))
    .map((el, i) => {
      const id = `g${i}`;
      el.setAttribute(SVG_CANDIDATE_ATTR, id);
      const { label } = stripFieldPrefix(layerName(el));
      return { id, label, hidden: isHiddenSubtree(el, svg) };
    });

  // PANEL SHAPES: the rectangles a graphic could grow (plan §3, the hug). Tagged after every
  // binding kind, so a marker is never taken from something that becomes a field.
  //
  // A PICTURE-FILLED SHAPE IS OFFERED HERE TOO, ON THE MARKER IT ALREADY CARRIES (sweep finding
  // 7). Since a shape painted with a pattern became a picture candidate, a Figma card whose
  // backplate IS the photograph - a full-bleed guest card, a photo strap - was tagged `iN` above
  // and left this inventory entirely, so the panel the name has to widen could not be picked and
  // the measured default fell to whatever rectangle was left (on the corpus's own strap, a 10px
  // accent tab). docs/SVG_AUTHORING.md makes the designer both promises about that one rectangle
  // and never says they have to choose between them.
  //
  // ONE ELEMENT STILL CARRIES ONE MARKER; what changes is that one MARKER may name two roles.
  // That is deliberate, and it is the cheap half of the two designs: every surface downstream
  // addresses a candidate by its exact marker value (`[data-noacg-candidate="i3"]`), so reusing
  // the id resolves to the same element in either role, while a second marker on the element
  // would have to be a list and would break every one of those selectors. Uniqueness is
  // unchanged - an id is minted once per element, never per role - and the two roles bind
  // different NODES anyway: growth stamps the rect, the picture field takes the id of the
  // `<image>` the pattern resolves to (templates/importedDesign/svg.ts). What the surfaces do owe
  // this is to stop assuming a candidate id appears in exactly one inventory: `proposeFollowers`
  // and the canvas's pickable list dedupe, and a DRAG on a dual-role shape means growth rather
  // than the picture toggle a plain click still means (MapSvgFieldsStep).
  //
  // WIDEST FIRST: the
  // background of a banner is the widest rectangle in it, and the picker should lead with the
  // shape the reader means nine times out of ten. A `<path>` whose data reads as a rectangle
  // (Illustrator's rounded rectangle) qualifies exactly like a `<rect>` — see panelPathGeometry;
  // a path inside an outlined-text suspect is a GLYPH (an outlined capital I is a bar) and is
  // never a panel.
  const panels = Array.from(svg.querySelectorAll('rect, path'))
    .filter((el) => {
      const marker = el.getAttribute(SVG_CANDIDATE_ATTR);
      return marker === null || marker.startsWith('i');
    })
    .filter((el) => isOffered(el, svg))
    .map((el) => {
      // The shape's own coordinates first, then WHERE THAT LANDS on the artboard: every
      // `transform` between it and the root moves the system the attributes are written in, and a
      // plate drawn on an angle is the normal case in hand-made artwork rather than an edge one
      // (owner's quiz board, 2026-09-02 - see assets/svgGeometry.ts for what this used to report).
      const local = ((): { x: number; y: number; width: number; height: number } | null => {
        if (el.tagName.toLowerCase() === 'rect') {
          return {
            x: numAttr(el, 'x') ?? 0,
            y: numAttr(el, 'y') ?? 0,
            width: numAttr(el, 'width') ?? 0,
            height: numAttr(el, 'height') ?? 0,
          };
        }
        const inOutline = el.parentElement?.hasAttribute(SVG_CANDIDATE_ATTR)
          ? (el.parentElement.getAttribute(SVG_CANDIDATE_ATTR) ?? '').startsWith('o')
          : false;
        return inOutline ? null : panelPathGeometry(el.getAttribute('d') ?? '');
      })();
      if (!local) return { el: el as Element, x: 0, y: 0, w: 0, h: 0 };
      const box = boxInUserSpace(local, transformChain(el, svg));
      return { el: el as Element, x: box.x, y: box.y, w: box.width, h: box.height };
    })
    .filter((r) => r.w > 0 && r.h > 0)
    .sort((a, b) => b.w - a.w);

  // THE CAP COUNTS WHAT THIS INVENTORY ADDS, so the two kinds are capped separately. A shape that
  // is already a picture candidate has a row on the step either way; letting one spend a slot
  // would mean twelve photo tiles drawn wider than the panel silently pushing the panel a name
  // has to widen out of the growth list, on a file whose panel was offered before a picture could
  // be a panel at all. Merged back into WIDEST-FIRST order, which is the order
  // `proposeBannerGrowth` reads this list in.
  const alreadyPictures = panels.filter((r) => r.el.hasAttribute(SVG_CANDIDATE_ATTR));
  const plainShapes = panels.filter((r) => !r.el.hasAttribute(SVG_CANDIDATE_ATTR));
  let minted = 0;
  const shapes: SvgShapeCandidate[] = [
    ...alreadyPictures.slice(0, MAX_SHAPE_CANDIDATES),
    ...plainShapes.slice(0, MAX_SHAPE_CANDIDATES),
  ]
    .sort((a, b) => b.w - a.w)
    .map(({ el, x, y, w, h }, i) => {
      // A shape that is ALREADY a picture candidate keeps that marker (see above); only a new
      // one mints an `sN`, and the counter is the mint count rather than the row index so a file
      // with no dual-role shape numbers exactly as it always did.
      const id = el.getAttribute(SVG_CANDIDATE_ATTR) ?? `s${minted++}`;
      el.setAttribute(SVG_CANDIDATE_ATTR, id);
      const { label } = stripFieldPrefix(candidateName(el, svg).name);
      return {
        id,
        label: label || (el.tagName.toLowerCase() === 'path' ? `Panel ${i + 1}` : `Rectangle ${i + 1}`),
        x,
        y,
        width: w,
        height: h,
      };
    });

  // A layer name is a designer's private note ("Name" on three different straps) and becomes an
  // OPERATOR'S label. Three rows reading "Name", and a control page with three identical inputs,
  // is a file the reader has to decode by clicking. Numbered in document order, and only where
  // the name actually repeats — the common file numbers nothing.
  // Shapes are deliberately NOT numbered with the rest: they share a name with the group they
  // sit in ("Panel"), so numbering the whole set would start the rectangle list at "Panel 2".
  // The picker prints each one's size beside its name, which is what tells them apart anyway.
  numberRepeats([...candidates, ...images, ...outlines, ...groups]);
  // ONE ELEMENT, ONE NAME. The exclusion above is about shapes that are ONLY shapes; a dual-role
  // backplate is a numbered picture row too, so leaving its shape label as first computed would
  // print "Backplate 2" in Pictures and plain "Backplate" in the growth picker for the very
  // element the reader is pointing at - and `labelOfCandidate` searches shapes first, so the
  // follower line would print the un-numbered one as well.
  const pictureLabels = new Map(images.map((row) => [row.id, row.label]));
  for (const shape of shapes) {
    const named = pictureLabels.get(shape.id);
    if (named) shape.label = named;
  }

  // Text inside a SYMBOL is drawn (a <use> paints a copy of it) but cannot be bound, so it is
  // not in the rows above. Said out loud only when a <use> actually paints one: an unused symbol
  // library is invisible, and nobody wonders where its text went.
  if (svg.querySelector('use') && Array.from(svg.querySelectorAll('symbol, defs')).some((d) => d.querySelector('text'))) {
    notices.push(
      'Text inside a reusable symbol is drawn but cannot become an operator field — every copy of a symbol shows the same words. Move that text onto the artboard if it should be editable.',
    );
  }

  return {
    markup: new XMLSerializer().serializeToString(svg),
    width: size.width,
    height: size.height,
    candidates,
    images,
    outlines,
    groups,
    shapes,
    fonts: fontInventory(svg),
    notices,
  };
}

/** Number the labels that REPEAT, in place: "Name", "Name 2", "Name 3". A label that appears
 *  once is left exactly as the designer wrote it. */
function numberRepeats(rows: { label: string }[]): void {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.label, (counts.get(row.label) ?? 0) + 1);
  const seen = new Map<string, number>();
  for (const row of rows) {
    if ((counts.get(row.label) ?? 0) < 2) continue;
    const n = (seen.get(row.label) ?? 0) + 1;
    seen.set(row.label, n);
    if (n > 1) row.label = `${row.label} ${n}`;
  }
}
