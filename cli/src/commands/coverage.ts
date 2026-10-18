// `noacg coverage` - the full matrix of frames (cli/src/coverage.ts) in one browser session, for
// the look before a graphic is handed in: every value set on every ground, the Take, every event
// and step, an update and Out as timed strips, and native-pixel crops of every field. It writes
// the frames and `coverage.json` (what each frame shows, and the sources' digest) to --out, and
// `review.json`, every frame with an empty verdict, which `noacg record --review` hands in only
// once each is set (review.ts). An event that did not move the machine, one that moved it but
// draws nothing on screen, or a graphic call that threw, is a finding (exit 1).

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { BridgeClient } from '../bridgeClient.js';
import { cliVersion } from '../config.js';
import { coveragePlan, frameFile, LATER_MS, settlesOwnState, STRIP_MS, stripFile, type CoverageRender, type Ground } from '../coverage.js';
import { sourceDigest } from '../digest.js';
import { REVIEW_FILE, reviewFor } from '../review.js';
import { EXIT_FINDINGS, EXIT_OK, EXIT_USAGE, flagBool, flagString, refuseBareFlags, refuseStrayArgs, UsageError, type Out, type ParsedArgs } from '../output.js';
import { BUSY_PLATE, changedShare, composeStrip, LIGHT_PLATE, mimeTypeOf, momentLabel, safe, shoot, shootSequence, VIDEO_PLATE, type FrameOp, type SequenceShot } from '../screenshot.js';
import { markFramesDir, readPackageInput } from '../workspace.js';

const PLATES: Record<Ground, string> = { video: VIDEO_PLATE, light: LIGHT_PLATE, busy: BUSY_PLATE };
/** Renders at once: each is a page of its own, and four is what `validate --screenshots` runs. */
const PARALLEL = 4;
/** Below this share of changed pixels, a press drew nothing: about 40 pixels of a full-HD frame.
 *  The same moment rendered twice differs by none; a stopped clock's last digit by about 300. */
const NO_CHANGE_SHARE = 0.00002;

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
  // Each timeline (the Take, an event, a step, the update, Out) is ONE picture of its moments, so
  // the look costs a reader far fewer pictures. --frames writes a frame per moment instead, as a
  // judge that compares frames needs.
  const strips = !flagBool(args, 'frames', false);
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
      const asStrip = strips && shot.strip.length > 1;
      if (asStrip) {
        const moments = shot.strip.map((f) => f.atMs);
        const file = stripFile(r, 'jpg');
        await fs.writeFile(path.join(dir, file), await composeStrip(shot.strip, size));
        frames.push({ file, render: r.name, values: r.values, ground: r.ground, state: `${r.state}, as a strip: ${moments.map(momentLabel).join(', ')}, left to right and down`, atMs: moments[moments.length - 1], moments, ops: shot.ran, machine: shot.machine });
      }
      // A strip's thirds show the motion, not the small print. The state an action, a step or the
      // update settles in is shown by no other frame, so its last moment stays a frame of its own;
      // the Take settles in the sample frame and Out in nothing.
      for (const f of asStrip ? (settlesOwnState(r) ? shot.strip.slice(-1) : []) : shot.strip) {
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

    // An action that moves the machine but draws nothing: at every moment of its strip (20 ms to
    // 10 s after the press) the frame is the one with no press at all, so a flash that fades
    // still counts as drawn. It is tried from the settled Take and then after each action that
    // moved the machine (Reveal may need a Pick first); a finding only when no start shows a
    // change. The renders that decide it are compared, not kept: the frames stay the matrix's.
    const moments = [...STRIP_MS, LATER_MS];
    const settledWithout = (prefix: FrameOp[]) => renderOne({ name: 'unpressed', values: 'sample', ground: 'video', state: '', ops: [...prefix, { kind: 'wait', ms: 0 }], offsets: moments });
    const shows = async (without: SequenceShot, pressed: SequenceShot) => {
      if (without.strip.length !== pressed.strip.length) return true;
      for (let k = 0; k < pressed.strip.length; k++) if ((await changedShare(without.strip[k].image, pressed.strip[k].image)) >= NO_CHANGE_SHARE) return true;
      return false;
    };
    const unpressed = inspection.buttons.length ? await settledWithout([]).catch(() => null) : null;
    for (const button of unpressed ? inspection.buttons : []) {
      const first = eventRender(button.event);
      const shot = results.get(first?.name ?? '');
      if (!first || !shot) continue;
      let moves = !stillAfter(shot, button.event);
      if (moves && (await shows(unpressed!, shot))) continue;
      let drawn = false;
      for (const other of moved.filter((b) => b.event !== button.event).slice(0, PARALLEL)) {
        const prefix: FrameOp[] = [{ kind: 'event', event: other.event }];
        const [without, pressed] = await Promise.all([settledWithout(prefix), renderOne({ ...first, crops: undefined, ops: [...prefix, { kind: 'event', event: button.event }], offsets: moments })]).catch(() => [null, null]);
        if (!without || !pressed || stillAfter(pressed, button.event)) continue;
        moves = true;
        if (await shows(without, pressed)) {
          drawn = true;
          break;
        }
      }
      // An action that never moves the machine has its own finding above.
      if (moves && !drawn) findings.push(`${first.name}: ${button.label || button.event} shows no change on screen. It moves the machine, but from 20 ms to 10 s after the press every frame is the same as with no press, after the Take${moved.length > 1 ? ' and after each other action tried' : ''}. Draw what it does, or the operator presses it and the viewer sees nothing.`);
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
