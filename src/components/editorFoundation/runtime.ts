/** Original authoring bridge. Deliberately a literal script, not function.toString:
 * production minification cannot rewrite names captured by the sandbox.
 * Motion is evaluated by the template's bundled buildStepTimeline/GSAP interpreter.
 * No play/next/stop, machine events, timers or lifecycle callbacks are dispatched. */
export const foundationRuntime = String.raw`
(function () {
  'use strict';
  var config = window.__NOACG_EDITOR_CONFIG;
  var current = config.revision;
  var lastRequest = config.requestId;
  var timeline = null;
  var activeStep = -1;
  var initial = [];
  var intervals = [];
  var longTasks = [];
  var lastFrame = 0;
  var waiting = 0;
  var initialized = false;
  var failed = false;
  window.addEventListener('error', function (event) {
    failed = true;
    send('error', lastRequest, { message: event.message || 'Template runtime failed.' });
  });
  window.addEventListener('unhandledrejection', function (event) {
    failed = true;
    send('error', lastRequest, { message: String(event.reason) });
  });
  function send(kind, request, extra) {
    parent.postMessage(Object.assign({
      type: 'noacg-editor-foundation-v1', documentId: config.documentId,
      revision: current, generation: config.generation, requestId: request, kind: kind
    }, extra || {}), '*');
  }
  function valid(message) {
    return message && message.type === 'noacg-editor-foundation-v1' &&
      message.documentId === config.documentId && message.generation === config.generation &&
      Number.isSafeInteger(message.requestId) && message.requestId > lastRequest;
  }
  function resetPose() {
    if (timeline) timeline.kill();
    timeline = null;
    activeStep = -1;
    if (window.gsap) {
      gsap.globalTimeline.clear();
      initial.forEach(function (entry) {
        gsap.set(entry.element, { clearProps: 'all' });
        if (entry.style === null) entry.element.removeAttribute('style');
        else entry.element.setAttribute('style', entry.style);
        if (entry.element instanceof SVGElement) {
          if (entry.transform === null) entry.element.removeAttribute('transform');
          else entry.element.setAttribute('transform', entry.transform);
        }
      });
    }
  }
  function build(index) {
    var step = NOACG_ANIM.steps[index];
    // Cloning only this transient interpreter input leaves canonical source untouched.
    // Remove calls before building, not just during seek: no callback can fire at t=0.
    return buildStepTimeline(Object.assign({}, step, { calls: [], dynamics: [], loops: undefined }));
  }
  function seek(step, time) {
    if (!config.scrubbable) return;
    if (typeof window.buildStepTimeline !== 'function' || !window.gsap) {
      throw new Error('This source does not expose the supported animation interpreter.');
    }
    if (!NOACG_ANIM.steps[step]) throw new Error('The requested segment no longer exists.');
    if (activeStep !== step) {
      resetPose();
      gsap.set(NOACG_ANIM.root, { opacity: 1 });
      for (var i = 0; i < step; i++) {
        var previous = build(i);
        previous.pause();
        previous.time(NOACG_ANIM.steps[i].duration / NOACG_ANIM.speed, true);
        previous.kill();
      }
      timeline = build(step);
      timeline.pause();
      activeStep = step;
    }
    var target = Math.max(0, Math.min(time, NOACG_ANIM.steps[step].duration / NOACG_ANIM.speed));
    timeline.time(target, true);
    // Same first-frame rule as noacgPaintFirstFrame in the emitted interpreter.
    // A newly paused timeline at zero otherwise leaves its initial .set unapplied.
    if (target === 0) timeline.render(0, true, true);
    // Existence is explicit, independent of whether a layer owns any keys.
    NOACG_ANIM.steps.forEach(function (segment, i) {
      (segment.reveals || []).forEach(function (selector) {
        if (i > step) gsap.set(selector, { visibility: 'hidden' });
        else gsap.set(selector, { visibility: 'visible' });
      });
    });
    var finalExit = step > 0 && step === NOACG_ANIM.steps.length - 1 &&
      time >= NOACG_ANIM.steps[step].duration / NOACG_ANIM.speed;
    gsap.set(NOACG_ANIM.root, { opacity: finalExit ? 0 : 1 });
  }
  function measure() {
    return config.selectors.flatMap(function (selector) {
      var element = document.querySelector(selector);
      if (!element) return [];
      var style = getComputedStyle(element);
      var adapter = config.adapters[selector];
      var target = adapter ? document.querySelector(adapter.target) : element;
      var rect = target.getBoundingClientRect();
      var parent = target instanceof SVGGraphicsElement ? target.parentElement : target.offsetParent;
      var matrix = basis(parent);
      var unit = adapter && adapter.scaled || adapter && adapter.mode === 'flow'
        ? parseFloat(getComputedStyle(target).getPropertyValue('--scale')) || 1 : 1;
      return [{ selector: selector, x: rect.x, y: rect.y, width: rect.width,
        height: rect.height, opacity: Number(style.opacity), transform: style.transform,
        parent: [matrix.a * unit, matrix.b * unit, matrix.c * unit, matrix.d * unit],
        corners: adapter && adapter.scaleReason ? undefined : corners(target), anchor: anchor(target) }];
    });
  }
  // Translation cancels for pointer deltas. SVG supplies an exact CTM; HTML composes
  // the linear transforms up its ancestors, including independent base scale.
  function basis(element) {
    if (element instanceof SVGGraphicsElement) return element.getScreenCTM() || new DOMMatrix();
    var matrix = new DOMMatrix();
    for (var node = element; node && node instanceof Element; node = node.parentElement) {
      var style = getComputedStyle(node);
      var transform = new DOMMatrix(style.transform === 'none' ? undefined : style.transform);
      var scales = style.scale === 'none' ? [1, 1] : style.scale.split(' ').map(Number);
      var own = new DOMMatrix().scale(scales[0], scales[1] === undefined ? scales[0] : scales[1]).multiply(transform);
      matrix = own.multiply(matrix);
    }
    return matrix;
  }
  function corners(element) {
    var rect = element.getBoundingClientRect();
    if (element instanceof SVGGraphicsElement) {
      var box = element.getBBox(), m = element.getScreenCTM();
      if (m) return [[box.x,box.y],[box.x+box.width,box.y],[box.x+box.width,box.y+box.height],[box.x,box.y+box.height]].map(function (p) {
        return { x:m.a*p[0]+m.c*p[1]+m.e, y:m.b*p[0]+m.d*p[1]+m.f };
      });
    }
    var m = basis(element), w = element.offsetWidth, h = element.offsetHeight;
    var points = [[0,0],[w,0],[w,h],[0,h]].map(function (p) { return { x:m.a*p[0]+m.c*p[1], y:m.b*p[0]+m.d*p[1] }; });
    var left = Math.min.apply(null, points.map(function (p) { return p.x; }));
    var top = Math.min.apply(null, points.map(function (p) { return p.y; }));
    return points.map(function (p) { return { x:p.x-left+rect.x, y:p.y-top+rect.y }; });
  }
  function drawingSpace() {
    var element = config.creationParent && document.querySelector(config.creationParent);
    if (!element) return null;
    // A zero-sized absolute probe gives the parent's padding-box origin without touching layout.
    var probe = document.createElement('i');
    probe.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;margin:0;padding:0;border:0';
    element.appendChild(probe);
    var rect = probe.getBoundingClientRect(), m = basis(probe.offsetParent);
    probe.remove();
    return [m.a,m.b,m.c,m.d,rect.x,rect.y];
  }
  function anchor(element) {
    var origin = getComputedStyle(element).transformOrigin.split(' ').map(parseFloat);
    if (element instanceof SVGGraphicsElement) {
      var m = element.getScreenCTM();
      return { x:m.a*origin[0]+m.c*origin[1]+m.e, y:m.b*origin[0]+m.d*origin[1]+m.f };
    }
    var m = basis(element), corner = corners(element)[0];
    return { x:corner.x+m.a*origin[0]+m.c*origin[1], y:corner.y+m.b*origin[0]+m.d*origin[1] };
  }
  function setCss(css) {
    var sheet = document.getElementById('spx-inline-css');
    var baseTransforms = /--base-(?:scale-[xy]|[xy])\s*:[^;}]+/g;
    var changed = String(sheet.textContent.match(baseTransforms)) !== String(css.match(baseTransforms));
    var step = activeStep, time = timeline ? timeline.time() : 0;
    // GSAP folds independent CSS transforms into its cached matrix and writes inline
    // scale: none. Rebuild that transient pose when base transforms change so both
    // the first edit and an edit after scrubbing/reopening agree with exported playback.
    if (changed && step >= 0) resetPose();
    sheet.textContent = css;
    if (changed && step >= 0) seek(step, time);
  }
  function presented(request, kind, interactive) {
    waiting = request;
    function report() {
        if (waiting !== request || lastRequest !== request) return;
        send(kind, request, { parts: measure(), drawingSpace: drawingSpace(), renderedAt: performance.timeOrigin + performance.now(),
          frameIntervals: intervals.splice(0), longTasks: longTasks.splice(0) });
    }
    requestAnimationFrame(function () {
      if (interactive) report(); else requestAnimationFrame(report);
    });
  }
  function frame(now) {
    if (lastFrame && waiting) intervals.push(now - lastFrame);
    if (intervals.length > 600) intervals.shift();
    lastFrame = now;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (entry) { longTasks.push(entry.duration); });
      }).observe({ type: 'longtask', buffered: false });
    } catch (_) { /* Unsupported browsers still report rAF and acknowledgement timing. */ }
  }
  window.addEventListener('message', function (event) {
    var m = event.data;
    if (event.source !== parent || !initialized || !valid(m)) return;
    if (m.kind === 'apply' || m.kind === 'apply-css') {
      if (!m.previous || m.previous.source !== current.source || m.previous.assets !== current.assets) return;
      lastRequest = m.requestId;
      try {
        if (m.kind === 'apply-css') setCss(m.css);
        else { resetPose(); window.NOACG_ANIM = m.animation; }
        current = m.revision;
        presented(m.requestId, 'ready');
      } catch (error) { send('error', m.requestId, { message: String(error.message || error) }); }
      return;
    }
    if (m.revision.source !== current.source || m.revision.assets !== current.assets) return;
    lastRequest = m.requestId;
    try {
      if (m.kind === 'seek') seek(m.step, m.time);
      else if (m.kind === 'preview-css') setCss(m.css);
      else if (m.kind === 'reset-metrics') { intervals = []; longTasks = []; }
      else return;
      presented(m.requestId, 'pose', m.kind === 'preview-css');
    } catch (error) { send('error', m.requestId, { message: String(error.message || error) }); }
  });
  window.addEventListener('load', async function () {
    try {
      if (failed) return;
      await document.fonts.ready;
      await Promise.all(Array.from(document.images).map(function (image) {
        return image.decode ? image.decode().catch(function () {}) : Promise.resolve();
      }));
      if (typeof window.update === 'function') window.update(JSON.stringify(config.sampleData));
      initial = Array.from(document.body.querySelectorAll('*')).filter(function (element) {
        return !['SCRIPT', 'STYLE'].includes(element.tagName);
      }).map(function (element) { return { element: element, style: element.getAttribute('style'), transform: element.getAttribute('transform') }; });
      seek(config.step, config.time);
      initialized = true;
      presented(config.requestId, 'ready');
    } catch (error) { send('error', config.requestId, { message: String(error.message || error) }); }
  }, { once: true });
})();
`;
