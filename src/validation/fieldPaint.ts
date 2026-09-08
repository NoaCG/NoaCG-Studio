// Does a declared field reach the SCREEN?
//
// One definition, two consumers: `structuralIntentCheck` asks it of a routed harness result,
// and `runtimeBench` asks it of a NoaCG Lite generation (opt-in - see `fieldPaints`). It lived
// inside the first of those until 2026-08-08, when a Lite round produced a frame whose second
// field painted nothing at all: the panel reserved its space, `update()` with fresh data
// changed nothing, every rule code stayed silent, and the check that answers exactly this
// question could not run on that path (Lite never runs the intent stage, and the structural
// check needs an intent). Copying it would have been the second definition of a question that
// must have one answer, so it moved here instead.
//
// Browser-only: it drives a template running in a same-origin iframe and re-reads the frame.

import { parseAnimData } from '../blocks/animData';
import type { SpxTemplate } from '../model/types';
import { DATA_SOURCE_CLASS } from '../templates/shared/base';

/** The field types whose value becomes VISIBLE TEXT, so driving them can be observed on the
 *  screen. A `filelist` points at a picture that does not exist here, and a colour or a
 *  checkbox moves a style rather than a string - none of the three can be measured this way,
 *  so none is reported. Honest silence beats a finding the method cannot support. */
export const TEXT_FTYPES = new Set(['textfield', 'textarea', 'number', 'hidden']);

/**
 * A NUMBER the author declared input-only: a value the runtime COMPUTES with, never echoes.
 *
 * `class="noacg-data-source"` on the field's own element is the root `AGENTS.md` contract for a
 * holder SPX writes and a runtime reads without ever drawing it. On its own that says nothing
 * about whether the VALUE reaches the screen - a quiz board's audience percentages sit in exactly
 * such a holder and are painted verbatim as row chips - so the declaration alone must not silence
 * this check. Paired with `ftype: 'number'` it does say it, and the catalog agrees without an
 * exception: all 72 numeric holders it ships are a duration, a speed, a percentage, a 1-based
 * index or a goal ("Countdown (minutes)" x15, "Scroll speed (%)" x6, "Spotlit player (1-based)"
 * x4). A runtime turns those into a DIFFERENT string, so the sentinel can never appear - `900001`
 * minutes paints "15000:00:58" - and no value of the field would make it appear either.
 *
 * That is the fault the 2026-09-06 Pro Harness round hit from the other side: every countdown it
 * generated was refused on `bench-field-unpainted` for markup the root contract prescribes
 * verbatim, and all 6 shipped `game-timer` designs plus 7 of the 12 `end-credits` designs fail the
 * same way (docs/AI_ATTEMPTS.md, the sixth fault). A numeric holder is not measurable by "is this
 * string on screen", and honest silence beats a finding the method cannot support - the same
 * reason `filelist`, `color` and `checkbox` are absent from TEXT_FTYPES above.
 *
 * It is asked at REPORT time, so a holder whose value IS painted still has to prove it: the quiz's
 * percentages pass on the sentinel exactly as before, and hiding the chips still raises the
 * finding.
 */
function declaredNumericInput(doc: Document, field: SpxTemplate['fields'][number]): boolean {
  if (field.ftype !== 'number') return false;
  return doc.getElementById(field.field)?.classList.contains(DATA_SOURCE_CLASS) ?? false;
}

/** A value that will be ACCEPTED for the field's type and is unmistakable on screen. */
export function sentinelFor(field: SpxTemplate['fields'][number], i: number): string {
  const tag = `ZQ${i}X`;
  if (field.ftype === 'number') return String(900000 + i);
  const value = String(field.value ?? '');
  // A multi-line source (a rows/lines field) keeps its line and column COUNT, so the runtime
  // rebuilds the same shape and every cell carries its own sentinel.
  if (value.includes('\n') || value.includes('|')) {
    return value
      .split('\n')
      .map((line, li) => line.split('|').map((_, ci) => `${tag}_${li}_${ci}`).join(' | '))
      .join('\n');
  }
  return tag;
}

/**
 * Every string the frame can show, skipping only what is `display: none` or
 * `visibility: hidden`.
 *
 * OPACITY is deliberately not consulted. A region the state machine reveals in a later step is
 * transparent during the entrance and is perfectly reachable - the bracket's champion is
 * exactly that, and treating it as unreachable was this check's first false positive. The
 * defect being hunted has a different signature: the value exists NOWHERE but the hidden
 * holder, or nowhere at all. An element left at opacity 0 forever is a real fault, but it is
 * the entrance's, and `stripHidingDeclarations` and the runtime bench already own it.
 */
export function visibleText(doc: Document, win: Window): string {
  let out = '';
  const walk = (el: Element) => {
    const cs = win.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === 3 && node.textContent?.trim()) out += ` ${node.textContent.trim()}`;
    }
    for (const child of Array.from(el.children)) walk(child);
  };
  if (doc.body) walk(doc.body);
  return out;
}

interface UpdateGlobal {
  update?: (data: string) => void;
}

/** The machine engine's own globals (src/templates/shared/animRuntime.ts). Absent on a saved
 *  template whose FROZEN interpreter predates it, which is why every use is guarded. */
interface MachineGlobals {
  noacgSnap?: (assignments: Record<string, string> | null, opts?: { timers?: boolean }) => void;
  noacgMachineState?: () => { groups: Record<string, string> };
}

/**
 * How many extra states one measurement may enter.
 *
 * A bound is required - this walks a graph an author controls - but it must never be the thing
 * that decides the answer, so it sits far above anything the catalog ships: the largest machine
 * here is the quiz board's eight states, and the busiest parallel type reaches nine across three
 * groups. `e2e/lite-field-paint.spec.ts` measures the real maximum against this number, so the
 * cap cannot quietly start truncating as types are added.
 */
export const MAX_WALKED_STATES = 32;

/**
 * Which declared fields never reach the screen.
 *
 * The technique is scripts/field-coverage.mjs's, asked in the opposite direction: instead of
 * "which visible string can no operator reach", this asks "which field reaches no visible
 * string". It exists because presence in the DOM is not reachability - the 2026-08-01 pass
 * shipped 88 fields that were structurally impossible to draw (hidden holders no runtime read,
 * a list runtime whose container was never emitted) and every gate reported the parts present,
 * including the structural check's own parts check (PASS-2026-08-01.md cause 4).
 *
 * Reading the markup for `id="fN"` would not answer it: a standings row, a ticker item and a
 * credits line are all BUILT by a runtime from ONE field, so the id is legitimately absent.
 * Driving the field and re-reading the screen is the only question that survives that.
 *
 * IT ASKS THE WHOLE MACHINE, NOT ONE STATE. Until 2026-08-09 it read the frame once, at the
 * settled default path, which is only the whole answer for a graphic that has no states. A field
 * a later operator event reveals - a quiz's audience percentages, painted only on entry to its
 * `audience` branch, three events past settled - reached no pixels at that moment and would have
 * been reported unreachable, failing a correct graphic. That was the standing blocker on running
 * this check for any interactive category (docs/CONTROL_PANEL_PARITY.md §6).
 *
 * So after the settled reading it SNAPS through the machine's other states and unions what each
 * one shows. Three properties make that both correct and cheap:
 *
 * - `noacgSnap` enters any state directly, by replaying its canonical path with callbacks
 *   suppressed - no need to find an event sequence that reaches it, and a state no walk can
 *   reach by pressing buttons is still measured.
 * - Because callbacks ARE suppressed, a state whose look is a CALL (the quiz's marks, the poll's
 *   winner) paints nothing from the snap alone. The data is therefore re-driven after each one -
 *   which is exactly the recovery sequence's own trailing `update()`, not a special case.
 * - It stops as soon as every field has been seen somewhere, so a correct graphic pays for one
 *   or two extra states rather than for its whole graph.
 *
 * Only an EXPLICIT machine is walked. A derived one's states ARE the default path, which the
 * caller already walked before calling this, so a single-step lower third costs nothing new.
 *
 * It REPLACES the frame's data with sentinels. A caller that measures anything else afterwards
 * has to restore the values it wants - `runtimeBench` does; the structural check runs it last.
 * The MACHINE is put back where it was found, so a caller that walked to a pose before calling
 * this still measures that pose afterwards.
 */
export async function unreachableFields(
  doc: Document,
  win: Window & UpdateGlobal & MachineGlobals,
  template: SpxTemplate,
  settleMs: number,
): Promise<string[]> {
  const driven = template.fields
    .map((f, i) => ({ field: f, sentinel: sentinelFor(f, i) }))
    .filter((d) => TEXT_FTYPES.has(d.field.ftype));
  if (!driven.length) return [];

  const payload = JSON.stringify(Object.fromEntries(driven.map((d) => [d.field.field, d.sentinel])));
  /** Write the sentinels and let the frame settle. False = the template threw, so stop. */
  const drive = async (): Promise<boolean> => {
    try {
      win.update?.(payload);
    } catch {
      return false; // a template that throws on update is the runtime bench's finding, not ours
    }
    await new Promise<void>((r) => setTimeout(r, settleMs)); // a rebuild runtime may re-fit
    return true;
  };
  /** One cell is enough for a list: the field reached the screen, and how many rows the runtime
   *  chose to draw is a different question. */
  const shows = (sentinel: string, painted: string): boolean =>
    sentinel.split(/[\s|\n]+/).some((part) => part && painted.includes(part));

  if (!(await drive())) return [];
  let missing = driven.filter((d) => !shows(d.sentinel, visibleText(doc, win)));

  const machine = missing.length > 0 ? parseAnimData(template.js)?.machine : null;
  const snap = win.noacgSnap;
  const readState = win.noacgMachineState;
  if (machine && typeof snap === 'function' && typeof readState === 'function') {
    // An interpreter that cannot say where it is, is one we must not move: without a pointer to
    // put back, the walk would leave the caller measuring a pose it never asked for.
    let restore: Record<string, string> | null;
    try {
      restore = readState().groups;
    } catch {
      restore = null;
    }
    if (restore) {
      // Skip each group's INITIAL state (a group resting there is what the settled reading
      // already showed) and whatever is on screen right now, for the same reason.
      const targets: Array<{ group: string; state: string }> = [];
      for (const group of machine.groups) {
        for (const state of group.states) {
          if (state.id === group.initial || restore[group.id] === state.id) continue;
          targets.push({ group: group.id, state: state.id });
        }
      }
      for (const target of targets.slice(0, MAX_WALKED_STATES)) {
        if (missing.length === 0) break;
        try {
          // timers: false - a measurement must never arm a clock that then advances the
          // graphic under the next reading (the editor's parked preview passes the same).
          snap({ [target.group]: target.state }, { timers: false });
        } catch {
          continue; // an unreachable state snaps to nothing; the others still answer
        }
        if (!(await drive())) break;
        const painted = visibleText(doc, win);
        missing = missing.filter((d) => !shows(d.sentinel, painted));
      }
      try {
        snap(restore, { timers: false });
      } catch {
        /* put back if we can; the caller's own restore covers the data half */
      }
    }
  }

  return missing
    .filter((d) => !declaredNumericInput(doc, d.field))
    .map((d) => `${d.field.title || d.field.field} (${d.field.field})`);
}
