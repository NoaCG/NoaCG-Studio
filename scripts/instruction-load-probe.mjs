#!/usr/bin/env node
// Which instruction files actually reached a Claude session, and how many times each.
//
//   node scripts/instruction-load-probe.mjs run <file> [<file> ...]
//       starts a headless Claude session in this checkout, has it read the first lines of each
//       file, then reports what loaded (costs one small model call)
//   node scripts/instruction-load-probe.mjs session <transcript.jsonl | session id>
//       reports what loaded in a session that already ran - the only way to see the desktop
//       app, whose loading differs from the CLI's (a scheduled task is a desktop session)
//
// Every instruction the harness injects is written into the session transcript: the files loaded
// at start (`instructions`), the ones a Read pulled in (`nested_memory`: CLAUDE.md, its imports and
// `.claude/rules`), and anything a hook added (`hook_additional_context`, which is how the built-in
// agents-md plugin delivers a folder's AGENTS.md). Counting those is measuring, not assuming - the
// rule for any change to how instructions load (contracts/README.md).
//
// Exits 1 when a file loaded more than once, or when a generated folder contract reached Claude:
// Claude gets those rules from `.claude/rules`, so the folder copy is always a duplicate.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GENERATED_MARKER } from './contracts-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJECTS = path.join(os.homedir(), '.claude', 'projects');

/** Every instruction file a transcript shows reaching the model, in order, with repeats. */
export function loadsIn(text) {
  const loads = [];
  for (const line of text.split('\n')) {
    if (!line.includes('"attachment"')) continue;
    const a = JSON.parse(line).attachment;
    if (a?.type === 'instructions') loads.push(...(a.files ?? []).map((f) => ({ path: f.path, how: 'start' })));
    else if (a?.type === 'nested_memory') loads.push({ path: a.path, how: 'on read' });
    else if (a?.type === 'hook_additional_context') {
      for (const chunk of [].concat(a.content ?? [])) {
        for (const m of String(chunk).matchAll(/Contents of (.+?\.md)(?: \(|:)/g)) loads.push({ path: m[1], how: `hook ${a.hookName}` });
      }
    }
  }
  return loads;
}

function transcriptFor(idOrPath) {
  if (existsSync(idOrPath)) return idOrPath;
  for (const dir of readdirSync(PROJECTS)) {
    const file = path.join(PROJECTS, dir, `${idOrPath}.jsonl`);
    if (existsSync(file)) return file;
  }
  throw new Error(`no transcript for ${idOrPath}`);
}

// A generated AGENTS.md with no CLAUDE.md beside it is a folder contract written for Codex; the root
// one has its CLAUDE.md import and is meant to reach Claude.
const isFolderContract = (file) => path.basename(file) === 'AGENTS.md' && existsSync(file)
  && readFileSync(file, 'utf8').includes(GENERATED_MARKER) && !existsSync(path.join(path.dirname(file), 'CLAUDE.md'));

/** Print one line per instruction file and return how many look wrong. */
function report(transcript) {
  const counts = new Map();
  for (const load of loadsIn(readFileSync(transcript, 'utf8'))) {
    const entry = counts.get(load.path) ?? { n: 0, how: new Set() };
    entry.n += 1;
    entry.how.add(load.how);
    counts.set(load.path, entry);
  }
  let problems = 0;
  for (const [file, { n, how }] of counts) {
    const problem = n > 1 ? `  LOADED ${n} TIMES` : isFolderContract(file) ? '  GENERATED FOLDER CONTRACT (its rules also load from .claude/rules)' : '';
    if (problem) problems += 1;
    console.log(`${String(n).padStart(2)}x  ${file.replace(os.homedir(), '~')}  [${[...how].join(', ')}]${problem}`);
  }
  console.log(problems === 0 ? 'every instruction file loaded once' : `${problems} problem(s)`);
  return problems;
}

const [mode, ...rest] = process.argv.slice(2);
if (mode === 'session' && rest[0]) {
  process.exit(report(transcriptFor(rest[0])) ? 1 : 0);
} else if (mode === 'run' && rest.length > 0) {
  const prompt = `Use the Read tool to read only the first 2 lines of each of these files, one at a time: ${rest.join(', ')}. Then reply DONE.`;
  const run = spawnSync(process.env.CLAUDE_BIN || 'claude', ['-p', prompt, '--model', 'claude-haiku-4-5-20251001',
    '--allowedTools', 'Read', '--output-format', 'json'], { cwd: ROOT, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`claude exited ${run.status}: ${run.stderr || run.error}`);
  process.exit(report(transcriptFor(JSON.parse(run.stdout).session_id)) ? 1 : 0);
} else {
  console.error('usage: instruction-load-probe.mjs run <file>... | session <transcript or session id>');
  process.exit(2);
}
