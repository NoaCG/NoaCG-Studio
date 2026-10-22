#!/usr/bin/env node
// THE PREPARED SAMPLE SENDER (docs/DATA_API.md "A sample sender"; data-sources C5, AC-7).
//
// The acquisition boundary, runnable: an outside source -> this collector -> NoaCG `/patch` ->
// the fields connected to Another system. NoaCG receives normalized values; it never scrapes or
// polls anything itself, and neither does this script: it reads one local file of SYNTHETIC input
// (scripts/fixtures/data-sample/), names its values after the destination fields, and sends them.
//
//   node scripts/data-sample-sender.mjs --example another-system.json --input results-first.json
//
// `--example` is the file the Data view's Another system card downloads ("For the sample
// sender"): the address, the paths and the field each fills. `--input` is what was acquired.
// The key is read from NOACG_DATA_KEY and is never printed. `--dry-run` prints the body and sends
// nothing. A failed acquisition (a missing, unreadable or cut-off file, no records, a value that
// is not text or a number) SENDS NOTHING: the fields keep what they show, rather than being
// replaced by a half-read report. A correction is the same command with the corrected file.

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

/** Names compared case, accents and punctuation aside, in any script (`名前` stays `名前`). */
export const sameName = (name) =>
  String(name)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');

/** Read and check the acquired file. Throws, with the reason, on anything that is not a report. */
export async function acquire(file, read = readFile) {
  let text;
  try {
    text = await read(file, 'utf8');
  } catch (error) {
    throw new Error(`could not read ${file}: ${error.code ?? error.message}`, { cause: error });
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch (error) {
    throw new Error(`${file} is not complete JSON (cut off or damaged)`, { cause: error });
  }
  const records = body?.records;
  if (!records || typeof records !== 'object' || Array.isArray(records) || Object.keys(records).length === 0) {
    throw new Error(`${file} has no records`);
  }
  for (const [name, value] of Object.entries(records)) {
    if (typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value))) {
      throw new Error(`${file}: "${name}" is not text or a number`);
    }
  }
  return { synthetic: body.synthetic === true, records };
}

/**
 * Normalize: each destination takes the record named like its field (or like its path's last
 * segment), as text. Unmatched destinations are not sent, so they keep what they show; records no
 * destination names are reported, never guessed into a field. Two records that read as the same
 * name, or a name that is only punctuation, match nothing: the field is reported, never filled
 * with the other record's value.
 */
export function normalize(example, records) {
  const AMBIGUOUS = { name: null, value: null };
  const byName = new Map();
  for (const [name, value] of Object.entries(records)) {
    const key = sameName(name);
    if (key === '') continue;
    byName.set(key, byName.has(key) ? AMBIGUOUS : { name, value: String(value) });
  }
  const find = (name) => {
    const key = sameName(name);
    return key === '' ? undefined : byName.get(key);
  };
  const patch = {};
  const sent = [];
  const missing = [];
  const used = new Set();
  for (const field of example.fields ?? []) {
    const hit = find(field.label) ?? find(field.path.split('.').pop());
    if (!hit || hit === AMBIGUOUS) {
      missing.push(field.label);
      continue;
    }
    const parts = field.path.split('.');
    let at = patch;
    for (const part of parts.slice(0, -1)) {
      at[part] ??= {};
      at = typeof at[part] === 'object' ? at[part] : null;
      if (!at) break;
    }
    // Two destinations where one path runs through the other cannot both be sent: the first wins.
    if (!at || typeof at[parts[parts.length - 1]] === 'object') {
      missing.push(field.label);
      continue;
    }
    used.add(hit.name);
    at[parts[parts.length - 1]] = hit.value;
    sent.push({ path: field.path, label: field.label, value: hit.value });
  }
  const unused = Object.keys(records).filter((name) => !used.has(name));
  return { patch, sent, missing, unused };
}

/** Send one patch, and say what NoaCG answered: the receipt. */
export async function send(address, key, patch, fetchImpl = fetch) {
  const response = await fetchImpl(address, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

/** The receipt in words. */
export function receipt({ status, body }) {
  if (status !== 200 || body?.ok !== true) return `Refused (${status}): ${body?.error?.message ?? 'no answer'}`;
  if (body.paused) return `Held (${status}): ${body.message}`;
  const writes = body.writes ?? [];
  if (writes.length === 0) return `Received (${status}): no field changed`;
  return `Received (${status}): ${writes.map((w) => `${w.graphic} (${Object.keys(w.applied ?? {}).join(', ')})`).join('; ')}`;
}

function args(argv) {
  const out = { dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--example' || a === '--input' || a === '--address') out[a.slice(2)] = argv[(i += 1)];
    else throw new Error(`unknown argument ${a}`);
  }
  if (!out.example || !out.input) throw new Error('usage: data-sample-sender.mjs --example <another-system.json> --input <report.json> [--address URL] [--dry-run]');
  return out;
}

/** The command. Answers the exit code; `log` and `env` are the process's unless a test hands them in. */
export async function main(argv, { log = console.log, env = process.env, fetchImpl = fetch } = {}) {
  let opts;
  let example;
  try {
    opts = args(argv);
    example = JSON.parse(await readFile(opts.example, 'utf8'));
  } catch (error) {
    log(`Cannot start: ${error.message}`);
    return 2;
  }
  let acquired;
  try {
    acquired = await acquire(opts.input);
  } catch (error) {
    log(`Acquisition failed: ${error.message}. Nothing was sent; the fields keep what they show.`);
    return 1;
  }
  const { patch, sent, missing, unused } = normalize(example, acquired.records);
  log(`${acquired.synthetic ? 'Synthetic input' : 'Input'}: ${Object.keys(acquired.records).length} records, ${sent.length} matched.`);
  for (const s of sent) log(`  ${s.label} -> ${s.path} = ${s.value}`);
  if (missing.length > 0) log(`  Not in this report, kept as shown: ${missing.join(', ')}`);
  if (unused.length > 0) log(`  Not connected to a field, not sent: ${unused.join(', ')}`);
  if (sent.length === 0) {
    log('Nothing matched a connected field. Nothing was sent.');
    return 1;
  }
  if (opts.dryRun) {
    log(JSON.stringify(patch, null, 2));
    return 0;
  }
  const key = env.NOACG_DATA_KEY;
  if (!key) {
    log('Set NOACG_DATA_KEY to the production’s data key (Data, Another system, Reveal). Nothing was sent.');
    return 2;
  }
  const address = opts.address ?? example.address;
  let answer;
  try {
    answer = await send(address, key, patch, fetchImpl);
  } catch (error) {
    log(`Could not reach ${address}: ${error.message}`);
    return 1;
  }
  log(receipt(answer));
  return answer.status === 200 && answer.body?.ok === true ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main(process.argv.slice(2));
}
