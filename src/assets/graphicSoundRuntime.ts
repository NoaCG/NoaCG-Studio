// Packaged Web Audio, emitted with the interpreter. ES5 for receiving browsers.
// No network/decode on a cue: prepare first, then start the decoded buffer synchronously.
export const SOUND_RUNTIME_JS = `// Capability: graphic-sound-v1
var noacgSoundContext = null;
var noacgSoundBuffers = {};
var noacgSoundPlaying = {};
var noacgSoundPreparing = null;
var noacgSoundError = null;
var noacgSoundQuiet = false;
var noacgSoundDisposed = false;

function noacgSoundDescriptors() {
  var sounds = [];
  function step(s) { if (s && s.sound) sounds.push(s.sound); }
  NOACG_ANIM.steps.forEach(step);
  if (NOACG_ANIM.machine) NOACG_ANIM.machine.groups.forEach(function (g) {
    g.states.forEach(function (s) { step(s.timeline); });
    g.transitions.forEach(function (t) { if (t.sound) sounds.push(t.sound); });
  });
  return sounds;
}
function noacgSoundAudible() {
  return !noacgSoundDisposed && !noacgSoundQuiet && window.noacgSoundMode !== 'silent';
}
function noacgSoundPrepare() {
  if (noacgSoundContext && noacgSoundContext.state === 'suspended' && noacgSoundAudible()) {
    noacgSoundContext.resume().catch(function (e) { console.error(String(e.message || e)); });
  }
  if (noacgSoundPreparing) return noacgSoundPreparing;
  var sounds = noacgSoundDescriptors().filter(function (s) { return s.enabled; });
  if (!sounds.length) return Promise.resolve();
  try {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error('This output has no Web Audio support.');
    noacgSoundContext = new Ctx();
    noacgSoundContext.onstatechange = function () {
      if (noacgSoundContext.state !== 'running') noacgSoundStopAll();
      else noacgSoundRestore();
    };
    var paths = {};
    sounds = sounds.filter(function (s) { if (paths[s.asset]) return false; paths[s.asset] = true; return true; });
    noacgSoundPreparing = Promise.all(sounds.map(function (s) {
      var url = window.noacgResolveSound ? window.noacgResolveSound(s.asset) : s.asset;
      if (noacgSoundBuffers[s.asset]) return Promise.resolve();
      return fetch(url).then(function (r) {
        if (!r.ok) throw new Error('Could not load sound ' + s.id);
        return r.arrayBuffer();
      }).then(function (bytes) {
        return new Promise(function (resolve, reject) {
          noacgSoundContext.decodeAudioData(bytes, function (buffer) {
            noacgSoundBuffers[s.asset] = buffer; resolve();
          }, function () { reject(new Error('Could not decode sound ' + s.id)); });
        });
      });
    })).then(function () { noacgSoundError = null; }, function (e) {
      noacgSoundError = String(e.message || e); throw e;
    });
  } catch (e) {
    noacgSoundError = String(e.message || e);
    noacgSoundPreparing = Promise.reject(e);
  }
  return noacgSoundPreparing;
}
function noacgSoundStatus() {
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
  return !error;
}
function noacgSoundStop(key) {
  var p = noacgSoundPlaying[key];
  if (!p) return;
  delete noacgSoundPlaying[key];
  p.source.onended = null;
  try { p.source.stop(); } catch (e) {}
  p.source.disconnect(); p.gain.disconnect();
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
  var key = group + ':' + sound.id, old = noacgSoundPlaying[key];
  if (restore && old && old.sound.mode === 'loop') return;
  noacgSoundStop(key);
  var buffer = noacgSoundBuffers[sound.asset];
  if (!buffer || !noacgSoundContext || noacgSoundContext.state !== 'running') {
    console.error(noacgSoundStatus() || ('Sound is not decoded: ' + sound.id)); return;
  }
  var source = noacgSoundContext.createBufferSource(), gain = noacgSoundContext.createGain();
  source.buffer = buffer; source.loop = sound.mode === 'loop';
  gain.gain.value = Math.pow(10, sound.levelDb / 20);
  source.connect(gain); gain.connect(noacgSoundContext.destination);
  var p = { source: source, gain: gain, sound: sound, group: group };
  noacgSoundPlaying[key] = p;
  source.onended = function () {
    if (noacgSoundPlaying[key] === p) delete noacgSoundPlaying[key];
    source.disconnect(); gain.disconnect();
  };
  source.start(0);
}
function noacgSoundExecute(sound, group, tl, edgeSound) {
  if (!sound || !sound.enabled || !noacgSoundAudible()) return;
  if (!edgeSound && tl && tl.__noacgOutSoundAt > 0) {
    tl.call(function () { noacgSoundStart(sound, group); }, [], tl.__noacgOutSoundAt);
  } else noacgSoundStart(sound, group);
}
function noacgSoundRestore() {
  if (!noacgSoundAudible()) return;
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
  noacgCancelAllTimers(); noacgQueue.length = 0;
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
