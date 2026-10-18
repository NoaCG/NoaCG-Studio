#!/usr/bin/env node
// THE NIGHTLY FEEDBACK DIGEST - feedback goes to the owner, instead of waiting for a visit.
//
// WHY THIS EXISTS. Feedback needs to reach the owner (docs/ADMIN.md §10). The owner's ruling
// on 2026-08-26 was blunt: "I will not remember to go to the admin page." Feedback that a person
// bothered to write and nobody reads is worse than having no feedback button at all, because the
// button teaches users that telling us something is pointless. So the inbox stops being a place
// somebody has to visit and becomes a thing that arrives.
//
// It does not replace the inbox. Triage - `new` / `reviewed` / `resolved`, the internal note, the
// audit trail - belongs to private operator sessions; this script is read-only.
// The digest is a copy of what came in, addressed to the one person who has to know.
//
// WHAT IT MAY TOUCH. One SELECT against `public.user_feedback` with the service key. There is no
// code path here that writes, updates or deletes anything: the table's own grants already refuse
// a delete (migration 0028), and this script never even asks. A digest is a reader.
//
// PRIVACY, AND THE REASON THE JOB LOG IS ALMOST EMPTY. This repository is PUBLIC, and an Actions
// log is public with it. `user_feedback.message` is the one free-text column in the product's
// server-side data - somebody's own words, sometimes about a thing that went wrong for them. It
// goes in the EMAIL and nowhere else. The job log gets counts, and counts are all it can ever
// get: `logLine()` below is built from the summary object, which has no message field to leak.
// The only rendering that reaches a log is `--dry-run`, and dry-run never opens a socket - it
// renders FIXTURES, which are made-up rows written into this file.
//
// FAIL CLOSED, AND NEVER RED FOR A MISSING SECRET. Until the two secrets exist the workflow has
// nothing to do, and a repository that goes red every night for a configuration step nobody has
// taken yet trains its owner to ignore red. `readSecrets()` reports what is missing and the
// caller exits 0 with a notice. Anything else - a Supabase error, an SMTP refusal - is a real
// failure and fails loudly, because at that point somebody IS relying on the mail arriving.
//
// THE COUNT MODE, AND WHY IT IS THE ONE THAT ACTUALLY RUNS. The mail half is parked - it wants a
// Gmail app password nobody has had five minutes for - so the standing reminder moved to a WEEKLY
// ROUTINE in Claude Code (docs/ROUTINES.md), which runs `--count` against the local .env and reads
// the numbers out in chat. That mode needs no SMTP secret and it never asks the database for the
// message column at all: COUNT_SELECT_COLUMNS has no `message` in it, and the one fact it wants
// about written notes - how many there are - comes back as a PostgREST row count with zero rows
// attached. So there is no code path in `--count` that could print somebody's words even if the
// printing were rewritten carelessly, which is a stronger promise than `logLine()` makes.
//
// Usage:
//   node scripts/feedback-digest.mjs            # read, render, send (needs the secrets)
//   node scripts/feedback-digest.mjs --count    # counts only, to stdout (needs only the DB pair)
//   node scripts/feedback-digest.mjs --dry-run  # render FIXTURE rows to stdout, no network
//
// Environment:
//   SUPABASE_URL                the project URL
//   SUPABASE_SERVICE_ROLE_KEY   service key, read-only use (SUPABASE_SECRET_KEY also accepted)
//   FEEDBACK_DIGEST_SMTP_USER   the Gmail account the mail is sent FROM
//   FEEDBACK_DIGEST_SMTP_PASS   a Gmail APP PASSWORD, never the account password
//   FEEDBACK_DIGEST_TO          recipient (default contact.noacg@gmail.com)
//   FEEDBACK_DIGEST_WINDOW_HOURS  how far back to look (default 26)
//   NOACG_APP_URL               legacy setting accepted for existing callers

import { connect as tlsConnect } from 'node:tls';
import { fileURLToPath } from 'node:url';

import { ambientEnv } from './read-dotenv.mjs';

export const DEFAULT_RECIPIENT = 'contact.noacg@gmail.com';
export const DEFAULT_APP_URL = 'https://noacg.studio';

// 26 hours against a daily cron, for the same reason nightly-drift uses 26: GitHub delays
// scheduled runs under load and can drop one outright. The overlap means a row can appear in two
// consecutive digests, and that is the trade taken on purpose - a repeated paragraph costs the
// reader two seconds, and a missed one is the failure this whole script exists to prevent.
export const DEFAULT_WINDOW_HOURS = 26;

// A Gmail send is one message; there is no pagination story worth writing for a product with
// single-digit feedback per day. If a burst ever exceeds this the digest says so out loud rather
// than silently showing the first hundred.
export const ROW_LIMIT = 200;

// A week, because the routine that calls `--count` runs weekly and a count that does not cover
// the whole gap between two readings is a count of the wrong thing.
export const COUNT_WINDOW_HOURS = 168;

/** The columns the digest reads. Named explicitly so adding a column to the table never widens
 *  what an email carries by accident. `user_id` is NOT among them: the digest reports whether a
 *  note came from an account, never which one - resolving an address belongs to a private operator session. */
export const SELECT_COLUMNS = [
  'id',
  'created_at',
  'kind',
  'sentiment',
  'reasons',
  'message',
  'area',
  'tier',
  'model',
  'variant_id',
  'intent_kind',
  'status',
];

/** What `--count` reads. It is SELECT_COLUMNS minus `message`, and the subtraction is the whole
 *  point: a mode whose output is numbers should not be holding anybody's sentence in memory to
 *  begin with. Everything left is either a timestamp or a value out of a closed vocabulary
 *  (`src/feedback/contract.ts`), so no row read here can carry free text. */
export const COUNT_SELECT_COLUMNS = SELECT_COLUMNS.filter((column) => column !== 'message');

/** Made-up rows, used by --dry-run only. Their whole purpose is to be safe to print in a public
 *  log, so nothing here is real feedback and the messages say so. */
export const FIXTURE_ROWS = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    created_at: '2026-08-26T09:14:00.000Z',
    kind: 'generation',
    sentiment: 'negative',
    reasons: ['hard-to-read', 'wrong-layout'],
    message: 'FIXTURE ROW, not real feedback. The score sat on top of the team name at 1080p.',
    area: 'wizard',
    tier: 'lite',
    model: 'example-model-id',
    variant_id: 'sb-04',
    intent_kind: 'scoreboard',
    status: 'new',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    created_at: '2026-08-26T14:02:00.000Z',
    kind: 'beta',
    sentiment: 'negative',
    reasons: ['export-problem'],
    message: 'FIXTURE ROW, not real feedback. CasparCG export named the folder twice.',
    area: 'export',
    tier: null,
    model: null,
    variant_id: null,
    intent_kind: null,
    status: 'new',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    created_at: '2026-08-26T18:40:00.000Z',
    kind: 'generation',
    sentiment: 'positive',
    reasons: [],
    message: '',
    area: 'wizard',
    tier: 'pro',
    model: null,
    variant_id: null,
    intent_kind: 'lower-third',
    status: 'new',
  },
];

// -- configuration -------------------------------------------------------------------------

/**
 * What the run has, and what it is missing. Returns `missing` rather than throwing, because a
 * missing secret is the ordinary state of this workflow before somebody has configured it and
 * must not look like a fault.
 */
export function readSecrets(env = process.env, { defaultWindowHours = DEFAULT_WINDOW_HOURS } = {}) {
  const url = (env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const key = (env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY ?? '').trim();
  const smtpUser = (env.FEEDBACK_DIGEST_SMTP_USER ?? '').trim();
  const smtpPass = (env.FEEDBACK_DIGEST_SMTP_PASS ?? '').trim();
  const to = (env.FEEDBACK_DIGEST_TO ?? '').trim() || DEFAULT_RECIPIENT;
  const appUrl = (env.NOACG_APP_URL ?? '').trim().replace(/\/+$/, '') || DEFAULT_APP_URL;

  const parsedWindow = Number.parseFloat(env.FEEDBACK_DIGEST_WINDOW_HOURS ?? '');
  const windowHours =
    Number.isFinite(parsedWindow) && parsedWindow > 0 ? parsedWindow : defaultWindowHours;

  const missing = [];
  if (!url) missing.push('SUPABASE_URL');
  if (!key) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  // The database pair alone is what a READ needs. `--count` never sends anything, so the SMTP
  // pair being absent must not stop it - that is the whole reason the parked mail half does not
  // park the weekly reminder with it.
  const missingForRead = [...missing];
  if (!smtpUser) missing.push('FEEDBACK_DIGEST_SMTP_USER');
  if (!smtpPass) missing.push('FEEDBACK_DIGEST_SMTP_PASS');

  return { url, key, smtpUser, smtpPass, to, appUrl, windowHours, missing, missingForRead };
}

// -- reading -------------------------------------------------------------------------------

/** The read-only REST call. GET, and only GET. */
export async function fetchRows({
  url,
  key,
  since,
  limit = ROW_LIMIT,
  columns = SELECT_COLUMNS,
  fetchImpl = fetch,
}) {
  const query = new URLSearchParams({
    select: columns.join(','),
    created_at: `gte.${since}`,
    order: 'created_at.desc',
    limit: String(limit),
  });
  const response = await fetchImpl(`${url}/rest/v1/user_feedback?${query}`, {
    method: 'GET',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      accept: 'application/json',
    },
  });
  if (!response.ok) {
    // The body of a PostgREST error names the table and the failing clause, never a row - so it
    // is safe in a public log, and it is the only thing that makes a broken query diagnosable.
    const detail = await response.text().catch(() => '');
    throw new Error(
      `Supabase read failed: ${response.status} ${response.statusText} ${detail}`.trim(),
    );
  }
  const rows = await response.json();
  if (!Array.isArray(rows)) {
    throw new Error('Supabase read returned something other than a list of rows.');
  }
  return rows;
}

/**
 * How many rows match, WITHOUT reading any of them. PostgREST answers a `count=exact` request
 * with the total in the `content-range` header and a body of zero rows, which is exactly the
 * shape `--count` wants for the one question it cannot answer from the columns it reads: how
 * many people wrote something. `message=neq.` filters on the empty string, because the write
 * path stores `''` for "no note" and never null (`api/_lib/feedbackStore.ts`).
 */
export async function fetchCount({ url, key, since, filter = {}, fetchImpl = fetch }) {
  const query = new URLSearchParams({
    select: 'id',
    created_at: `gte.${since}`,
    limit: '0',
    ...filter,
  });
  const response = await fetchImpl(`${url}/rest/v1/user_feedback?${query}`, {
    method: 'GET',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      accept: 'application/json',
      prefer: 'count=exact',
      range: '0-0',
    },
  });
  if (!response.ok && response.status !== 206) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `Supabase count failed: ${response.status} ${response.statusText} ${detail}`.trim(),
    );
  }
  // "*/6" - the part after the slash is the total. A missing header means the server did not
  // honour the preference, and guessing a number there would be worse than saying so.
  const range = response.headers.get('content-range') ?? '';
  const total = Number.parseInt(range.split('/')[1] ?? '', 10);
  if (!Number.isFinite(total)) {
    throw new Error(`Supabase count returned no usable content-range (got "${range}").`);
  }
  return total;
}

// -- shaping -------------------------------------------------------------------------------

/** Most negative first, then newest first, matching the inbox rule in docs/ADMIN.md §10: three
 *  complaints must not be buried under thirty compliments. */
export function sortForInbox(rows) {
  const rank = (row) => (row.sentiment === 'negative' ? 0 : 1);
  return [...rows].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return String(b.created_at).localeCompare(String(a.created_at));
  });
}

export function summarize(rows) {
  const negative = rows.filter((row) => row.sentiment === 'negative').length;
  const withMessage = rows.filter((row) => (row.message ?? '').trim().length > 0).length;
  const reasons = new Map();
  for (const row of rows) {
    for (const reason of row.reasons ?? []) reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  return {
    total: rows.length,
    negative,
    positive: rows.length - negative,
    withMessage,
    beta: rows.filter((row) => row.kind === 'beta').length,
    generation: rows.filter((row) => row.kind === 'generation').length,
    topReasons: [...reasons.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  };
}

/** The ONLY thing a real run is allowed to print. Built from the summary, which has no message
 *  field - so this cannot leak a person's words even if somebody edits it carelessly later. */
export function logLine(summary) {
  return `feedback digest: ${summary.total} row(s), ${summary.negative} negative, ${summary.positive} positive, ${summary.withMessage} with a written note`;
}

export function subjectFor(summary) {
  if (summary.total === 0) return 'NoaCG feedback: nothing new';
  const plural = summary.total === 1 ? '' : 's';
  return `NoaCG feedback: ${summary.total} note${plural}, ${summary.negative} negative`;
}

function formatWhen(value) {
  // A fixed, unambiguous rendering. No locale, no relative time: the reader is one person in one
  // timezone reading a mail that may arrive late, and "yesterday" is a lie by the time it lands.
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return `${parsed.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function contextLine(row) {
  const bits = [];
  if (row.kind) bits.push(row.kind);
  if (row.area) bits.push(`area ${row.area}`);
  if (row.tier) bits.push(`tier ${row.tier}`);
  if (row.model) bits.push(`model ${row.model}`);
  if (row.variant_id) bits.push(`variant ${row.variant_id}`);
  if (row.intent_kind) bits.push(`intent ${row.intent_kind}`);
  return bits.join(', ');
}

/**
 * The mail body. Plain text on purpose: it has to be readable on a phone lock screen at a glance,
 * and HTML mail buys nothing a list of paragraphs does not already have.
 */
export function renderDigest({ rows, since, until, windowHours }) {
  const summary = summarize(rows);
  const lines = [];

  lines.push(
    summary.total === 0
      ? 'No feedback arrived in this window.'
      : `${summary.total} piece(s) of feedback: ${summary.negative} negative, ${summary.positive} positive.`,
  );
  lines.push(`Window: ${formatWhen(since)} to ${formatWhen(until)} (last ${windowHours} hours).`);
  if (summary.total > 0) {
    lines.push(
      `Kinds: ${summary.generation} generation rating(s), ${summary.beta} beta note(s).`,
    );
    if (summary.topReasons.length > 0) {
      lines.push(
        `Reasons given: ${summary.topReasons.map(([id, n]) => `${id} x${n}`).join(', ')}`,
      );
    }
  }
  lines.push('');
  lines.push('Inspect and triage feedback in a private operator session (docs/ADMIN.md section 10).');

  if (rows.length >= ROW_LIMIT) {
    lines.push('');
    lines.push(
      `NOTE: this digest hit its ${ROW_LIMIT}-row limit, so there may be more. Inspect the backlog in a private operator session.`,
    );
  }

  if (summary.total > 0) {
    lines.push('');
    lines.push('Most negative first, newest first within that.');
    for (const row of sortForInbox(rows)) {
      lines.push('');
      lines.push('----------------------------------------------------------------------');
      const mark = row.sentiment === 'negative' ? 'NEGATIVE' : 'positive';
      lines.push(`${mark}  ${formatWhen(row.created_at)}`);
      const context = contextLine(row);
      if (context) lines.push(context);
      if ((row.reasons ?? []).length > 0) lines.push(`reasons: ${row.reasons.join(', ')}`);
      const message = (row.message ?? '').trim();
      if (message) {
        lines.push('');
        lines.push(message);
      } else {
        lines.push('(no written note)');
      }
    }
  }

  return { subject: subjectFor(summary), text: `${lines.join('\n')}\n`, summary };
}

/**
 * The whole output of `--count`, and every line of it is a number or a closed vocabulary value.
 * Written as a list rather than printed inline so a test can assert on it directly - the promise
 * that this mode prints no free text is only worth as much as the thing checking it.
 */
export function countLines({ summary, windowHours, capped = false }) {
  const days = Math.round(windowHours / 24);
  const lines = [];

  if (summary.total === 0) {
    lines.push(`No feedback in the last ${windowHours} hours (${days} day(s)). Nothing to open.`);
    return lines;
  }

  lines.push(
    `${summary.total} piece(s) of feedback in the last ${windowHours} hours (${days} day(s)): ` +
      `${summary.negative} negative, ${summary.positive} positive.`,
  );
  lines.push(
    `${summary.withMessage} with a written note, ${summary.untriaged} still at status "new".`,
  );
  lines.push(`Kinds: ${summary.generation} generation rating(s), ${summary.beta} beta note(s).`);
  if (summary.topReasons.length > 0) {
    lines.push(`Reasons given: ${summary.topReasons.map(([id, n]) => `${id} x${n}`).join(', ')}`);
  }
  if (capped) {
    lines.push(
      `NOTE: the breakdown above was built from the newest ${ROW_LIMIT} rows; the totals are exact.`,
    );
  }
  lines.push('Inspect written feedback in a private operator session (docs/ADMIN.md section 10).');
  return lines;
}

/** The counting run. Two requests: the narrow rows for the breakdown, one count for the notes. */
export async function runCount({ url, key, since, appUrl, windowHours, fetchImpl = fetch }) {
  const [rows, withMessage] = await Promise.all([
    fetchRows({ url, key, since, columns: COUNT_SELECT_COLUMNS, fetchImpl }),
    fetchCount({ url, key, since, filter: { message: 'neq.' }, fetchImpl }),
  ]);
  const summary = {
    ...summarize(rows),
    withMessage,
    untriaged: rows.filter((row) => row.status === 'new').length,
  };
  return { summary, lines: countLines({ summary, windowHours, appUrl, capped: rows.length >= ROW_LIMIT }) };
}

// -- the mail itself -----------------------------------------------------------------------

/** RFC 2047 for a header that is not pure ASCII. Feedback is written by people, and people write
 *  in their own alphabet; a raw non-ASCII byte in a Subject is what turns a digest into mojibake. */
export function encodeHeaderValue(value) {
  if (!/[^\x20-\x7e]/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

/** SMTP forbids a line over 1000 octets including CRLF. A 2000-character paragraph with no
 *  newline in it is one line, and refusing to wrap it would mean the mail is rejected rather than
 *  the paragraph being ugly. Wrapping at a space where there is one, hard otherwise. */
export function wrapLongLines(text, limit = 900) {
  const out = [];
  for (const line of text.split('\n')) {
    let rest = line;
    while (Buffer.byteLength(rest, 'utf8') > limit) {
      let cut = limit;
      while (cut > 0 && Buffer.byteLength(rest.slice(0, cut), 'utf8') > limit) cut -= 1;
      const space = rest.lastIndexOf(' ', cut);
      const useSpace = space > limit / 2;
      const at = useSpace ? space : cut;
      out.push(rest.slice(0, at));
      rest = rest.slice(useSpace ? at + 1 : at);
    }
    out.push(rest);
  }
  return out.join('\n');
}

/** A line of body text that begins with a dot would end the DATA command. */
export function dotStuff(body) {
  return body
    .split('\n')
    .map((line) => (line.startsWith('.') ? `.${line}` : line))
    .join('\r\n');
}

export function buildMessage({ from, to, subject, text, date, messageId }) {
  const headers = [
    `From: NoaCG feedback <${from}>`,
    `To: <${to}>`,
    `Subject: ${encodeHeaderValue(subject)}`,
    `Date: ${date}`,
    `Message-ID: <${messageId}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    // A digest is a notification, not correspondence. Nothing here should be auto-replied to, and
    // nothing here should start a bounce loop.
    'Auto-Submitted: auto-generated',
  ];
  return `${headers.join('\r\n')}\r\n\r\n${dotStuff(wrapLongLines(text))}`;
}

/**
 * A single-message SMTP client over implicit TLS (Gmail, port 465).
 *
 * Written out rather than pulled in: this holds an app password for the address users write to,
 * it runs in CI with the repository's secrets in the environment, and one file of protocol we can
 * read end to end is a better trade than a dependency tree we cannot. The protocol used here is
 * six commands and has not changed in thirty years.
 */
export async function sendMail({ host = 'smtp.gmail.com', port = 465, user, pass, from, to, raw }) {
  return new Promise((resolve, reject) => {
    const socket = tlsConnect({ host, port, servername: host });
    socket.setEncoding('utf8');
    socket.setTimeout(30_000);

    // Each step is [what to send, which reply code proves it worked]. The password is in this
    // list; nothing here prints what it sends.
    const steps = [
      [null, '220'],
      ['EHLO noacg-feedback-digest', '250'],
      ['AUTH LOGIN', '334'],
      [Buffer.from(user, 'utf8').toString('base64'), '334'],
      [Buffer.from(pass, 'utf8').toString('base64'), '235'],
      [`MAIL FROM:<${from}>`, '250'],
      [`RCPT TO:<${to}>`, '250'],
      ['DATA', '354'],
      [`${raw}\r\n.`, '250'],
      ['QUIT', '221'],
    ];

    let step = 0;
    let buffer = '';
    let settled = false;

    const fail = (message) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new Error(message));
    };

    const advance = () => {
      step += 1;
      if (step >= steps.length) {
        settled = true;
        socket.end();
        resolve();
        return;
      }
      socket.write(`${steps[step][0]}\r\n`);
    };

    socket.on('timeout', () => fail('SMTP timed out.'));
    socket.on('error', (error) => fail(`SMTP socket error: ${error.message}`));

    socket.on('data', (chunk) => {
      buffer += chunk;
      // A reply may be multi-line; the last line has a space rather than a hyphen after the code.
      let match;
      while ((match = /^(\d{3})([ -])([^\n]*)\n/.exec(buffer))) {
        buffer = buffer.slice(match[0].length);
        if (match[2] === '-') continue;
        if (settled) return;
        const expected = steps[step][1];
        if (!match[1].startsWith(expected)) {
          // Report the CODE and the server's own words. Neither can contain the feedback: the
          // body has not been sent yet at every step that can realistically fail, and the one
          // that has (the final 250) is not an error path.
          fail(`SMTP step ${step} expected ${expected}, got ${match[1]} ${match[3]}`);
          return;
        }
        advance();
      }
    });
  });
}

// -- the run -------------------------------------------------------------------------------

export async function main(argv = process.argv.slice(2), env = process.env) {
  const dryRun = argv.includes('--dry-run');
  const countOnly = argv.includes('--count');
  const secrets = readSecrets(
    env,
    countOnly ? { defaultWindowHours: COUNT_WINDOW_HOURS } : undefined,
  );
  const until = new Date();
  const since = new Date(until.getTime() - secrets.windowHours * 3_600_000);

  if (dryRun) {
    // FIXTURES ONLY. This is the one mode that prints a rendered digest, and it must stay unable
    // to reach the database: no row is read, no socket is opened, and the rows are written into
    // this file. That is what makes it safe in a public job log.
    const digest = renderDigest({
      rows: FIXTURE_ROWS,
      since: since.toISOString(),
      until: until.toISOString(),
      windowHours: secrets.windowHours,
      appUrl: secrets.appUrl,
    });
    console.log('DRY RUN - fixture rows, no database, no mail sent.\n');
    console.log(`Subject: ${digest.subject}`);
    console.log('');
    console.log(digest.text);
    return 0;
  }

  if (countOnly) {
    // Counts only, and this is the mode a person reads in chat rather than in a log. A missing
    // database pair here IS a fault worth stopping for: unlike the scheduled mail job, somebody
    // asked for this number just now and a green silence would answer the wrong question.
    if (secrets.missingForRead.length > 0) {
      throw new Error(
        `Cannot count: missing ${secrets.missingForRead.join(', ')}. The pair lives in .env.`,
      );
    }
    const { lines } = await runCount({
      url: secrets.url,
      key: secrets.key,
      since: since.toISOString(),
      appUrl: secrets.appUrl,
      windowHours: secrets.windowHours,
    });
    for (const line of lines) console.log(line);
    return 0;
  }

  if (secrets.missing.length > 0) {
    // Neutral, not red. See the header.
    console.log(
      `::notice title=Feedback digest is inert::Not configured yet - missing ${secrets.missing.join(', ')}. Nothing was read and nothing was sent.`,
    );
    return 0;
  }

  const rows = await fetchRows({ url: secrets.url, key: secrets.key, since: since.toISOString() });
  const digest = renderDigest({
    rows,
    since: since.toISOString(),
    until: until.toISOString(),
    windowHours: secrets.windowHours,
    appUrl: secrets.appUrl,
  });
  console.log(logLine(digest.summary));

  if (digest.summary.total === 0) {
    // Silence is the correct report for an empty window. A nightly "nothing happened" mail is
    // the fastest way to teach somebody to filter this address into a folder they never open.
    console.log('Nothing to send.');
    return 0;
  }

  const raw = buildMessage({
    from: secrets.smtpUser,
    to: secrets.to,
    subject: digest.subject,
    text: digest.text,
    date: until.toUTCString(),
    messageId: `${until.getTime()}.feedback-digest@noacg.studio`,
  });
  await sendMail({
    user: secrets.smtpUser,
    pass: secrets.smtpPass,
    from: secrets.smtpUser,
    to: secrets.to,
    raw,
  });
  console.log(`Sent to ${secrets.to}.`);
  return 0;
}

// Only when run directly, so the test file can import the pieces above.
const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href;
if (invokedDirectly) {
  // The file first, the real environment last (scripts/read-dotenv.mjs). In Actions there is no
  // .env and this is exactly `process.env`; on a laptop it is what makes `--count` work with no
  // configuration beyond the .env the checkout already has. A linked worktree with no .env of its
  // own reads the main checkout's, so the answer does not depend on which window you typed in.
  const env = ambientEnv(fileURLToPath(new URL('..', import.meta.url)));
  // `exitCode` rather than `process.exit()`: exiting the instant the promise settles tears the
  // event loop down while undici still holds the keep-alive socket, and Node aborts with a libuv
  // assertion instead of the code we asked for. Letting the loop drain costs a second and always
  // reports the truth.
  main(process.argv.slice(2), env).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(`::error title=Feedback digest failed::${error.message}`);
      process.exitCode = 1;
    },
  );
}
