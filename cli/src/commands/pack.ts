// `noacg pack` - several graphics as ONE graphics package (`noacg-pack` v1, docs/GRAPHICS_PACKS.md):
// the graphics, their playout layers and an optional prepared cue rundown - a whole production's
// worth. Two ways out, either or both:
//
//   --save   send it to the user's NoaCG Home (docs/AGENT_SAVE.md §7). It waits on
//            Home → Productions with an Install button; Install creates the production and
//            opens its rundown. Works from any machine - a cloud agent included - because it
//            rides the same scoped agent key `noacg save` uses.
//   --out    write the `.noacgpack.json` file, for Home → Productions → Import a package.
//   --share  ALSO send it for review to Community packs (docs/AGENT_SAVE.md §8), only when the
//            user asked to share it. It needs --save, the licence written out (--license
//            cc-by-4.0), the name it is shown under (--shown-as) and --description. The shared
//            copy carries no cues. The studio's community checks and the share go before the
//            Home copy, so a refused share sends nothing and a retry adds no second Home copy.
//
// A package that is SENT is validated first, graphic by graphic, exactly as `noacg save` does
// (the static gate + the runtime bench): one graphic with an error refuses the whole package
// before a byte leaves the machine. The studio validates again when Install is pressed.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ApiError, explainFailure, resolveKey, savePackageToHome, shareCommunityPack } from '../auth.js';
import { BridgeClient, type BridgeValidation, type SpxTemplate } from '../bridgeClient.js';
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
  /** Also send it for review to Community packs. Needs `save`; set only on the user's request. */
  share?: ShareOptions;
}

/** The one licence a community pack is shared under, as the command line writes it. */
export const SHARE_LICENSE = 'cc-by-4.0';

/** What the user gave for a share: the licence they accepted, the name the pack is shown under
 *  and its one-line description. The CLI never fills them from the account (spec D15). */
export interface ShareOptions {
  license: string;
  shownAs: string;
  description: string;
}

/** What a share asked for and what became of it. */
export type ShareOutcome =
  | { id: string; state: 'in_review'; shownAs: string; withoutCues: boolean }
  | { reason: 'checks' | 'refused' | 'bridge'; error: string; findings?: Array<{ graphic?: string; message: string }> };

/** Why a share cannot even start, or null. `names` are the arguments as the caller spells them.
 *  The lengths are the submit gate's (migration 0087), checked here so nothing is sent first. */
export function shareProblem(
  share: ShareOptions,
  save: boolean,
  packName: string,
  names = { save: '--save', name: '--name', license: `--license ${SHARE_LICENSE}`, shownAs: '--shown-as', description: '--description' },
): string | null {
  if (!save) return `Sharing needs ${names.save}: the shared pack is the one put on your Home.`;
  if (packName.trim().length > 80) return `A shared pack's ${names.name} is at most 80 characters.`;
  if (share.license.trim().toLowerCase() !== SHARE_LICENSE) {
    return `Sharing needs ${names.license}: everything on Community packs is CC BY 4.0, so anyone may use it in any show with the name it is shown under.`;
  }
  if (!share.shownAs.trim() || share.shownAs.trim().length > 60) return `Sharing needs ${names.shownAs} "<the name the pack is shown under>", at most 60 characters.`;
  if (!share.description.trim() || share.description.trim().length > 200) return `Sharing needs ${names.description} "<one line: what it is for>", at most 200 characters.`;
  return null;
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
  /** The Community packs share, when the user asked for one. */
  share?: ShareOutcome;
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
  const templates: SpxTemplate[] = [];
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
    templates.push(template);
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

  // The local file first: it sends nothing, and a write that fails then stops the run before
  // anything leaves the machine.
  const outcome: PackOutcome = { ...base, ok: true };
  if (opts.outFile) {
    const file = path.resolve(opts.outFile);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(pack, null, 2)}\n`);
    outcome.file = file;
  }
  // A share goes before the Home copy (#876). A refused share then sends nothing at all, so the
  // user fixes the graphic and runs the same command again without a second copy piling up on
  // Home. The other order would leave a duplicate share in an admin's review queue instead,
  // whenever the Home door refused after a share went through; that case is said below with how
  // to send the Home copy alone.
  const share = opts.save && key && opts.share
    ? await shareToCommunity(opts, opts.share, graphics, templates, bridge, origin, key.key, log)
    : undefined;
  if (share) outcome.share = share;
  if (share && !('id' in share)) return { ...outcome, ok: false, reason: 'refused', error: share.error };
  if (opts.save && key) {
    try {
      const sent = await savePackageToHome(origin, key.key, pack);
      outcome.id = sent.id;
      outcome.url = sent.url;
    } catch (e) {
      const message = e instanceof ApiError ? explainFailure(e.failure) : e instanceof Error ? e.message : String(e);
      const error = share
        ? `Not sent to your Home: ${message.replace(/[.\s]*$/, '.')} It is shared, so pack it again without sharing to put it on your Home.`
        : `Not sent: ${message}`;
      return { ...outcome, ok: false, reason: 'refused', error };
    }
  }
  return outcome;
}

/** A share, before the Home copy: the studio's own community checks over the templates the save's
 *  gate already validated, then the share door. Never throws; what went wrong is the outcome. */
async function shareToCommunity(
  opts: PackOptions,
  share: ShareOptions,
  graphics: Record<string, unknown>[],
  templates: SpxTemplate[],
  bridge: BridgeClient,
  origin: string,
  key: string,
  log: (line: string) => void,
): Promise<ShareOutcome> {
  const description = share.description.trim();
  const author = share.shownAs.trim();
  log('Checking the pack for Community packs…');
  let findings: Array<{ graphic?: string; message: string }>;
  try {
    findings = await bridge.communityCheck({
      name: opts.name,
      description,
      author,
      graphics: templates.map((template, i) => ({ name: String(graphics[i].name), template })),
    });
  } catch (e) {
    return { reason: 'bridge', error: `Not sent: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (findings.length) {
    return { reason: 'checks', findings, error: 'Not sent: Community packs refuses what is listed above. Fix it and try again.' };
  }
  // A community pack is graphics only (spec D2): the server refuses cues, so none are sent.
  const pack = { format: 'noacg-pack', version: 1, name: opts.name, description, graphics };
  try {
    const sent = await shareCommunityPack(origin, key, { name: opts.name, description, author, license: SHARE_LICENSE, pack });
    return { id: sent.id, state: sent.state, shownAs: author, withoutCues: Boolean(opts.rundown?.length) };
  } catch (e) {
    let message = e instanceof Error ? e.message : String(e);
    if (e instanceof ApiError) {
      // The share door's own sentences say what to do (the submit gate's 409, the size and shape
      // refusals, a deployment with no accounts); the package door's hints would not fit them.
      // A 404 is a deployment that predates the door.
      const { status } = e.failure;
      message = status === 404
        ? `the NoaCG at ${origin} does not take shared packs yet`
        : [400, 409, 413, 503].includes(status)
          ? e.failure.message
          : explainFailure(e.failure);
    }
    return { reason: 'refused', error: `Not sent: ${message}` };
  }
}

/** What a finished pack says to a person, in the terminal and in the MCP tool. */
export function describePack(outcome: PackOutcome): string {
  const lines: string[] = [];
  for (const f of outcome.failures ?? []) lines.push(`${f.input}:\n${describeValidation(f.validation)}`);
  if (!outcome.ok && !outcome.share) {
    lines.push(outcome.error ?? 'Not packed.');
    return lines.join('\n\n');
  }
  if (outcome.file) lines.push(`Wrote ${outcome.file} with ${outcome.graphics} graphic(s) - import it on the studio's Home → Productions → Import a package.`);
  if (outcome.url) {
    lines.push(`Sent "${outcome.name}" (${outcome.graphics} graphic(s)) to your NoaCG Home -> ${outcome.url}`);
    lines.push('It is waiting on Home → Productions: press Install and the production opens with its rundown.');
  }
  const share = outcome.share;
  if (share && 'id' in share) {
    lines.push(
      `Sent "${outcome.name}" for review under CC BY 4.0, shown as "${share.shownAs}". It is In review under Your packs on the Community packs shelf; you can withdraw it there.`,
    );
    if (share.withoutCues && outcome.url) lines.push('The shared copy carries no cues; the rundown stays on your Home copy.');
  } else if (share) {
    for (const f of share.findings ?? []) lines.push(f.graphic ? `- ${f.graphic}: ${f.message}` : `- ${f.message}`);
    lines.push(share.error);
  }
  if (!outcome.ok && share && 'id' in share && outcome.error) lines.push(outcome.error);
  return lines.join('\n');
}

export async function runPack(args: ParsedArgs, out: Out): Promise<number> {
  const inputs = args._.slice(1);
  // `--save` is a switch, but the parser gives a flag the next word when it is not a flag -
  // so `pack --save ./a ./b` hands "./a" to save. Give it back to the packages.
  const saveFlag = args.flags.save;
  if (typeof saveFlag === 'string') inputs.unshift(saveFlag);
  const save = saveFlag !== undefined && saveFlag !== false && saveFlag !== 'false';
  // `--share` is the same kind of switch, with the same give-back.
  const shareFlag = args.flags.share;
  if (typeof shareFlag === 'string') inputs.unshift(shareFlag);
  const sharing = shareFlag !== undefined && shareFlag !== false && shareFlag !== 'false';
  const share: ShareOptions | undefined = sharing
    ? { license: flagString(args, 'license') ?? '', shownAs: flagString(args, 'shown-as') ?? '', description: flagString(args, 'description') ?? '' }
    : undefined;
  const outFile = flagString(args, 'out');
  if (!inputs.length) throw new UsageError('pack needs one or more package directories or .zip files.');
  if (!outFile && !save) throw new UsageError('pack needs --save (send it to your NoaCG Home) and/or --out <file.noacgpack.json>.');
  const named = flagString(args, 'name');
  const name = named ?? (outFile ? path.basename(outFile).replace(/\.noacgpack\.json$/i, '').replace(/\.json$/i, '') : undefined);
  if (!name) throw new UsageError('pack --save needs --name "<the production\'s name>".');
  const rundownFile = flagString(args, 'rundown');
  const rundown = rundownFile ? await readRundown(rundownFile) : undefined;
  // Everything a share needs is the user's own words, so it is refused before any browser starts.
  const problem = share ? shareProblem(share, save, name) : null;
  if (problem) throw new UsageError(problem);

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
        share,
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
