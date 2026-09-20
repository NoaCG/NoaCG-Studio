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
      var rect = element.getBoundingClientRect();
      var style = getComputedStyle(element);
      return [{ selector: selector, x: rect.x, y: rect.y, width: rect.width,
        height: rect.height, opacity: Number(style.opacity), transform: style.transform }];
    });
  }
  function presented(request, kind) {
    waiting = request;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (waiting !== request || lastRequest !== request) return;
        send(kind, request, { parts: measure(), renderedAt: performance.timeOrigin + performance.now(),
          frameIntervals: intervals.splice(0), longTasks: longTasks.splice(0) });
      });
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
    if (m.kind === 'apply') {
      if (!m.previous || m.previous.source !== current.source || m.previous.assets !== current.assets) return;
      lastRequest = m.requestId;
      try {
        resetPose();
        window.NOACG_ANIM = m.animation;
        current = m.revision;
        presented(m.requestId, 'ready');
      } catch (error) { send('error', m.requestId, { message: String(error.message || error) }); }
      return;
    }
    if (m.revision.source !== current.source || m.revision.assets !== current.assets) return;
    lastRequest = m.requestId;
    try {
      if (m.kind === 'seek') seek(m.step, m.time);
      else if (m.kind === 'reset-metrics') { intervals = []; longTasks = []; }
      else return;
      presented(m.requestId, 'pose');
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
      }).map(function (element) { return { element: element, style: element.getAttribute('style') }; });
      seek(config.step, config.time);
      initialized = true;
      presented(config.requestId, 'ready');
    } catch (error) { send('error', config.requestId, { message: String(error.message || error) }); }
  }, { once: true });
})();
`;
