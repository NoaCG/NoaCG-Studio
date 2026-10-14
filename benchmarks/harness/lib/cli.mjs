// The NoaCG CLI as the bench runs it: this checkout's built `cli/dist`, against one deployment
// (NOACG_URL: this checkout's dev server or a deployment, as the other benches). Injected into the
// arms and the pipeline, so a test can hand them a stand-in.

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const CLI_ENTRY = path.join(ROOT, 'cli', 'dist', 'index.js');

/** `cli(args, { cwd })` -> `{ code, json, stdout, stderr, args, ms }`; never throws on a non-zero exit. */
export function makeCli({ url, entry = CLI_ENTRY, env = process.env } = {}) {
  if (!existsSync(entry)) throw new Error(`no built CLI at ${entry}: run \`npm run build\` in cli/`);
  const cli = (args, { cwd } = {}) =>
    new Promise((resolve) => {
      const started = Date.now();
      // The child gets no key: the bench's CLI never saves, and must not hold anything it could.
      const childEnv = { ...env, NOACG_URL: url };
      delete childEnv.NOACG_AGENT_KEY;
      execFile(process.execPath, [entry, ...args], { cwd, env: childEnv, maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
        let json = null;
        try {
          json = JSON.parse(stdout);
        } catch {
          /* not json */
        }
        const call = { args, code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, json, stdout, stderr: String(stderr).slice(-4000), ms: Date.now() - started };
        resolve(call);
      });
    });
  cli.url = url;
  return cli;
}
