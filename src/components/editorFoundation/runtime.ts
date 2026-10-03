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
  var inspected = false;
  var localTime = 0;
  var exiting = false;
  var initial = [];
  var initialMotion = {};
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
    exiting = false;
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
    var step = editorStep(index);
    // Cloning only this transient interpreter input leaves canonical source untouched.
    // Remove calls before building, not just during seek: no callback can fire at t=0.
    return buildStepTimeline(Object.assign({}, step, { calls: [], dynamics: [], loops: undefined }));
  }
  function editorStep(index) {
    return NOACG_ANIM.steps[index] || (index === 1 && NOACG_ANIM.steps.length === 1 ? { duration: 0, ease: 'none', layers: {} } : null);
  }
  function numericPose(element) {
    var pose = {};
    ['x', 'y', 'xPercent', 'yPercent', 'scaleX', 'scaleY', 'rotation', 'opacity'].forEach(function (property) { pose[property] = Number(gsap.getProperty(element, property)); });
    return pose;
  }
  // The box xPercent and yPercent resolve against: the element's border box, in its own pixels, from
  // the computed size rather than offsetWidth/offsetHeight, which round to whole pixels.
  function percentBox(element, style) {
    if (element instanceof SVGElement) return undefined;
    var width = parseFloat(style.width), height = parseFloat(style.height);
    if (!(width >= 0 && height >= 0)) return [element.offsetWidth, element.offsetHeight];
    if (style.boxSizing === 'border-box') return [width, height];
    var edge = function (side) { return parseFloat(style.getPropertyValue('padding-' + side)) + parseFloat(style.getPropertyValue('border-' + side + '-width')); };
    return [width + edge('left') + edge('right'), height + edge('top') + edge('bottom')];
  }
  function seek(step, time, inspect) {
    if (!config.scrubbable) return;
    if (typeof window.buildStepTimeline !== 'function' || !window.gsap) {
      throw new Error('This source does not expose the supported animation interpreter.');
    }
    if (!editorStep(step)) throw new Error('The requested segment no longer exists.');
    if (activeStep !== step || exiting) {
      resetPose();
      config.selectors.forEach(function (selector) {
        var element = document.querySelector(selector);
        if (element) initialMotion[selector] = numericPose(element);
      });
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
    inspected = !!inspect;
    localTime = time;
    var target = Math.max(0, Math.min(time, editorStep(step).duration / NOACG_ANIM.speed));
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
    Object.keys(editorStep(step).spans || {}).forEach(function (selector) {
      var segment = editorStep(step);
      gsap.set(selector, { visibility: noacgSpanVisible(segment.spans[selector], target * NOACG_ANIM.speed, segment.duration) ? 'visible' : 'hidden' });
    });
    var finalExit = !inspect && step > 0 && step === Math.max(1, NOACG_ANIM.steps.length - 1) &&
      time >= editorStep(step).duration / NOACG_ANIM.speed;
    gsap.set(NOACG_ANIM.root, { opacity: finalExit ? 0 : 1 });
  }
  function exit(time, start) {
    if (start) {
      if (typeof noacgBuildExit !== 'function') throw new Error('Set Out first to upgrade this saved interpreter.');
      // A parked flag is read from summed cue lengths, so it can sit a float step short of its cue's
      // end: within a microsecond counts as the end. Out's first frame (Edit Out) is where the
      // authored exit starts, so Out plays from there as at the last step.
      var outCue = Math.max(1, NOACG_ANIM.steps.length - 1), near = 1e-6;
      var outStart = activeStep === outCue && localTime < near;
      var interrupted = activeStep >= 0 && !outStart && localTime < editorStep(activeStep).duration / NOACG_ANIM.speed - near;
      if (timeline) timeline.kill();
      noacgStepsPlayed = Math.min(activeStep + 1, outCue);
      timeline = noacgExitTimeline(interrupted, true);
      timeline.pause();
      activeStep = outCue;
      inspected = false;
      exiting = true;
    }
    localTime = time;
    timeline.time(time, true);
    if (time === 0) timeline.render(0, true, true);
  }
  function measure() {
    var poseTime = config.scrubbable ? localTime : config.time;
    for (var i = 0; i < activeStep; i++) poseTime += NOACG_ANIM.steps[i].duration / NOACG_ANIM.speed;
    return config.selectors.flatMap(function (selector) {
      var element = document.querySelector(selector);
      if (!element) return [];
      var style = getComputedStyle(element);
      var adapter = config.adapters[selector];
      var target = adapter ? document.querySelector(adapter.target) : element;
      var rect = target.getBoundingClientRect();
      var parent = target instanceof SVGGraphicsElement ? target.parentElement : target.offsetParent;
      var matrix = basis(parent);
      var targetStyle = target === element ? style : getComputedStyle(target);
      var unit = adapter && adapter.scaled || adapter && adapter.mode === 'flow'
        ? parseFloat(targetStyle.getPropertyValue('--scale')) || 1 : 1;
      var motion = window.gsap ? numericPose(element) : undefined;
      // Reuse this pose's HTML geometry for both handles and pivot. Each ancestor
      // walk was repeated three times per layer; no value survives this measure.
      var targetMatrix = target instanceof SVGGraphicsElement ? null : basis(target);
      var svg = target instanceof SVGGraphicsElement, bbox = svg && target.getBBox();
      var box = svg ? [bbox.width, bbox.height] : percentBox(target, targetStyle);
      var points = corners(target, targetMatrix, rect, box);
      // The pivot rotation and scale use, from the top-left of the box the corners are measured on.
      var origin = targetStyle.transformOrigin.split(' ').slice(0, 2).map(parseFloat);
      var path = element.tagName.toLowerCase() === 'path' ? element : element.hasAttribute('data-pen-path') ? element.querySelector(':scope > svg > path') : null;
      var pathMatrix = path && path.getScreenCTM();
      // Point edits can extend past the initial transform frame. Hit testing follows the artwork;
      // the original corners and pivot still define its whole-layer transform.
      var hit = path && element.hasAttribute('data-pen-path') ? path.getBoundingClientRect() : rect;
      return [{ selector: selector, x: hit.x, y: hit.y, width: hit.width,
        height: hit.height, opacity: Number(style.opacity), transform: style.transform,
        appearance: { time: poseTime, cue: inspected ? activeStep : undefined, exiting: exiting || undefined, revision: current, motion: motion, initialMotion: initialMotion[selector], unit: unit, size: target !== element ? percentBox(element, style) : svg ? undefined : box, box: box, origin: svg ? undefined : origin, fontFamily: style.fontFamily, fontSize: parseFloat(style.fontSize) / (element instanceof SVGElement ? 1 : unit), fontWeight: Number(style.fontWeight), lineHeight: style.lineHeight === 'normal' ? undefined : parseFloat(style.lineHeight) / parseFloat(style.fontSize), letterSpacing: style.letterSpacing === 'normal' ? 0 : parseFloat(style.letterSpacing) / (element instanceof SVGElement ? 1 : unit), color: element instanceof SVGElement ? style.fill : style.color, fill: element instanceof SVGElement ? style.fill : style.backgroundColor, opacity: Number(style.opacity) },
        parent: [matrix.a * unit, matrix.b * unit, matrix.c * unit, matrix.d * unit],
        corners: points, anchor: anchor(target, targetMatrix, points, origin),
        pathMatrix: pathMatrix ? [pathMatrix.a,pathMatrix.b,pathMatrix.c,pathMatrix.d,pathMatrix.e,pathMatrix.f] : undefined }];
    });
  }
  // Translation cancels for pointer deltas. SVG supplies an exact CTM; HTML composes
  // the linear transforms up its ancestors, including independent base scale.
  function basis(element) {
    if (element instanceof SVGGraphicsElement) return element.getScreenCTM() || new DOMMatrix();
    var matrix = new DOMMatrix();
    for (var node = element; node && node instanceof Element; node = node.parentElement) {
      var style = getComputedStyle(node);
      matrix = ownMatrix(style).multiply(matrix);
    }
    return matrix;
  }
  // An element's own transform: CSS applies rotate, then scale, then transform (all about transform-origin).
  // An independent rotate is GSAP's to fold once it reads the element; DOMMatrix reads its angle unit.
  function ownMatrix(style) {
    var transform = new DOMMatrix(style.transform === 'none' ? undefined : style.transform);
    var rotate = new DOMMatrix(style.rotate && style.rotate !== 'none' ? 'rotate(' + style.rotate.split(' ').pop() + ')' : undefined);
    var scales = style.scale === 'none' ? [1, 1] : style.scale.split(' ').map(Number);
    return rotate.scale(scales[0], scales[1] === undefined ? scales[0] : scales[1]).multiply(transform);
  }
  // The box's corners on screen: an SVG element's bounding box, else the unrounded border box
  // (size; offsetWidth rounds to whole pixels, transform-origin percentages do not).
  function corners(element, matrix, rect, size) {
    if (element instanceof SVGGraphicsElement) {
      var box = element.getBBox(), m = element.getScreenCTM();
      if (m) return [[box.x,box.y],[box.x+box.width,box.y],[box.x+box.width,box.y+box.height],[box.x,box.y+box.height]].map(function (p) {
        return { x:m.a*p[0]+m.c*p[1]+m.e, y:m.b*p[0]+m.d*p[1]+m.f };
      });
    }
    var m = matrix || basis(element), w = size[0], h = size[1];
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
  function anchor(element, matrix, points, origin) {
    if (element instanceof SVGGraphicsElement) {
      // CSS rotate and scale turn about the origin in the parent's user space, outside the element's
      // own transform attribute, so the origin maps through the parent.
      var parentNode = element.parentElement, m = parentNode instanceof SVGGraphicsElement && parentNode.getScreenCTM() || element.getScreenCTM();
      return { x:m.a*origin[0]+m.c*origin[1]+m.e, y:m.b*origin[0]+m.d*origin[1]+m.f };
    }
    var m = matrix, corner = points[0];
    return { x:corner.x+m.a*origin[0]+m.c*origin[1], y:corner.y+m.b*origin[0]+m.d*origin[1] };
  }
  function setCss(css) {
    var sheet = document.getElementById('spx-inline-css');
    var baseTransforms = /--base-(?:scale-[xy]|[xy]|rotation)\s*:[^;}]+/g;
    var changed = String(sheet.textContent.match(baseTransforms)) !== String(css.match(baseTransforms));
    var step = activeStep, time = timeline ? timeline.time() : 0;
    // GSAP folds independent CSS transforms into its cached matrix and writes inline
    // scale: none. Rebuild that transient pose when base transforms change so both
    // the first edit and an edit after scrubbing/reopening agree with exported playback.
    if (changed && step >= 0) resetPose();
    sheet.textContent = css;
    // A design that fits placed text to a slot measures from the stylesheet, so a new slot width or
    // spacing refits it, as the design's own update() does after every value (R1.2b.2).
    if (typeof fitPlacedText === 'function') fitPlacedText();
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
        seek(m.step, m.time, m.inspect);
        presented(m.requestId, 'ready');
      } catch (error) { send('error', m.requestId, { message: String(error.message || error) }); }
      return;
    }
    if (m.revision.source !== current.source || m.revision.assets !== current.assets) return;
    lastRequest = m.requestId;
    try {
      if (m.kind === 'seek') seek(m.step, m.time, m.inspect);
      else if (m.kind === 'exit-start' || m.kind === 'exit-time') exit(m.time, m.kind === 'exit-start');
      else if (m.kind === 'preview-css') setCss(m.css);
      else if (m.kind === 'preview-template') {
        resetPose(); setCss(m.css);
        (m.geometry || []).forEach(function (patch) {
          var element = document.querySelector(patch.selector);
          if (!element) return;
          ['x', 'y', 'cx', 'cy'].forEach(function (name) {
            var value = patch.attributes[name];
            if (value === null) element.removeAttribute(name); else element.setAttribute(name, value);
          });
        });
        window.NOACG_ANIM = m.animation; seek(m.step, m.time, m.inspect);
      }
      else if (m.kind === 'reset-metrics') { intervals = []; longTasks = []; }
      else return;
      presented(m.requestId, 'pose', m.kind === 'preview-css' || m.kind === 'preview-template');
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
      seek(config.step, config.time, config.inspect);
      initialized = true;
      presented(config.requestId, 'ready');
    } catch (error) { send('error', config.requestId, { message: String(error.message || error) }); }
  }, { once: true });
})();
`;
