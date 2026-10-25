// THE DERIVED PANEL AS PREP AND LIVE (docs/work-specs/pinned-live-controls/spec.md AC-9), for the
// surfaces that describe a graphic rather than draw it: `noacg inspect` prints it. The pick and
// stepper rules are liveControls.ts's; this only arranges their answers.
//
// Runtime imports carry `.ts` so Node resolves them (cli/test/unit.test.mjs reads this file).

import type { FieldDescriptor } from '../model/fieldModel';
import type { ControlButton } from './controlModel';
import { liveNumberFields, pickOptions, type PickGroup } from './liveControls.ts';

export interface LivePanel {
  /** Every declared control, a pick group drawn as its option buttons. */
  controls: { event: string; label: string; pick?: PickGroup }[];
  /** Number fields with a ± stepper. */
  steppers: string[];
  /** Every other operator-visible field: typed before air. A stepped figure stays here too. */
  prep: string[];
}

export function livePanel(descriptors: readonly FieldDescriptor[], buttons: readonly ControlButton[], pathEvents: ReadonlySet<string>): LivePanel {
  const controls = buttons.map((b) => {
    const pick = pickOptions(b, descriptors, pathEvents, buttons);
    return pick ? { event: b.event, label: b.label, pick } : { event: b.event, label: b.label };
  });
  const picked = new Set(controls.flatMap((c) => (c.pick ? [c.pick.field] : [])));
  return {
    controls,
    steppers: liveNumberFields(descriptors, buttons).map((d) => d.key),
    prep: descriptors.filter((d) => !picked.has(d.key)).map((d) => d.key),
  };
}
