// Usage-only recovery measurement. Explicit files/windows; never prints transcript contents.
// node scripts/native-recovery-context.mjs <manifest.json> <native-transcript.jsonl> [...]
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dedupeClaudeRows, parseJsonl, readClaudeRows } from './harness-usage.mjs';

const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);
const validCount = (value) => Number.isSafeInteger(value) && value >= 0;

function claudeUsage(transcripts, sessionId, since, until) {
  for (const text of transcripts) for (const record of parseJsonl(text).records) {
    const usage = record.message?.usage;
    if (usage && !['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'output_tokens'].every((key) => validCount(usage[key]))) {
      throw new Error('Incomplete native Claude counters; do not replace missing fields with zero');
    }
  }
  const all = transcripts.flatMap((text, index) => readClaudeRows(text, { file: String(index) }).rows);
  if (all.some((row) => row.sessionId !== sessionId || row.sidechain)) throw new Error('Supply only transcripts of the exact native owner; inherited-ID subagents are excluded');
  if (all.some((row) => !Object.values(row.tokens).every(validCount))) throw new Error('Invalid native usage counters');
  const seen = new Map();
  for (const row of all) {
    if (seen.has(row.key) && JSON.stringify(seen.get(row.key)) !== JSON.stringify(row.tokens)) throw new Error('Conflicting copies of native request counters');
    seen.set(row.key, row.tokens);
  }
  const rows = dedupeClaudeRows(all)
    .filter((row) => row.at >= since && row.at <= until).sort((a, b) => a.at - b.at);
  const positive = rows.filter((row) => row.tokens.total > 0).map((row) => row.tokens);
  if (!positive.length) return null;
  return {
    records: positive.length,
    firstRequestInput: positive[0].input + positive[0].cacheWrite + positive[0].cacheRead,
    uncachedInput: sum(positive, 'input'), cacheRead: sum(positive, 'cacheRead'),
    cacheWrite: sum(positive, 'cacheWrite'), output: sum(positive, 'output'),
    method: 'native message/request IDs deduplicated across the supplied files; provider input/cache counters kept separate',
  };
}

function codexUsage(transcripts, sessionId, since, until) {
  const samples = [];
  for (const text of transcripts) {
    const { records } = parseJsonl(text);
    const id = records.find((row) => row.type === 'session_meta')?.payload?.id;
    if (id !== sessionId) throw new Error('Codex transcript does not match the exact native session');
    for (const row of records) {
      if (row.payload?.type !== 'token_count' || !row.payload.info) continue;
      const at = Date.parse(row.timestamp);
      const { total_token_usage: total, last_token_usage: last } = row.payload.info;
      if (!Number.isFinite(at) || !total || !['input_tokens', 'cached_input_tokens', 'output_tokens'].every((key) => validCount(total[key]))
          || total.cached_input_tokens > total.input_tokens) throw new Error('Invalid or incomplete native Codex cumulative snapshot');
      samples.push({ at, total, last });
    }
  }
  samples.sort((a, b) => a.at - b.at);
  let previous = null, firstRequestInput = null, records = 0;
  let input = 0, cached = 0, output = 0;
  for (const sample of samples) {
    const { total } = sample;
    if (sample.at > until) break;
    if (previous && ['input_tokens', 'cached_input_tokens', 'output_tokens'].some((key) => total[key] < previous[key])) {
      throw new Error('Native cumulative counters decreased; split the measurement at the reset');
    }
    const delta = (key) => total[key] - (previous?.[key] ?? 0);
    if (previous && delta('cached_input_tokens') > delta('input_tokens')) {
      throw new Error('Native interval cached input exceeds total input; split invalid cumulative measurements');
    }
    if (sample.at >= since && (delta('input_tokens') > 0 || delta('output_tokens') > 0)) {
      // A resumed transcript without its pre-window baseline cannot attribute a lifetime total
      // to this recovery. A new session's zero baseline must be recorded explicitly too.
      if (!previous) throw new Error('Recovery window needs a native cumulative baseline before its first counted record');
      input += delta('input_tokens'); cached += delta('cached_input_tokens'); output += delta('output_tokens');
      if (records === 0 && validCount(sample.last?.input_tokens)) firstRequestInput = sample.last.input_tokens;
      records += 1;
    }
    previous = total;
  }
  if (!records) return null;
  if (cached > input) throw new Error('Native cached input exceeds total input');
  return { records, firstRequestInput, uncachedInput: input - cached, cacheRead: cached, cacheWrite: null, output,
    method: 'deltas of native cumulative counters; last_token_usage used only for first-request size, never summed; cache writes unavailable' };
}

export function measureRecovery(manifest, transcripts) {
  const { provider, sessionId, identityEvidence, since, until, packetBytes, retrievedBytes, planningTurns = null } = manifest;
  const start = Date.parse(since), end = Date.parse(until);
  if (!['claude', 'codex'].includes(provider) || typeof sessionId !== 'string' || !sessionId.trim()
      || typeof identityEvidence !== 'string' || !identityEvidence.trim() || !Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new Error('Provider, exact session, native identity evidence and explicit recovery window required');
  }
  if (![packetBytes, retrievedBytes].every((n) => n === null || validCount(n))
      || (planningTurns !== null && !validCount(planningTurns))) throw new Error('Measurements must be nonnegative integers or explicitly null');
  const malformed = transcripts.reduce((count, text) => count + parseJsonl(text).malformed, 0);
  const usage = provider === 'claude' ? claudeUsage(transcripts, sessionId, start, end) : codexUsage(transcripts, sessionId, start, end);
  return { provider, sessionId, identityEvidence, since, until, packetBytes, retrievedBytes, planningTurns, malformed,
    usageStatus: malformed ? 'incomplete' : usage ? 'observed' : 'unavailable', usage,
    limits: 'Packet/retrieval bytes are not token counts. Planning turns require an explicit observation. No billing, quota, guardrail reduction or comparative savings claim.' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [manifestFile, ...files] = process.argv.slice(2);
  if (!manifestFile) throw new Error('Pass a measurement manifest and explicit native transcript files');
  const result = measureRecovery(JSON.parse(readFileSync(manifestFile, 'utf8')), files.map((file) => readFileSync(file, 'utf8')));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
