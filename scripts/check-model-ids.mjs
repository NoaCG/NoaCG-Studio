// gate: workflow weekly-audit.yml
// guards: src/ai/**, api/_lib/**
//
// The PINNED-MODEL liveness check: every model id this codebase hard-codes, checked against its
// provider's live listing.
//
// Why this exists: a retired model id is the one staleness in this stack that fails in
// PRODUCTION rather than in a build. Nothing in the repo references a version of it — the id IS
// the contract — so `npm outdated`, `npm audit`, typecheck and the e2e suite all stay green
// while a real user's generation returns a provider error. The video harness already syncs its
// own catalog (`npm run video:models:sync`); the SPX/Lite/Pro routes are pinned in source
// (PRO_STANDARD_ROUTES, the Lite profile, aiModelCatalog) and had nothing watching them.
//
// It began as a gateway-only check and found `openai/gpt-5.6` dead there. The SECOND dead
// id was in the same file one entry up — the direct-OpenAI suggestion, on a provider the check
// could not see — and only a manual listing call settled it. Hence the provider split below: a
// gap that hid a real defect once is a gap worth closing rather than documenting.
//
// Usage:
//   node scripts/check-model-ids.mjs          # exit 1 if any reachable listing lacks a pinned id
//   node scripts/check-model-ids.mjs --json   # machine-readable report on stdout
//
// KEYS: the Vercel gateway listing and Hugging Face are public and always checked. OpenAI and
// Anthropic need a
// key, read from .env exactly as the bench runners read it. Without one the provider is reported
// UNCHECKED and never counted as ok — "could not check" is not "clean" — but it does not fail
// the run, because the weekly workflow is keyless by design and a permanent red there would just
// train everyone to ignore it (docs/STACK_FRESHNESS.md).
//
// KNOWN BLIND SPOT, measured on Google 2026-08-14: a listing can advertise a model the calling
// key cannot use. `gemini-2.5-flash` and `gemini-2.5-flash-lite` appear in BOTH of Google's
// listings, with no field separating them from live models, and answer 404 "no longer available
// to new users" on a key created after their retirement. A presence check therefore reports OK
// for an id that cannot be called - only a real request can tell, and this script deliberately
// makes none. The product's answer is the error message in api/_lib/aiGateway.ts, not a filter.
//
// Every endpoint used here is a LISTING. No completion is requested, so this spends nothing.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ambientEnv } from './read-dotenv.mjs';
import { measured } from './measured.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Where routes are declared. Tests are excluded: a fixture id is not a route we ship. */
const SEARCH_ROOTS = ['src/ai', 'api/_lib'];
const isSource = (path) => path.endsWith('.ts') && !path.endsWith('.test.ts');

/**
 * Only a literal in ROUTE POSITION counts. A bare `vendor/name` string matches file paths,
 * doc URLs and prose; requiring `model:` or `id:` in front is what keeps this from reporting
 * `meta-llama/llama-4-scout` out of the comment that explains why we do NOT use it.
 */
const ROUTE_LITERAL = /\b(?:model|id):\s*'([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\/[A-Za-z0-9._:-]+)'/g;

/**
 * The picker's own catalog (src/ai/settings.ts `AI_MODELS`), where each entry names its provider
 * explicitly. Read separately from the route scan because THIS is where a non-gateway id can
 * live — a bare `gpt-5.6` has no slash and never matches ROUTE_LITERAL at all.
 */
const CATALOG_ENTRY = /provider:\s*'(anthropic|openai|google|vercel|huggingface)',[\s\S]{0,400}?\bid:\s*'([^']+)'/g;

const walk = (dir) => {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (isSource(path)) out.push(path);
  }
  return out;
};

/** `${provider}\u0000${id}` -> the repo-relative files that pin it. */
const pinned = new Map();
const pin = (provider, id, file) => {
  const key = `${provider}\u0000${id}`;
  if (!pinned.has(key)) pinned.set(key, new Set());
  pinned.get(key).add(file);
};

// settings.ts is deliberately EXCLUDED here and parsed by CATALOG_ENTRY below instead. Its
// entries declare their own provider, and a slashed id is not proof of a gateway route:
// `openai/gpt-oss-120b` is a Hugging Face repo id in one entry and a gateway route in
// another. Scanning it both ways attributed every slashed id to the gateway, which would report
// a Hugging-Face-only model as GONE from a listing it was never in.
const CATALOG_FILE = 'src/ai/settings.ts';
for (const dir of SEARCH_ROOTS) {
  for (const file of walk(resolve(root, dir))) {
    const rel = relative(root, file).replaceAll('\\', '/');
    if (rel === CATALOG_FILE) continue;
    const text = readFileSync(file, 'utf8');
    // Everywhere else in this codebase a slashed id in route position IS a gateway route.
    for (const [, id] of text.matchAll(ROUTE_LITERAL)) pin('vercel', id, rel);
  }
}
{
  const settings = resolve(root, 'src/ai/settings.ts');
  const text = readFileSync(settings, 'utf8');
  for (const [, provider, id] of text.matchAll(CATALOG_ENTRY)) pin(provider, id, 'src/ai/settings.ts');
}

// Both sets above come out of a REGEX over source text, which is the exact way a gate stops
// measuring without saying so: a route literal reformatted past ROUTE_LITERAL, or a catalog entry
// whose provider and id drift more than 400 characters apart, and this check would report a clean
// run over nothing at all.
measured(pinned.size, 'pinned model ids');

/** The ambient environment: .env first, real environment last. See scripts/read-dotenv.mjs. */
const env = ambientEnv(root);

/**
 * One entry per provider: how to list its models, and what a missing key means.
 *
 * `list` returns a Set of live ids, or null when the provider cannot be reached at all. Hugging
 * Face has no listing endpoint worth paging, so it asks about each repo directly — a 404 there
 * is exactly the same evidence a missing id in a listing is.
 */
const PROVIDERS = {
  vercel: {
    label: 'Vercel AI Gateway',
    // Public: the gateway's models listing needs no credential, so this check keeps working
    // in the keyless weekly workflow exactly as the OpenRouter one did.
    keyName: null,
    async list() {
      const res = await fetch('https://ai-gateway.vercel.sh/v1/models');
      if (!res.ok) throw new Error(`vercel ai gateway listing answered ${res.status}`);
      return new Set((await res.json()).data.map((m) => m.id));
    },
  },
  openai: {
    label: 'OpenAI',
    keyName: 'OPENAI_API_KEY',
    async list(key) {
      const res = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } });
      if (!res.ok) throw new Error(`openai listing answered ${res.status}`);
      return new Set((await res.json()).data.map((m) => m.id));
    },
  },
  anthropic: {
    label: 'Anthropic',
    keyName: 'ANTHROPIC_API_KEY',
    async list(key) {
      const res = await fetch('https://api.anthropic.com/v1/models?limit=1000', {
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      });
      if (!res.ok) throw new Error(`anthropic listing answered ${res.status}`);
      return new Set((await res.json()).data.map((m) => m.id));
    },
  },
  google: {
    label: 'Google AI',
    // Google's own docs and SDKs use GEMINI_API_KEY, so a machine set up for Gemini carries it
    // under that name - the same fallback api/_lib/aiCredentials.ts reads.
    keyName: 'GOOGLE_API_KEY',
    keyFallbacks: ['GEMINI_API_KEY'],
    async list(key) {
      // The OpenAI-compatible listing, which is the surface the google adapter posts to - so
      // this checks the ids that route actually accepts. It answers them prefixed `models/`.
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/models', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) throw new Error(`google listing answered ${res.status}`);
      return new Set((await res.json()).data.map((m) => String(m.id).replace(/^models\//, '')));
    },
  },
  huggingface: {
    label: 'Hugging Face',
    keyName: null,
    perId: true,
    async has(id) {
      const res = await fetch(`https://huggingface.co/api/models/${id}`);
      // 401/403 as well as 404: the Hub answers an unauthenticated request for a repo that does
      // not exist with 401 rather than 404, so it does not leak which private names are taken.
      // Measured - a made-up org/model returns 401. Treating only 404 as missing meant a dead id
      // reported UNCHECKED, which is the silent miss this whole script exists to prevent. The
      // three are one answer for our purposes: these are PUBLIC suggestions, so a repo an
      // anonymous request cannot resolve is unusable to the user being offered it.
      if (res.status === 404 || res.status === 401 || res.status === 403) return false;
      if (!res.ok) throw new Error(`huggingface answered ${res.status} for ${id}`);
      return true;
    },
  },
};

const byProvider = new Map();
for (const [key, files] of pinned) {
  const [provider, id] = key.split('\u0000');
  if (!byProvider.has(provider)) byProvider.set(provider, []);
  byProvider.get(provider).push({ id, files: [...files].sort() });
}

const rows = [];
const unchecked = [];
for (const [provider, entries] of [...byProvider.entries()].sort()) {
  const spec = PROVIDERS[provider];
  if (!spec) {
    unchecked.push({ provider, reason: 'no listing configured for this provider', count: entries.length });
    continue;
  }
  const keyNames = spec.keyName ? [spec.keyName, ...(spec.keyFallbacks ?? [])] : [];
  const key = keyNames.map((name) => env[name]).find(Boolean) ?? null;
  if (spec.keyName && !key) {
    unchecked.push({ provider, reason: `${keyNames.join(' / ')} not set`, count: entries.length });
    continue;
  }
  try {
    if (spec.perId) {
      for (const e of entries.sort((a, b) => a.id.localeCompare(b.id))) {
        rows.push({ provider, ...e, live: await spec.has(e.id) });
      }
    } else {
      const live = await spec.list(key);
      for (const e of entries.sort((a, b) => a.id.localeCompare(b.id))) {
        rows.push({ provider, ...e, live: live.has(e.id) });
      }
    }
  } catch (err) {
    // A listing we cannot read is not evidence the routes are fine, but it is also not proof
    // they are broken. Report it as unchecked rather than inventing a verdict either way.
    unchecked.push({ provider, reason: String(err.message ?? err), count: entries.length });
  }
}

const missing = rows.filter((row) => !row.live);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ checked: rows.length, missing, unchecked, rows }, null, 2));
} else {
  for (const row of rows) {
    console.log(`${row.live ? 'ok  ' : 'GONE'} ${PROVIDERS[row.provider].label.padEnd(13)} ${row.id}`);
  }
  console.log(`\n${rows.length} pinned ids checked against a live listing.`);
  if (missing.length) {
    console.log('\nNo longer listed upstream:');
    for (const row of missing) console.log(`  - ${row.id}  (${row.files.join(', ')})`);
  }
  if (unchecked.length) {
    console.log('\nNOT CHECKED (these ids could rot without this script noticing):');
    for (const u of unchecked) {
      console.log(`  - ${PROVIDERS[u.provider]?.label ?? u.provider}: ${u.count} id(s) - ${u.reason}`);
    }
  }
}

// `process.exitCode`, never `process.exit()`: forcing exit while a fetch handle is still closing
// trips a libuv assertion on Windows (`!(handle->flags & UV_HANDLE_CLOSING)`) and the run reports
// 127 instead of the verdict it just computed.
process.exitCode = missing.length ? 1 : 0;
