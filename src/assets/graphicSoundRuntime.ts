// Packaged Web Audio, emitted with the interpreter. ES5 for receiving browsers.
// No network/decode on a cue: prepare first, then start the decoded buffer synchronously.
export const SOUND_RUNTIME_JS = `// Capability: graphic-sound-v2
var noacgSoundContext = null;
var noacgSoundBuffers = {};
var noacgSoundPlaying = {};
var noacgSoundPreparing = null;
var noacgSoundError = null;
var noacgSoundQuiet = window.noacgSoundInitialQuiet === true;
var noacgSoundDisposed = false;
var noacgSoundSuppressShot = false;

function noacgSoundStats() {
  var paths = {}, count = 0, bytes = 0, prepared = 0;
  noacgSoundDescriptors().forEach(function (s) {
    if (!s.enabled || paths[s.asset]) return;
    paths[s.asset] = true; count++;
    var buffer = noacgSoundBuffers[s.asset];
    if (buffer) { prepared++; bytes += buffer.length * buffer.numberOfChannels * 4; }
  });
  return { n: prepared, of: count, bytes: bytes, error: noacgSoundStatus() };
}
function noacgSoundNotify() {
  if (window.noacgSoundReport) window.noacgSoundReport(noacgSoundStats());
}

function noacgSoundBinding(key) {
  if (typeof NOACG_PRODUCTION_SOUNDS === 'undefined' || noacgSoundConfigError) return null;
  var visual = NOACG_PRODUCTION_SOUNDS.visuals[typeof noacgSoundVisual === 'undefined' ? 'graphic' : noacgSoundVisual];
  return visual && visual.bindings[key];
}
function noacgSoundDescriptors() {
  var sounds = [];
  function step(s) { if (s && s.sound) sounds.push(s.sound); }
  if (typeof NOACG_ANIM !== 'undefined') NOACG_ANIM.steps.forEach(step);
  if (typeof NOACG_ANIM !== 'undefined' && NOACG_ANIM.machine) NOACG_ANIM.machine.groups.forEach(function (g) {
    g.states.forEach(function (s) { step(s.timeline); });
    g.transitions.forEach(function (t) { if (t.sound) sounds.push(t.sound); });
  });
  if (typeof NOACG_PRODUCTION_SOUNDS !== 'undefined') Object.keys(NOACG_PRODUCTION_SOUNDS.visuals).forEach(function (key) {
    var bindings = NOACG_PRODUCTION_SOUNDS.visuals[key].bindings;
    Object.keys(bindings).forEach(function (trigger) { sounds.push(bindings[trigger]); });
  });
  return sounds;
}
function noacgSoundAudible() {
  return !noacgSoundDisposed && !noacgSoundQuiet && window.noacgSoundMode !== 'silent';
}
function noacgSoundPrepare() {
  if (window.noacgSoundMode === 'silent') return Promise.resolve();
  if (noacgSoundContext && noacgSoundContext.state === 'suspended') {
    noacgSoundContext.resume().catch(function (e) { console.error(String(e.message || e)); });
  }
  if (noacgSoundPreparing) return noacgSoundPreparing;
  var sounds = noacgSoundDescriptors().filter(function (s) { return s.enabled; });
  if (!sounds.length) return Promise.resolve();
  try {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error('This output has no Web Audio support.');
    if (!noacgSoundContext) noacgSoundContext = new Ctx();
    noacgSoundContext.onstatechange = function () {
      if (noacgSoundContext.state !== 'running') noacgSoundStopAll();
      else noacgSoundRestore();
      noacgSoundNotify();
    };
    var paths = {};
    sounds = sounds.filter(function (s) { if (paths[s.asset]) return false; paths[s.asset] = true; return true; });
    noacgSoundPreparing = sounds.reduce(function (chain, s) { return chain.then(function () {
      var url = window.noacgResolveSound ? window.noacgResolveSound(s.asset) : s.asset;
      if (noacgSoundBuffers[s.asset]) return Promise.resolve();
      var bytesReady = window.noacgLoadSound ? window.noacgLoadSound(s.asset) : fetch(url).then(function (r) {
        if (!r.ok) throw new Error('Could not load sound ' + s.id);
        return r.arrayBuffer();
      });
      return bytesReady.then(function (bytes) {
        return new Promise(function (resolve, reject) {
          noacgSoundContext.decodeAudioData(bytes, function (buffer) {
            if (buffer.length * buffer.numberOfChannels * 4 > 67108864) { reject(new Error('Decoded sound exceeds 64 MiB: ' + s.id)); return; }
            var size = buffer.length * buffer.numberOfChannels * 4;
            if (noacgSoundStats().bytes + size > 536870912) { reject(new Error('Prepared sounds exceed 512 MiB. Reduce the sounds in this production.')); return; }
            var retain = window.noacgSoundRetain ? window.noacgSoundRetain(s.asset,size) : Promise.resolve();
            retain.then(function () {
              if (!noacgSoundDisposed) noacgSoundBuffers[s.asset] = buffer;
              resolve();
            },reject);
          }, function () { reject(new Error('Could not decode sound ' + s.id)); });
        });
      });
    }); }, Promise.resolve()).then(function () { noacgSoundError = null; noacgSoundRestore(); noacgSoundNotify(); }, function (e) {
      noacgSoundPreparing = null; noacgSoundError = String(e.message || e); noacgSoundNotify(); throw e;
    });
  } catch (e) {
    noacgSoundError = String(e.message || e);
    noacgSoundNotify();
    return Promise.reject(e);
  }
  return noacgSoundPreparing;
}
function noacgSoundStatus() {
  if (window.noacgSoundMode === 'silent') return null;
  if (typeof noacgSoundConfigError !== 'undefined' && noacgSoundConfigError) return noacgSoundConfigError;
  if (noacgSoundError) return noacgSoundError;
  if (!noacgSoundDescriptors().some(function (s) { return s.enabled; })) return null;
  if (!noacgSoundContext) return 'Sounds have not been prepared.';
  if (noacgSoundDescriptors().some(function (s) { return s.enabled && !noacgSoundBuffers[s.asset]; })) return 'Sounds are still decoding.';
  if (window.noacgSoundMode !== 'silent' && noacgSoundContext.state !== 'running') return 'Output audio is blocked. Enable audio in the receiving browser and prepare again.';
  return null;
}
function noacgSoundCanExecute() {
  if (!noacgSoundAudible()) return true;
  var error = noacgSoundStatus();
  if (error) console.error(error);
  return true;
}
function noacgSoundStop(key) {
  var p = noacgSoundPlaying[key];
  if (!p) return;
  delete noacgSoundPlaying[key];
  if (noacgSoundContext.state !== 'running') {
    p.source.onended = null;
    try { p.source.stop(); } catch (e) {}
    p.source.disconnect(); p.gain.disconnect(); p.envelope.disconnect(); return;
  }
  var now = noacgSoundContext.currentTime;
  p.envelope.gain.cancelScheduledValues(now);
  p.envelope.gain.setValueAtTime(p.envelope.gain.value, now);
  p.envelope.gain.linearRampToValueAtTime(0, now + 0.05);
  try { p.source.stop(now + 0.05); } catch (e) {}
}
function noacgSoundStopAll() {
  Object.keys(noacgSoundPlaying).forEach(noacgSoundStop);
}
function noacgSoundLeave(group) {
  Object.keys(noacgSoundPlaying).forEach(function (key) {
    var p = noacgSoundPlaying[key];
    if (p.group === group && p.sound.mode === 'loop') noacgSoundStop(key);
  });
}
function noacgSoundStart(sound, group, restore) {
  if (!sound || !sound.enabled || !noacgSoundAudible()) return;
  if (typeof noacgSoundConfigError !== 'undefined' && noacgSoundConfigError) return;
  var key = group + ':' + sound.id, old = noacgSoundPlaying[key];
  if (restore && old && old.sound.mode === 'loop') return;
  noacgSoundStop(key);
  var buffer = noacgSoundBuffers[sound.asset];
  if (!buffer || !noacgSoundContext || noacgSoundContext.state !== 'running') {
    console.error(noacgSoundStatus() || ('Sound is not decoded: ' + sound.id)); return;
  }
  var source = noacgSoundContext.createBufferSource(), gain = noacgSoundContext.createGain(), envelope = noacgSoundContext.createGain();
  source.buffer = buffer; source.loop = sound.mode === 'loop';
  gain.gain.value = Math.pow(10, sound.levelDb / 20);
  envelope.gain.setValueAtTime(0, noacgSoundContext.currentTime);
  envelope.gain.linearRampToValueAtTime(1, noacgSoundContext.currentTime + 0.005);
  source.connect(gain); gain.connect(envelope); envelope.connect(noacgSoundContext.destination);
  var p = { source: source, gain: gain, envelope: envelope, sound: sound, group: group };
  noacgSoundPlaying[key] = p;
  source.onended = function () {
    if (noacgSoundPlaying[key] === p) delete noacgSoundPlaying[key];
    source.disconnect(); gain.disconnect(); envelope.disconnect();
  };
  source.start(0);
}
function noacgSoundExecute(sound, group, tl, edgeSound) {
  if (noacgSoundSuppressShot && (!sound || sound.mode !== 'loop')) return;
  if (!sound || !sound.enabled || !noacgSoundAudible()) return;
  if (!edgeSound && tl && tl.__noacgOutSoundAt > 0) {
    tl.call(function () { noacgSoundStart(sound, group); }, [], tl.__noacgOutSoundAt);
  } else noacgSoundStart(sound, group);
}
function noacgSoundRestore() {
  if (!noacgSoundAudible()) return;
  if (typeof noacgSoundQuiz === 'function' && noacgSoundQuiz()) {
    var quiz = noacgSoundQuiz(), current = noacgCurrent[noacgMachine.groups[0].id];
    noacgSoundPick = current === quiz.selectionState || current === 'locked' ? noacgSoundField(quiz.selected) : null;
  }
  if (typeof noacgSoundClockRestore === 'function') noacgSoundClockRestore();
  if (typeof noacgMachine === 'undefined') {
    var binding = noacgSoundBinding('in');
    if (typeof noacgSoundOnAir !== 'undefined' && noacgSoundOnAir && binding && binding.mode === 'loop') noacgSoundStart(binding,'visual',true);
    return;
  }
  noacgMachine.groups.forEach(function (group) {
    if (noacgCurrent[group.id] === group.initial) return;
    var step = noacgStepFor(group, noacgCurrent[group.id]);
    if (step && step.sound && step.sound.mode === 'loop') noacgSoundStart(step.sound, group.id, true);
  });
}
function noacgSoundSetQuiet(quiet) {
  if (noacgSoundQuiet === quiet) return;
  noacgSoundQuiet = quiet;
  if (quiet) noacgSoundStopAll();
  else noacgSoundRestore();
}
function noacgSoundDispose() {
  if (noacgSoundDisposed) return;
  noacgSoundDisposed = true;
  noacgSoundStopAll();
  if (typeof noacgCancelAllTimers !== 'undefined') noacgCancelAllTimers();
  if (typeof noacgQueue !== 'undefined') noacgQueue.length = 0;
  if (window.removeEventListener) {
    window.removeEventListener('pagehide', noacgSoundDispose);
    window.removeEventListener('unload', noacgSoundDispose);
  }
  if (noacgSoundContext) noacgSoundContext.close().catch(function () {});
}
if (window.addEventListener) {
  window.addEventListener('pagehide', noacgSoundDispose);
  window.addEventListener('unload', noacgSoundDispose);
}
`;
