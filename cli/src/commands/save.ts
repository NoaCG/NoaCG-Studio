// `noacg save` - put graphics in the user's NoaCG LIBRARY (docs/AGENT_SAVE.md).
//
// Validate first, then save: each package is read by the bridge, normalized, and run through the
// static gate + the runtime bench exactly as `noacg validate` does; a graphic with an ERROR is
// refused here (exit 1) before a byte reaches the server - the server never executes the code,
// so the CLI is where it is judged. Then the bridge builds each LIBRARY RECORD (the same shape
// the studio saves - fields parsed in the bridge's own browser, never on the server).
//
// ONE DELIVERY, HOWEVER MANY GRAPHICS (docs/AGENT_SAVE.md §10). `noacg save a b c` sends every
// record in one request to /api/me/graphic-sets under an operation id named BEFORE the write and
// kept in the operation journal (operations.ts). The deployment saves all of them or none, and the
// same set sent again - a lost answer, a timeout, the same command after a restart - answers the
// first delivery's links and never saves a second copy. One graphic takes the same path; a
// deployment too old for the set door gets it through the single save door it always had.
//
// Vocabulary: SAVE = the library. It does not publish, add to a production, or air anything.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { BridgeClient, type BridgeValidation } from '../bridgeClient.js';
import { cliVersion, noacgUrl } from '../config.js';
import { EXIT_FINDINGS, EXIT_OK, flagBool, flagString, UsageError, type Out, type ParsedArgs } from '../output.js';
import { readDelivery, resolveKey, saveGraphic, saveGraphicSet } from '../auth.js';
import { forgetOperation, operationFor, setFingerprint } from '../operations.js';
import { deliverAndConfirm, deliverSetAndConfirm, describeReceipt, destinationOf, type DeliveryReceipt } from '../receipt.js';
import { readPackageInput } from '../workspace.js';
import { describeValidation } from './validate.js';

/** At most this many graphics in one delivery - the set door's cap, a pack's own. */
export const MAX_SET_GRAPHICS = 40;
/** The set door reads at most this much (api/_lib/me/graphics.ts MAX_SAVE_BODY_BYTES). */
export const MAX_SET_BYTES = 4_000_000;

export interface SavedGraphic {
  input: string;
  id: string;
  name: string;
  url: string;
}

export interface SaveOutcome {
  ok: boolean;
  /** One graphic: its id, link and name, as `save` always answered. */
  id?: string;
  url?: string;
  name?: string;
  /** Every graphic saved, in the order given. */
  graphics?: SavedGraphic[];
  /** The operation the delivery went under; the same command again resumes it. */
  operationId?: string;
  /** The deployment answered this operation's earlier delivery: nothing new was saved. */
  replayed?: boolean;
  /** One graphic's validation report, warnings included. */
  validation?: BridgeValidation;
  /** Several graphics: each one's report, warnings included - in the order given. */
  validations?: Array<{ input: string; validation: BridgeValidation }>;
  /** Several graphics: the ones that failed, when that refused the set. */
  failures?: Array<{ input: string; validation: BridgeValidation }>;
  error?: string;
  /** For an agent reading `--json`: which of the documented refusals this was. `unverified`: no
   *  answer came and a readback did not find it - run the same command again, it resumes. */
  reason?: 'not-logged-in' | 'invalid' | 'refused' | 'not-a-noacg-package' | 'unverified' | 'too-large' | 'conflict' | 'deleted';
  /** The delivery receipt (docs/AGENT_SAVE.md §9): account, deployment, state, and whether a
   *  readback confirmed it. */
  receipt?: DeliveryReceipt;
}

export interface SaveOptions {
  /** One graphic's library name; a set keeps each graphic's own. */
  name?: string;
  folder?: string;
  bench?: boolean;
  houseContract?: boolean;
}

/** The refusal every entrance gives before it starts a browser. */
export function notLoggedIn(origin: string): string {
  return `Not logged in to ${origin} - run \`noacg login\` first (or set NOACG_AGENT_KEY). No account? Zip the package and use the studio's Import door.`;
}

/** The usage problem with these arguments, or null - checked before any browser starts. */
export function saveArgsProblem(inputs: string[], opts: Pick<SaveOptions, 'name'>, names = { name: '--name' }): string | null {
  if (!inputs.length) return 'save needs a package directory or .zip.';
  if (inputs.length > MAX_SET_GRAPHICS) return `save takes at most ${MAX_SET_GRAPHICS} graphics in one delivery; save the rest in another.`;
  if (opts.name && inputs.length > 1) return `${names.name} names one graphic; with several, each keeps the name its definition gives it.`;
  return null;
}

/** The save as one call, shared by the CLI command and the MCP tool. */
export async function savePackages(inputs: string[], opts: SaveOptions, bridge: BridgeClient, log: (line: string) => void): Promise<SaveOutcome> {
  const origin = noacgUrl();
  const found = await resolveKey(origin);
  if (!found) return { ok: false, reason: 'not-logged-in', error: notLoggedIn(origin) };

  const prepared: Array<{ input: string; name: string; doc: Record<string, unknown>; validation: BridgeValidation }> = [];
  const failures: NonNullable<SaveOutcome['failures']> = [];
  for (const input of inputs) {
    const { bytes, fileName } = await readPackageInput(input);
    const pkg = await bridge.readPackage(bytes, fileName);
    if (!pkg.imported) {
      return { ok: false, reason: 'not-a-noacg-package', error: `${input}: only a NoaCG/SPX package can be saved to the library (a third-party OGraf Graphic has no NoaCG sources yet - docs/AGENT_CLI.md "Future").` };
    }
    const template = (await bridge.normalize(pkg.imported.template)).template;
    log(`Validating "${template.name}"…`);
    const validation = await bridge.validate(template, { bench: opts.bench ?? true, houseContract: opts.houseContract ?? true });
    if (!validation.ok) {
      failures.push({ input, validation });
      continue;
    }
    const name = (inputs.length === 1 && opts.name?.trim()) || template.name || path.basename(input).replace(/\.zip$/i, '');
    const doc = await bridge.graphicDoc(template, { name, ...(opts.folder ? { folder: opts.folder } : {}), origin: { tool: 'noacg-cli', version: cliVersion() } });
    prepared.push({ input, name, doc, validation });
  }
  const single = inputs.length === 1 ? failures[0]?.validation : undefined;
  if (failures.length) {
    const error = inputs.length === 1
      ? `Not saved - the graphic has ${failures[0].validation.merged.errors.length} error(s). Fix them (\`noacg validate\`) and save again.`
      : `Nothing saved - ${failures.map((f) => `"${f.input}" (${f.validation.merged.errors.length} error(s))`).join(', ')} failed validation. Fix them (\`noacg validate\`) and save again.`;
    return { ok: false, reason: 'invalid', ...(single ? { validation: single } : { failures }), error };
  }
  // Warnings travel with the outcome, apart from whether it was delivered.
  const reports = inputs.length === 1 ? { validation: prepared[0].validation } : { validations: prepared.map(({ input, validation }) => ({ input, validation })) };
  const docs = prepared.map((p) => p.doc);
  const bytes = Buffer.byteLength(JSON.stringify({ graphics: docs }));
  if (bytes > MAX_SET_BYTES) {
    return {
      ok: false,
      reason: 'too-large',
      error: `Not saved - these graphics come to ${(bytes / 1e6).toFixed(1)} MB and one delivery holds ${MAX_SET_BYTES / 1e6} MB. Save them in smaller groups, and keep inline assets small (a logo, not a video).`,
    };
  }

  const fingerprint = setFingerprint(origin, found.key, docs);
  const { operationId, resumed } = await operationFor(fingerprint);
  log(`${resumed ? 'Resuming' : 'Saving'} ${docs.length === 1 ? `"${prepared[0].name}"` : `${docs.length} graphics`} under operation ${operationId}…`);
  const names = prepared.map((p) => p.name);
  const sent = await deliverSetAndConfirm(origin, found.key, operationId, names, () => saveGraphicSet(origin, found.key, docs, operationId));
  if (!sent.ok && sent.reason === 'unsupported' && docs.length === 1) {
    const old = await saveOneTheOldWay(origin, found.key, operationId, inputs[0], names[0], docs[0], reports);
    if (old.reason === 'deleted') await forgetOperation(fingerprint, operationId);
    return old;
  }
  if (!sent.ok) {
    // A conflict ties this content to an operation that is not its own; let the next run start afresh.
    if (sent.reason === 'conflict') await forgetOperation(fingerprint, operationId);
    const error = sent.reason === 'unverified' || sent.reason === 'conflict' ? sent.error : `Not saved: ${sent.error}`;
    return { ok: false, reason: sent.reason === 'unsupported' ? 'refused' : sent.reason, operationId, receipt: sent.receipt, error, ...reports };
  }
  const graphics = (sent.graphics ?? []).map((g, i) => ({ input: inputs[i], id: g.id, name: g.name || names[i], url: g.url }));
  const outcome: SaveOutcome = {
    ok: true,
    ...(graphics.length === 1 ? { id: graphics[0].id, url: graphics[0].url, name: graphics[0].name } : {}),
    graphics,
    operationId,
    replayed: Boolean(sent.replayed),
    receipt: sent.receipt,
    ...reports,
  };
  // An earlier delivery of this set, answered again, whose graphics were deleted since: they are
  // NOT in the library, and saying "saved" would be the false claim this receipt exists to prevent.
  const deleted = sent.receipt.resources.filter((r) => r.state === 'missing').length;
  if (deleted) {
    // Forgotten, so the same save run again is a new delivery that puts the set back.
    await forgetOperation(fingerprint, operationId);
    const error = `This set was saved earlier under operation ${operationId}, and ${deleted} of its graphics ${deleted === 1 ? 'was' : 'were'} deleted since, so ${deleted === 1 ? 'it is' : 'they are'} not in the library. Run the same save again to put the whole set back as a new delivery.`;
    return { ...outcome, ok: false, reason: 'deleted', error };
  }
  return outcome;
}

/** One graphic to a deployment from before the set door: the single save door it always had, under
 *  the same operation - asked about first, so a rerun after a lost answer never saves it twice. */
export async function saveOneTheOldWay(
  origin: string,
  key: string,
  operationId: string,
  input: string,
  name: string,
  doc: Record<string, unknown>,
  reports: Pick<SaveOutcome, 'validation' | 'validations'>,
): Promise<SaveOutcome> {
  const earlier = await readDelivery(origin, key, operationId).catch(() => null);
  const graphicOf = (receipt: DeliveryReceipt) => receipt.resources.find((r) => r.kind === 'graphic');
  const g = earlier ? graphicOf(earlier) : undefined;
  if (earlier && g) {
    const outcome: SaveOutcome = { ok: true, id: g.id, url: g.link, name, graphics: [{ input, id: g.id, name, url: g.link }], operationId, replayed: true, receipt: earlier, ...reports };
    if (g.state === 'saved') return outcome;
    // Saved earlier and deleted since: not in the library. The caller forgets the operation.
    return { ...outcome, ok: false, reason: 'deleted', error: `"${name}" was saved earlier under operation ${operationId} and deleted since, so it is not in the library. Run the same save again to put it back.` };
  }
  const one = await deliverAndConfirm(origin, key, 'graphic', (op) => saveGraphic(origin, key, doc, op), operationId);
  if (!one.ok) return { ok: false, reason: one.reason, operationId, receipt: one.receipt, error: one.reason === 'unverified' ? one.error : `Not saved: ${one.error}`, ...reports };
  const graphic = { input, id: one.id ?? '', name, url: one.url ?? '' };
  return { ok: true, id: graphic.id, url: graphic.url, name, graphics: [graphic], operationId, receipt: one.receipt, ...reports };
}

/** The validation reports a save carries (warnings included), one per graphic. */
export function describeReports(outcome: SaveOutcome): string[] {
  if (outcome.validation) return [describeValidation(outcome.validation)];
  return (outcome.validations ?? []).map((v) => `${v.input}:\n${describeValidation(v.validation)}`);
}

/** What a finished save says to a person, in the terminal and in the MCP tool. */
export function describeSave(outcome: SaveOutcome): string[] {
  if (!outcome.ok || !outcome.receipt) {
    const lines = (outcome.failures ?? []).map((f) => `${f.input}:\n${describeValidation(f.validation)}`);
    return [...lines, outcome.error ?? 'Not saved.'];
  }
  const graphics = outcome.graphics ?? [];
  const lines: string[] = [];
  if (outcome.replayed) lines.push('Already saved under this operation - nothing new was saved, and these are the same graphics:');
  if (graphics.length <= 1 && !outcome.replayed) return [`Saved "${outcome.name ?? graphics[0]?.name}".`, ...describeReceipt(outcome.receipt)];
  if (!outcome.replayed) lines.push(`Saved ${graphics.length} graphics in one delivery:`);
  const states = new Map(outcome.receipt.resources.map((r) => [r.id, r.state]));
  for (const g of graphics) {
    const state = states.get(g.id);
    lines.push(`- "${g.name}" -> ${g.url}${state && state !== 'saved' ? ` (${state})` : ''}`);
  }
  const checked = outcome.receipt.verified ? 'confirmed by reading it back from the account' : 'accepted by the server, not yet read back';
  lines.push(`In the library of ${destinationOf(outcome.receipt)} (${checked}).`);
  if (outcome.receipt.nextAction) lines.push(outcome.receipt.nextAction);
  lines.push(`Operation ${outcome.receipt.operationId}.`);
  return lines;
}

export async function runSave(args: ParsedArgs, out: Out): Promise<number> {
  const inputs = args._.slice(1);
  const opts: SaveOptions = {
    name: flagString(args, 'name'),
    folder: flagString(args, 'folder'),
    bench: flagBool(args, 'bench', true),
    houseContract: flagBool(args, 'house-contract', true),
  };
  // Every input must exist BEFORE the browser starts. `save` takes several packages, so a stray
  // word cannot be refused by count - an unquoted `--name Football scoreboard` hands it
  // "scoreboard" as a package - and the usual cause is worth naming.
  const missing: string[] = [];
  for (const input of inputs) if (!(await fs.stat(path.resolve(input)).catch(() => null))) missing.push(input);
  if (missing.length) {
    const listed = missing.map((m) => `"${m}"`).join(', ');
    const hint = opts.name ? ` If ${missing.length === 1 ? 'it is' : 'they are'} part of the graphic's name, quote it: --name "${[opts.name, ...missing].join(' ')}".` : '';
    throw new UsageError(`save: no package at ${listed}.${hint}`);
  }
  const problem = saveArgsProblem(inputs, opts);
  if (problem) throw new UsageError(problem);
  // The cheapest refusal first: no key means no save, and that answer needs no browser.
  if (!(await resolveKey(noacgUrl()))) {
    const error = notLoggedIn(noacgUrl());
    out.result({ ok: false, reason: 'not-logged-in', error } satisfies SaveOutcome);
    out.say(error);
    return EXIT_FINDINGS;
  }
  const bridge = await BridgeClient.connect();
  try {
    const outcome = await savePackages(inputs, opts, bridge, (line) => out.log(line));
    out.result(outcome);
    for (const report of describeReports(outcome)) out.say(report);
    for (const line of describeSave(outcome)) out.say(line);
    if (outcome.ok) {
      out.say(`${(outcome.graphics?.length ?? 1) > 1 ? 'They are' : 'It is'} in Home → Graphics the next time the studio opens (or at once on the link); add ${(outcome.graphics?.length ?? 1) > 1 ? 'them' : 'it'} to a production from there.`);
      return EXIT_OK;
    }
    return EXIT_FINDINGS;
  } finally {
    await bridge.close();
  }
}
