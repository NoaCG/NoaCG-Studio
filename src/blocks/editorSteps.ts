import type { SpxTemplate } from '../model/types';
import { replaceDefinitionInHtml } from '../model/spxDefinition';
import { cueStarts, EPS, joinCues, moveStepFlag, renameStep, round, splitCue, withOut } from './animEdit';
import { spxSteps } from './animMachine';
import { animationSource, documentContains, sequenceAuthoringReason } from './editorAnimation';
import { writeOutData } from '../templates/shared/animRuntime';

/** Step authoring on the one timeline (R1.2a.4, docs/research/editor-r1-2a-4). Times are ruler
 *  seconds (stored / speed); a Step is a cue between In and Out, named by its index. */
export type StepOperation =
  | { kind: 'step.add'; time: number }
  | { kind: 'step.rename'; step: number; name: string }
  | { kind: 'step.delete'; step: number }
  | { kind: 'step.move'; step: number; time: number };
const STEP_NAME_LIMIT = 40;

/**
 * Add, rename, delete or move a Step. Keys and bars keep their absolute times (animEdit.ts
 * splitCue, joinCues, moveStepFlag), `settings.steps` and the SPX definition follow, and an older
 * known interpreter is re-emitted as Set Out does. Throws with the reason, leaving `template` as it was.
 */
export function applyStep(template: SpxTemplate, operation: StepOperation): SpxTemplate {
  let data = animationSource(template);
  const reason = sequenceAuthoringReason(data);
  if (reason) throw new Error(reason);
  // A legacy one-step graphic gains its empty Out first, so a new Step is never the exit.
  withOut(data);
  const out = data.steps.length - 1, frame = data.speed / template.fps;
  const starts = cueStarts(data);
  // Stored time on the ruler of a playhead snapped to its frame.
  const snapped = (time: number) => {
    if (!Number.isFinite(time) || time < 0) throw new Error('A flag needs a finite playhead time.');
    return Math.round(time * template.fps) / template.fps * data.speed;
  };
  const contains = documentContains(template.html);
  const step = 'step' in operation ? operation.step : 0;
  if ('step' in operation && !data.steps[step]) throw new Error('That Step no longer exists. Select a flag again.');
  if ('step' in operation && (step === 0 || step === out)) throw new Error(`In and Out stay where they are; only a Step can be ${operation.kind === 'step.rename' ? 'renamed' : operation.kind === 'step.delete' ? 'deleted' : 'moved here'}.`);
  if (operation.kind === 'step.add') {
    const u = snapped(operation.time);
    if (starts.some(start => Math.abs(start - u) < EPS)) throw new Error('A flag is already at this frame. Put the playhead between flags to add a Step there.');
    if (u > starts[out]) throw new Error('A Step after Out would never play. Put the playhead before Out to add a Step.');
    const at = starts.findIndex((start, i) => u > start && u < starts[i + 1]);
    data = splitCue(data, at, round(u - starts[at]), frame);
  } else if (operation.kind === 'step.rename') {
    const name = operation.name.trim();
    if (!name) throw new Error('A Step needs a name.');
    if (name.length > STEP_NAME_LIMIT) throw new Error(`Keep a Step name to ${STEP_NAME_LIMIT} characters.`);
    const renamed = renameStep(data, step, name);
    if (!renamed) return template;
    data = renamed;
  } else if (operation.kind === 'step.delete') {
    data = joinCues(data, step - 1, contains);
  } else if (operation.kind === 'step.move') {
    const moved = moveStepFlag(data, step, round(snapped(operation.time) - starts[step - 1]), frame, contains);
    if (moved === data) return template;
    data = moved;
  } else throw new Error('Unknown step operation.');
  const js = writeOutData(template.js, data);
  if (js === null) throw new Error('This interpreter has custom source. Steps cannot upgrade it safely; its source is preserved.');
  const steps = String(spxSteps(data));
  if (template.settings.steps === steps) return { ...template, js };
  const settings = { ...template.settings, steps };
  return { ...template, js, settings, html: replaceDefinitionInHtml(template.html, settings, template.fields) };
}
