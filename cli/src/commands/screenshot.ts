// `noacg screenshot` - one transparent frame of the settled graphic: off, on air, or the stress
// frame (every text doubled, every number widened), or explicit data.

import path from 'node:path';
import { BridgeClient } from '../bridgeClient.js';
import { EXIT_OK, flagList, flagString, refuseStrayArgs, UsageError, type Out, type ParsedArgs } from '../output.js';
import { shoot } from '../screenshot.js';
import { readPackageInput } from '../workspace.js';

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
  if (!input) throw new UsageError('screenshot needs a package directory or .zip.');
  refuseStrayArgs(args, 1);
  if (!outPath) throw new UsageError('screenshot needs --out <file.png>.');
  if (!['off', 'onair', 'stress'].includes(state)) throw new UsageError('--state is off, onair or stress.');
  const { bytes, fileName } = await readPackageInput(input);
  const bridge = await BridgeClient.connect();
  try {
    const pkg = await bridge.readPackage(bytes, fileName);
    if (!pkg.imported) throw new UsageError('screenshot takes a NoaCG/SPX package; for a third-party OGraf package use `noacg validate --screenshots`.');
    const template = pkg.imported.template;
    const data = dataFromFlags(args);
    const html = await bridge.compose(template, data ?? state);
    await shoot(bridge.bench, bridge.origin, html, path.resolve(outPath), { width: template.resolution.width, height: template.resolution.height });
    out.result({ ok: true, file: path.resolve(outPath), state: data ? 'data' : state });
    out.say(`Wrote ${path.resolve(outPath)} (${data ? 'custom data' : state}, ${template.resolution.width}x${template.resolution.height}, transparent).`);
    return EXIT_OK;
  } finally {
    await bridge.close();
  }
}
