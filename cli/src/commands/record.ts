// `noacg record` - hand a graphic in without saving it: write the LIBRARY RECORD the save door
// would POST (the bridge's `graphicDoc`, exactly what `noacg save` sends), the package zip beside
// it, and the digest of the sources, to files a host collects. No key, no network write, nothing
// saved. The graphic is validated first, as save validates it, and a graphic with an error is
// refused (exit 1) with nothing written, so a record on disk is always of a clean graphic.
//
// For a host that runs an agent somewhere it cannot save from (a container, a CI job): the agent
// records after every clean validate, the host takes the last record, checks its shape and saves
// it under its own identity (docs/work-specs/noacg-harness/spec.md D3).

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { BridgeClient } from '../bridgeClient.js';
import { cliVersion } from '../config.js';
import { sourceDigest } from '../digest.js';
import { EXIT_FINDINGS, EXIT_OK, flagBool, flagString, refuseBareFlags, refuseStrayArgs, UsageError, type Out, type ParsedArgs } from '../output.js';
import { readPackageInput } from '../workspace.js';
import { describeValidation } from './validate.js';

export const RECORD_FORMAT = 'noacg-record-v1';

/** The zip that goes with a record file: `record.json` -> `record.zip`. */
export function zipPathFor(recordPath: string): string {
  return recordPath.replace(/\.json$/i, '') + '.zip';
}

export async function runRecord(args: ParsedArgs, out: Out): Promise<number> {
  const input = args._[1];
  if (!input) throw new UsageError('record needs a package directory or .zip.');
  refuseStrayArgs(args, 1, '--name "Football scoreboard"');
  refuseBareFlags(args, ['out', 'name', 'folder']);
  const outFlag = flagString(args, 'out');
  if (!outFlag) throw new UsageError('record needs --out <record.json>.');
  const file = path.resolve(outFlag);
  if (!/\.json$/i.test(file)) throw new UsageError('--out names the record file, ending in .json; the package zip is written beside it.');
  const { bytes, fileName, isDirectory } = await readPackageInput(input);
  const bridge = await BridgeClient.connect();
  try {
    const pkg = await bridge.readPackage(bytes, fileName);
    if (!pkg.imported) throw new UsageError('record takes a NoaCG/SPX package: a third-party OGraf Graphic has no NoaCG sources to record.');
    const template = (await bridge.normalize(pkg.imported.template)).template;
    const digest = sourceDigest(template);
    const validation = await bridge.validate(template, { bench: flagBool(args, 'bench', true), houseContract: flagBool(args, 'house-contract', true) });
    if (!validation.ok) {
      out.result({ ok: false, reason: 'invalid', digest, validation });
      out.say(describeValidation(validation));
      out.say(`Not recorded - the graphic has ${validation.merged.errors.length} error(s). Fix them (\`noacg validate\`) and record again.`);
      return EXIT_FINDINGS;
    }
    const name = flagString(args, 'name')?.trim() || template.name || path.basename(input).replace(/\.zip$/i, '');
    const folder = flagString(args, 'folder');
    const doc = await bridge.graphicDoc(template, { name, ...(folder ? { folder } : {}), origin: { tool: 'noacg-cli', version: cliVersion() } });
    const inspection = await bridge.inspect({ template });
    const thumb = isDirectory ? await fs.readFile(path.join(path.resolve(input), 'thumbnail.png')).catch(() => null) : null;
    const zip = await bridge.exportPackage(template, thumb ? { thumbnail: { png: new Uint8Array(thumb), width: template.resolution.width, height: template.resolution.height } } : {});
    const zipFile = zipPathFor(file);
    const record = {
      format: RECORD_FORMAT,
      cli: cliVersion(),
      digest,
      recordedAt: new Date().toISOString(),
      name,
      zip: path.basename(zipFile),
      validation: {
        ok: validation.ok,
        errors: validation.merged.errors,
        warnings: validation.merged.warnings,
        readiness: validation.readiness.map((r) => ({ id: r.id, state: r.state })),
      },
      inspection,
      doc,
    };
    await fs.mkdir(path.dirname(file), { recursive: true });
    // The zip first: a record on disk names a zip that is already complete.
    await fs.writeFile(zipFile, zip);
    await fs.writeFile(file, `${JSON.stringify(record, null, 2)}\n`);
    out.result({ ok: true, file, zip: zipFile, digest, name });
    out.say(`Recorded "${name}" -> ${file} (+ ${path.basename(zipFile)}). Nothing was saved.`);
    out.say(`Digest: ${digest}`);
    return EXIT_OK;
  } finally {
    await bridge.close();
  }
}
