// `noacg save` - put a graphic package in the user's NoaCG LIBRARY (docs/AGENT_SAVE.md).
//
// Validate first, then save: the package is read by the bridge, normalized, and run through the
// static gate + the runtime bench exactly as `noacg validate` does; a graphic with an ERROR is
// refused here (exit 1) before a byte reaches the server - the server never executes the code,
// so the CLI is where it is judged. Then the bridge builds the LIBRARY RECORD (the same shape
// the studio saves - fields parsed in the bridge's own browser, never on the server), and the
// CLI POSTs it to /api/me/graphics with the scoped key. The server re-stamps id, timestamps and
// origin, INSERTs, and answers the `#/graphic/<id>` link.
//
// Vocabulary: SAVE = the library. It does not publish, add to a production, or air anything.

import path from 'node:path';
import { BridgeClient, type BridgeValidation } from '../bridgeClient.js';
import { cliVersion, noacgUrl } from '../config.js';
import { EXIT_FINDINGS, EXIT_OK, flagBool, flagString, refuseStrayArgs, UsageError, type Out, type ParsedArgs } from '../output.js';
import { ApiError, explainFailure, resolveKey, saveGraphic } from '../auth.js';
import { readPackageInput } from '../workspace.js';
import { describeValidation } from './validate.js';

export interface SaveOutcome {
  ok: boolean;
  id?: string;
  url?: string;
  name?: string;
  validation?: BridgeValidation;
  error?: string;
  /** For an agent reading `--json`: which of the documented refusals this was. */
  reason?: 'not-logged-in' | 'invalid' | 'refused' | 'not-a-noacg-package';
}

/** The refusal every entrance gives before it starts a browser. */
export function notLoggedIn(origin: string): string {
  return `Not logged in to ${origin} - run \`noacg login\` first (or set NOACG_AGENT_KEY). No account? Zip the package and use the studio's Import door.`;
}

/** The save as one call, shared by the CLI command and the MCP tool. */
export async function savePackage(
  input: string,
  opts: { name?: string; folder?: string; bench?: boolean; houseContract?: boolean },
  bridge: BridgeClient,
  log: (line: string) => void,
): Promise<SaveOutcome> {
  const origin = noacgUrl();
  const found = await resolveKey(origin);
  if (!found) {
    return { ok: false, reason: 'not-logged-in', error: notLoggedIn(origin) };
  }
  const { bytes, fileName } = await readPackageInput(input);
  const pkg = await bridge.readPackage(bytes, fileName);
  if (!pkg.imported) {
    return { ok: false, reason: 'not-a-noacg-package', error: `${input}: only a NoaCG/SPX package can be saved to the library (a third-party OGraf Graphic has no NoaCG sources yet - docs/AGENT_CLI.md "Future").` };
  }
  const normalized = await bridge.normalize(pkg.imported.template);
  const template = normalized.template;
  log(`Validating "${template.name}"…`);
  const validation = await bridge.validate(template, { bench: opts.bench ?? true, houseContract: opts.houseContract ?? true });
  if (!validation.ok) {
    return { ok: false, reason: 'invalid', validation, error: `Not saved - the graphic has ${validation.merged.errors.length} error(s). Fix them (\`noacg validate\`) and save again.` };
  }
  const name = opts.name?.trim() || template.name || path.basename(input).replace(/\.zip$/i, '');
  const doc = await bridge.graphicDoc(template, { name, ...(opts.folder ? { folder: opts.folder } : {}), origin: { tool: 'noacg-cli', version: cliVersion() } });
  try {
    const saved = await saveGraphic(origin, found.key, doc);
    return { ok: true, id: saved.id, url: saved.url, name, validation };
  } catch (e) {
    const message = e instanceof ApiError ? explainFailure(e.failure) : e instanceof Error ? e.message : String(e);
    return { ok: false, reason: 'refused', validation, error: `Not saved: ${message}` };
  }
}

export async function runSave(args: ParsedArgs, out: Out): Promise<number> {
  const input = args._[1];
  if (!input) throw new UsageError('save needs a package directory or .zip.');
  refuseStrayArgs(args, 1, '--name "Football scoreboard"');
  // The cheapest refusal first: no key means no save, and that answer needs no browser.
  if (!(await resolveKey(noacgUrl()))) {
    const error = notLoggedIn(noacgUrl());
    out.result({ ok: false, reason: 'not-logged-in', error } satisfies SaveOutcome);
    out.say(error);
    return EXIT_FINDINGS;
  }
  const bridge = await BridgeClient.connect();
  try {
    const outcome = await savePackage(
      input,
      { name: flagString(args, 'name'), folder: flagString(args, 'folder'), bench: flagBool(args, 'bench', true), houseContract: flagBool(args, 'house-contract', true) },
      bridge,
      (line) => out.log(line),
    );
    out.result(outcome);
    if (outcome.validation) out.say(describeValidation(outcome.validation));
    if (outcome.ok) {
      out.say(`Saved "${outcome.name}" to your NoaCG library -> ${outcome.url}`);
      out.say('It is in Home → Graphics the next time the studio opens (or at once on that link); add it to a production from there.');
      return EXIT_OK;
    }
    out.say(outcome.error ?? 'Not saved.');
    return EXIT_FINDINGS;
  } finally {
    await bridge.close();
  }
}
