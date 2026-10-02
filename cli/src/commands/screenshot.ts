// `noacg screenshot` - one frame of the graphic: off, on air, or the stress frame (every text
// doubled, every number widened), or explicit data; after a sequence of operator events
// (`--event`, repeatable), at a chosen time after the last of them (`--at`); transparent, or over
// a background (`--background`).

import path from 'node:path';
import { BridgeClient } from '../bridgeClient.js';
import { EXIT_OK, flagList, flagString, refuseStrayArgs, UsageError, type Out, type ParsedArgs } from '../output.js';
import { describeOp, parseDuration, parseOps, resolveBackground, shoot, shootSequence, STEP_MS } from '../screenshot.js';
import { promises as fs } from 'node:fs';
import { markFramesDir, readPackageInput } from '../workspace.js';

export function dataFromFlags(args: ParsedArgs): Record<string, string> | null {
  const pairs = flagList(args, 'data');
  if (!pairs.length) return null;
  const data: Record<string, string> = {};
  for (const kv of pairs) {
    const eq = kv.indexOf('=');
    if (eq <= 0) throw new UsageError(`--data expects key=value, got "${kv}".`);
    data[kv.slice(0, eq).trim()] = kv.slice(eq + 1);
  }
  return data;
}

export async function runScreenshot(args: ParsedArgs, out: Out): Promise<number> {
  const input = args._[1];
  const outPath = flagString(args, 'out');
  const state = (flagString(args, 'state') ?? 'onair') as 'off' | 'onair' | 'stress';
  const eventFlags = flagList(args, 'event');
  const atFlag = flagString(args, 'at');
  if (!input) throw new UsageError('screenshot needs a package directory or .zip.');
  refuseStrayArgs(args, 1);
  if (!outPath) throw new UsageError('screenshot needs --out <file.png>.');
  if (!['off', 'onair', 'stress'].includes(state)) throw new UsageError('--state is off, onair or stress.');
  const sequence = eventFlags.length > 0 || atFlag !== undefined;
  if (sequence && state === 'off') throw new UsageError('--event and --at start from a Take, so they go with --state onair or stress (or --data), not off.');
  const atMs = atFlag !== undefined ? parseDuration(atFlag, '--at') : undefined;
  const background = await resolveBackground(flagString(args, 'background'));
  // A frame written into a folder of its own inside the package marks that folder, exactly as
  // `validate --screenshots` does. One written straight into the package folder, or in among
  // its sources, cannot be told from an image the graphic uses, so that is said instead.
  const SOURCE_DIRS = ['css', 'js', 'images', 'fonts'];
  let insidePackage = false;
  if ((await fs.stat(path.resolve(input)).catch(() => null))?.isDirectory()) {
    const rel = path.relative(path.resolve(input), path.dirname(path.resolve(outPath)));
    const inside = !rel.startsWith('..') && !path.isAbsolute(rel);
    if (inside && rel && !SOURCE_DIRS.includes(rel.split(path.sep)[0])) await markFramesDir(path.dirname(path.resolve(outPath)), input);
    else insidePackage = inside;
  }
  const { bytes, fileName } = await readPackageInput(input);
  const bridge = await BridgeClient.connect();
  try {
    const pkg = await bridge.readPackage(bytes, fileName);
    if (!pkg.imported) throw new UsageError('screenshot takes a NoaCG/SPX package; for a third-party OGraf package use `noacg validate --screenshots`.');
    const template = pkg.imported.template;
    const data = dataFromFlags(args);
    const size = { width: template.resolution.width, height: template.resolution.height };
    const file = path.resolve(outPath);
    const ground = background ? `over ${flagString(args, 'background')}` : 'transparent';
    const label = data ? 'custom data' : state;

    if (!sequence) {
      const html = await bridge.compose(template, data ?? state);
      await shoot(bridge.bench, bridge.origin, html, file, { ...size, background });
      out.result({ ok: true, file, state: data ? 'data' : state, background: flagString(args, 'background') ?? 'transparent' });
      out.say(`Wrote ${file} (${label}, ${size.width}x${size.height}, ${ground}).`);
    } else {
      const inspection = await bridge.inspect({ template });
      const ops = parseOps(eventFlags, inspection.buttons, template.fields.map((f) => f.field));
      const base = { ...(await bridge.stateData(template, state === 'stress' ? 'stress' : 'onair')), ...(data ?? {}) };
      const html = await bridge.compose(template, 'off');
      const shot = await shootSequence(bridge.origin, html, file, { ...size, background, data: base, ops, atMs, buttons: inspection.buttons });
      const run = ops[0]?.kind === 'take' ? ops : [{ kind: 'take' as const }, ...ops];
      const steps = run.map(describeOp);
      const at = atMs ?? STEP_MS;
      out.result({
        ok: true,
        file,
        state: data ? 'data' : state,
        events: steps,
        atMs: at,
        background: flagString(args, 'background') ?? 'transparent',
        machine: shot.machine,
        notes: shot.notes,
      });
      out.say(`Wrote ${file} (${label}, ${steps.join(' > ')}, then ${at} ms; ${size.width}x${size.height}, ${ground}).`);
      if (shot.machine) out.say(`Machine at the shutter: ${Object.entries(shot.machine.groups).map(([g, s]) => `${g}=${s}`).join(', ')}`);
      for (const note of shot.notes) out.say(`Note: ${note}`);
    }
    if (insidePackage) out.say('Note: that file is inside the package, so the next validate or save packs it as one of the graphic\'s images. Write frames to a folder of their own (shots/) or outside the package.');
    return EXIT_OK;
  } finally {
    await bridge.close();
  }
}
