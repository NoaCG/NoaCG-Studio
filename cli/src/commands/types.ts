// `noacg types` - the graphic types the deployment knows, with what each brings.

import { BridgeClient, type BridgeTypeSummary } from '../bridgeClient.js';
import { EXIT_OK, table, type Out, type ParsedArgs } from '../output.js';

/** Keep whole list items: a partial field or design id cannot be used to scaffold anything. */
function elideItems(cell: string, width: number): string {
  if (cell.length <= width) return cell;
  const items = cell.split(' ');
  // Work backwards so the suffix's changing digit count is included in every fit decision.
  // In particular, retaining an item must leave room for both the space and the dropped count.
  for (let keep = items.length - 1; keep > 0; keep--) {
    const candidate = `${items.slice(0, keep).join(' ')} +${items.length - keep}`;
    if (candidate.length <= width) return candidate;
  }
  return `+${items.length}`;
}

/** Human-only rendering. The bridge result stays intact for callers that request JSON. */
export function typesTable(types: BridgeTypeSummary[], columns: number): string {
  const rows = [
    ['type', 'fields', 'events', 'designs', 'neutral'],
    ...types.map((t) => [
      t.id,
      t.fields.map((f) => `${f.key}:${f.kind}${f.role === 'line' ? '' : `(${f.role})`}`).join(' '),
      t.events.map((e) => e.event).join(' ') || '-',
      t.designs.map((d) => d.id).join(' '),
      t.neutral ? 'yes' : 'no',
    ]),
  ];
  const natural = rows[0].map((_, i) => Math.max(...rows.map((row) => row[i].length)));
  const widths = [...natural];
  const terminalWidth = Math.max(60, Math.min(200, Math.floor(Number.isFinite(columns) && columns > 0 ? columns : 100)));
  let remaining = terminalWidth - natural[0] - natural[4] - 8;
  let pending = [1, 2, 3];

  // Twelve characters keep short fields and common event names useful. At the narrow clamp,
  // a long type id can leave less room: lower the floor together, but preserve the headers.
  // Fixed ids are never cut, even if an unusually long future id makes the budget impossible.
  const floor = Math.min(12, Math.floor(remaining / pending.length));
  const minimum = natural.map((n, i) => Math.min(n, Math.max(rows[0][i].length, floor)));
  while (pending.length > 0) {
    const total = pending.reduce((sum, i) => sum + natural[i], 0);
    const shares = pending.map((i) => ({ i, share: remaining * natural[i] / total }));
    const bounded = shares.filter(({ i, share }) => share < minimum[i] || share >= natural[i]);
    if (bounded.length > 0) {
      // A small column takes only what it needs; a floor protects a disproportionately small
      // share. Recompute the other shares from the pool instead of stranding that spare width.
      for (const { i, share } of bounded) {
        widths[i] = share < minimum[i] ? minimum[i] : natural[i];
        remaining -= widths[i];
      }
      pending = pending.filter((i) => !bounded.some((column) => column.i === i));
      continue;
    }
    for (const { i, share } of shares) widths[i] = Math.floor(share);
    const spare = remaining - pending.reduce((sum, i) => sum + widths[i], 0);
    // Largest remainders spend every integer column, with source order breaking ties.
    shares.sort((a, b) => (b.share - Math.floor(b.share)) - (a.share - Math.floor(a.share)));
    for (const { i } of shares.slice(0, spare)) widths[i]++;
    break;
  }

  // table() measures its input. Pad to the allocated widths here so whole-item elision does
  // not silently shrink a column and discard space already reserved for readable alignment.
  return table(rows.map((row, r) => row.map((cell, i) => {
    const text = r > 0 && i > 0 && i < 4 ? elideItems(cell, widths[i]) : cell;
    return i < 4 ? text.padEnd(widths[i]) : text;
  })));
}

export async function runTypes(_args: ParsedArgs, out: Out): Promise<number> {
  const bridge = await BridgeClient.connect();
  try {
    const types = await bridge.types();
    out.result({ ok: true, types });
    if (out.json) return EXIT_OK;
    out.say(`${types.length} graphic types. A type brings its FIELDS, its state machine's operator EVENTS (buttons) and its runtime;`);
    out.say('scaffold one with `noacg scaffold --type <id> [--design <id>|neutral]`, or author from scratch against the contract (`noacg docs contract`).');
    out.say('');
    out.say(typesTable(types, process.stdout.columns || 100));
    out.say('--json carries every field, event and design in full.');
    return EXIT_OK;
  } finally {
    await bridge.close();
  }
}
