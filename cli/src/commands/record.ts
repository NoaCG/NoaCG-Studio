// `noacg record` - hand a graphic in without saving it: write the LIBRARY RECORD the save door
// would POST (the bridge's `graphicDoc`, exactly what `noacg save` sends), the package zip beside
// it, and the digest of the sources, to files a host collects. No key, no network write, nothing
// saved. The graphic is validated first, as save validates it, and a graphic with an error is
// refused (exit 1) with nothing written, so a record on disk is always of a clean graphic.
//
// For a host that runs an agent somewhere it cannot save from (a container, a CI job): the agent
// records after every clean validate, the host takes the last record, checks its shape and saves
// it under its own identity (docs/work-specs/noacg-harness/spec.md D3).
//
// `--review <review.json>` makes the look a gate (docs/work-specs/harness-ladder/spec.md D1): the
// record is refused (exit 1, nothing written) unless every frame of the coverage beside that
// review has a verdict, none is left open, and the review is of the graphic as it is now. The
// record then carries the verdicts.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { BridgeClient } from '../bridgeClient.js';
import { cliVersion } from '../config.js';
import { sourceDigest } from '../digest.js';
import { EXIT_FINDINGS, EXIT_OK, flagBool, flagString, refuseBareFlags, refuseStrayArgs, UsageError, type Out, type ParsedArgs } from '../output.js';
import { REVIEW_FILE, reviewProblems, reviewSummary, type CoverageManifest, type Review } from '../review.js';
import { readPackageInput } from '../workspace.js';
import { describeValidation } from './validate.js';

export const RECORD_FORMAT = 'noacg-record-v1';

/** A review file and the coverage.json it names, as JSON (null where a file is not JSON). */
async function readReview(file: string): Promise<{ review: unknown; coverage: CoverageManifest | null }> {
  const json = async (f: string) => {
    const text = await fs.readFile(f, 'utf8').catch(() => null);
    if (text === null) return undefined;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  };
  const review = await json(file);
  if (review === undefined) throw new UsageError(`--review: no file at ${file}. \`noacg coverage\` writes ${REVIEW_FILE} beside its frames.`);
  const named = review && typeof review === 'object' && typeof (review as Review).coverage === 'string' ? (review as Review).coverage : 'coverage.json';
  const coverage = await json(path.resolve(path.dirname(file), path.basename(named)));
  return { review, coverage: coverage && typeof coverage === 'object' ? (coverage as CoverageManifest) : null };
}

/** The zip that goes with a record file: `record.json` -> `record.zip`. */
export function zipPathFor(recordPath: string): string {
  return recordPath.replace(/\.json$/i, '') + '.zip';
}

export async function runRecord(args: ParsedArgs, out: Out): Promise<number> {
  const input = args._[1];
  if (!input) throw new UsageError('record needs a package directory or .zip.');
  refuseStrayArgs(args, 1, '--name "Football scoreboard"');
  refuseBareFlags(args, ['out', 'name', 'folder', 'review']);
  const outFlag = flagString(args, 'out');
  if (!outFlag) throw new UsageError('record needs --out <record.json>.');
  const file = path.resolve(outFlag);
  if (!/\.json$/i.test(file)) throw new UsageError('--out names the record file, ending in .json; the package zip is written beside it.');
  const reviewFile = flagString(args, 'review') ? path.resolve(flagString(args, 'review') as string) : null;
  const refuseReview = (problems: string[], digest?: string) => {
    out.result({ ok: false, reason: 'review', ...(digest ? { digest } : {}), problems });
    for (const p of problems) out.say(`Review: ${p}`);
    out.say('Not recorded - the review is not complete. Open each frame it lists, set its verdict, and record again.');
    return EXIT_FINDINGS;
  };
  // What the review says by itself is checked before any browser starts; its digest once the
  // bridge has read the package.
  const reviewed = reviewFile ? await readReview(reviewFile) : null;
  if (reviewed) {
    const problems = reviewProblems(reviewed);
    if (problems.length) return refuseReview(problems);
  }
  const { bytes, fileName, isDirectory } = await readPackageInput(input);
  const bridge = await BridgeClient.connect();
  try {
    const pkg = await bridge.readPackage(bytes, fileName);
    if (!pkg.imported) throw new UsageError('record takes a NoaCG/SPX package: a third-party OGraf Graphic has no NoaCG sources to record.');
    const template = (await bridge.normalize(pkg.imported.template)).template;
    const digest = sourceDigest(template);
    if (reviewed) {
      const problems = reviewProblems({ ...reviewed, digest });
      if (problems.length) return refuseReview(problems, digest);
    }
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
      ...(reviewed ? { review: reviewSummary(reviewed.review as Review) } : {}),
      doc,
    };
    await fs.mkdir(path.dirname(file), { recursive: true });
    // The zip first: a record on disk names a zip that is already complete.
    await fs.writeFile(zipFile, zip);
    await fs.writeFile(file, `${JSON.stringify(record, null, 2)}\n`);
    out.result({ ok: true, file, zip: zipFile, digest, name, ...(reviewed ? { reviewed: (reviewed.review as Review).frames.length } : {}) });
    out.say(`Recorded "${name}" -> ${file} (+ ${path.basename(zipFile)}). Nothing was saved.`);
    out.say(`Digest: ${digest}`);
    return EXIT_OK;
  } finally {
    await bridge.close();
  }
}
