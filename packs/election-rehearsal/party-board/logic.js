/* Election - party totals. SPX lifecycle; ES5 only (CasparCG 2.3's Chromium 71). A share
   arrives as text ("22.7%"); the bars are drawn against the largest share on the board, so the
   leader fills the track and every other bar keeps its true proportion to it.
   Every entrance tween names its end state, so a play() that interrupts another never
   ends hidden. */

(function () {
  var motion = null; // the one timeline on stage: an entrance or an exit, never both
  var onAir = false;

  function shareOf(text) {
    var n = parseFloat(String(text || '').replace(',', '.').replace(/[^0-9.]/g, ''));
    return isFinite(n) && n > 0 ? n : 0;
  }

  function rows() {
    return document.querySelectorAll('.pb-row');
  }

  function paintColours() {
    var swatches = document.querySelectorAll('.pb-swatch');
    for (var i = 0; i < swatches.length; i++) {
      var row = swatches[i].parentNode.parentNode;
      row.style.setProperty('--row-color', swatches[i].getAttribute('data-color') || '');
    }
  }

  function barWidths() {
    var list = rows();
    var widths = [];
    var top = 0;
    for (var i = 0; i < list.length; i++) {
      var s = shareOf(list[i].querySelector('.pb-share').textContent);
      widths.push(s);
      if (s > top) { top = s; }
    }
    for (var j = 0; j < widths.length; j++) {
      widths[j] = top > 0 ? (widths[j] / top) * 100 : 0;
    }
    return widths;
  }

  function drawBars(animate) {
    var list = rows();
    var widths = barWidths();
    for (var i = 0; i < list.length; i++) {
      var bar = list[i].querySelector('.pb-bar');
      if (animate) {
        gsap.to(bar, { width: widths[i] + '%', duration: 0.8, ease: 'power2.out', overwrite: true });
      } else {
        gsap.set(bar, { width: widths[i] + '%' });
      }
    }
  }

  window.update = function (data) {
    var parsed = typeof data === 'string' ? JSON.parse(data) : data;
    if (!parsed) { return; }
    for (var key in parsed) {
      var el = document.getElementById(key);
      if (!el) { continue; }
      if (el.hasAttribute('data-color')) {
        el.setAttribute('data-color', parsed[key]);
        el.textContent = '';
      } else {
        el.textContent = parsed[key];
      }
    }
    paintColours();
    // A count arriving on air moves the bars; before Take they are simply set.
    drawBars(onAir);
  };

  window.play = function () {
    if (motion) { motion.kill(); }
    paintColours();
    onAir = true;
    var widths = barWidths();
    motion = gsap.timeline();
    motion.set('#pb-root', { autoAlpha: 1 });
    motion.fromTo('.pb-panel', { y: 26, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.55, ease: 'power3.out' }, 0);
    motion.fromTo('.pb-head > *', { y: 12, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.45, ease: 'power2.out', stagger: 0.08 }, 0.15);
    motion.fromTo('.pb-row', { x: -18, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.4, ease: 'power2.out', stagger: 0.04 }, 0.25);
    var list = rows();
    for (var i = 0; i < list.length; i++) {
      motion.fromTo(list[i].querySelector('.pb-bar'), { width: '0%' }, { width: widths[i] + '%', duration: 0.9, ease: 'power3.out' }, 0.45 + i * 0.04);
    }
    motion.fromTo('.pb-foot', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 }, 0.8);
  };

  window.stop = function () {
    onAir = false;
    if (motion) { motion.kill(); }
    motion = gsap.timeline();
    motion.to('.pb-panel', { y: 16, autoAlpha: 0, duration: 0.4, ease: 'power2.in' }, 0);
    motion.to('#pb-root', { autoAlpha: 0, duration: 0.4 }, 0.05);
    motion.set('.pb-panel', { y: 0, autoAlpha: 1 });
  };

  window.next = function () {};

  function ready() { paintColours(); drawBars(false); }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', ready); } else { ready(); }
})();
