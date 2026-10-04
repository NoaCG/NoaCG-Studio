// Adapter to the existing interpreter's accepted executions and the clock's own ticks.
// It installs no event handler or timer of its own. Snap/warm never call noacgFire.
export const PRODUCTION_SOUND_HOOKS = `
var noacgSoundPick = null;
function noacgSoundField(id) { var el = document.getElementById(id); return el ? String(el.textContent).trim() : ''; }
function noacgSoundQuiz() { return typeof NOACG_PRODUCTION_SOUNDS === 'undefined' ? null : NOACG_PRODUCTION_SOUNDS.visuals.graphic && NOACG_PRODUCTION_SOUNDS.visuals.graphic.quiz; }
(function () {
  if (typeof noacgFire === 'function') {
    var fire = noacgFire;
    noacgFire = function (group, edge) {
      var quiz = noacgSoundQuiz(), key = null, binding = null;
      if (quiz && group === noacgMachine.groups[0]) {
        var pick = noacgSoundField(quiz.selected);
        if (edge.to === quiz.selectionState && pick && pick !== noacgSoundPick) key = 'selection';
        if (edge.to === quiz.revealState && noacgCurrent[group.id] !== quiz.revealState && pick) key = pick === noacgSoundField(quiz.correct) ? 'correct' : 'wrong';
        noacgSoundPick = pick;
        binding = key && noacgSoundBinding(key);
      }
      noacgSoundSuppressShot = !!binding && binding.enabled;
      var result;
      try { result = fire(group,edge); } finally { noacgSoundSuppressShot = false; }
      if (binding) noacgSoundStart(binding,group.id);
      return result;
    };
    var machinePlay = noacgMachinePlay;
    noacgMachinePlay = function () { noacgSoundPick = null; return machinePlay(); };
  }
  if (typeof startClock === 'function' && typeof pauseClock === 'function' && typeof resumeClock === 'function' && typeof stopClock === 'function' && typeof tickClock === 'function') {
    var start = startClock, pause = pauseClock, resume = resumeClock, stop = stopClock, tick = tickClock;
    var resetting = false;
    startClock = function () { resetting = true; try { start(); } finally { resetting = false; } noacgSoundLeave('clock'); noacgSoundStart(noacgSoundBinding('countdown-running'),'clock'); };
    pauseClock = function () { var active = !!clockTimer; pause(); if (active) { noacgSoundLeave('clock'); noacgSoundStart(noacgSoundBinding('countdown-paused'),'clock'); } };
    resumeClock = function () { var active = !!clockTimer; resume(); if (!active && clockTimer) { noacgSoundLeave('clock'); noacgSoundStart(noacgSoundBinding('countdown-running'),'clock'); } };
    stopClock = function () { stop(); noacgSoundLeave('clock'); };
    tickClock = function () { var left = clockSecondsLeft; tick(); if (left > 0 && clockSecondsLeft <= 0 && !resetting) noacgSoundStart(noacgSoundBinding('countdown-expired'),'clock'); };
  }
})();
function noacgSoundClockRestore() {
  var binding = noacgSoundBinding(typeof clockTimer !== 'undefined' && clockTimer ? 'countdown-running' : typeof clockPaused !== 'undefined' && clockPaused ? 'countdown-paused' : '');
  if (binding && binding.mode === 'loop') noacgSoundStart(binding,'clock',true);
}
`;
