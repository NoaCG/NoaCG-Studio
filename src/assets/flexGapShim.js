/*
 * FLEX `gap` ON OLD PLAYOUT ENGINES - a runtime shim the studio's composers and exporters put
 * beside GSAP. It is platform plumbing, not part of the template's own code.
 *
 * WHY. Flexbox `gap` shipped in Chromium 84. CasparCG 2.3.x - the LTS a school downloads today -
 * renders on CEF 3.3578 (Chromium 71), which PARSES the declaration (grid has had `gap` since 66)
 * and then ignores it in flex layout. Nothing errors and nothing is logged: the graphic airs with
 * every flex gap collapsed. The house scorebug read `HOME3` on a real 2.3.2 server where 2.5.0
 * reads `HOME 5` (measured 2026-09-10; docs/handoffs/2026-09-10-bk-flex-gap-on-old-engines.md).
 *
 * WHAT IT DOES. On an engine WITHOUT flex gap it puts the gap back as margins. Every in-flow flex
 * item after the first gets the container's main-axis gap on the side that faces the item before
 * it (left in a row, top in a column, mirrored for the `-reverse` directions and for rtl), added
 * on top of whatever margin the stylesheet already gives it. A wrapped container also gets the
 * cross-axis gap on every line after the first, found by reading where the browser actually
 * broke the lines. It keeps up with the graphic afterwards: rows rebuilt with innerHTML, a chip
 * that appears, a class toggle - a MutationObserver refits the containers that changed. Before
 * every pass it UNDOES its own margins, so what it reads is always the authored value.
 *
 * WHAT IT DOES NOT DO. On Chromium 84 and newer (CasparCG 2.4 and 2.5, OBS, vMix, any browser)
 * the feature test at the top passes and the script returns without touching the document: the
 * template's own CSS does the work, as designed. It never edits the template's code, so what a
 * person reads in the editor or in an export is still one plain `gap:` line. The one known
 * limit: an item that fits its line without the gap in front of it but not with it can land one
 * line earlier than native `gap` would put it. That band is one gap wide, and
 * scripts/flex-gap-sweep.mjs measures every catalog design native-against-shimmed to show
 * nothing settles in it.
 *
 * PROVING IT ON A MODERN ENGINE. Set `window.NOACG_SIMULATE_NO_FLEX_GAP = true` before this
 * script runs and it behaves as if the engine lacked flex gap AND zeroes each handled
 * container's own gap, so a modern Chromium lays out exactly what CEF 71 would. That is how the
 * sweep compares the shim against native layout across the whole catalog.
 *
 * Plain ES5 in a classic script, on purpose: it has to parse on the engine it exists for.
 */
(function () {
  var SIMULATE = window.NOACG_SIMULATE_NO_FLEX_GAP === true;

  // The feature test: a column flex box with a 1px row gap and two empty children is 1px tall
  // only where flex gap works. It runs at parse time, so it hangs off <html>; <body> may not
  // exist yet when this script sits in the head.
  function engineHasFlexGap() {
    var probe = document.createElement('div');
    probe.style.cssText = 'display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden';
    probe.appendChild(document.createElement('div'));
    probe.appendChild(document.createElement('div'));
    document.documentElement.appendChild(probe);
    var has = probe.scrollHeight === 1;
    document.documentElement.removeChild(probe);
    return has;
  }
  if (!SIMULATE && engineHasFlexGap()) return;

  // ── Bookkeeping: every inline property this shim writes, so it can take them back ──────────
  // An element can carry writes in two roles: as an ITEM (the margins that stand in for its
  // parent's gap) and as a BOX (in simulation, the zeroed gap of a container). They are undone
  // separately, because refitting a container must not disturb the container's own children's
  // containers.
  var own = new WeakMap();

  function write(el, role, prop, value, important) {
    var list = own.get(el);
    if (!list) {
      list = [];
      own.set(el, list);
    }
    list.push({
      role: role,
      prop: prop,
      was: el.style.getPropertyValue(prop),
      wasPriority: el.style.getPropertyPriority(prop),
      set: value,
    });
    el.style.setProperty(prop, value, important ? 'important' : '');
  }

  function undo(el, role) {
    var list = own.get(el);
    if (!list) return;
    var keep = [];
    for (var i = list.length - 1; i >= 0; i--) {
      var w = list[i];
      if (w.role !== role) {
        keep.unshift(w);
        continue;
      }
      // Something else wrote this property since - a tween, the template's own JS. Its value
      // wins, and from here on it is the authored value.
      if (el.style.getPropertyValue(w.prop) !== w.set) continue;
      if (w.was) el.style.setProperty(w.prop, w.was, w.wasPriority);
      else el.style.removeProperty(w.prop);
    }
    if (keep.length) own.set(el, keep);
    else own.delete(el);
  }

  // ── Reading the authored layout ────────────────────────────────────────────────────────────
  function isFlex(display) {
    return display === 'flex' || display === 'inline-flex';
  }

  function inFlow(cs) {
    return cs.display !== 'none' && cs.position !== 'absolute' && cs.position !== 'fixed';
  }

  // A computed gap is `normal`, a px length, or (rarely) a percentage of the container's content
  // box on that axis. Anything that is not a positive length is no gap.
  function gapPx(value, box, axis) {
    var n = parseFloat(value);
    if (!(n > 0)) return 0;
    if (String(value).indexOf('%') < 0) return n;
    var cs = getComputedStyle(box);
    var size = axis === 'x'
      ? box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      : box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    return (n / 100) * Math.max(0, size);
  }

  // A generated ::before or ::after that is in flow is a flex item too, and one this shim cannot
  // give a margin. The gap beside it goes on its neighbour instead.
  function pseudoInFlow(box, which) {
    var cs = getComputedStyle(box, which);
    var content = cs.content;
    return content !== 'none' && content !== 'normal' && content !== '' && inFlow(cs);
  }

  function camel(prop) {
    return prop.replace(/-([a-z])/g, function (m, c) { return c.toUpperCase(); });
  }

  // ── Fitting one container ──────────────────────────────────────────────────────────────────
  function fixContainer(box) {
    // Take back the last pass first, so every read below is of the authored value.
    undo(box, 'box');
    for (var c = box.firstElementChild; c; c = c.nextElementSibling) undo(c, 'item');

    var cs = getComputedStyle(box);
    if (!isFlex(cs.display)) return;
    var rowGap = gapPx(cs.rowGap, box, 'y');
    var colGap = gapPx(cs.columnGap, box, 'x');
    if (!rowGap && !colGap) return;

    // In simulation the container's own gap must stop working, the way it does on CEF 71.
    if (SIMULATE) {
      write(box, 'box', 'row-gap', '0px', true);
      write(box, 'box', 'column-gap', '0px', true);
    }

    // The items, in flex order: `order` first, then document order. A run of text straight
    // inside a flex container is an item too (an anonymous one), and it has no style to write
    // to - the gap beside it goes on its neighbouring element instead.
    var items = [];
    for (var node = box.firstChild; node; node = node.nextSibling) {
      if (node.nodeType === 1) {
        var ics = getComputedStyle(node);
        if (!inFlow(ics)) continue;
        items.push({ el: node, order: parseInt(ics.order, 10) || 0, index: items.length });
      } else if (node.nodeType === 3 && node.nodeValue.replace(/\s+/g, '') !== '') {
        items.push({ el: null, text: node, order: 0, index: items.length });
      }
    }
    items.sort(function (a, b) { return a.order - b.order || a.index - b.index; });
    var before = pseudoInFlow(box, '::before');
    var after = pseudoInFlow(box, '::after');
    if (items.length + (before ? 1 : 0) + (after ? 1 : 0) < 2) return;

    var direction = cs.flexDirection;
    var horizontal = direction.indexOf('row') === 0;
    var reversed = direction.indexOf('reverse') > 0;
    var rtl = cs.direction === 'rtl';
    var mainGap = horizontal ? colGap : rowGap;
    var crossGap = horizontal ? rowGap : colGap;
    // The side of an item that faces the item before it in flex order, and the far side.
    var backwards = horizontal ? reversed !== rtl : reversed;
    var mainSide = horizontal ? (backwards ? 'margin-right' : 'margin-left') : (backwards ? 'margin-bottom' : 'margin-top');
    var farSide = horizontal ? (backwards ? 'margin-left' : 'margin-right') : (backwards ? 'margin-top' : 'margin-bottom');

    // The authored margin on a side, read before anything is written to that side. `null`
    // means the margin is `auto`: getComputedStyle hands back the px the engine resolved it to,
    // but an auto margin already takes every px of free space, so a gap written on top of it
    // would push the item out past where the design ends it. Such a side is left alone.
    function authored(item, side) {
      if (item.el.computedStyleMap) {
        var typed = item.el.computedStyleMap().get(side);
        if (typed && typed.value === 'auto') return null;
      }
      return parseFloat(getComputedStyle(item.el)[camel(side)]) || 0;
    }
    function put(item, side, base, gap) {
      if (base !== null) write(item.el, 'item', side, base + gap + 'px');
    }
    var i;
    var mainAuthored = [];
    for (i = 0; i < items.length; i++) mainAuthored.push(items[i].el ? authored(items[i], mainSide) : null);
    // The gap between two neighbours goes on the later one's facing side when that is an element,
    // otherwise on the earlier one's far side. `null` at either end stands for a pseudo-element.
    function between(prev, next) {
      if (next && next.el) put(next, mainSide, mainAuthored[next.index], mainGap);
      else if (prev && prev.el) put(prev, farSide, authored(prev, farSide), mainGap);
    }
    if (before) between(null, items[0]);
    for (i = 1; i < items.length; i++) between(items[i - 1], items[i]);
    if (after) between(items[items.length - 1], null);
    if (cs.flexWrap === 'nowrap' || items.length < 2) return;

    // Wrapped: read where the browser broke the lines now that the main-axis margins are on. An
    // item starts a new line when it sits at or behind the previous item on the main axis. A
    // line start carries no main-axis margin (there is nothing before it), and every item past
    // the first line carries the cross-axis gap.
    var wrapReverse = cs.flexWrap === 'wrap-reverse';
    var crossSide = horizontal
      ? (wrapReverse ? 'margin-bottom' : 'margin-top')
      : (wrapReverse !== rtl ? 'margin-right' : 'margin-left');
    function rectOf(item) {
      if (item.el) return item.el.getBoundingClientRect();
      var range = document.createRange();
      range.selectNode(item.text);
      return range.getBoundingClientRect();
    }
    var rects = [];
    for (i = 0; i < items.length; i++) rects.push(rectOf(items[i]));
    var line = 0;
    for (i = 1; i < items.length; i++) {
      var r = rects[i];
      var p = rects[i - 1];
      var wrapped = horizontal
        ? (backwards ? r.right >= p.right - 0.5 : r.left <= p.left + 0.5)
        : (backwards ? r.bottom >= p.bottom - 0.5 : r.top <= p.top + 0.5);
      if (wrapped) {
        line++;
        if (items[i].el) put(items[i], mainSide, mainAuthored[items[i].index], 0);
      }
      if (line > 0 && crossGap && items[i].el) put(items[i], crossSide, authored(items[i], crossSide), crossGap);
    }
  }

  // Every flex container under `root`, innermost first: an inner container's margins change its
  // size, and the outer container's line breaks are read from that size.
  function fixAll(root) {
    if (!root || root.nodeType !== 1) return;
    var all = root.querySelectorAll('*');
    for (var i = all.length - 1; i >= 0; i--) {
      if (isFlex(getComputedStyle(all[i]).display)) fixContainer(all[i]);
    }
    if (isFlex(getComputedStyle(root).display)) fixContainer(root);
  }

  // ── Keeping up with the graphic ────────────────────────────────────────────────────────────
  // A mutation names the elements it touched; the containers that can have changed are those
  // elements and their parents. Attribute records arrive every frame while GSAP tweens, so the
  // pass is scoped to them rather than the whole document.
  var observer = new MutationObserver(function (records) {
    var dirty = [];
    function consider(node) {
      if (!node || node.nodeType !== 1 || dirty.indexOf(node) >= 0) return;
      dirty.push(node);
    }
    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      var target = rec.type === 'characterData' ? rec.target.parentNode : rec.target;
      consider(target);
      consider(target && target.parentNode);
      for (var a = 0; a < rec.addedNodes.length; a++) {
        var added = rec.addedNodes[a];
        if (added.nodeType !== 1) continue;
        var inner = added.querySelectorAll('*');
        for (var d = inner.length - 1; d >= 0; d--) consider(inner[d]);
        consider(added);
      }
    }
    // Children before parents, for the same reason fixAll walks backwards.
    dirty.sort(function (a, b) {
      return a !== b && a.contains(b) ? 1 : b.contains(a) ? -1 : 0;
    });
    for (var k = 0; k < dirty.length; k++) {
      if (isFlex(getComputedStyle(dirty[k]).display)) fixContainer(dirty[k]);
    }
    // The writes above are mutations too; drop them rather than answer them.
    observer.takeRecords();
  });

  function start() {
    fixAll(document.body);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden'],
    });
    observer.takeRecords();
  }
  function refit() {
    fixAll(document.body);
    observer.takeRecords();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
  // A webfont swap and a resize both move line breaks without a DOM mutation.
  window.addEventListener('load', refit);
  window.addEventListener('resize', refit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit, function () {});
})();
