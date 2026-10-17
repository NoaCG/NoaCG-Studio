// `noacg coverage` - the full matrix of frames (cli/src/coverage.ts) in one browser session, for
// the look before a graphic is handed in: every value set on every ground, the Take, every event
// and step, an update and Out as timed strips, and native-pixel crops of every field. It writes
// the frames and `coverage.json` (what each frame shows, and the sources' digest) to --out, and
// `review.json`, every frame with an empty verdict, which `noacg record --review` hands in only
// once each is set (review.ts). An event that did not move the machine, or a graphic call that
// threw, is a finding (exit 1).

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { BridgeClient } from '../bridgeClient.js';
import { cliVersion } from '../config.js';
import { coveragePlan, frameFile, stripFile, type CoverageRender, type Ground } from '../coverage.js';
import { sourceDigest } from '../digest.js';
import { REVIEW_FILE, reviewFor } from '../review.js';
import { EXIT_FINDINGS, EXIT_OK, EXIT_USAGE, flagBool, flagString, refuseBareFlags, refuseStrayArgs, UsageError, type Out, type ParsedArgs } from '../output.js';
import { BUSY_PLATE, composeStrip, LIGHT_PLATE, mimeTypeOf, momentLabel, safe, shoot, shootSequence, VIDEO_PLATE, type SequenceShot } from '../screenshot.js';
import { markFramesDir, readPackageInput } from '../workspace.js';

const PLATES: Record<Ground, string> = { video: VIDEO_PLATE, light: LIGHT_PLATE, busy: BUSY_PLATE };
/** Renders at once: each is a page of its own, and four is what `validate --screenshots` runs. */
const PARALLEL = 4;

const extOf = (bytes: Uint8Array) => (mimeTypeOf(bytes) === 'image/jpeg' ? 'jpg' : 'png');

async function readStress(file: string | undefined): Promise<Record<string, string> | undefined> {
  if (!file) return undefined;
  const text = await fs.readFile(path.resolve(file), 'utf8').catch(() => null);
  if (text === null) throw new UsageError(`--stress: no file at ${path.resolve(file)}.`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new UsageError(`--stress: ${file} is not JSON.`);
  }
  // A whole brief is accepted as well as its `stress` object, so a bench can pass the brief file.
  const stress = parsed && typeof parsed === 'object' && 'stress' in parsed ? (parsed as { stress: unknown }).stress : parsed;
  if (!stress || typeof stress !== 'object' || Array.isArray(stress)) throw new UsageError('--stress: expected an object of field = value (a brief\'s "stress").');
  return Object.fromEntries(Object.entries(stress as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
}

export async function runCoverage(args: ParsedArgs, out: Out): Promise<number> {
  const input = args._[1];
  if (!input) throw new UsageError('coverage needs a package directory or .zip.');
  refuseStrayArgs(args, 1);
  refuseBareFlags(args, ['out', 'stress']);
  const outDir = flagString(args, 'out');
  if (!outDir) throw new UsageError('coverage needs --out <dir> for its frames.');
  const stress = await readStress(flagString(args, 'stress'));
  // --strips: each timeline (the Take, an event, a step, the update, Out) as ONE picture of its
  // moments instead of a frame per moment, so the look costs a reader a third as much.
  const strips = flagBool(args, 'strips', false);
  const dir = path.resolve(outDir);
  if ((await fs.stat(path.resolve(input)).catch(() => null))?.isDirectory()) await markFramesDir(dir, input);
  await fs.mkdir(dir, { recursive: true });

  const { bytes, fileName } = await readPackageInput(input);
  const bridge = await BridgeClient.connect();
  try {
    const pkg = await bridge.readPackage(bytes, fileName);
    if (!pkg.imported) throw new UsageError('coverage takes a NoaCG/SPX package; a third-party OGraf package is covered by `noacg validate --screenshots`.');
    const template = (await bridge.normalize(pkg.imported.template)).template;
    const digest = sourceDigest(template);
    const inspection = await bridge.inspect({ template });
    const plan = coveragePlan({
      fields: template.fields,
      defaults: await bridge.stateData(template, 'onair'),
      buttons: inspection.buttons,
      stepCount: inspection.steps.count,
      stress,
    });
    const size = { width: template.resolution.width, height: template.resolution.height };
    const offHtml = await bridge.compose(template, 'off');

    const frames: Array<{ file: string; render: string; values: string; ground: Ground; state: string; atMs: number; moments?: number[]; ops: string[]; machine: SequenceShot['machine'] }> = [];
    const crops: Array<{ file: string; key: string; values: string; ground: Ground }> = [];
    const findings: string[] = [];
    const failures: string[] = [];
    const results = new Map<string, SequenceShot>();

    const offImage = await shoot(bridge.bench, bridge.origin, offHtml, undefined, { ...size, background: VIDEO_PLATE, compact: true });
    const offFile = `off.${extOf(offImage)}`;
    await fs.writeFile(path.join(dir, offFile), offImage);
    frames.push({ file: offFile, render: 'off', values: 'none', ground: 'video', state: 'off, before the Take', atMs: 0, ops: [], machine: null });

    const keep = async (r: CoverageRender, shot: SequenceShot) => {
      if (strips && shot.strip.length > 1) {
        const moments = shot.strip.map((f) => f.atMs);
        const file = stripFile(r, 'jpg');
        await fs.writeFile(path.join(dir, file), await composeStrip(shot.strip, size));
        frames.push({ file, render: r.name, values: r.values, ground: r.ground, state: `${r.state}, as a strip: ${moments.map(momentLabel).join(', ')}, left to right and down`, atMs: moments[moments.length - 1], moments, ops: shot.ran, machine: shot.machine });
      }
      for (const f of strips && shot.strip.length > 1 ? [] : shot.strip) {
        const file = frameFile(r, f.atMs, extOf(f.image));
        await fs.writeFile(path.join(dir, file), f.image);
        frames.push({ file, render: r.name, values: r.values, ground: r.ground, state: r.state, atMs: f.atMs, ops: shot.ran, machine: shot.machine });
      }
      for (const c of shot.crops) {
        const file = `crop-${r.name}-${c.key}.png`;
        await fs.writeFile(path.join(dir, file), c.image);
        crops.push({ file, key: c.key, values: r.values, ground: r.ground });
      }
    };
    const stillAfter = (shot: SequenceShot, event: string) => shot.unmoved.some((u) => u.event === event);
    const renderOne = (r: CoverageRender) =>
      shootSequence(bridge.origin, offHtml, undefined, {
        ...size,
        background: PLATES[r.ground],
        compact: true,
        data: plan.valueSets[r.values],
        ops: r.ops,
        offsets: r.offsets,
        crops: r.crops,
        buttons: inspection.buttons,
      });
    for (let i = 0; i < plan.renders.length; i += PARALLEL) {
      const batch = plan.renders.slice(i, i + PARALLEL);
      const shots = await Promise.allSettled(batch.map(renderOne));
      for (let j = 0; j < batch.length; j++) {
        const r = batch[j];
        const shot = shots[j];
        if (shot.status === 'rejected') {
          failures.push(`${r.name}: ${shot.reason instanceof Error ? shot.reason.message.split('\n')[0] : String(shot.reason)}`);
          continue;
        }
        await keep(r, shot.value);
        results.set(r.name, shot.value);
      }
    }

    // An event that does not move the machine from the settled Take may undo another (Clear flag
    // after Flag). It is pressed once more after each event that did move it, and it is a finding
    // only when it moves the machine from none of those states; the strip that shows it working
    // is kept as `event-<it>-after-<other>`.
    const eventRender = (event: string) => plan.renders.find((r) => r.ops.length === 1 && r.ops[0].kind === 'event' && r.ops[0].event === event);
    const moved = inspection.buttons.filter((b) => {
      const shot = results.get(eventRender(b.event)?.name ?? '');
      return shot && !stillAfter(shot, b.event);
    });
    for (const button of inspection.buttons) {
      const first = eventRender(button.event);
      const shot = results.get(first?.name ?? '');
      if (!first || !shot || !stillAfter(shot, button.event)) continue;
      let answered = false;
      for (const other of moved.filter((b) => b.event !== button.event).slice(0, PARALLEL)) {
        const retry: CoverageRender = { ...first, name: `${first.name}-after-${safe(other.event, 'x')}`, state: `${first.state}, after ${other.label || other.event}`, ops: [{ kind: 'event', event: other.event }, { kind: 'event', event: button.event }] };
        const again = await renderOne(retry).catch(() => null);
        if (again && !stillAfter(again, button.event)) {
          await keep(retry, again);
          answered = true;
          break;
        }
      }
      if (!answered) findings.push(`${first.name}: ${shot.unmoved.find((u) => u.event === button.event)?.note}${moved.length ? ' It did not move it after any other event either.' : ''}`);
    }
    for (const [name, shot] of results) {
      for (const note of shot.notes) if (!shot.unmoved.some((u) => u.note === note)) findings.push(`${name}: ${note}`);
    }

    const manifest = {
      format: 'noacg-coverage-v1',
      cli: cliVersion(),
      digest,
      template: { name: template.name, type: template.type, resolution: template.resolution },
      grounds: plan.grounds,
      valueSets: plan.valueSets,
      frames,
      crops,
      findings,
      failures,
      notes: plan.notes,
    };
    await fs.writeFile(path.join(dir, 'coverage.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    // A fresh review every time: verdicts belong to the frames of this digest, never an earlier one.
    await fs.writeFile(path.join(dir, REVIEW_FILE), `${JSON.stringify(reviewFor(digest, frames), null, 2)}\n`);
    out.result({ ok: findings.length === 0 && failures.length === 0, dir, digest, frames: frames.length, crops: crops.length, findings, failures, notes: plan.notes });
    out.say(`Coverage of "${template.name}": ${frames.length} frame(s) and ${crops.length} crop(s) in ${dir} (${plan.renders.length + 1} renders, grounds ${plan.grounds.join(', ')}).`);
    out.say(`Digest: ${digest}`);
    out.say(`What each frame shows: ${path.join(dir, 'coverage.json')}`);
    out.say(`Verdicts, one per frame: ${path.join(dir, REVIEW_FILE)}`);
    for (const n of plan.notes) out.say(`Note: ${n}`);
    for (const f of findings) out.say(`Finding: ${f}`);
    for (const f of failures) out.say(`Not shot: ${f}`);
    if (findings.length) return EXIT_FINDINGS;
    // Frames that could not be shot are an IO failure, as in validate --screenshots.
    return failures.length ? EXIT_USAGE : EXIT_OK;
  } finally {
    await bridge.close();
  }
}
