/* Election - count bug. SPX lifecycle; ES5 only (CasparCG 2.3's Chromium 71). The meter is
   drawn from the counted share ("61%"), which the results source sends beside the counted line
   so a figure and its meter never disagree.
   Every entrance tween names its end state, so a play() that interrupts another never
   ends hidden. */

(function () {
  var motion = null; // the one timeline on stage: an entrance or an exit, never both
  var onAir = false;

  function shareOf() {
    var n = parseFloat(String(document.getElementById('f3').textContent || '').replace(',', '.').replace(/[^0-9.]/g, ''));
    return isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
  }

  function drawMeter(animate) {
    var width = shareOf() + '%';
    if (animate) { gsap.to('.cb-fill', { width: width, duration: 0.8, ease: 'power2.out', overwrite: true }); } else { gsap.set('.cb-fill', { width: width }); }
  }

  window.update = function (data) {
    var parsed = typeof data === 'string' ? JSON.parse(data) : data;
    if (!parsed) { return; }
    for (var key in parsed) {
      var el = document.getElementById(key);
      if (el) { el.textContent = parsed[key]; }
    }
    drawMeter(onAir);
  };

  window.play = function () {
    if (motion) { motion.kill(); }
    onAir = true;
    motion = gsap.timeline();
    motion.set('#cb-root', { autoAlpha: 1 });
    motion.fromTo('.cb-bug', { x: 30, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.5, ease: 'power3.out' }, 0);
    motion.fromTo(['.cb-top', '.cb-line', '.cb-source'], { y: 8, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.35, ease: 'power2.out', stagger: 0.06 }, 0.15);
    motion.fromTo('.cb-fill', { width: '0%' }, { width: shareOf() + '%', duration: 0.9, ease: 'power3.out' }, 0.3);
  };

  window.stop = function () {
    onAir = false;
    if (motion) { motion.kill(); }
    motion = gsap.timeline();
    motion.to('.cb-bug', { x: 24, autoAlpha: 0, duration: 0.35, ease: 'power2.in' }, 0);
    motion.to('#cb-root', { autoAlpha: 0, duration: 0.35 }, 0.05);
    motion.set('.cb-bug', { x: 0, autoAlpha: 1 });
  };

  window.next = function () {};

  function ready() { drawMeter(false); }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', ready); } else { ready(); }
})();
