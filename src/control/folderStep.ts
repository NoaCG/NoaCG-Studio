// A ONE-BY-ONE FOLDER'S STEP (docs/CLIP_PLAYBACK_PLAN.md §20.1, owner 2026-09-29): what one press of
// SPACE, TAKE or a hardware button on a held One-by-one header does, as plain data the page carries
// out with the verbs it already has.
//
// The step airs the folder's next cue exactly as that cue's own Take would. Before it, the folder's
// graphics that are up go off; a clip or audio file is never stopped by a step. With no cue left, the
// press takes the graphics off and goes back to the top.
//
// Where the step stands is the page's memory of the folder's cue taken last, by any route. Nothing
// is saved: before any take in this page it is read off what is on air. Pure and importing nothing,
// so scripts/folder-playout.test.mjs runs it in Node.

/** A cue of the folder as the step reads it. */
export interface StepMember {
  id: string;
  /** A graphic - a pool graphic or a server template - goes off when the folder steps on. A clip,
   *  audio file or still does not. */
  graphic: boolean;
  /** What its own Take replaces: its pool graphic, or its server item. A graphic up with the same key
   *  as the next cue is replaced by that cue's Take rather than taken off first. */
  replaces: string;
}

/**
 * The folder's cue taken last in this page: `undefined` when nothing of it has been taken here (the
 * step is read off the air), `null` when it has gone back to the top.
 */
export type StepMemory = string | null | undefined;

export type FolderStep =
  /** Take `cueId`, after taking the graphics in `off` off. */
  | { kind: 'take'; cueId: string; off: readonly string[] }
  /** The end: take the graphics in `off` off (maybe none) and go back to the top. */
  | { kind: 'top'; off: readonly string[] }
  /** Every cue of the folder is on air, and none of them is a graphic a press could take off. */
  | { kind: 'none' };

/** The furthest of the folder's cues on air, or -1. */
function furthestOnAir(members: readonly StepMember[], onAir: ReadonlySet<string>): number {
  for (let i = members.length - 1; i >= 0; i--) if (onAir.has(members[i].id)) return i;
  return -1;
}

/**
 * WHAT ONE PRESS DOES. The next cue is the first after the step that is not on air, so a press
 * never re-takes what is already up (a clip the server moved on to, a cue taken by hand).
 */
export function folderStep(members: readonly StepMember[], memory: StepMemory, onAir: ReadonlySet<string>): FolderStep {
  const remembered = memory ? members.findIndex((m) => m.id === memory) : -1;
  // A remembered cue that has since left the folder reads like no memory: the air says where it is.
  const from = memory === null ? -1 : remembered >= 0 ? remembered : furthestOnAir(members, onAir);
  const next = members.findIndex((m, i) => i > from && !onAir.has(m.id));
  const graphicsUp = members.filter((m) => m.graphic && onAir.has(m.id));
  if (next >= 0) {
    const cue = members[next];
    return { kind: 'take', cueId: cue.id, off: graphicsUp.filter((g) => !cue.graphic || g.replaces !== cue.replaces).map((g) => g.id) };
  }
  if (graphicsUp.length || from >= 0) return { kind: 'top', off: graphicsUp.map((g) => g.id) };
  return { kind: 'none' };
}

/** The TAKE button's words for a step: the verb, and the cues a press takes and takes off named in
 *  its tooltip. `started`: something of the folder has been taken, so the press moves it on. */
export function stepFace(
  step: FolderStep,
  folderName: string,
  labelOf: (cueId: string) => string,
  started: boolean,
): { text: string; title: string; tone: 'take' | 'off' | 'still' } {
  const names = (ids: readonly string[]) => ids.map(labelOf).join(' and ');
  if (step.kind === 'take') {
    return {
      text: started ? '⟳ NEXT' : '⟳ TAKE',
      title: `Take ${labelOf(step.cueId)}${step.off.length ? `, and ${names(step.off)} off` : ''}`,
      tone: 'take',
    };
  }
  if (step.kind === 'top') {
    const back = `${folderName} starts again from its first cue; its clips play on.`;
    return step.off.length
      ? { text: '■ TAKE OFF', title: `Take ${names(step.off)} off. ${back}`, tone: 'off' }
      : { text: '↺ FROM THE TOP', title: back, tone: 'still' };
  }
  return { text: '⟳ TAKE', title: `Everything in ${folderName} is on air. 0 takes it off.`, tone: 'take' };
}
