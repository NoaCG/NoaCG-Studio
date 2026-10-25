/* Election - ticker. SPX lifecycle; ES5 only (CasparCG 2.3's Chromium 71). The crawl is the
   headlines laid out as often as the window needs, moved left at a constant speed and wrapped
   at one copy's width, so it never jumps. New headlines on air take over at the next wrap,
   never mid-sentence. The crawl runs on GSAP's frame clock, so a renderer that pauses frames
   pauses it too.
   Every entrance tween names its end state, so a play() that interrupts another never
   ends hidden. */

(function () {
  var SPEED = 120; // px per second
  var entrance = null;
  var crawl = null;
  var onAir = false;
  var pending = false;

  function esc(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function lines() {
    var raw = document.getElementById('f0').textContent || '';
    var out = [];
    var parts = raw.split(/\r?\n/);
    for (var i = 0; i < parts.length; i++) {
      var t = parts[i].replace(/^\s+|\s+$/g, '');
      if (t) { out.push(t); }
    }
    return out;
  }

  function build() {
    var items = lines();
    var html = '';
    for (var i = 0; i < items.length; i++) { html += '<span class="tk-item">' + esc(items[i]) + '</span><span class="tk-dot"></span>'; }
    var el = document.querySelector('.tk-crawl');
    el.innerHTML = html;
    // Enough copies that the window is never short of words after a wrap.
    var one = el.scrollWidth;
    var copies = one > 0 ? Math.max(2, Math.ceil(document.querySelector('.tk-window').clientWidth / one) + 1) : 1;
    var all = '';
    for (var c = 0; c < copies; c++) { all += html; }
    el.innerHTML = all;
    return one;
  }

  // One position, moved by the frame clock. The crawl enters from the right edge; once a whole
  // copy has passed it wraps by that copy's width, which is where waiting headlines take over.
  var x = 0;
  var loop = 0;
  function tick(time, delta) {
    x -= (SPEED * delta) / 1000;
    if (loop > 0 && x <= -loop) {
      x += loop;
      if (pending) { pending = false; loop = build(); }
    }
    gsap.set('.tk-crawl', { x: x });
  }

  function run() {
    halt();
    loop = build();
    x = document.querySelector('.tk-window').clientWidth;
    gsap.set('.tk-crawl', { x: x });
    if (loop > 0) { crawl = tick; gsap.ticker.add(tick); }
  }

  function halt() {
    if (crawl) { gsap.ticker.remove(crawl); crawl = null; }
  }

  window.update = function (data) {
    var parsed = typeof data === 'string' ? JSON.parse(data) : data;
    if (!parsed) { return; }
    var changed = false;
    for (var key in parsed) {
      var el = document.getElementById(key);
      if (!el) { continue; }
      if (key === 'f0' && el.textContent !== parsed[key]) { changed = true; }
      el.textContent = parsed[key];
    }
    if (changed) {
      if (onAir) { pending = true; } else { build(); }
    }
  };

  window.play = function () {
    if (entrance) { entrance.kill(); }
    onAir = true;
    pending = false;
    entrance = gsap.timeline();
    entrance.set('#tk-root', { autoAlpha: 1 });
    entrance.fromTo('.tk-bar', { y: 90 }, { y: 0, duration: 0.55, ease: 'power3.out' }, 0);
    entrance.fromTo('.tk-label', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.35 }, 0.25);
    run();
  };

  window.stop = function () {
    onAir = false;
    if (entrance) { entrance.kill(); }
    gsap.to('.tk-bar', { y: 90, duration: 0.45, ease: 'power3.in' });
    gsap.to('#tk-root', { autoAlpha: 0, duration: 0.2, delay: 0.4, onComplete: function () {
      halt();
      gsap.set('.tk-bar', { y: 0 });
    } });
  };

  window.next = function () {};

  function ready() { build(); }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', ready); } else { ready(); }
})();
