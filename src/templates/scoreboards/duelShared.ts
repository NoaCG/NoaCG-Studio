// The DUEL SCORE contract - the two-player score strip a quiz show keeps up all evening
// (types/duelScore.ts). Shared by its three designs (sb26 Sticker, sb27 Showtime, sb28 Arcade)
// so they pair the same ids the same way and ship the same small runtime.
//
//   f0 "Player 1" · f1 "Score 1" · f2 "Player 2" · f3 "Score 2"
//
// It is the founding scoreboard's four-field shape with the football taken out: the labels say
// Player, the control page says Point rather than Goal, there is no flag, and "Final score"
// marks the LEADER. Who leads is never a state or a field - it is read off the two numbers
// every time they change, so a correction typed into a score box moves the mark with it.

import type { SpxField } from '../../model/types';

export const DUEL_NAMES = ['ALEX', 'SAM'] as const;

/** The duel board's four fields. Scores are `number`, so every control surface gives each one
 *  its own steppers as well as the Point buttons. */
export function duelFields(names: readonly string[] = DUEL_NAMES): SpxField[] {
  return [
    { field: 'f0', ftype: 'textfield', title: 'Player 1', value: names[0] },
    { field: 'f1', ftype: 'number', title: 'Score 1', value: '0' },
    { field: 'f2', ftype: 'textfield', title: 'Player 2', value: names[1] },
    { field: 'f3', ftype: 'number', title: 'Score 2', value: '0' },
  ];
}

/**
 * The duel runtime - design-owned JS outside the marked region (the boardRuntimes rule).
 *
 * `rebuildScoreboard` is the name the assembler's update() already calls after every data
 * write, so the leader mark rides every score change with no extra wiring. It is a CLASS on the
 * root (`scoreboard-lead-a` / `scoreboard-lead-b`, neither on a tie) and what it looks like is
 * the design's business: all three show it only once the result is final.
 *
 * `scorePoint` exists because a Point button's figure rides its EVENT, and a payload is written
 * straight into the element without passing through update(): the pop and the leader mark have
 * to be asked for by the state that the press enters. `markFinal` and `markLive` are declared
 * here because these boards opt out of the shared match clock (they draw no clock), and that
 * runtime is where the other scoreboards get theirs.
 */
export function duelRuntimeJs(): string {
  return `// ── Duel runtime: who leads, the point that was just scored, and the final call. ──

var duelSeen = {};               // the last figure each score showed - what scorePoint() compares against

// rebuildScoreboard(): called by update() after every data write, and at load. Compares the two
// scores and marks the leader on the root. A tie marks nobody. Text that is not a number counts
// as 0, so a half-typed correction never throws.
function rebuildScoreboard() {
  var root = document.querySelector('.scoreboard');
  var a = document.getElementById('f1');
  var b = document.getElementById('f3');
  if (!root || !a || !b) return;
  var scoreA = parseFloat(a.textContent) || 0;
  var scoreB = parseFloat(b.textContent) || 0;
  root.classList.toggle('scoreboard-lead-a', scoreA > scoreB);
  root.classList.toggle('scoreboard-lead-b', scoreB > scoreA);
  duelSeen.f1 = a.textContent;   // update() has already popped a figure it changed
  duelSeen.f3 = b.textContent;
}

// scorePoint(): the state effect the machine's "Point" timeline names. A Point button's new
// figure rides its EVENT, and an event's payload is written straight into the element - it
// never passes through update() - so the pop and the leader mark have to be asked for here.
// Pops the MASK (the span's parent), for update()'s reason: the span is clipped by it.
function scorePoint() {
  var ids = ['f1', 'f3'];
  for (var i = 0; i < ids.length; i++) {
    var el = document.getElementById(ids[i]);
    if (!el || duelSeen[ids[i]] === undefined || duelSeen[ids[i]] === el.textContent) continue;
    if (typeof onAir !== 'undefined' && onAir) {
      gsap.fromTo(el.parentNode, { scale: 1.35 }, { scale: 1, duration: 0.4 / motionSpeed(), ease: 'back.out(1.7)' });
    }
  }
  rebuildScoreboard();
}

// markFinal() / markLive(): the state effects the machine's result group names. The class is
// what the design's winner treatment hangs on; update()'s paintMatchState() keeps it honest
// after a recovery, because a snap replays states with their calls suppressed.
function markFinal() {
  var root = document.querySelector('.scoreboard');
  if (root) root.classList.add('scoreboard-final');
  rebuildScoreboard();
}
function markLive() {
  var root = document.querySelector('.scoreboard');
  if (root) root.classList.remove('scoreboard-final');
  rebuildScoreboard();
}

// First paint: mark the leader before the entrance runs. Guarded, because an exported package
// may load this file from <head>, before the strip exists.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', rebuildScoreboard);
} else {
  rebuildScoreboard();
}`;
}
