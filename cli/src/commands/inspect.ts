// `noacg inspect` - the operator surface NoaCG derives from the graphic's OWN contract: an input
// per field, a button per action, the step semantics. For a NoaCG package from its definition +
// machine; for any OGraf manifest from `schema` + `customActions` + `stepCount`. No category.

import { BridgeClient, type BridgeInspection } from '../bridgeClient.js';
import { EXIT_OK, refuseStrayArgs, table, UsageError, type Out, type ParsedArgs } from '../output.js';
import { readPackageInput } from '../workspace.js';

export function describeInspection(i: BridgeInspection): string {
  const lines: string[] = [];
  lines.push(`Inputs (${i.descriptors.length})`);
  lines.push(
    i.descriptors.length
      ? table([['key', 'label', 'kind', 'default'], ...i.descriptors.map((d) => [d.key, d.label, d.kind + (d.options ? ` [${d.options.map((o) => o.value).join('|')}]` : ''), String(d.defaultValue)])])
      : '  (none)',
  );
  lines.push('');
  lines.push(`Buttons (${i.buttons.length})`);
  lines.push(
    i.buttons.length
      ? table([['event', 'label', 'section', 'payload'], ...i.buttons.map((b) => [b.event, b.label, b.section ?? 'Actions', [...(b.payload ?? []), ...Object.entries(b.adjust ?? {}).map(([k, d]) => `${k}${d > 0 ? '+' : ''}${d}`)].join(' ') || '-'])])
      : '  (none beyond Take / Update / Next / Out)',
  );
  lines.push('');
  lines.push(`Steps: ${i.steps.count === -1 ? 'dynamic' : i.steps.count}${i.steps.stepped ? ' (» Next advances)' : ''}`);
  if (i.stateGroups.length) lines.push(`State groups: ${i.stateGroups.map((g) => `${g.id} [${g.states.map((s) => s.name).join(', ')}]`).join('; ')}`);
  if (i.panel) lines.push('', ...describePanel(i.descriptors, i.panel));
  if (i.adjustable) lines.push(`Adjustable: ${i.adjustable}`);
  for (const n of i.notes) lines.push(`Note: ${n}`);
  return lines.join('\n');
}

/** The panel as the operator meets it: LIVE is pressed on air, PREP is typed before it. */
function describePanel(descriptors: BridgeInspection['descriptors'], panel: NonNullable<BridgeInspection['panel']>): string[] {
  const label = (key: string) => descriptors.find((d) => d.key === key)?.label || key;
  const live = [
    ...panel.controls.map((c) => (c.pick ? `${c.label}: ${c.pick.options.map((o) => o.label).join(' | ')}` : c.label)),
    ...panel.steppers.map((k) => `${label(k)} -/+`),
  ];
  return [
    'LIVE',
    ...(live.length ? live.map((l) => `  ${l}`) : ['  Take / Update / Next / Out only']),
    'PREP',
    `  ${panel.prep.map(label).join(', ') || '(none)'}`,
    ...(live.length ? [] : ['Advice: a value that changes on air needs a declared control (noacg docs contract).']),
  ];
}

export async function runInspect(args: ParsedArgs, out: Out): Promise<number> {
  const input = args._[1];
  if (!input) throw new UsageError('inspect needs a package directory or .zip.');
  refuseStrayArgs(args, 1);
  const { bytes, fileName } = await readPackageInput(input);
  const bridge = await BridgeClient.connect();
  try {
    const pkg = await bridge.readPackage(bytes, fileName);
    const inspection = pkg.imported
      ? await bridge.inspect({ template: pkg.imported.template })
      : await bridge.inspect({ manifest: pkg.ograf?.manifest });
    out.result({ ok: true, kind: pkg.kind, inspection });
    out.say(`${input}: ${pkg.kind === 'ograf' ? 'a third-party OGraf Graphic' : pkg.kind === 'noacg' ? 'a NoaCG graphic package' : 'an SPX package'}`);
    out.say('');
    out.say(describeInspection(inspection));
    return EXIT_OK;
  } finally {
    await bridge.close();
  }
}
