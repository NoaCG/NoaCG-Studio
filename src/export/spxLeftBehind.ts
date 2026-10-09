// WHAT THE SPX PACKAGE LEAVES BEHIND, said in the package (docs/CONTROL_PANEL_ANY_GRAPHIC.md §6h).
//
// The SPX starter package is the fallback a room reaches for when the network or the real-SPX
// check fails. By design (§6f) it carries each graphic's contract and nothing of the production:
// no bindings, no data tree. That boundary is right, and it was silent. This module writes the
// words, in the SPX operator's own actions (Play, Continue, Update, Stop), so whoever opens the
// package knows what to do by hand instead. (It also listed Combined controls until they were
// removed on 2026-10-02; a stored profile that still carries them adds nothing here.)
//
// Two separate findings, keyed separately on purpose:
// - LEFT BEHIND is keyed on the PRODUCTION (bindings, a data tree). A production with neither gets
//   nothing.
// - THE REPORTED-FIELD RULE is keyed on the GRAPHIC: a hidden field one of its own controls writes,
//   on a control SPX's Continue fires. SPX stores the hidden field on the rundown item and sends
//   that stored value with every Update, so an Update after Continue hands the graphic its old state
//   back. That trap is there with or without a profile, so hiding it behind one would be wrong.

import { continueEvents, eventButtons, fieldDescriptors } from '../control/controlModel';
import type { Show } from '../model/shows';
import type { SpxTemplate } from '../model/types';

/** One pool graphic as the package ships it: the POOL name (the key the bindings use) beside the
 *  export-ready template. */
export interface PackagedGraphic {
  poolName: string;
  template: SpxTemplate;
}

/** A field's name as an operator sees it, or undefined when SPX shows no box for it (a hidden
 *  field, or no field at all): the same list every control panel draws. */
function fieldTitle(template: SpxTemplate, id: string): string | undefined {
  return fieldDescriptors(template.fields).find((d) => d.key === id)?.label;
}

/** The production's bindings and data tree, each with its SPX by-hand equivalent. Empty when the
 *  production has neither. */
export function spxLeftBehindMd(show: Show, graphics: PackagedGraphic[]): string {
  const items: string[] = [];

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

/** One hidden field a Continue writes, on one graphic. */
interface ReportedField {
  graphic: string;
  id: string;
  name: string;
  /** The value the host stores and sends again: the field's default, '' when it has none. */
  stored: string;
  /** The value Continue moves it to, and the control that does. */
  value: string;
  control: string;
}

/** Every hidden field one of a graphic's own controls sets, on a control Continue fires, to a
 *  value other than its default (`continueEvents`, the same reading as `canAdvance`). */
function reportedFields(templates: SpxTemplate[]): ReportedField[] {
  const found: ReportedField[] = [];
  for (const template of templates) {
    const onContinue = continueEvents(template.js);
    for (const button of eventButtons(template.js)) {
      if (!onContinue.has(button.event)) continue;
      for (const [id, value] of Object.entries(button.set ?? {})) {
        const field = template.fields.find((f) => f.field === id && f.ftype === 'hidden');
        if (!field || field.value === value) continue;
        found.push({
          graphic: template.name,
          id,
          name: field.title || id,
          stored: field.value,
          value,
          control: button.label,
        });
      }
    }
  }
  return found;
}

/** The SPX rule for every hidden field a Continue writes: SPX's Continue fires the control without
 *  the value, SPX cannot set a hidden field, and it sends the stored one with each Update. Empty
 *  when no packaged graphic has one. */
export function spxReportedFieldRulesMd(templates: SpxTemplate[]): string {
  return rulesSection(
    'Update after Continue, in SPX',
    templates,
    (r, stored) =>
      `**Continue** (${r.control}) shows the change but leaves the field at \`${stored}\`: SPX cannot\n` +
      `set a hidden field, and the rundown item sends \`${stored}\` with every **Update**. The graphic\n` +
      `repaints from the field, so an Update after Continue clears what Continue showed.\n\n` +
      `- Finish every field on ${r.graphic} before **Continue**.\n` +
      `- If an Update after Continue cleared it, recover with **Stop**, **Play**, **Continue**.`,
  );
}

/** The same trap in a CasparCG client. A plain Next fires the control without the value its
 *  `set` carries, so the graphic still holds the field's default and every update() repaints from
 *  it, whether or not the update sends the field. Unlike SPX, a client's data grid can send any
 *  key, so the operator can set the field by hand. */
export function casparReportedFieldRulesMd(templates: SpxTemplate[]): string {
  return rulesSection(
    'Update after Next, in CasparCG',
    templates,
    (r, stored) =>
      `**Next** (${r.control}) shows the change but leaves the field at \`${stored}\`, and the graphic\n` +
      `repaints from the field on every **Update**, so an Update after Next clears what Next showed.\n\n` +
      `- To update after Next, first set \`${r.id}\` to \`${r.value}\` in the item's data, and\n` +
      `  ${r.stored ? `set it back to \`${r.stored}\`` : 'clear it'} before the next **Play**.\n` +
      `- If an Update after Next cleared it, recover with **Stop**, **Play**, **Next**.`,
  );
}

/** One host's section: a heading per reported field, the shared opening line, then the host's
 *  own words (handed the stored value as it reads, `(empty)` for none). '' when there is none. */
function rulesSection(
  title: string,
  templates: SpxTemplate[],
  hostLines: (r: ReportedField, stored: string) => string,
): string {
  const rules = reportedFields(templates).map(
    (r) =>
      `### ${r.name} on ${r.graphic}\n\n` +
      `${r.graphic}'s hidden **${r.name}** field (\`${r.id}\`) tells the graphic what it is showing.\n` +
      hostLines(r, r.stored || '(empty)'),
  );
  return rules.length ? `## ${title}\n\n${rules.join('\n\n')}\n` : '';
}
