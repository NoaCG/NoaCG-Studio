// `noacg pack` - several graphics as ONE graphics package (`noacg-pack` v1, docs/GRAPHICS_PACKS.md):
// the graphics, their playout layers and an optional prepared cue rundown - a whole production's
// worth. Two ways out, either or both:
//
//   --save   send it to the user's NoaCG Home (docs/AGENT_SAVE.md §7). It waits on
//            Home → Productions with an Install button; Install creates the production and
//            opens its rundown. Works from any machine - a cloud agent included - because it
//            rides the same scoped agent key `noacg save` uses.
//   --out    write the `.noacgpack.json` file, for Home → Productions → Import a package.
//
// A package that is SENT is validated first, graphic by graphic, exactly as `noacg save` does
// (the static gate + the runtime bench): one graphic with an error refuses the whole package
// before a byte leaves the machine. The studio validates again when Install is pressed.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ApiError, explainFailure, resolveKey, savePackageToHome } from '../auth.js';
import { BridgeClient, type BridgeValidation } from '../bridgeClient.js';
import { noacgUrl } from '../config.js';
import { EXIT_FINDINGS, EXIT_OK, flagBool, flagList, flagString, UsageError, type Out, type ParsedArgs } from '../output.js';
import { readPackageInput } from '../workspace.js';
import { notLoggedIn } from './save.js';
import { describeValidation } from './validate.js';

/** One row of the prepared rundown: which graphic, the cue's label, its field values. */
export interface RundownCue {
  graphic: string;
  label: string;
  values?: Record<string, string>;
  note?: string;
}

export interface PackOptions {
  name: string;
  description?: string;
  /** One number = the first graphic's layer, the rest counting up; several = one per graphic. */
  layers?: number[];
  rundown?: RundownCue[];
  /** Send the package to the user's Home. */
  save?: boolean;
  /** Also (or only) write the pack file here. */
  outFile?: string;
  bench?: boolean;
  houseContract?: boolean;
}

export interface PackOutcome {
  ok: boolean;
  name: string;
  graphics: number;
  file?: string;
  id?: string;
  url?: string;
  error?: string;
  /** For an agent reading `--json`: which refusal this was. */
  reason?: 'not-logged-in' | 'invalid' | 'refused' | 'not-a-noacg-package' | 'bad-rundown';
  /** Per graphic, when a sent package was refused for validation errors. */
  failures?: Array<{ input: string; validation: BridgeValidation }>;
}

/** Check a rundown: a list of { graphic, label, values?, note? }. `source` names where it came
 *  from in the refusal (`--rundown cues.json`, or the MCP argument). */
export function rundownFrom(raw: unknown, source: string): RundownCue[] {
  if (!Array.isArray(raw)) throw new UsageError(`${source}: expected a JSON array of cues.`);
  return raw.map((c, i) => {
    const cue = (c ?? {}) as Record<string, unknown>;
    if (typeof cue.graphic !== 'string' || typeof cue.label !== 'string' || !cue.label.trim()) {
      throw new UsageError(`${source} cue ${i + 1}: needs "graphic" (a graphic's name) and "label".`);
    }
    const values = cue.values && typeof cue.values === 'object' ? (cue.values as Record<string, unknown>) : {};
    if (Object.values(values).some((v) => typeof v !== 'string')) throw new UsageError(`${source} cue ${i + 1}: "values" must all be strings.`);
    return {
      graphic: cue.graphic,
      label: cue.label.trim(),
      ...(Object.keys(values).length ? { values: values as Record<string, string> } : {}),
      ...(typeof cue.note === 'string' && cue.note ? { note: cue.note } : {}),
    };
  });
}

/** Read and check a rundown file (`--rundown <file.json>`). */
export async function readRundown(file: string): Promise<RundownCue[]> {
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(path.resolve(file), 'utf8'));
  } catch (e) {
    throw new UsageError(`--rundown ${file}: not readable JSON (${e instanceof Error ? e.message : String(e)}).`);
  }
  return rundownFrom(raw, '--rundown');
}

/** Build the package from package folders / zips, then send and/or write it. Shared by the
 *  terminal command and the MCP tool, the way `savePackage` is. */
export async function makePack(inputs: string[], opts: PackOptions, bridge: BridgeClient, log: (line: string) => void): Promise<PackOutcome> {
  const base: PackOutcome = { ok: false, name: opts.name, graphics: inputs.length };
  const origin = noacgUrl();
  const key = opts.save ? await resolveKey(origin) : null;
  if (opts.save && !key) return { ...base, reason: 'not-logged-in', error: notLoggedIn(origin) };

  const layers = opts.layers ?? [];
  const graphics: Record<string, unknown>[] = [];
  const failures: PackOutcome['failures'] = [];
  for (const [i, input] of inputs.entries()) {
    const { bytes, fileName } = await readPackageInput(input);
    const pkg = await bridge.readPackage(bytes, fileName);
    if (!pkg.imported) {
      return { ...base, reason: 'not-a-noacg-package', error: `${input}: only NoaCG/SPX packages can join a package (a third-party OGraf Graphic has no NoaCG sources).` };
    }
    let template = pkg.imported.template;
    if (opts.save) {
      // The gate `noacg save` runs, per graphic, before anything is sent.
      template = (await bridge.normalize(template)).template;
      log(`Validating "${template.name}"…`);
      const validation = await bridge.validate(template, { bench: opts.bench ?? true, houseContract: opts.houseContract ?? true });
      if (!validation.ok) failures.push({ input, validation });
    }
    const layer = layers.length === 1 ? layers[0] + i : layers[i];
    graphics.push(await bridge.packEntry(template, Number.isFinite(layer) ? { layer } : {}));
  }
  if (failures.length) {
    const named = failures.map((f) => `"${f.input}" (${f.validation.merged.errors.length} error(s))`).join(', ');
    return { ...base, reason: 'invalid', failures, error: `Not sent - ${named} failed validation. Fix them (\`noacg validate\`) and pack again.` };
  }

  // The pool keys on the graphic name, so the names must be unique, and every rundown row must
  // name one of them - the studio refuses both, and it is cheaper to say so here.
  const names = graphics.map((g) => String(g.name));
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) return { ...base, reason: 'bad-rundown', error: `Two graphics are both named "${dup}" - rename one (its definition's name) so the production can tell them apart.` };
  const stray = (opts.rundown ?? []).find((c) => !names.includes(c.graphic));
  if (stray) return { ...base, reason: 'bad-rundown', error: `The rundown cues "${stray.graphic}", which is not one of: ${names.map((n) => `"${n}"`).join(', ')}.` };

  const pack = {
    format: 'noacg-pack',
    version: 1,
    name: opts.name,
    description: opts.description ?? '',
    graphics,
    ...(opts.rundown?.length ? { cues: opts.rundown } : {}),
  };

  const outcome: PackOutcome = { ...base, ok: true };
  if (opts.outFile) {
    const file = path.resolve(opts.outFile);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(pack, null, 2)}\n`);
    outcome.file = file;
  }
  if (opts.save && key) {
    try {
      const sent = await savePackageToHome(origin, key.key, pack);
      outcome.id = sent.id;
      outcome.url = sent.url;
    } catch (e) {
      const message = e instanceof ApiError ? explainFailure(e.failure) : e instanceof Error ? e.message : String(e);
      return { ...outcome, ok: false, reason: 'refused', error: `Not sent: ${message}` };
    }
  }
  return outcome;
}

/** What a finished pack says to a person, in the terminal and in the MCP tool. */
export function describePack(outcome: PackOutcome): string {
  const lines: string[] = [];
  for (const f of outcome.failures ?? []) lines.push(`${f.input}:\n${describeValidation(f.validation)}`);
  if (!outcome.ok) {
    lines.push(outcome.error ?? 'Not packed.');
    return lines.join('\n\n');
  }
  if (outcome.file) lines.push(`Wrote ${outcome.file} with ${outcome.graphics} graphic(s) - import it on the studio's Home → Productions → Import a package.`);
  if (outcome.url) {
    lines.push(`Sent "${outcome.name}" (${outcome.graphics} graphic(s)) to your NoaCG Home -> ${outcome.url}`);
    lines.push('It is waiting on Home → Productions: press Install and the production opens with its rundown.');
  }
  return lines.join('\n');
}

export async function runPack(args: ParsedArgs, out: Out): Promise<number> {
  const inputs = args._.slice(1);
  // `--save` is a switch, but the parser gives a flag the next word when it is not a flag -
  // so `pack --save ./a ./b` hands "./a" to save. Give it back to the packages.
  const saveFlag = args.flags.save;
  if (typeof saveFlag === 'string') inputs.unshift(saveFlag);
  const save = saveFlag !== undefined && saveFlag !== false && saveFlag !== 'false';
  const outFile = flagString(args, 'out');
  if (!inputs.length) throw new UsageError('pack needs one or more package directories or .zip files.');
  if (!outFile && !save) throw new UsageError('pack needs --save (send it to your NoaCG Home) and/or --out <file.noacgpack.json>.');
  const named = flagString(args, 'name');
  const name = named ?? (outFile ? path.basename(outFile).replace(/\.noacgpack\.json$/i, '').replace(/\.json$/i, '') : undefined);
  if (!name) throw new UsageError('pack --save needs --name "<the production\'s name>".');
  const rundownFile = flagString(args, 'rundown');
  const rundown = rundownFile ? await readRundown(rundownFile) : undefined;

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
  // The cheapest refusal first: no key means nothing can be sent, and that needs no browser.
  if (save && !(await resolveKey(noacgUrl()))) {
    const error = notLoggedIn(noacgUrl());
    out.result({ ok: false, name, graphics: inputs.length, reason: 'not-logged-in', error } satisfies PackOutcome);
    out.say(error);
    return EXIT_FINDINGS;
  }

  const bridge = await BridgeClient.connect();
  try {
    const outcome = await makePack(
      inputs,
      {
        name,
        description: flagString(args, 'description'),
        layers: flagList(args, 'layer').map((n) => Number(n)),
        rundown,
        save,
        outFile,
        bench: flagBool(args, 'bench', true),
        houseContract: flagBool(args, 'house-contract', true),
      },
      bridge,
      (line) => out.log(line),
    );
    out.result(outcome);
    out.say(describePack(outcome));
    return outcome.ok ? EXIT_OK : EXIT_FINDINGS;
  } finally {
    await bridge.close();
  }
}
