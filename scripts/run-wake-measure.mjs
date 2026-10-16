// Read local wake transcripts for usage counters only. Never print prompts, paths or tool output.
// Usage: node scripts/run-wake-measure.mjs <primary Claude project folder> [output.json]
import { createReadStream, writeFileSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { readClaudeRows, dedupeClaudeRows } from './harness-usage.mjs';

const directory = process.argv[2];
if (!directory) throw new Error('Pass the primary Claude project folder');
const since = Date.parse('2026-10-12T00:00:00Z');
const firings = [];
let scanned = 0, malformed = 0;
for (const name of await readdir(directory)) {
  if (!name.endsWith('.jsonl')) continue;
  const file = path.join(directory, name);
  if ((await stat(file)).mtimeMs < since) continue;
  scanned += 1;
  let wake = false, at = null;
  const usage = [];
  const tools = new Map();
  for await (const line of createInterface({ input: createReadStream(file), crlfDelay: Infinity })) {
    let record;
    try { record = JSON.parse(line); } catch { malformed += 1; continue; }
    const content = record.message?.content;
    const text = typeof content === 'string' ? content : Array.isArray(content) ? content.filter((s) => s.type === 'text').map((s) => s.text).join('\n') : '';
    if (record.type === 'user' && /^\s*<scheduled-task name="noacg-run-wake"[^>]*>[\s\S]*<\/scheduled-task>\s*$/.test(text)) {
      wake = true; at = record.timestamp;
    }
    if (record.message?.usage) usage.push(...readClaudeRows(line, { file: name }).rows);
    if (Array.isArray(content)) for (const item of content) {
      if (item.type !== 'tool_use' || !item.id) continue;
      const category = item.name?.endsWith('__send_message') ? 'nativeWakeSends'
        : item.name === 'Skill' ? 'fallbackSkillCalls'
        : item.name === 'Read' ? 'fileReadCalls'
        : /^(?:Bash|PowerShell)$/.test(item.name ?? '') && /node scripts\/run-wake\.mjs check/.test(item.input?.command ?? '') ? 'checkCommandCalls'
        : 'otherToolCalls';
      tools.set(item.id, category);
    }
  }
  if (!wake || Date.parse(at ?? '') < since) continue;
  const rows = dedupeClaudeRows(usage);
  const first = rows.find((s) => s.tokens.total > 0)?.tokens ?? null;
  firings.push({ at, requests: rows.length, first, tools: [...tools.values()].reduce((sum, key) => ({ ...sum, [key]: (sum[key] ?? 0) + 1 }), {}),
    tokens: rows.reduce((sum, row) => Object.fromEntries(Object.keys(sum).map((key) => [key, sum[key] + row.tokens[key]])), { input: 0, cacheWrite: 0, cacheRead: 0, output: 0, total: 0 }) });
}
const distribution = (values) => {
  const sorted = values.sort((a, b) => a - b);
  return sorted.length ? { min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], max: sorted.at(-1) } : null;
};
const result = { measuredAt: new Date().toISOString(), since: new Date(since).toISOString(),
  scope: 'top-level transcripts in the primary project only; deduplicated message/request IDs; archived/missing files excluded',
  scanned, malformed, wakeSessions: firings.length, zeroUsageSessions: firings.filter((s) => s.tokens.total === 0).length,
  firstRequestContext: distribution(firings.filter((s) => s.first).map((s) => s.first.input + s.first.cacheWrite + s.first.cacheRead)),
  requestsPerSession: distribution(firings.map((s) => s.requests)),
  toolCounts: firings.reduce((sum, s) => { for (const [key, count] of Object.entries(s.tools)) sum[key] = (sum[key] ?? 0) + count; return sum; }, {}),
  totals: firings.reduce((sum, s) => Object.fromEntries(Object.keys(sum).map((key) => [key, sum[key] + s.tokens[key]])), { input: 0, cacheWrite: 0, cacheRead: 0, output: 0, total: 0 }),
  sessions: firings.sort((a, b) => a.at.localeCompare(b.at)),
};
if (process.argv[3]) writeFileSync(process.argv[3], `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ ...result, sessions: undefined }, null, 2));
