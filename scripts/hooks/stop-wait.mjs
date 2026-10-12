// Stop / SubagentStop hook: a session that ends its turn WAITING on something that cannot wake it
// is told so, at that moment, and continues. The reasoning and the patterns live in
// scripts/stop-wait.mjs (the pure, tested half); this file is the shell around it.
//
// Cost: the message regexes run at every turn end and are microseconds. Git, the job store and the
// refusal count are read only when a wait is declared, which is rare, so an ordinary turn end pays
// nothing. Nothing expensive may move above the `declaresWait` line.

import { closeSync, mkdirSync, openSync, readFileSync, readSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readHookInput, warn, gitOutput } from './lib.mjs';
import { decide, declaresWait, isCloudSession, lastAssistantText, MAX_REFUSALS, REFUSAL_WINDOW_MS } from '../stop-wait.mjs';

// A cloud session has real wake sources and is never refused (`isCloudSession`), so it reads nothing.
if (isCloudSession()) process.exit(0);

const input = await readHookInput();
if (!input) process.exit(0);

function readTail(file, bytes) {
  const size = statSync(file).size;
  const length = Math.min(size, bytes);
  const buffer = Buffer.alloc(length);
  const fd = openSync(file, 'r');
  try {
    readSync(fd, buffer, 0, length, size - length);
  } finally {
    closeSync(fd);
  }
  return buffer.toString('utf8');
}

const text =
  typeof input.last_assistant_message === 'string'
    ? input.last_assistant_message
    : typeof input.transcript_path === 'string'
      ? lastAssistantText(input.transcript_path, { readTail })
      : null;

if (!declaresWait(text)) process.exit(0);

// Only now is anything expensive touched: the branch this session sits on, and whether the
// queue already holds it - a queued or landed branch needs nobody awake.
let landingState = null;
try {
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  const branch = gitOutput(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])?.trim();
  if (branch && branch !== 'HEAD') {
    const { jobsDir, readJobs, landingStateFor } = await import('../jobs-store.mjs');
    const dir = jobsDir(); // the job store is per git common dir, shared by every worktree
    if (dir) landingState = landingStateFor(branch, readJobs(dir)).state;
  }
} catch {
  landingState = null; // fail open on the facts, never on the message
}

// HOW MANY TIMES THIS SESSION HAS ALREADY BEEN REFUSED, and when it last was. One small file per
// session, holding `<count> <epoch-ms>`. The name carries BOTH ids the event offers: a row's
// `agent_id` and the session it belongs to, so the count never depends on one of them being unique
// forever. The file lives in the per-session scratchpad the event names when it has one, which the
// harness cleans up with the session, and in the system temp directory when it does not - the job
// store `session-start.mjs` uses for its marker is the other candidate and was not taken, because
// this state is worth nothing an hour later and that directory is never cleaned.
function refusalState() {
  const key = [input.session_id, input.agent_id]
    .filter((part) => typeof part === 'string' && part)
    .join('.')
    .replace(/[^\w.-]/g, '');
  // No id to count against, so there is nothing to count: fall back to what this hook did before
  // the count existed - the harness's own `stop_hook_active` flag, one refusal and never a loop.
  if (!key) return { file: null, refusals: input.stop_hook_active === true ? MAX_REFUSALS : 0 };

  const base = typeof input.scratchpad_dir === 'string' && input.scratchpad_dir ? input.scratchpad_dir : tmpdir();
  const file = join(base, 'stop-wait-refusals', `${key}.count`);
  try {
    const [count, at] = readFileSync(file, 'utf8').split(' ').map(Number);
    // A refusal older than the window has done its job and is forgotten, so a long-lived session
    // gets its budget back rather than spending it once and running unguarded for a whole night.
    const fresh = Number.isFinite(at) && Date.now() - at < REFUSAL_WINDOW_MS;
    return { file, refusals: fresh && Number.isInteger(count) && count > 0 ? count : 0 };
  } catch (error) {
    if (error?.code === 'ENOENT') return { file, refusals: 0 }; // the ordinary first stop
    return { file: null, refusals: input.stop_hook_active === true ? MAX_REFUSALS : 0 };
  }
}

const { file, refusals } = refusalState();
const message = decide({ text, refusals, landingState });
if (message) {
  let counted = false;
  if (file) {
    try {
      mkdirSync(join(file, '..'), { recursive: true });
      writeFileSync(file, `${refusals + 1} ${Date.now()}`, 'utf8');
      counted = true;
    } catch {
      counted = false; // disk full, read-only temp: the flag below is what stops a loop instead
    }
  }
  // Refuse when the refusal was counted, or when the harness's flag is there to hold the line
  // instead. When NEITHER is available there is nothing to stop this repeating at every stop
  // forever, and a session that can never end is worse than a wait nobody caught.
  if (counted || input.stop_hook_active === false) warn(message);
}
process.exit(0);
