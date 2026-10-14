// H3'S PROOFS (docs/work-specs/noacg-harness/spec.md section 6): the sessions feasibility runs that
// are not tuning briefs. `node scripts/harness-bench.mjs --build H3 --proof <id>[,<id>]` runs them
// through the same arm, pipeline and ledger as any brief; proof 3, the real graphic, is a v1
// tuning brief run with `--briefs` instead.
//
//   h3-plumbing        Haiku 5.5: the CLI from the mounted tarball, a Chromium, doctor against the
//                      production bridge, a neutral scoreboard through validate --screenshots,
//                      coverage and record, and a probe of the hosts a browser download would need
//   h3-packages-cold   Haiku 5.5, in an environment whose `packages` field carries the published
//   h3-packages-warm   CLI: the first session pays the install, the second shows the cached start
//   h3-defect          Opus 5.5: a scaffolded lower third with a defect only the picture shows,
//                      mounted as the package someone started; the agent is asked to finish it

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** The published CLI, the only one npm can install by name until the new verbs are released (D3). */
export const PUBLISHED_CLI = '@noacg/cli@0.11.0';

const PLUMBING = [
  'This is a plumbing check of the container, not a design task. Do exactly this, in order, and change nothing in the graphic\'s design.',
  '1. Get the CLI and the browser working as your instructions say, then run `noacg --version` and `noacg doctor`.',
  '2. `noacg scaffold --type scoreboard --design neutral --name "Plumbing check" --out /workspace/graphic`.',
  '3. `noacg validate /workspace/graphic --screenshots /mnt/session/outputs/shots`, then read one of the screenshots it lists.',
  '4. Record, then run coverage, as your instructions say. Read one coverage frame; the rest need no look in this check.',
  "5. A network probe: `npx -y playwright@1.61.1 install --dry-run chromium`, then for each download URL it prints `curl -sS -o /dev/null -w '%{http_code} %{url_effective}\\n' <url>`, then the same curl for https://noacg.studio/bridge.",
  'End with a short report: how the CLI got installed, which browser `noacg doctor` used, the probe\'s status codes, then the DELIVERED line.',
].join('\n');

const PACKAGES = [
  'This is a plumbing check of the container, not a design task. Install nothing, and change nothing in the graphic\'s design.',
  '1. `which noacg`, `noacg --version`, then `noacg doctor` (if it finds no browser, use the preinstalled one as your instructions say).',
  '2. `noacg scaffold --type scoreboard --design neutral --name "Packages check" --out /workspace/graphic`.',
  '3. `noacg validate /workspace/graphic --screenshots /mnt/session/outputs/shots`, then read one of the screenshots it lists.',
  'This CLI version has no `record` or `coverage` verb: skip the hand-in. End with a short report (where noacg came from, its version, which browser doctor used), then `NOT READY: plumbing check only`.',
].join('\n');

const DEFECT = [
  'A lower third for the evening news: the anchor\'s name and their role.',
  'Someone started it, and their package is at /mnt/session/uploads/graphic.tgz. Unpack it into /workspace/graphic and finish it, so that it is a clean, readable lower third you would put on air. Keep its two fields.',
].join(' ');

export const PROOFS = {
  'h3-plumbing': { model: { id: 'claude-haiku-5-5' }, budgetCents: 50, prompt: PLUMBING },
  'h3-packages-cold': { model: { id: 'claude-haiku-5-5' }, budgetCents: 30, prompt: PACKAGES, environment: 'packages', withoutCli: true },
  'h3-packages-warm': { model: { id: 'claude-haiku-5-5' }, budgetCents: 30, prompt: PACKAGES, environment: 'packages', withoutCli: true },
  'h3-defect': { model: null, budgetCents: 300, prompt: DEFECT, prepare: plantDefect },
};

/** The environment a `packages` proof runs in: the synced one's networking, with the CLI as a package. */
export function packagesEnvironment(definition) {
  return { ...definition, name: `${definition.name}-h3-packages`, config: { ...definition.config, packages: { npm: [PUBLISHED_CLI] } } };
}

/** The defect: the name turned upside down inside its own rule. The validator passes it clean
 *  (0 errors, 0 warnings, measured 2026-10-14), so only a look at the picture finds it. */
export const PLANT = { rule: '.lower-third-name {', line: '  transform: scaleY(-1);' };

/** Scaffold the lower third, plant the defect in its CSS, and pack it as the mounted package. */
export async function plantDefect({ cli, dir }) {
  const graphic = path.join(dir, 'graphic');
  const scaffold = await cli(['scaffold', '--type', 'lower-third', '--design', 'neutral', '--name', 'Evening news', '--out', graphic]);
  if (scaffold.code !== 0) throw new Error(`scaffold failed: ${scaffold.stderr.slice(-300)}`);
  const css = path.join(graphic, 'css', 'template.css');
  const text = readFileSync(css, 'utf8');
  if (!text.includes(PLANT.rule)) throw new Error(`no ${PLANT.rule} rule to plant the defect in`);
  writeFileSync(css, text.replace(PLANT.rule, `${PLANT.rule}\n${PLANT.line}`));
  const validate = await cli(['validate', graphic, '--json']);
  if (!validate.json?.ok) throw new Error(`the planted package must still validate: ${validate.stdout.slice(-300)}`);
  const tgz = path.join(dir, 'graphic.tgz');
  // Relative paths from `dir`: GNU tar reads `C:\...` as a remote host.
  const tar = spawnSync('tar', ['-czf', 'graphic.tgz', '-C', 'graphic', '.'], { cwd: dir, encoding: 'utf8', windowsHide: true });
  if (tar.status !== 0) throw new Error(`tar failed: ${tar.stderr}`);
  return { mounts: [{ file: tgz, mountPath: '/graphic.tgz' }], plantedDigest: validate.json.digest };
}
