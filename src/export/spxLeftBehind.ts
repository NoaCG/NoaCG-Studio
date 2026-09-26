// WHAT THE SPX PACKAGE LEAVES BEHIND, said in the package (docs/CONTROL_PANEL_ANY_GRAPHIC.md §6h).
//
// The SPX starter package is the fallback a room reaches for when the network or the real-SPX
// check fails. By design (§6f) it carries each graphic's contract and nothing of the production:
// no combined controls, no bindings, no data tree. That boundary is right, and it was silent: a
// production built around one combined press exported to two rundown items with no word that the
// press was gone. This module writes the words, in the SPX operator's own actions (Play, Continue,
// Update, Stop), so whoever opens the package knows what to do by hand instead.
//
// Two separate findings, keyed separately on purpose:
// - LEFT BEHIND is keyed on the PRODUCTION (a published profile's combined controls, bindings, a
//   data tree). A production with none of them gets nothing.
// - THE REPORTED-FIELD RULE is keyed on the GRAPHIC: a hidden field one of its own controls writes,
//   on a control SPX's Continue fires. SPX stores the hidden field on the rundown item and sends
//   that stored value with every Update, so an Update after Continue hands the graphic its old state
//   back. That trap is there with or without a profile, so hiding it behind one would be wrong.

import type { ControlButton } from '../blocks/animMachine';
import { adjustWords, continueEvents, eventButtons, fieldDescriptors } from '../control/controlModel';
import { readPublishedProfile, type ProfileStep } from '../model/profile';
import type { Show } from '../model/shows';
import type { SpxTemplate } from '../model/types';

/** One pool graphic as the package ships it: the POOL name (the key the profile and the bindings
 *  use) beside the export-ready template. */
export interface PackagedGraphic {
  poolId: string;
  poolName: string;
  template: SpxTemplate;
}

/** A field's name as an operator sees it, or undefined when SPX shows no box for it (a hidden
 *  field, or no field at all): the same list every control panel draws. */
function fieldTitle(template: SpxTemplate, id: string): string | undefined {
  return fieldDescriptors(template.fields).find((d) => d.key === id)?.label;
}

/** "set <Field> to `v`" for every value an operator can type. A hidden field has no box on an SPX
 *  item, so it is left out rather than named as an edit nobody can make. */
function setWords(template: SpxTemplate, values: Record<string, string>): string[] {
  return Object.entries(values).flatMap(([id, v]) => {
    const title = fieldTitle(template, id);
    return title ? [`set ${title} to \`${v}\``] : [];
  });
}

/** What one control press is in SPX: Continue when the walk fires it, otherwise the fields it
 *  moves typed by hand and an Update. Null when SPX has no way to do it at all. */
function controlByHand(template: SpxTemplate, button: ControlButton): string | null {
  if (continueEvents(template.js).has(button.event)) return `press **Continue** (${button.label})`;
  const labelOf = (id: string) => fieldTitle(template, id);
  const edits = [
    ...Object.entries(button.adjust ?? {}).flatMap(([id, delta]) => {
      const title = labelOf(id);
      return title ? [`${delta > 0 ? 'raise' : 'lower'} ${title} by ${Math.abs(delta)}`] : [];
    }),
    ...setWords(template, button.set ?? {}),
  ];
  const lists = adjustWords({ add: button.add, remove: button.remove }, labelOf);
  if (lists) edits.push(`move ${lists}`);
  // The edit names its own fields, so the button's label (often a bare "+1") would only repeat it.
  return edits.length ? `${edits.join(', ')}, then **Update**` : null;
}

const VERB_KEY: Record<string, string> = { take: 'Play', update: 'Update', next: 'Continue', out: 'Stop' };

const notPackaged = (name: string) => `${name}: not in this package, so SPX has no item for it`;

function stepByHand(step: ProfileStep, graphics: PackagedGraphic[], show: Show): string {
  let line: string;
  if (step.kind === 'verb') {
    const cue = show.cues?.find((c) => c.id === step.cue);
    const g = cue && graphics.find((x) => x.poolId === cue.sourceId);
    // The package has ONE item per graphic, so a cue is that item with the cue's values typed in:
    // the cue's label is what tells two cues on one graphic apart.
    const asCue = cue?.label && g && cue.label !== g.template.name ? `, with the cue "${cue.label}" typed in` : '';
    line = g ? `${g.template.name}${asCue}: press **${VERB_KEY[step.verb]}**` : notPackaged(cue?.label || 'a cue');
  } else {
    const g = graphics.find((x) => x.poolName === step.graphic);
    if (!g) {
      line = notPackaged(step.graphic);
    } else if (step.kind === 'patch') {
      const edits = setWords(g.template, step.values);
      const lost = Object.keys(step.values).length - edits.length;
      const hidden = lost ? `${lost} hidden field${lost > 1 ? 's' : ''}, which SPX cannot set` : '';
      line = edits.length
        ? `${g.template.name}: ${edits.join(', ')}, then **Update**${hidden ? ` (it also writes ${hidden})` : ''}`
        : `${g.template.name}: this step writes only ${hidden}`;
    } else {
      const button = eventButtons(g.template.js).find((b) => b.event === step.control);
      const how = button && controlByHand(g.template, button);
      line = how
        ? `${g.template.name}: ${how}`
        : `${g.template.name}: ${button?.label ?? step.control} has no SPX equivalent and runs only from NoaCG`;
    }
  }
  if (step.after) line = `wait ${step.after} s, then ${line}`;
  if (step.ask) {
    line += step.ask.default
      ? ' (a tick in NoaCG, on by default: skip it when it does not apply)'
      : ' (a tick in NoaCG, off by default: do it only when it applies)';
  }
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/** The production's combined controls, bindings and data tree, each with its SPX by-hand
 *  equivalent. Empty when the production has none of them. */
export function spxLeftBehindMd(show: Show, graphics: PackagedGraphic[]): string {
  const items: string[] = [];

  // Through `readPublishedProfile`, like the overlay controller's line (§6f): a profile a newer
  // build wrote degrades to "no combined controls" rather than to steps this build cannot read.
  for (const control of readPublishedProfile(show.profile)?.combine ?? []) {
    const steps = control.steps.map((s, i) => `   ${i + 1}. ${stepByHand(s, graphics, show)}.`);
    items.push(`- **The combined control "${control.name}"** is one press in NoaCG. In SPX it is:\n${steps.join('\n')}`);
  }

  const byPath = new Map<string, string[]>();
  for (const [graphicName, fields] of Object.entries(show.bindings ?? {})) {
    const g = graphics.find((x) => x.poolName === graphicName);
    for (const [id, path] of Object.entries(fields)) {
      const where = g ? `${g.template.name} › ${fieldTitle(g.template, id) ?? id}` : `${graphicName} › ${id}`;
      byPath.set(path, [...(byPath.get(path) ?? []), where]);
    }
  }
  if (byPath.size) {
    const rows = [...byPath].map(([path, where]) => `   - \`${path}\`: ${where.join(', ')}`);
    items.push(
      `- **The bindings.** In NoaCG one value feeds every field bound to it. In SPX each is a plain\n` +
        `  field: type the same value into each one and press **Update** on every item it appears on.\n` +
        rows.join('\n'),
    );
  }

  if (show.data && Object.keys(show.data).length) {
    items.push(
      `- **The production data** NoaCG starts the show from is not in this package. Every field\n` +
        `  starts from its graphic's own default, so type the show's values in before **Play**.`,
    );
  }

  if (!items.length) return '';
  return (
    `## What SPX does not carry from this production\n\n` +
    `NoaCG runs this production with things an SPX rundown has no place for. They are not in\n` +
    `this package, and the SPX operator does them by hand:\n\n${items.join('\n')}\n`
  );
}

/** The SPX rule for every hidden field a Continue writes: SPX never learns the new value and
 *  sends its stored one with each Update. Empty when no packaged graphic has one. */
export function spxReportedFieldRulesMd(graphics: PackagedGraphic[]): string {
  const rules: string[] = [];
  for (const g of graphics) {
    const onContinue = continueEvents(g.template.js);
    for (const button of eventButtons(g.template.js)) {
      if (!onContinue.has(button.event)) continue;
      for (const [id, value] of Object.entries(button.set ?? {})) {
        const field = g.template.fields.find((f) => f.field === id && f.ftype === 'hidden');
        if (!field || field.value === value) continue;
        const name = field.title || id;
        rules.push(
          `### ${name} on ${g.template.name}\n\n` +
            `${g.template.name}'s hidden **${name}** field (\`${id}\`) tells the graphic what it is showing.\n` +
            `Continue (${button.label}) moves it to \`${value}\`, but SPX never learns that: the rundown\n` +
            `item keeps \`${field.value || '(empty)'}\` and sends it with every **Update**, and the graphic repaints\n` +
            `from it, so an Update after Continue clears what Continue showed.\n\n` +
            `- Finish every field on ${g.template.name} before **Continue**.\n` +
            `- If an Update after Continue cleared it, recover with **Stop**, **Play**, **Continue**.`,
        );
      }
    }
  }
  if (!rules.length) return '';
  return `## Update after Continue, in SPX\n\n${rules.join('\n\n')}\n`;
}
