/** Additive runtime for explicitly styled drawn looks. The saved recipe runtime remains intact.
 * GSAP contexts restore only this entrance's properties, including authored SVG transforms. */
export const LOOK_ENTRANCE_RUNTIME = `// BEGIN NOACG LOOK ENTRANCE 1
(function () {
  var active = [], pending = null, snapping = 0;
  function style(el) {
    var value = el.getAttribute('data-noacg-look-entrance');
    return value === 'cut' || value === 'fade' || value === 'pop' ? value : '';
  }
  function settle(el) {
    for (var i = active.length - 1; i >= 0; i--) {
      if (!el || active[i].el === el) {
        var entry = active.splice(i, 1)[0];
        entry.context.revert();
      }
    }
  }
  function enter(el) {
    settle(el);
    var kind = style(el);
    if (snapping || kind === 'cut' || typeof gsap === 'undefined') return;
    var entry = { el: el, context: null };
    entry.context = gsap.context(function () {
      var speed = motionSpeed();
      var from = kind === 'fade' ? { opacity: 0 } : { scaleX: Number(gsap.getProperty(el, 'scaleX')) * 1.04, scaleY: Number(gsap.getProperty(el, 'scaleY')) * 1.04 };
      var to = kind === 'fade' ? { opacity: Number(gsap.getProperty(el, 'opacity')), duration: 0.25 / speed, ease: 'power1.out' }
        : { scaleX: Number(gsap.getProperty(el, 'scaleX')), scaleY: Number(gsap.getProperty(el, 'scaleY')), duration: 0.3 / speed, ease: 'back.out(2)' };
      to.onComplete = function () { settle(el); };
      gsap.fromTo(el, from, to);
    });
    active.push(entry);
  }
  var show = noacgLookShow, pop = noacgPop;
  noacgLookShow = function (el, on) {
    pending = null;
    var landed = show.apply(this, arguments);
    if (style(el)) {
      if (!on) settle(el);
      else if (landed) { enter(el); pending = el; }
    }
    return landed;
  };
  noacgPop = function (el) {
    if (!style(el)) return pop.apply(this, arguments);
    // A state-entry pop can immediately follow show(), or re-enter an already lit look.
    if (pending !== el) enter(el);
    pending = null;
  };
  var snap = noacgSnap, reset = noacgResetGraphic, pointers = noacgResetPointers, takeOut = stop, takeIn = play;
  noacgSnap = function () {
    settle(); snapping++;
    try { return snap.apply(this, arguments); }
    finally { snapping--; pending = null; settle(); }
  };
  noacgResetGraphic = function () { settle(); return reset.apply(this, arguments); };
  noacgResetPointers = function () { settle(); pending = null; return pointers.apply(this, arguments); };
  stop = function () { settle(); pending = null; return takeOut.apply(this, arguments); };
  play = function () { settle(); pending = null; return takeIn.apply(this, arguments); };
}());
// END NOACG LOOK ENTRANCE 1`;
