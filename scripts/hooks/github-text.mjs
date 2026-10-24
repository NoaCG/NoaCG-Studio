// What a shell command writes to GitHub (`root/write-everything-github-issues-pull-requests`).
// The repository is public: issues, pull requests and their comments are read by developers,
// users and investors as well as agents. A prompt for the next session, notes about the owner or
// a session id belong in the chat, so a `gh issue|pr` write carrying one is refused with the rule.
//
// Shared by guard-command.mjs (Claude Code) and codex-guard-command.mjs (Codex). Hidden
// `<!-- ... -->` blocks are skipped: the repair-owner record lives in one on purpose
// (.agent-workflows/queue-merge.md). A body passed with --body-file is read when it resolves.
// ALLOW_GITHUB_TEXT=1 in the command passes text whose match is a product term, such as an
// account owner.

import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import * as rules from '../rules.mjs';

const RULE = 'root/write-everything-github-issues-pull-requests';

const WRITES = /\bgh\s+(?:issue|pr)\s+(?:create|comment|edit|review|close)\b/;

const PATTERNS = [
  [/\bthe owner\b|\bowner's\b/i, 'talks about the owner'],
  [/\b(?:next|fresh|new) session\b/i, 'addresses a future session'],
  [/\bpaste(?:able)?\b[^\n]{0,40}\bprompt\b|\bprompt\b[^\n]{0,40}\bpaste/i, 'carries a pasteable prompt'],
  [/(?:^|["'])\s*#+\s*(?:next[- ]session\s+)?prompt\b/im, 'carries a prompt section'],
  [/\bsession_0[0-9A-Za-z]{6,}|\blocal_[0-9a-f]{8}/, 'names a session id'],
  [/\bthis (?:session|conversation|chat)\b/i, 'speaks from a chat'],
];

function bodyFile(command, cwd) {
  const match = command.match(/(?:--body-file|-F)\s+(?:"([^"]+)"|'([^']+)'|(\S+))/);
  const path = match && (match[1] ?? match[2] ?? match[3]);
  if (!path || path === '-') return '';
  try {
    return readFileSync(isAbsolute(path) ? path : join(cwd, path), 'utf8');
  } catch {
    return '';
  }
}

/** The refusal for a `gh issue|pr` write whose text breaks the rule, or null. */
export function githubTextRefusal(command, cwd = process.cwd()) {
  if (!WRITES.test(command) || /ALLOW_GITHUB_TEXT\s*=\s*1/.test(command)) return null;
  const text = `${command}\n${bodyFile(command, cwd)}`.replace(/<!--[\s\S]*?-->/g, '');
  const hits = PATTERNS.filter(([pattern]) => pattern.test(text)).map(([, why]) => why);
  if (hits.length === 0) return null;
  return (
    `Blocked: this GitHub text ${hits.join('; ')} (\`${RULE}\`).\n` +
    `${rules.text('root/write-everything-github-issues-pull-requests')}\n` +
    'Rewrite it about NoaCG and give anything meant for the owner or the next session in the chat. ' +
    'If the match is a product term (an account owner, say), include ALLOW_GITHUB_TEXT=1 in the command.'
  );
}
