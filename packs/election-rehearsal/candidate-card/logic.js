/* Election - candidate card. SPX lifecycle; ES5 only (CasparCG 2.3's Chromium 71). The
   portrait is an <img id="f4">: empty shows the bundled silhouette. The party colour is a
   field whose element only carries it, so it paints the rule and is never printed.
   Every entrance tween names its end state, so a play() that interrupts another never
   ends hidden. */

(function () {
  var motion = null; // the one timeline on stage: an entrance or an exit, never both

  function paintColour() {
    var rule = document.getElementById('f5');
    var colour = rule.getAttribute('data-color');
    document.getElementById('cc-root').style.setProperty('--party', colour || '');
  }

  function setPortrait(value) {
    var img = document.getElementById('f4');
    if (value) { img.src = value; img.style.display = ''; } else { img.removeAttribute('src'); img.style.display = 'none'; }
    img.parentNode.classList.toggle('has-image', !!value);
  }

  window.update = function (data) {
    var parsed = typeof data === 'string' ? JSON.parse(data) : data;
    if (!parsed) { return; }
    for (var key in parsed) {
      var el = document.getElementById(key);
      if (!el) { continue; }
      if (key === 'f4') {
        setPortrait(parsed[key]);
      } else if (el.hasAttribute('data-color')) {
        el.setAttribute('data-color', parsed[key]);
        el.textContent = '';
      } else {
        el.textContent = parsed[key];
      }
    }
    paintColour();
  };

  window.play = function () {
    if (motion) { motion.kill(); }
    paintColour();
    motion = gsap.timeline();
    motion.set('#cc-root', { autoAlpha: 1 });
    motion.fromTo('.cc-card', { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.6, ease: 'power3.inOut' }, 0);
    motion.fromTo('.cc-portrait img', { scale: 1.12 }, { scale: 1, duration: 0.9, ease: 'power2.out' }, 0);
    motion.fromTo(['.cc-name', '.cc-sub'], { x: -24, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.45, ease: 'power3.out', stagger: 0.08 }, 0.3);
    motion.fromTo('.cc-figure > *', { y: 14, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.4, ease: 'power2.out', stagger: 0.06 }, 0.42);
  };

  window.stop = function () {
    if (motion) { motion.kill(); }
    motion = gsap.timeline();
    motion.to('.cc-card', { clipPath: 'inset(0 100% 0 0)', duration: 0.45, ease: 'power3.in' }, 0);
    motion.to('#cc-root', { autoAlpha: 0, duration: 0.2 }, 0.4);
    motion.set('.cc-card', { clipPath: 'inset(0 0% 0 0)' });
  };

  window.next = function () {};

  function ready() { setPortrait(document.getElementById('f4').getAttribute('src') || ''); paintColour(); }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', ready); } else { ready(); }
})();
