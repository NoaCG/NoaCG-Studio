// WHAT A SESSION DID, from its events (docs/work-specs/noacg-harness/spec.md section 6, 5.2): the
// measurements H3 owes H4 and the trace a reader can replay without the frames.
//
//   coldStart     seconds from the session's creation to its first model request, its first tool
//                 call, its first `noacg` command, and the `noacg doctor` that first reached the
//                 bridge: the CLI and a trusted browser working (bridgeReady)
//   turns         model requests (`span.model_request_end`), and tool calls
//   images        tool results that carried an image back to the model: the agent LOOKED, as
//                 opposed to naming a file or reading text findings
//   requests      each model request priced at list rates; the largest is the overshoot `o`, the
//                 most one request can carry a session past its budget (5.2)
//   steps         the compact trace: every tool call with what it was and what came back, the
//                 digest a `noacg` command printed, and the agent's messages, in order
//
// Pricing is the public list price per million tokens. The cache-write rate depends on the
// lifetime the platform chose, which only the session's totals say (`usage.cache_creation`), so
// the per-request figure uses the session's mix; `pricedCents` beside the session's own
// `usage.list_cost` shows whether the table and the platform agree.

/** US dollars per million tokens: input, output, cache read, cache write 5 min, cache write 1 h. */
export const LIST_PRICES = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, write5m: 5, write1h: 8 },
  // Sonnet 5.5's cache read at $0.10: what H7's five sessions' own list costs imply, each within a
  // cent; at $0.20 every one priced 7 to 15 cents over the platform's figure.
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1, write5m: 2.5, write1h: 4 },
  // Haiku 5.5 at $0.50 / $2.50: what H3's two plumbing sessions' own list costs imply (3 cents each
  // on about 50k price-weighted tokens); the $0.10 / $0.50 figure did not reproduce them.
  'claude-haiku-5-5': { input: 0.5, output: 2.5, cacheRead: 0.05, write5m: 0.625, write1h: 1 },
};
/** Session running time, billed into the list cost (managed-agents/budgets). */
export const RUNTIME_USD_PER_HOUR = 0.08;

const DIGEST = /sha256:[0-9a-f]{64}/;
const seconds = (from, to) => (from && to ? Math.round((Date.parse(to) - Date.parse(from)) / 100) / 10 : null);
const textOf = (content) => (content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n');
const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}...` : s);

/** One request's list cost in US dollars, at the session's cache-write mix. */
export function requestUsd(usage, price, write1hShare = 0) {
  const write = price.write5m * (1 - write1hShare) + price.write1h * write1hShare;
  return ((usage.input_tokens ?? 0) * price.input + (usage.output_tokens ?? 0) * price.output + (usage.cache_read_input_tokens ?? 0) * price.cacheRead + (usage.cache_creation_input_tokens ?? 0) * write) / 1e6;
}

export function traceMetrics({ events, createdAt, model, usage = null }) {
  const price = LIST_PRICES[model];
  const created = usage?.cache_creation ?? {};
  const written = (created.ephemeral_1h_input_tokens ?? 0) + (created.ephemeral_5m_input_tokens ?? 0);
  const write1hShare = written ? (created.ephemeral_1h_input_tokens ?? 0) / written : 0;
  const uses = new Map();
  const steps = [];
  const requests = [];
  let firstRequest = null;
  let firstTool = null;
  let firstNoacg = null;
  let bridgeReady = null;
  let images = 0;
  for (const e of events) {
    if (e.type === 'span.model_request_start' && !firstRequest) firstRequest = e.processed_at;
    if (e.type === 'span.model_request_end') {
      const usd = price ? requestUsd(e.model_usage ?? {}, price, write1hShare) : null;
      requests.push({ at: e.processed_at, error: Boolean(e.is_error), usage: e.model_usage, usd });
    }
    if (e.type === 'agent.message') steps.push({ at: e.processed_at, kind: 'message', text: clip(textOf(e.content), 1200) });
    if (e.type === 'agent.tool_use') {
      firstTool ??= e.processed_at;
      const command = typeof e.input?.command === 'string' ? e.input.command : null;
      if (command && /(?:^|[\s;&|(])noacg\s/.test(command)) firstNoacg ??= e.processed_at;
      const step = { at: e.processed_at, kind: 'tool', tool: e.name, ...(command ? { command: clip(command, 600) } : {}), ...(typeof e.input?.file_path === 'string' ? { path: e.input.file_path } : {}) };
      uses.set(e.id, step);
      steps.push(step);
    }
    if (e.type === 'agent.tool_result' && uses.has(e.tool_use_id)) {
      const step = uses.get(e.tool_use_id);
      const imageBlocks = (e.content ?? []).filter((b) => b.type === 'image').length;
      const text = textOf(e.content);
      images += imageBlocks;
      step.ok = !e.is_error;
      if (!bridgeReady && /bridge\s+v\d/.test(text)) bridgeReady = e.processed_at;
      if (imageBlocks) step.images = imageBlocks;
      const digest = DIGEST.exec(text);
      if (digest) step.digest = digest[0];
      if (text) step.result = clip(text, step.command && /\bnoacg\s+(validate|coverage|doctor|record)\b/.test(step.command) ? 900 : 300);
    }
  }
  const largest = requests.reduce((max, r) => (r.usd !== null && (!max || r.usd > max.usd) ? r : max), null);
  const activeSeconds = usage?.active_seconds ?? null;
  const tokenUsd = requests.reduce((n, r) => n + (r.usd ?? 0), 0);
  return {
    model,
    coldStart: { firstModelRequest: seconds(createdAt, firstRequest), firstToolCall: seconds(createdAt, firstTool), firstNoacgCommand: seconds(createdAt, firstNoacg), bridgeReady: seconds(createdAt, bridgeReady) },
    turns: { modelRequests: requests.length, toolCalls: steps.filter((s) => s.kind === 'tool').length },
    images,
    largestRequest: largest ? { at: largest.at, usd: Math.round(largest.usd * 10000) / 10000, usage: largest.usage } : null,
    pricedCents: price ? Math.round((tokenUsd + ((activeSeconds ?? 0) / 3600) * RUNTIME_USD_PER_HOUR) * 100) : null,
    activeSeconds,
    steps,
  };
}

// ── the look line (docs/work-specs/harness-ladder/spec.md D1, D6) ─────────────────────────────
// `record --review` proves every coverage frame has a verdict, not that it was looked at. The
// trace says which files the agent opened: a frame is opened when the agent read a file of that
// name (the frames carry the coverage's own names, `take-sample-video-600ms.png` and the like).
// Every coverage writes those names again, over new pixels and with empty verdicts, so only a read
// after the session's last `noacg coverage` counts, and only one that did not fail.

const COVERAGE_RUN = /(?:^|[\s;&|(])noacg\s+coverage\b/;

/** The reads that come after the last coverage run of `events` ([{ read } | { coverage }], in
 *  order). With `back`, a list instead: the reads after the last run, after the one before it, and
 *  so on back to the first, since a frame coverage drew again byte for byte (its `sameSince`) was
 *  that same picture when the agent read it after an earlier run. */
const sinceCoverage = (events, back = false) => {
  const after = (i) => events.slice(i + 1).filter((e) => e.read).map((e) => e.read);
  const runs = events.flatMap((e, i) => (e.coverage ? [i] : []));
  return back ? runs.reverse().map(after) : after(runs.length ? runs[runs.length - 1] : -1);
};

/** The paths a Managed Agents trace's `read` steps opened after its last coverage (`back`: after each, last first). */
export function readsOf(steps, { back = false } = {}) {
  return sinceCoverage((steps ?? []).filter((s) => s.kind === 'tool').map((s) => (/^read$/i.test(s.tool ?? '') && typeof s.path === 'string' && s.ok !== false ? { read: s.path } : { coverage: COVERAGE_RUN.test(s.command ?? '') })), back);
}

/** The paths a Claude Code session's transcript (its `.jsonl`) opened with Read after its last coverage (`back`: after each, last first). */
export function transcriptReads(text, { back = false } = {}) {
  const events = [];
  const failed = new Set();
  for (const line of String(text ?? '').split('\n')) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    for (const block of Array.isArray(entry?.message?.content) ? entry.message.content : []) {
      if (block?.type === 'tool_use' && block.name === 'Read' && typeof block.input?.file_path === 'string') events.push({ id: block.id, read: block.input.file_path });
      else if (block?.type === 'tool_use' && block.name === 'Bash') events.push({ coverage: COVERAGE_RUN.test(block.input?.command ?? '') });
      else if (block?.type === 'tool_result' && block.is_error) failed.add(block.tool_use_id);
    }
  }
  return sinceCoverage(events.filter((e) => !(e.read && failed.has(e.id))), back);
}

/**
 * A Claude Code session's list-price cost from its transcript, for a session stopped before it
 * printed its own `total_cost_usd`: every model message's usage once (a message written as several
 * lines repeats it), at the model's list prices, cache writes at the 5-minute rate. Null for a
 * model with no price here.
 */
export function transcriptUsd(text, model) {
  const price = LIST_PRICES[model];
  if (!price) return null;
  const seen = new Set();
  let usd = 0;
  for (const line of String(text ?? '').split('\n')) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const m = entry?.message;
    if (entry?.type !== 'assistant' || !m?.usage || seen.has(m.id)) continue;
    seen.add(m.id);
    usd += requestUsd(m.usage, price);
  }
  return Math.round(usd * 1e6) / 1e6;
}

const baseName = (p) => String(p).split(/[\\/]/).pop();

/**
 * The look line of one hand-in: how many frames it gave a verdict for, how many of those the agent
 * opened, and which it did not. `review` is the record's `review`, null when it was handed in
 * without one.
 */
export function framesOpened(review, reads, readsBack = []) {
  if (!review) return { reviewed: 0, opened: 0, unopened: [], all: false, fixed: 0 };
  const read = new Set((reads ?? []).map(baseName));
  // A frame coverage drew again byte for byte for `sameSince` runs was that same picture when the
  // agent read it after the run that many back (a carried verdict without the count: after any).
  const back = (readsBack ?? []).map((r) => new Set(r.map(baseName)));
  const sawSame = (v) => {
    const k = Number.isInteger(v.sameSince) && v.sameSince > 0 ? v.sameSince : v.carried ? Infinity : 0;
    return k > 0 && back.length > 0 && back[Math.min(k, back.length - 1)].has(baseName(v.file));
  };
  const files = (review.verdicts ?? []).map((v) => v.file);
  const unopened = (review.verdicts ?? []).filter((v) => !read.has(baseName(v.file)) && !sawSame(v)).map((v) => v.file);
  return { reviewed: files.length, opened: files.length - unopened.length, unopened, all: files.length > 0 && unopened.length === 0, fixed: review.fixed ?? 0 };
}
