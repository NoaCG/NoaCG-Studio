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
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, write5m: 2.5, write1h: 4 },
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
