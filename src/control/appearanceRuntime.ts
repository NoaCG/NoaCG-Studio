// PLACE AND SIZE IN A DOCUMENT THAT IS THE PAGE (docs/work-specs/playout-adjustments/spec.md,
// phase 1b): an exported overlay, a CasparCG or SPX template, a graphic behind the local relay or
// the hosted log. There is no NoaCG frame around such a document, so the applied appearance
// (control/cueAdjust.ts) goes on its root instead: `document.documentElement`, or the canvas an
// OGraf Graphic mounts in its shadow root (the `host` argument).
//
// WHY THE ROOT, AND WHY THE RECTS ARE MAPPED BACK (the catalog sweep, e2e/playout-adjust-documents
// .spec.ts and evidence/phase-notes.md row 32c). On the `/output` stage the transform sits on the
// iframe, so the document never sees it. Inside the document it would: `getBoundingClientRect`
// and `getClientRects` report boxes after every ancestor transform, and the catalog's own fit
// runtimes (templates/shared/stageFit.ts, textFit.ts) size text from those rects against unscaled
// padding, so a board shrunk to 85 % fitted its words smaller than the same board in a scaled
// frame (qz01: 2,328 px apart). So while a host is transformed, those four reads answer the box
// the element would have untransformed: the document measures exactly what it measures in a
// frame, and the transform stays what a frame transform is, a picture of the page. The five
// designs that use viewport units (tk21, tr05, tr10, tr11, tr12) need nothing more: `html, body`
// clip at the canvas, and `clip-path: inset(0)` keeps that clip when the root itself shrinks.
// `<body>` and a wrapper around the body's children were measured too and gave nothing the root
// does not; a wrapper also breaks `body > .x` rules and `document.body.children` reads.
//
// THE FOUR RULES (cueAdjust.ts) as this block keeps them: an update without `appearance` never
// calls it (1); a call REPLACES what is applied, so a baked default and a cue's appearance from the
// relay never multiply (3); a version this build does not know is ignored and the call answers
// false, so the caller keeps what it had (rollback). Rule 2 and 4 belong to the senders and to the
// receivers' recovery.
//
// ES5 and emitted as text: it runs inside exported files on CasparCG 2.3's Chromium 71.
// `var noacgApplyAppearance = noacgApplyAppearance || ...` installs once per page however many
// blocks carry it (a bake and a receiver in one overlay), and stays module-local in an OGraf
// graphic.mjs, where nothing reaches the renderer's globals. The rect mapping lives on the
// prototypes, installed once, and maps only rects of elements under a transformed host, so a
// renderer page's own reads are untouched.

import type { AppliedAppearance } from './cueAdjust.ts';

/** The id the bake's own `<script>` tag carries; the import door leaves it out (model/importTemplate.ts). */
export const APPEARANCE_SCRIPT_ID = 'noacg-appearance';

export const APPEARANCE_RUNTIME_JS = `var noacgApplyAppearance = noacgApplyAppearance || (function () {
  var EP = Element.prototype, RP = Range.prototype;
  var hosts = EP.__noacgAppearanceHosts;
  if (!hosts) {
    hosts = [];
    EP.__noacgAppearanceHosts = hosts;
    var rect0 = EP.getBoundingClientRect, rects0 = EP.getClientRects;
    var rangeRect0 = RP.getBoundingClientRect, rangeRects0 = RP.getClientRects;
    var under = function (node, h) {
      if (!node) return false;
      if (node.nodeType !== 1) node = node.parentNode;
      return !!node && (node === h || (node.getRootNode() === h.getRootNode() && h.contains(node)));
    };
    // The rect the element would report with its host untransformed. The host's own reported box
    // gives what lies above it (a renderer's own scale k, a position), so the inverse holds in a
    // renderer page as in a document of its own.
    var unmap = function (node, r) {
      for (var i = 0; i < hosts.length; i++) {
        var h = hosts[i];
        if (!h.el.isConnected) { hosts.splice(i--, 1); continue; }
        if (!under(node, h.el)) continue;
        var f = h.f, box = rect0.call(h.el), w = h.el.offsetWidth;
        var k = w ? box.width / (f.s * w) : 1;
        var x0 = box.left - k * (f.ox + f.dx - f.s * f.ox), y0 = box.top - k * (f.oy + f.dy - f.s * f.oy);
        var x = x0 + k * (f.ox + ((r.left - x0) / k - f.ox - f.dx) / f.s);
        var y = y0 + k * (f.oy + ((r.top - y0) / k - f.oy - f.dy) / f.s);
        return new DOMRect(x, y, r.width / f.s, r.height / f.s);
      }
      return r;
    };
    var list = function (node, l) {
      var out = [];
      for (var i = 0; i < l.length; i++) out.push(unmap(node, l[i]));
      out.item = function (n) { return out[n] || null; };
      return out;
    };
    EP.getBoundingClientRect = function () { return hosts.length ? unmap(this, rect0.call(this)) : rect0.call(this); };
    EP.getClientRects = function () { return hosts.length ? list(this, rects0.call(this)) : rects0.call(this); };
    RP.getBoundingClientRect = function () { return hosts.length ? unmap(this.commonAncestorContainer, rangeRect0.call(this)) : rangeRect0.call(this); };
    RP.getClientRects = function () { return hosts.length ? list(this.commonAncestorContainer, rangeRects0.call(this)) : rangeRects0.call(this); };
  }
  var num = function (n) { return typeof n === 'number' && isFinite(n); };
  // Apply an appearance to the host, replacing the one it holds. Answers false, and changes
  // nothing, for anything this build cannot read.
  return function (a, host) {
    if (!a || typeof a !== 'object' || a.v !== 1) return false;
    var f = a.frame;
    if (f !== undefined && !(f && num(f.dx) && num(f.dy) && num(f.s) && f.s > 0 && num(f.ox) && num(f.oy))) return false;
    var el = host || document.documentElement;
    for (var i = 0; i < hosts.length; i++) if (hosts[i].el === el) hosts.splice(i--, 1);
    if (f) {
      hosts.push({ el: el, f: { dx: f.dx, dy: f.dy, s: f.s, ox: f.ox, oy: f.oy } });
      el.style.transform = 'translate(' + f.dx + 'px, ' + f.dy + 'px) scale(' + f.s + ')';
      el.style.transformOrigin = f.ox + 'px ' + f.oy + 'px';
      el.style.clipPath = 'inset(0)';
    } else {
      el.style.transform = '';
      el.style.transformOrigin = '';
      el.style.clipPath = '';
    }
    return true;
  };
})();`;

/**
 * THE BAKE (`bakeAppearance` in the spec): a graphic's place and size as a script of its own that
 * applies it to the document's root at load, exactly as a receiver applies an appearance a row
 * carries, so a relay row replaces it rather than adding to it. Every single-file and SPX target
 * bakes through this one function (export/targets/*); an OGraf Graphic applies the same runtime to
 * its canvas (targets/ograf.ts). Nothing for an identity or no appearance, so a package nobody
 * adjusted keeps its bytes. A tag of its own, by id, which the import door leaves out.
 */
export function bakeAppearance(appearance: AppliedAppearance | undefined): { id: string; js: string }[] {
  return appearance?.frame
    ? [{ id: APPEARANCE_SCRIPT_ID, js: `${APPEARANCE_RUNTIME_JS}\nnoacgApplyAppearance(${JSON.stringify(appearance)});` }]
    : [];
}
