// A SAVED GRAPHIC KEEPS THE BUTTONS IT WAS BUILT WITH, SO THE CONTROL MODEL RE-DERIVES WHAT CHANGED.
//
// A graphic's buttons (`machine.controls`: label, section, payload) are compiled INTO the template
// when it is built (templates/types/graphicType.ts compileControls, and the recipe compiler for an
// imported design), which is what lets an exported control page work with no type registry. The
// price is that a graphic saved before a control declaration changed keeps the old declaration, and
// a saved template records no type id to compile it again from.
//
// So every declaration change that must reach saved graphics is ONE ENTRY in the ledger below: the
// date and commit it follows, and a re-derive that recognises the shape it replaced from the
// graphic's own code and brings it to the current one. The ledger is the version - each entry is a
// step, applied in order - and an entry leaves a graphic already on its shape untouched, so a
// graphic built today passes through unchanged. `eventButtons` applies it on every read, which is
// every surface's one road to the buttons: a library copy, a production's snapshot, a published
// payload and an export all get the same buttons, and nothing is rewritten on disk.
//
// An entry recognises only what OUR generators wrote. A graphic whose code it cannot read is left
// exactly as it was saved, never guessed at.

import type { AnimMachine } from '../blocks/animData';
import { parseBehaviourData } from '../blocks/behaviourData';

interface ControlUpgrade {
  /** When the declaration changed, and the commit that changed it. */
  since: string;
  /** What a saved graphic gains. */
  what: string;
  apply(machine: AnimMachine, js: string): AnimMachine;
}

/** The answer key's field in a quiz's own code, or null when this is not a quiz we built. An
 *  imported quiz names it in its behaviour table (the recipe's owned `correctAnswer`); a catalog
 *  quiz reads it in its paint signature (templates/quiz/shared.ts `quizPaintSig`). */
function answerKeyField(js: string): string | null {
  const table = parseBehaviourData(js);
  if (table) {
    const quiz = table.recipe === 'quiz' || (table.parts ?? []).includes('quiz');
    const key = table.fields?.correctAnswer;
    return quiz && typeof key === 'string' ? key : null;
  }
  return /var correctEl = document\.getElementById\('(f\d+)'\);/.exec(js)?.[1] ?? null;
}

const LEDGER: ControlUpgrade[] = [
  {
    since: '2026-09-22 (4b9f0139)',
    what: "a quiz's Reveal carries the answer key, so a key corrected in the cue is the one that lights",
    apply(machine, js) {
      const controls = machine.controls ?? [];
      const reveal = controls.find((c) => c.event === 'judge' && !c.payload?.length);
      if (!reveal) return machine;
      const key = answerKeyField(js);
      if (!key) return machine;
      return { ...machine, controls: controls.map((c) => (c === reveal ? { ...c, payload: [key] } : c)) };
    },
  },
];

/** The machine with every ledger entry applied, in order: the buttons a graphic saved on any
 *  earlier declaration would have been built with today. */
export function upgradeControls(machine: AnimMachine, js: string): AnimMachine {
  return LEDGER.reduce((m, upgrade) => upgrade.apply(m, js), machine);
}
