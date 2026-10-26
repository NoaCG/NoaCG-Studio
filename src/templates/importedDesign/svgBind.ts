// THE BIND PASS of an imported SVG: the chosen candidates become the template's `<svg>` - field
// ids, the classes the stylesheet and the runtimes match, the layout stamps, the behaviour's
// marks - and the import's markers come off. The one DOM pass of the build (DOMParser in,
// XMLSerializer out), so the corpus harness in Chromium is its test
// (scripts/svg-import-passes.test.mjs, the `bind` record).

import type { DesignSvg, DesignSvgFollower } from '../../model/wizard';
import { SVG_CANDIDATE_ATTR, svgPictureTarget } from '../../assets/svgImport';
import { boundBehaviour } from './behaviour';
import { countdownIndex, svgFields } from './artworkFields';
import { creditsArtworkFields, creditsClass, creditsIndex } from './creditsRoll';
import { PREFIX } from './shared';
import { followToken, growToken, LAYOUT_EL_ATTR, layoutRules } from './svgLayout';

/**
 * The designer's own name for a marked element, off the markup - `data-name` carries the
 * original spelling where an exporter uniquified the id. Null when nothing named it, so the
 * caller can fall back honestly.
 *
 * IT LOOKS UP THE TREE, as the step's own naming does (`candidateName`, assets/svgImport.ts).
 * Illustrator writes the layer name on the GROUP and leaves the rect inside it anonymous, so a
 * plate the step calls "q bg" was read here as unnamed and every growth rule on it emitted the
 * comment `// "Layer" grows wider` - a comment about the generated code that named the wrong
 * thing, on the one file the owner walks.
 *
 * IT STOPS AT THE FIRST ANCESTOR THAT HOLDS SOMEBODY ELSE. A name only belongs to this layer
 * while the group wearing it wraps this layer alone; a group holding two marked layers is a
 * container, and its name would be handed to every plate inside it. Stopping at the ROOT is not
 * enough for that: Illustrator writes `id="Layer_1"` on the `<svg>`, but Figma and Inkscape wrap
 * the artwork in a NAMED group under the root, which would emit `// "Frame 1" grows wider` on
 * every row - the same wrong comment in a different exporter's spelling.
 */
export function candidateLabel(svg: DesignSvg, candidateId: string): string | null {
  const doc = new DOMParser().parseFromString(svg.markup, 'image/svg+xml');
  const root = doc.documentElement;
  let el = doc.querySelector(`[${SVG_CANDIDATE_ATTR}="${candidateId}"]`);
  // The marked element itself is allowed a name whatever it contains - it IS the layer.
  const own = el?.getAttribute('data-name') ?? el?.getAttribute('id');
  if (own?.trim()) return own.trim();
  el = el?.parentElement ?? null;
  while (el && el !== root && el.querySelectorAll(`[${SVG_CANDIDATE_ATTR}]`).length <= 1) {
    const name = el.getAttribute('data-name') ?? el.getAttribute('id');
    if (name?.trim()) return name.trim();
    el = el.parentElement;
  }
  return null;
}

/**
 * THE SWAP AND THE RESTORE BOTH SPEAK `href`, so a bound picture keeps exactly one spelling.
 *
 * Illustrator and Figma both write the SVG 1.1 `xlink:href` on a placed picture, while
 * `setFieldValue` (templates/shared/base.ts) remembers and rewrites the SVG 2 `href`. Left as
 * exported that half-works in the worst way: an operator's swap paints (a browser prefers
 * `href`), and CLEARING the field restores an empty string over a picture the `xlink:href`
 * beside it can no longer bring back - the field's own promise, "empty keeps the picture you
 * drew", failing only on the second click. Moving the value rather than copying it also keeps
 * one base64 payload in the export instead of two.
 */
function normalizePictureHref(el: Element): void {
  const legacy = el.getAttribute('xlink:href');
  if (legacy === null) return;
  if (!el.getAttribute('href')) el.setAttribute('href', legacy);
  el.removeAttribute('xlink:href');
}

/**
 * Rename an element's id and move every in-document reference to it with the rename. An SVG
 * refers to its own nodes by `#id` all over - a `<use>` inside a `<pattern>`, a gradient, a clip
 * path - so an id changed on its own turns a painted shape into an empty one.
 *
 * References are COMPARED, never selected. The old id is the DESIGNER'S text - Figma names a
 * text layer after the words in it - and an id carrying a quote or a backslash makes
 * `[href="#…"]` an invalid selector, which throws out of here and out of Create project. This
 * used to run only for the handful of layer ids that collided with ours (`f0`, `q-sel-1`), all
 * of them safe tokens; it now runs for every bound field.
 *
 * A DUPLICATE id moves nothing. Figma writes a duplicated layer's name into `id` verbatim, so a
 * file really can carry the same id twice (corpus: `figma-duplicate-ids-scorebug`), and a
 * browser answers `#id` with the FIRST one. A later twin was therefore never what any reference
 * pointed at, and repointing them here would silently hand this node's picture to another shape.
 */
function setIdKeepingRefs(root: Element, el: Element, id: string): void {
  const was = el.getAttribute('id');
  el.setAttribute('id', id);
  if (!was || was === id) return;
  const all = Array.from(root.querySelectorAll('*'));
  const twin = all.findIndex((n) => n.getAttribute('id') === was);
  if (twin !== -1 && twin < all.indexOf(el)) return; // an earlier twin owns the references
  for (const ref of all) {
    if (ref.getAttribute('href') === `#${was}`) ref.setAttribute('href', `#${id}`);
    if (ref.getAttribute('xlink:href') === `#${was}`) ref.setAttribute('xlink:href', `#${id}`);
  }
}

/**
 * Bind the chosen candidates: each gets id="fN" (in field order), every remaining candidate
 * marker is stripped, and the root <svg> gains the artwork class so the part registry names
 * it. Any pre-existing id that collides with a bound one is prefixed out of the way - the
 * field ids are the one namespace the platform owns inside the file.
 *
 * `keepMarkers` is the ONE preview-only exception (`ResolvedOptions.previewMarkers`): the
 * mapping step's hover highlight needs a handle on the layer a checklist row means, and the
 * preview iframe is the only canvas that has the fit runtime. A ticked OUTLINE group still
 * loses its marker there - that group is hidden and its live stand-in wears the marker
 * instead (components/wizard/import/draft.ts `withSvgOutlineFields`), so one marker always points at
 * whatever actually airs.
 */
export function bindSvgMarkup(svg: DesignSvg, keepMarkers = false): string {
  const doc = new DOMParser().parseFromString(svg.markup, 'image/svg+xml');
  const root = doc.documentElement;

  // The artwork identity (model/structure.ts `.{prefix}-art`) - appended, never replacing
  // classes the designer put there.
  const classes = (root.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
  if (!classes.includes(`${PREFIX}-art`)) classes.push(`${PREFIX}-art`);
  root.setAttribute('class', classes.join(' '));

  // Field ids are ours: a layer Illustrator happened to name "f0" would collide with the
  // binding, so any such id moves aside (references to it inside the file move with it). The
  // behaviour's own fields count here too - its holders carry `fN` ids like any other field,
  // and the stamped layer ids (`q-sel-1`, `p-bar-1`, …) are ours for the same reason.
  const behaviour = boundBehaviour(svg, svgFields(svg));
  const taken = new Set([
    ...[...svg.fields, ...svg.images, ...Array(behaviour?.fieldCount ?? 0)].map((_, i) => `f${i}`),
    ...(behaviour?.layerIds ?? []),
  ]);
  for (const el of Array.from(root.querySelectorAll('[id]'))) {
    const id = el.getAttribute('id')!;
    if (taken.has(id)) setIdKeepingRefs(root, el, `layer-${id}`);
  }

  const clock = countdownIndex(svg);
  const credits = creditsIndex(svg);
  const artworkCredits = creditsArtworkFields(svg, root);
  [...svg.fields, ...svg.images].forEach((field, i) => {
    const el = root.querySelector(`[${SVG_CANDIDATE_ATTR}="${field.candidateId}"]`);
    if (!el) return;
    if (i === clock || i === credits || artworkCredits.has(i)) {
      // The countdown DISPLAY: the clock runtime paints into `.{prefix}-clock`, and the
      // operator's minutes land in the hidden #fN holder instead - so this node takes the
      // class and NOT the field id, or update() would write "10" over the ticking readout.
      // The CREDITS SAMPLE is the same shape: the operator's list lands in its holder, and the
      // drawn text keeps its two looks for the roll engine to copy (creditsRoll.ts).
      // The sample is the whole <text>: a composed block offers its runs as candidates, and the
      // roll copies looks and leading off the lines of the text those runs belong to.
      const target = i === credits || artworkCredits.has(i) ? el.closest('text') ?? el : el;
      const cls = i === clock ? `${PREFIX}-clock` : creditsClass(PREFIX);
      const own = (target.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
      if (!own.includes(cls)) own.push(cls);
      target.setAttribute('class', own.join(' '));
      return;
    }
    // A PICTURE field binds the node whose href paints the picture, which is not always the node
    // the mapping step offered: Figma's placed raster is a `<rect fill="url(#pattern0)">` painted
    // by an `<image>` parked in `<defs>`, and only that `<image>` responds to a swap
    // (assets/svgImport.ts `svgPictureTarget` states why the two are chosen separately). Taking
    // the id KEEPS the references: the pattern's `<use>` points at the picture by id, so an
    // unaccompanied `setAttribute('id', …)` would leave the shape painting nothing.
    if (i < svg.fields.length) {
      setIdKeepingRefs(root, el, `f${i}`);
      return;
    }
    const picture = svgPictureTarget(el, root);
    normalizePictureHref(picture);
    setIdKeepingRefs(root, picture, `f${i}`);
  });
  // An outlined-text group the user chose to replace (plan §1.A) is HIDDEN, not deleted:
  // the class below is what the `.{prefix}-outlined { display: none }` rule in template.css
  // matches, so a professional can compare the live text against the shapes by deleting
  // one line, and the file still carries everything the designer exported. The HTML field
  // that stands in for it is placed afterwards (components/wizard/import/draft.ts).
  for (const outline of svg.outlines) {
    const el = root.querySelector(`[${SVG_CANDIDATE_ATTR}="${outline.candidateId}"]`);
    if (!el) continue;
    const own = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
    if (!own.includes(`${PREFIX}-outlined`)) own.push(`${PREFIX}-outlined`);
    el.setAttribute('class', own.join(' '));
  }
  // A text layer the author said should come OFF the artwork, hidden the same way and for the
  // same reason: the designer's own shapes stay in the file, and one rule takes them off air.
  // Its own class rather than the outlined one, because the two are different statements - a
  // replaced outline has a live field standing where it was, and this has nothing.
  for (const gone of svg.hidden ?? []) {
    const el = root.querySelector(`[${SVG_CANDIDATE_ATTR}="${gone.candidateId}"]`);
    if (!el) continue;
    const own = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
    if (!own.includes(`${PREFIX}-removed`)) own.push(`${PREFIX}-removed`);
    el.setAttribute('class', own.join(' '));
  }
  // THE ELEMENTS A LAYOUT RELATIONSHIP NAMES (plan §6c): every participant - an element that
  // may GROW, and anything DECLARED to travel with it - is stamped with one token, and the
  // emitted NOACG_LAYOUT table says what each token does. One stamp kind for the whole
  // feature, so a rule can name several elements without minting a class per role.
  for (const [i, rule] of layoutRules(svg).entries()) {
    // A SPACE-SEPARATED list of tokens, not a single value: one element may be named by two
    // rules at once - the wider-then-wrap ladder is one panel growing on both axes - and a
    // plain `setAttribute` would let the second rule erase the first one's stamp.
    const stamp = (candidateId: string, token: string) => {
      const el = root.querySelector(`[${SVG_CANDIDATE_ATTR}="${candidateId}"]`);
      if (!el) return;
      const own = (el.getAttribute(LAYOUT_EL_ATTR) ?? '').split(/\s+/).filter(Boolean);
      if (!own.includes(token)) own.push(token);
      el.setAttribute(LAYOUT_EL_ATTR, own.join(' '));
    };
    stamp(rule.candidateId, growToken(i));
    rule.followers?.forEach((f: DesignSvgFollower, j: number) => stamp(f.candidateId, followToken(i, j)));
  }
  // The layers a bound behaviour claims: our id, plus the state class on the ones that are drawn
  // MOMENTS. Before the markers are stripped - that is what they are for.
  behaviour?.markLayers(root);
  const replaced = new Set(svg.outlines.map((o) => o.candidateId));
  for (const el of Array.from(root.querySelectorAll(`[${SVG_CANDIDATE_ATTR}]`))) {
    if (keepMarkers && !replaced.has(el.getAttribute(SVG_CANDIDATE_ATTR) ?? '')) continue;
    el.removeAttribute(SVG_CANDIDATE_ATTR);
  }
  return new XMLSerializer().serializeToString(root);
}
