// `noacg scaffold` - a complete, valid graphic package to start from: a type's catalog chassis, a
// type's NEUTRAL scaffold (its fields, machine, controls and runtime on a plain spine), or a
// typeless graphic with exactly the fields you declare. One option among three, never the rule -
// an agent may author from scratch against the contract instead.

import path from 'node:path';
import { BridgeClient, type NeutralFieldSpec, type ScaffoldRequest, type ScaffoldStyle } from '../bridgeClient.js';
import { EXIT_OK, flagList, flagNumber, flagString, UsageError, type Out, type ParsedArgs } from '../output.js';
import { isEmptyDir, unzipTo } from '../workspace.js';

const KINDS = new Set(['text', 'lines', 'number', 'color', 'select', 'toggle', 'image']);

/** `"Artist:text=Anna,Progress:number=42,Mood:select=calm|loud"` -> field specs. */
export function parseFieldList(spec: string): NeutralFieldSpec[] {
  return spec
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((item) => {
      const m = /^([^:=]+)(?::([a-z]+))?(?:=(.*))?$/.exec(item);
      if (!m) throw new UsageError(`--fields: cannot read "${item}" (expected Label:kind[=value]).`);
      const label = m[1].trim();
      const kind = (m[2] ?? 'text').trim();
      if (!KINDS.has(kind)) throw new UsageError(`--fields: "${label}" has kind "${kind}"; kinds are ${[...KINDS].join(', ')}.`);
      const raw = m[3];
      if (kind === 'select') {
        const options = (raw ?? '').split('|').map((o) => o.trim()).filter(Boolean);
        if (!options.length) throw new UsageError(`--fields: select "${label}" needs options, e.g. ${label}:select=a|b|c.`);
        return { label, kind, value: options[0], options: options.map((o) => ({ label: o, value: o })) };
      }
      return { label, kind, ...(raw !== undefined ? { value: raw } : {}) };
    });
}

function styleFrom(args: ParsedArgs): ScaffoldStyle | undefined {
  const style: ScaffoldStyle = {};
  const palette = flagString(args, 'palette');
  const font = flagString(args, 'font');
  const zone = flagString(args, 'zone');
  const size = flagNumber(args, 'size-scale');
  const type = flagNumber(args, 'type-scale');
  const fps = flagNumber(args, 'fps');
  const res = flagString(args, 'resolution');
  if (palette) style.palette = palette;
  if (font) style.fontId = font;
  if (zone) style.zone = zone;
  if (size) style.sizeScale = size;
  if (type) style.typeScale = type;
  if (fps) style.fps = fps;
  if (res) {
    const m = /^(\d+)x(\d+)$/i.exec(res);
    if (!m) throw new UsageError(`--resolution expects WIDTHxHEIGHT, got "${res}".`);
    style.resolution = { width: Number(m[1]), height: Number(m[2]) };
  }
  return Object.keys(style).length ? style : undefined;
}

export function scaffoldRequestFrom(args: ParsedArgs): ScaffoldRequest {
  // `scaffold` takes no argument beyond the verb itself, so a leftover word is always a mistake -
  // and in practice always the SAME mistake: an unquoted flag value. `--name Football scoreboard`
  // leaves "scoreboard" sitting here, and the graphic is quietly called "Football", in the
  // package's <title>, its SPX description and its file names. Measured on the time-to-air walk
  // (2026-09-09, docs/AGENT_CLI.md "Time to air, measured"), where it cost a re-scaffold to spot.
  // `_[0]` is the verb in both entrances (index.ts dispatches on it; mcp.ts builds the same argv).
  const stray = args._.slice(1);
  if (stray.length) {
    throw new UsageError(
      `scaffold takes no arguments outside its flags, but got ${stray.map((s) => `"${s}"`).join(', ')}. ` +
        'A value containing a space needs quotes: --name "Football scoreboard".',
    );
  }
  const name = flagString(args, 'name');
  const style = styleFrom(args);
  const fields = flagString(args, 'fields');
  const type = flagString(args, 'type');
  if (fields && type) throw new UsageError('Use either --type (a registered graphic type) or --fields (a typeless graphic), not both.');
  if (fields) return { fields: parseFieldList(fields), ...(name ? { name } : {}), ...(style ? { style } : {}) };
  if (!type) throw new UsageError('scaffold needs --type <id> (see `noacg types`) or --fields "Label:kind[=value],...".');
  const values: Record<string, string> = {};
  for (const kv of flagList(args, 'set')) {
    const eq = kv.indexOf('=');
    if (eq <= 0) throw new UsageError(`--set expects key=value, got "${kv}".`);
    values[kv.slice(0, eq).trim()] = kv.slice(eq + 1);
  }
  const design = flagString(args, 'design');
  return {
    type,
    ...(design ? { design } : {}),
    ...(name ? { name } : {}),
    ...(Object.keys(values).length ? { values } : {}),
    ...(style ? { style } : {}),
  };
}

export async function runScaffold(args: ParsedArgs, out: Out): Promise<number> {
  const outDir = flagString(args, 'out');
  if (!outDir) throw new UsageError('scaffold needs --out <dir> (an empty or new directory).');
  if (!(await isEmptyDir(outDir))) {
    throw new UsageError(`${outDir} is not empty. Scaffold into a new directory; \`noacg validate\` regenerates an existing package.`);
  }
  const req = scaffoldRequestFrom(args);
  const bridge = await BridgeClient.connect();
  try {
    const { template, notes } = await bridge.scaffold(req);
    const zip = await bridge.exportPackage(template);
    const files = await unzipTo(zip, outDir);
    out.result({ ok: true, dir: path.resolve(outDir), name: template.name, type: template.type, fields: template.fields, files, notes });
    out.say(`Scaffolded "${template.name}" (${template.type}) into ${path.resolve(outDir)}`);
    out.say('');
    for (const n of notes) out.say(`- ${n}`);
    out.say('');
    out.say('Files:');
    for (const f of files) out.say(`  ${f}`);
    out.say('');
    out.say('Next: design it (edit the sources), then `noacg validate ' + outDir + ' --screenshots ./shots`.');
    return EXIT_OK;
  } finally {
    await bridge.close();
  }
}
