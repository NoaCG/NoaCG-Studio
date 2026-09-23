// `noacg pack` - several graphics as one `.noacgpack.json` production file for the studio's
// Import door (docs/GRAPHICS_PACKS.md): the same wire entry the save API takes, per graphic.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { BridgeClient } from '../bridgeClient.js';
import { EXIT_OK, flagList, flagString, UsageError, type Out, type ParsedArgs } from '../output.js';
import { readPackageInput } from '../workspace.js';

export async function runPack(args: ParsedArgs, out: Out): Promise<number> {
  const inputs = args._.slice(1);
  const outFile = flagString(args, 'out');
  if (!inputs.length) throw new UsageError('pack needs one or more package directories or .zip files.');
  if (!outFile) throw new UsageError('pack needs --out <file.noacgpack.json>.');
  const layers = flagList(args, 'layer').map((n) => Number(n));
  const named = flagString(args, 'name');
  const name = named ?? path.basename(outFile).replace(/\.noacgpack\.json$/i, '').replace(/\.json$/i, '');
  // Every input must exist BEFORE the browser starts. `pack` is the one verb that cannot refuse a
  // stray word the way the others do, because its packages ARE its words - so an unquoted
  // `--name My Pack` hands it "Pack" as a package, and the usual cause is worth naming.
  const missing: string[] = [];
  for (const input of inputs) if (!(await fs.stat(path.resolve(input)).catch(() => null))) missing.push(input);
  if (missing.length > 0) {
    const listed = missing.map((m) => `"${m}"`).join(', ');
    const hint = named
      ? ` If ${missing.length === 1 ? 'it is' : 'they are'} part of the pack's name, quote the name: --name "${[named, ...missing].join(' ')}".`
      : '';
    throw new UsageError(`pack: no package at ${listed}.${hint}`);
  }
  const bridge = await BridgeClient.connect();
  try {
    const graphics: Record<string, unknown>[] = [];
    for (const [i, input] of inputs.entries()) {
      const { bytes, fileName } = await readPackageInput(input);
      const pkg = await bridge.readPackage(bytes, fileName);
      if (!pkg.imported) throw new UsageError(`${input}: only NoaCG/SPX packages can join a pack (a third-party OGraf Graphic has no NoaCG sources).`);
      const layer = layers.length === 1 ? layers[0] + i : layers[i];
      graphics.push(await bridge.packEntry(pkg.imported.template, Number.isFinite(layer) ? { layer } : {}));
    }
    const pack = { format: 'noacg-pack', version: 1, name, description: '', graphics };
    await fs.mkdir(path.dirname(path.resolve(outFile)), { recursive: true });
    await fs.writeFile(path.resolve(outFile), `${JSON.stringify(pack, null, 2)}\n`);
    out.result({ ok: true, file: path.resolve(outFile), graphics: graphics.length });
    out.say(`Wrote ${path.resolve(outFile)} with ${graphics.length} graphic(s) - import it on the studio's Home > Productions > Import a package.`);
    return EXIT_OK;
  } finally {
    await bridge.close();
  }
}
