#!/usr/bin/env node
// Apply this repository's pending migrations to the hosted project, WITHOUT a human in the loop -
// unless a statement can actually lose something, in which case stop and say exactly what.
//
// WHY THIS EXISTS. The rule used to be "a production migration needs the user, in that message".
// That rule protected nothing. On 2026-08-25 `0051_client_table_grants.sql` sat applied-on-main and
// unapplied-on-production for hours; nothing anywhere said so, and `supabase/README.md` had already
// written down what a ledger out of step costs: it is silent until the NEXT push, which then finds
// several files pending, re-runs them against the live database, and fails partway through because
// `create policy` and `create trigger` have no `if not exists`. So the delay was not caution. It
// was the mechanism by which a small, safe change turned into a compound one.
//
// A rule whose only justification is "ask me first" is a missing mechanism. This is the mechanism.
// What a human was actually being asked for is a judgement about RISK, so that judgement is made
// here, on the statements themselves, and the human is spent only on the cases where it is real.
//
// WHAT IT WILL DO ON ITS OWN. Grants, policies, additive columns/tables/indexes, functions,
// triggers, comments, backfills - anything whose failure mode is "the transaction rolls back and
// nothing changed".
//
// WHAT IT REFUSES, reporting instead of applying: DROP of any object, TRUNCATE, DELETE FROM, an
// ALTER COLUMN ... TYPE, a RENAME, DISABLE ROW LEVEL SECURITY, ALTER ... OWNER TO, ALTER DATABASE,
// and a REVOKE from a role on an object this same migration did not create. It also refuses any
// statement it does not recognise at all - a guard that has to be right when nobody is watching
// fails CLOSED, and `scripts/db-push.test.mjs` keeps the recognised set honest by classifying every
// migration in the repo.
//
// AND IT REFUSES A MIGRATION FROM 0068 ON THAT DOES NOT SET ITS OWN `lock_timeout` (at most 5 s) AND
// `statement_timeout` before its first statement, so no migration can queue a live show's Takes
// behind a lock (FIRST_TIMED_MIGRATION says why the file, and not this script, has to set them). A
// push that fails on that lock timeout (SQLSTATE 55P03) is retried twice, then reported as what it
// is: nothing in that file applied, and the next landing tries again.
//
// Overriding is per-version and explicit: `--allow 0052` says "I read 0052 and I accept what it
// does". There is no blanket override, because a blanket override is the old rule again.
//
// A LIVE-PATH MIGRATION WAITS FOR A QUIET WINDOW. One that touches the contract renderers and
// operator pages hold open for hours (LIVE_PATH_PREFIX says what that is) applies on its own only
// when no renderer sent a heartbeat in the last ten minutes. Otherwise the files before it apply,
// it and everything after it are HELD, and the next landing tries again; `--live 0068` applies it
// at once, after printing who is live. A hold is not a failure (exit 0 with a warning) until it is
// a day old; then it exits 1, so the post-land run goes red and a person sees it.
//
// WHAT IT IS NOT, stated so nobody reads more into a green run than is there. This guard is about
// LOSS, not about EXPOSURE. A migration that grants a client role new reach, or replaces a
// SECURITY DEFINER function's body, or adds a permissive policy, is applied without comment - those
// are product decisions written in SQL, and refusing every one of them would make the override
// routine, which is how a guard stops meaning anything. Exposure has its own guards, offline and in
// the build: `scripts/client-grants-migration.test.mjs` (a policy that admits a role no migration
// granted), `scripts/definer-grants.test.mjs` (a definer function that ships with the bootstrap's
// EXECUTE grant), and `npm run check:advisors` against the live project. A `select some_function()`
// is likewise taken at face value; what a function does when called is not visible in the statement
// that calls it.
//
// It also refuses to push onto a DRIFTED ledger. `supabase db push` keys each migration by the
// four-digit version in its filename; an MCP `apply_migration` or an SQL-editor paste records a
// generated timestamp instead, and the damage stays invisible until the next push (supabase/AGENTS.md).
// A remote version that is not four digits, or a remote version with no file on disk, stops
// everything here rather than at the half-applied point.
//
// PROOF, NOT ASSERTION. It snapshots the grant matrix, the columns, the policies and the ledger
// BEFORE and AFTER, and prints the difference. "Applied cleanly" is the CLI's opinion; the diff is
// the evidence. For a grants-only migration the expected diff is a specific set of privileges and
// exactly one ledger row - anything else is a finding.
//
//   npm run db:push                  # plan, refuse if anything is dangerous, otherwise apply
//   npm run db:push -- --dry-run     # plan and snapshot only; never writes
//   npm run db:push -- --allow 0052  # apply, accepting 0052's dangerous statements by name
//   npm run db:push -- --live 0068   # apply live-path 0068 now, even with a production live
//   npm run db:push -- --json        # one JSON object, for a caller that wants the plan
//   npm run db:push -- --ref <ref>   # a DIFFERENT project: staging, rather than production
//
// The target is the project `VITE_SUPABASE_URL` names - deliberately NOT the Supabase CLI's own
// link state, which is per-checkout and untracked, so a worktree linked to staging cannot make this
// quietly answer about the wrong database. `--ref` names another project outright, and
// `SUPABASE_PROJECT_REF` does the same through the environment (the escape hatch
// scripts/supabase-advisors.mjs offers). The FLAG exists because the environment form is not
// portable: `VAR=x npm run …` is a shell-ism PowerShell does not have, and the machine this runs
// on is a Windows laptop - so a refusal that tells a person how to re-run it by hand has to print
// something they can paste.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ambientEnv } from './read-dotenv.mjs';
import { productionRef } from './supabase-projects.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = resolve(ROOT, 'supabase/migrations');
const API_TIMEOUT_MS = 30_000;

// ── Lexing ───────────────────────────────────────────────────────────────────────────────────────

/**
 * Split a migration into statements, respecting everything in PostgreSQL that can contain a
 * semicolon: line comments, NESTED block comments, single-quoted strings (with `''` and, after an
 * `E` prefix, backslash escapes), quoted identifiers, and dollar-quoted bodies with arbitrary tags.
 *
 * A naive `text.split(';')` would cut every `do $$ ... ; ... $$` block into pieces and then classify
 * the pieces, which is the one way this guard could report "safe" about a statement it never saw
 * whole. Each statement is returned with its 1-based index and its source line, so a refusal can
 * point at the file.
 */
export function splitStatements(text) {
  const statements = [];
  let start = 0;
  let line = 1;
  let startLine = 1;
  let i = 0;

  const push = (end) => {
    const raw = text.slice(start, end);
    if (raw.trim()) statements.push({ raw, index: statements.length + 1, line: startLine });
    start = end + 1;
    startLine = line;
  };

  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '\n') {
      line++;
      if (start === i) startLine = line; // leading blank lines belong to the next statement
      i++;
      continue;
    }

    if (ch === '-' && next === '-') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }

    if (ch === '/' && next === '*') {
      let depth = 1;
      i += 2;
      while (i < text.length && depth > 0) {
        if (text[i] === '/' && text[i + 1] === '*') { depth++; i += 2; continue; }
        if (text[i] === '*' && text[i + 1] === '/') { depth--; i += 2; continue; }
        if (text[i] === '\n') line++;
        i++;
      }
      continue;
    }

    if (ch === "'") {
      const escaped = /[eE]$/.test(text.slice(Math.max(0, i - 1), i));
      i++;
      while (i < text.length) {
        if (text[i] === '\n') line++;
        if (escaped && text[i] === '\\') { i += 2; continue; }
        if (text[i] === "'") {
          if (text[i + 1] === "'") { i += 2; continue; }
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    if (ch === '"') {
      i++;
      while (i < text.length) {
        if (text[i] === '\n') line++;
        if (text[i] === '"') {
          if (text[i + 1] === '"') { i += 2; continue; }
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    if (ch === '$') {
      const tag = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(text.slice(i));
      // `$1` in a plpgsql body and `$` in an operator are not dollar quotes; only a complete
      // `$tag$` opens one, and the same tag closes it.
      if (tag) {
        const close = text.indexOf(tag[0], i + tag[0].length);
        const end = close === -1 ? text.length : close + tag[0].length;
        line += (text.slice(i, end).match(/\n/g) || []).length;
        i = end;
        continue;
      }
    }

    if (ch === ';') {
      push(i);
      i++;
      continue;
    }

    i++;
  }
  push(text.length);
  return statements;
}

/**
 * A statement reduced to what the rules may look at: comments gone, string and identifier contents
 * blanked, whitespace collapsed, lowercased. Dollar-quoted bodies are lifted OUT into `bodies`
 * rather than blanked, because a `do $$ begin drop table x; end $$` executes its body and a trigger
 * function's body executes later - both have to be scanned, and neither is visible in `code`.
 */
export function normalize(raw) {
  let code = '';
  const bodies = [];
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    const next = raw[i + 1];

    if (ch === '-' && next === '-') {
      while (i < raw.length && raw[i] !== '\n') i++;
      code += ' ';
      continue;
    }
    if (ch === '/' && next === '*') {
      let depth = 1;
      i += 2;
      while (i < raw.length && depth > 0) {
        if (raw[i] === '/' && raw[i + 1] === '*') { depth++; i += 2; continue; }
        if (raw[i] === '*' && raw[i + 1] === '/') { depth--; i += 2; continue; }
        i++;
      }
      code += ' ';
      continue;
    }
    if (ch === "'") {
      const escaped = /[eE]$/.test(code);
      i++;
      while (i < raw.length) {
        if (escaped && raw[i] === '\\') { i += 2; continue; }
        if (raw[i] === "'") {
          if (raw[i + 1] === "'") { i += 2; continue; }
          i++;
          break;
        }
        i++;
      }
      code += "''";
      continue;
    }
    if (ch === '"') {
      let ident = '';
      i++;
      while (i < raw.length) {
        if (raw[i] === '"') {
          if (raw[i + 1] === '"') { ident += '"'; i += 2; continue; }
          i++;
          break;
        }
        ident += raw[i];
        i++;
      }
      // A quoted identifier keeps its text: `alter table "documents" drop column "x"` must read
      // exactly like the unquoted form to the rules below.
      code += ident;
      continue;
    }
    if (ch === '$') {
      const tag = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(raw.slice(i));
      if (tag) {
        const close = raw.indexOf(tag[0], i + tag[0].length);
        const end = close === -1 ? raw.length : close;
        bodies.push(raw.slice(i + tag[0].length, end));
        code += ' $body$ ';
        i = close === -1 ? raw.length : end + tag[0].length;
        continue;
      }
    }
    code += ch;
    i++;
  }
  return {
    code: code.replace(/\s+/g, ' ').trim().toLowerCase(),
    // A body is normalized the same way, minus its own nesting: prose in a body's comment reads
    // exactly like SQL to a regex, and `raise exception 'we do not drop tables'` is not a DROP.
    bodies: bodies.map((b) => normalize(b).code),
  };
}

// ── Rules ────────────────────────────────────────────────────────────────────────────────────────

/**
 * `public.documents`, `"documents"` and `documents(uuid, text)` all name the same thing to the rules.
 *
 * Trimming FIRST is load-bearing: in `revoke all on public.a, public.b` every object after the comma
 * arrives with a leading space, and a `public.` prefix that survives it makes the name miss what the
 * migration created - which turns a same-migration lock-down into a refusal.
 */
const bareName = (name) => name.trim().replace(/^public\./, '').replace(/\(.*$/, '').trim();

/** Split a comma-separated object list without cutting inside an argument list: a function is named
 *  `f(uuid, text)`, and splitting that on commas invents two objects called `uuid` and `text)`. */
function splitObjects(list) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of list) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(current); current = ''; continue; }
    current += ch;
  }
  parts.push(current);
  return parts.map((p) => bareName(p)).filter(Boolean);
}

/**
 * Objects a migration brings into existence, by name.
 *
 * Two rules lean on this, for the same reason. A REVOKE on an object this migration created takes
 * nothing away - it did not exist a statement ago, so no privilege can be in use. And a DROP of an
 * object this migration also creates is a REPLACEMENT, not a removal: `drop trigger if exists x …;
 * create trigger x …` and `drop constraint … ; add constraint …` are how a migration redefines
 * something that has no `create or replace`, and net they change nothing about what exists.
 */
function createdObjects(statements) {
  const created = new Set();
  const patterns = [
    /\bcreate\s+(?:or\s+replace\s+)?(?:unique\s+)?(?:materialized\s+)?(?:table|function|procedure|view|index|sequence|type|schema|publication)\s+(?:if\s+not\s+exists\s+)?([\w.]+)/g,
    /\bcreate\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+([\w.]+)/g,
    /\bcreate\s+policy\s+([\w.]+)/g,
    /\badd\s+constraint\s+([\w.]+)/g,
  ];
  for (const { code } of statements) {
    for (const re of patterns) {
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(code))) created.add(bareName(m[1]));
    }
  }
  return created;
}

/** `drop default` / `drop not null` / `drop identity` relax a column constraint and remove no
 *  object, so they are not in the DROP class at all. */
const KEPT_AFTER_DROP = /^\s*(?:default|not\s+null|identity|expression|generated)\b/;

/** The name a DROP names, skipping the object keyword and `if exists`. */
const DROPPED_NAME = /^\s*(?:table|column|schema|function|procedure|view|materialized\s+view|index|trigger|policy|constraint|type|sequence|extension|role|database|publication|domain|rule)?\s*(?:if\s+exists\s+)?([\w."]+)/;

const DANGER_RULES = [
  {
    id: 'truncate',
    why: 'TRUNCATE empties a table and cannot be rolled back into existence by a later migration',
    test: (code) => /\btruncate\b/.test(code),
  },
  {
    id: 'delete',
    why: 'DELETE FROM removes rows',
    test: (code) => {
      const deleted = [...code.matchAll(/\bdelete\s+from\s+([\w.]+)/g)].map((m) => bareName(m[1]));
      if (!deleted.length) return false;
      // A self-check that inserts a throwaway row, calls the thing and deletes the row again is
      // the shape supabase/AGENTS.md asks for ("a self-check proves SHAPE, never behaviour - so
      // CALL the thing"). Deleting from a table the same block just inserted into is that shape.
      const inserted = new Set([...code.matchAll(/\binsert\s+into\s+([\w.]+)/g)].map((m) => bareName(m[1])));
      return deleted.some((table) => !inserted.has(table));
    },
  },
  {
    id: 'column-type',
    why: 'ALTER COLUMN ... TYPE rewrites every row and can fail or lose precision on live data',
    test: (code) => /\balter\s+column\s+[\w"]+\s+(?:set\s+data\s+)?type\b/.test(code),
  },
  {
    id: 'rename',
    why: 'a RENAME breaks every caller that still uses the old name, silently and immediately',
    test: (code) => /\brename\b/.test(code),
  },
  {
    id: 'disable-rls',
    why: 'DISABLE ROW LEVEL SECURITY turns a table\'s only row boundary off',
    test: (code) => /\bdisable\s+row\s+level\s+security\b/.test(code),
  },
  {
    id: 'owner',
    why: 'OWNER TO changes who a SECURITY DEFINER function runs as',
    test: (code) => /\bowner\s+to\b/.test(code),
  },
  {
    id: 'alter-database',
    why:
      'ALTER DATABASE sets something `supabase db reset` does NOT wipe, so it survives every ' +
      'reset and quietly does a later fix\'s work for it (supabase/AGENTS.md)',
    test: (code) => /\balter\s+database\b/.test(code),
  },
  {
    id: 'drop',
    why: 'DROP removes an object this migration does not put back',
    test: (code, ctx) => {
      const re = /\bdrop\b/g;
      let m;
      while ((m = re.exec(code))) {
        const rest = code.slice(m.index + 4);
        if (KEPT_AFTER_DROP.test(rest)) continue;
        const named = DROPPED_NAME.exec(rest);
        if (named && ctx.created.has(bareName(named[1]))) continue;
        return true;
      }
      return false;
    },
  },
];

/** Rules that judge what a statement does to the SCHEMA, as opposed to what it does to rows. Only
 *  these are applied to a function body: `create function` does not run its body, so a retention
 *  cron that deletes old rows is future behaviour, not something this push removes. A `do $$ … $$`
 *  block runs NOW, so every rule applies to it. */
const DDL_RULE_IDS = new Set(['truncate', 'column-type', 'rename', 'disable-rls', 'owner', 'alter-database', 'drop']);

/** Statement verbs this may apply unattended. Anything outside the list is UNKNOWN, which refuses. */
const SAFE_VERBS = [
  /^create\b/,
  /^alter\s+(table|function|procedure|index|sequence|type|schema|extension|publication|policy|trigger|view|default\s+privileges)\b/,
  /^comment\s+on\b/,
  /^grant\b/,
  // A DROP only reaches this list when the danger rule above already cleared it - which happens in
  // exactly one case: the same migration creates the object back. That is the drop-and-recreate
  // idiom for a trigger, a policy or a constraint, none of which has a `create or replace`.
  /^drop\b/,
  /^insert\s+into\b/,
  /^update\b/,
  /^do\b/,
  /^select\b/,
  /^with\b/,
  /^set\b/,
  /^reset\b/,
  /^begin\b/,
  /^commit\b/,
  /^analyze\b/,
  /^vacuum\b/,
];

/**
 * Which roles a REVOKE takes a privilege away from, and which objects it takes it from.
 *
 * The distinction that makes unattended revokes tolerable at all: the fourteen tables added from
 * 0010 on all say `revoke all ... from public, anon, authenticated` immediately after creating
 * themselves. That is the standard lock-down idiom and it removes nothing, because the object is
 * one statement old. A revoke naming an object from an EARLIER migration is the other thing
 * entirely - it withdraws a privilege something live may be using - and that is what stops here.
 */
function revokeTargets(code) {
  const m = /^revoke\s+(?:grant\s+option\s+for\s+)?(.+?)\s+on\s+(.+?)\s+from\s+(.+?)\s*$/.exec(code);
  if (!m) return null;
  const [, privileges, target, roles] = m;
  // `on all tables in schema public` cannot be limited to this migration's own objects.
  if (/\ball\s+\w+\s+in\s+schema\b/.test(target)) return { privileges, objects: null, roles };
  const objects = splitObjects(target.replace(/^(table|function|procedure|schema|sequence|routine|type|database)\s+/, ''));
  return { privileges, objects, roles };
}

/**
 * Classify ONE statement against a set of objects the same migration creates.
 * Returns `{ verdict: 'safe' | 'dangerous' | 'unknown', reasons: [{ id, why }] }`.
 */
export function classifyStatement(raw, created = new Set()) {
  const { code, bodies } = normalize(raw);
  if (!code) return { verdict: 'safe', reasons: [], code };

  if (code.startsWith('revoke')) {
    const target = revokeTargets(code);
    if (!target) {
      return { verdict: 'unknown', reasons: [{ id: 'revoke', why: 'a REVOKE this could not parse' }], code };
    }
    if (target.objects && target.objects.every((o) => created.has(o))) {
      return { verdict: 'safe', reasons: [], code };
    }
    const named = target.objects ? target.objects.join(', ') : 'every object in the schema';
    return {
      verdict: 'dangerous',
      reasons: [{
        id: 'revoke',
        why: `withdraws "${target.privileges}" from ${target.roles} on ${named}, which this migration did not create`,
      }],
      code,
    };
  }

  const ctx = { created };
  const reasons = [];
  const scan = (text, rules, where) => {
    for (const rule of rules) {
      if (rule.test(text, ctx) && !reasons.some((r) => r.id === rule.id)) {
        reasons.push({ id: rule.id, why: where ? `${rule.why} (inside ${where})` : rule.why });
      }
    }
  };
  scan(code, DANGER_RULES, '');
  // A dollar-quoted body is SQL this push is responsible for and it never appears in `code`. A
  // `do $$ … $$` block executes NOW, so it faces every rule; a function body executes later, so it
  // faces only the ones about the schema (see DDL_RULE_IDS).
  const bodyRules = code.startsWith('do ') || code === 'do' ? DANGER_RULES : DANGER_RULES.filter((r) => DDL_RULE_IDS.has(r.id));
  for (const body of bodies) scan(body, bodyRules, 'a dollar-quoted body');
  if (reasons.length) return { verdict: 'dangerous', reasons, code };

  if (!SAFE_VERBS.some((re) => re.test(code))) {
    return {
      verdict: 'unknown',
      reasons: [{ id: 'unrecognised', why: 'not a statement shape this guard knows how to judge' }],
      code,
    };
  }
  return { verdict: 'safe', reasons: [], code };
}

// ── Session timeouts ─────────────────────────────────────────────────────────────────────────────

/**
 * EVERY MIGRATION FROM THIS VERSION ON SETS ITS OWN `lock_timeout` AND `statement_timeout`.
 *
 * Why: a statement that needs a strong lock (an `alter table`, a trigger, a policy) queues behind
 * any open reader, and every Take on air then queues behind IT. Measured on a preview branch
 * (docs/PLAYOUT_ISOLATION_RESEARCH.md §5.3): an instant `add column` on `control_events` behind a
 * 12 s reader failed 12 of 38 sends; with `set lock_timeout = '2s'` it gave up after 2.2 s and none
 * failed.
 *
 * Why IN THE FILE rather than applied from outside: nothing outside reaches the CLI's session.
 * `supabase db push --linked` (2.111) ignores `PGOPTIONS` and a `PGSERVICEFILE` service, runs
 * `RESET ALL` before each file, and on a hosted project logs in as `cli_login_postgres`, whose own
 * defaults are `lock_timeout = 0` and `statement_timeout = 2min` (all measured on a preview branch,
 * 2026-09-29). A `set` at the top of the file applies to exactly that file, because the CLI runs
 * each file in one transaction, and it travels with the SQL to every other route that runs it.
 *
 * Older files are exempt: they are applied everywhere already.
 */
export const FIRST_TIMED_MIGRATION = '0068';
/** The longest `lock_timeout` a migration may set without `--allow`: longer is a queue again. */
export const MAX_LOCK_TIMEOUT_MS = 5000;

const GUC_UNITS_MS = { us: 0.001, ms: 1, s: 1000, min: 60_000, h: 3_600_000, d: 86_400_000 };

/** A Postgres time setting in milliseconds; a bare number is milliseconds. null if unreadable. */
export function timeoutMs(value) {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(us|ms|s|min|h|d)?\s*$/i.exec(value);
  return m ? Number(m[1]) * GUC_UNITS_MS[(m[2] || 'ms').toLowerCase()] : null;
}

/**
 * The timeouts a migration sets before its first real statement: the leading run of `set`
 * statements only, because a `set lock_timeout` after the `alter table` protects nothing.
 */
export function leadingTimeouts(statements) {
  const found = {};
  for (const { raw } of statements) {
    const text = raw.replace(/^(?:\s|--[^\n]*|\/\*[\s\S]*?\*\/)*/, '');
    if (!/^set\s/i.test(text)) break;
    const m = /^set\s+(?:session\s+|local\s+)?(lock_timeout|statement_timeout)\s*(?:=|to)\s*'?([^';]*?)'?\s*$/i.exec(text.trim());
    if (m) found[m[1].toLowerCase()] = m[2].trim();
  }
  return found;
}

/** The refusal for a migration from FIRST_TIMED_MIGRATION on, or null when it sets both. */
function missingTimeouts(version, statements) {
  if (!/^[0-9]+$/.test(version) || version < FIRST_TIMED_MIGRATION) return null;
  const set = leadingTimeouts(statements);
  const problems = [];
  const lock = set.lock_timeout === undefined ? null : timeoutMs(set.lock_timeout);
  if (set.lock_timeout === undefined) problems.push('sets no lock_timeout before its first statement');
  else if (!lock || lock > MAX_LOCK_TIMEOUT_MS) {
    problems.push(`sets lock_timeout = '${set.lock_timeout}', and anything but 1ms to ${MAX_LOCK_TIMEOUT_MS / 1000}s lets a statement queue behind a reader with every Take behind it`);
  }
  if (set.statement_timeout === undefined) problems.push('sets no statement_timeout before its first statement');
  else if (!timeoutMs(set.statement_timeout)) {
    problems.push(`sets statement_timeout = '${set.statement_timeout}', which is no bound at all; a long backfill states how long instead`);
  }
  if (!problems.length) return null;
  return {
    id: 'timeouts',
    why:
      `${problems.join(', and ')}. Start the file with \`set lock_timeout = '2s';\` and ` +
      "`set statement_timeout = '30s';` (a longer statement_timeout is the file's own override, for a " +
      'real backfill). supabase/AGENTS.md, "Every migration sets its own timeouts"',
  };
}

// ── The live-path class ──────────────────────────────────────────────────────────────────────────

/**
 * THE LIVE-PATH CONTRACT: what renderers and operator pages hold open for hours without reloading
 * (supabase/AGENTS.md, "Live-path migrations wait for a quiet window"). A migration that changes it
 * can hurt a show already on air even when it loses nothing: 0056 redefined `control_send_many` and
 * silently dropped the `live_cue` mirror, a changed signature failed every send from open pages,
 * and 0066 revoked a read three hours after 0064 while renderers still depended on it
 * (docs/PLAYOUT_ISOLATION_RESEARCH.md §5.3, §11).
 *
 * - every table and function in `public` whose name starts with `control_`: the RPCs the pages call
 *   (`control_send_many`, `control_show_by_slug`, `control_output_*`, `control_tail`, …), the
 *   functions and triggers behind them, and the tables they read and write (`control_shows`,
 *   `control_events`, and `control_heads` or whatever comes next under the same prefix);
 * - `realtime.messages`, whose policies admit the `cmd-`, `log-` and `live-` topics;
 * - the predicates the policies on those tables call and the trigger function they share. These
 *   are named everywhere else too, so only a statement ABOUT them counts (defining, dropping,
 *   altering, granting or revoking the function), not every policy that calls one.
 */
export const LIVE_PATH_PREFIX = 'control_';
export const LIVE_PATH_TABLES = ['realtime.messages'];
export const LIVE_PATH_FUNCTIONS = ['is_suspended', 'feature_denied', 'is_team_member', 'set_updated_at'];
/** Files from this version on must declare the class; older ones are applied everywhere already. */
export const FIRST_LIVE_PATH_MIGRATION = '0068';
/** A production is live when its renderer sent a heartbeat this recently. */
export const QUIET_MINUTES = 10;
/** A hold older than this turns the post-land run red, the channel a refusal already uses. */
export const HOLD_ALARM_HOURS = 24;

/** Statement verbs that change the contract or take a lock on it. `select`, `do`, `set` and
 *  `comment` do neither; a `do` block's body is not scanned here (dynamic DDL is not a shape this
 *  repository writes). */
const LIVE_PATH_VERBS = /^(?:create|alter|drop|grant|revoke|insert|update|delete|truncate)\b/;
const LIVE_PATH_NAME = new RegExp(
  `(?<![\\w.$])(?:public\\.)?(${LIVE_PATH_PREFIX}\\w+)` +
    `|\\b(${LIVE_PATH_TABLES.map((t) => t.replace('.', '\\.')).join('|')})\\b` +
    // `execute function public.set_updated_at()` in a trigger on another table only CALLS it.
    `|(?<!execute )\\bfunction\\s+(?:if\\s+exists\\s+)?(?:public\\.)?(${LIVE_PATH_FUNCTIONS.join('|')})\\b`,
  'g',
);

/** The live-path objects one normalized statement changes or locks, or [] when it touches none. */
export function livePathNames(code) {
  if (!LIVE_PATH_VERBS.test(code)) return [];
  const names = new Set();
  for (const m of code.matchAll(LIVE_PATH_NAME)) names.add(m[1] || m[2] || m[3]);
  return [...names];
}

/** The `-- live-path: <what it changes>` line in the file's leading comment, or null. */
export function livePathHeader(text) {
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    if (/^\s*$/.test(line)) continue;
    if (!/^\s*--/.test(line)) break;
    const m = /^\s*--\s*live-path:\s*(\S.*?)\s*$/i.exec(line);
    if (m) return m[1];
  }
  return null;
}

/** What the build refuses about a file's live-path declaration, or null. Pure; the test runs it
 *  over the real folder, so a missing or stale header fails before anything lands. */
export function livePathProblem(migration) {
  const { version, livePath } = migration;
  if (!/^[0-9]+$/.test(version) || version < FIRST_LIVE_PATH_MIGRATION) return null;
  if (livePath.statements.length && !livePath.declared) {
    const first = livePath.statements[0];
    return (
      `changes the live-path contract (${first.names.join(', ')} at line ${first.line}) but does not ` +
      'say so: add `-- live-path: <what it changes on the live path>` to its header comment ' +
      '(supabase/AGENTS.md, "Live-path migrations wait for a quiet window")'
    );
  }
  if (livePath.declared && !livePath.statements.length) {
    return 'declares `-- live-path:` but no statement touches a live-path object; remove the stale line';
  }
  return null;
}

/** Classify a whole migration file. `dangerous` and `unknown` statements are both blockers; they
 *  are reported apart because they mean different things to whoever reads the refusal. The
 *  live-path class is separate and composes with them: it never refuses, it decides WHEN. */
export function classifyMigration(version, name, text) {
  const statements = splitStatements(text).map((s) => ({ ...s, ...normalize(s.raw) }));
  const created = createdObjects(statements);
  const livePath = {
    declared: livePathHeader(text),
    statements: statements
      .map((s) => ({ line: s.line, excerpt: s.code.slice(0, 140), names: livePathNames(s.code) }))
      .filter((s) => s.names.length),
  };
  // A declared file counts even with no matching statement: the author knows something the
  // classifier does not, and holding costs a little time where applying could cost a show.
  livePath.is = Boolean(livePath.declared || livePath.statements.length);
  const findings = [];
  const timeouts = missingTimeouts(version, statements);
  if (timeouts) {
    findings.push({ verdict: 'dangerous', line: statements[0]?.line ?? 1, index: 1, excerpt: statements[0]?.code.slice(0, 140) ?? '', reasons: [timeouts] });
  }
  for (const statement of statements) {
    const { verdict, reasons } = classifyStatement(statement.raw, created);
    if (verdict !== 'safe') {
      findings.push({
        verdict,
        line: statement.line,
        index: statement.index,
        excerpt: statement.code.slice(0, 140),
        reasons,
      });
    }
  }
  return { version, name, statements: statements.length, findings, blocked: findings.length > 0, livePath };
}

/**
 * The quiet window, read through the same Management API query the push uses: which productions
 * had a renderer heartbeat (`control_shows.output_seen_at`) in the last QUIET_MINUTES. `read` is
 * injected so the decision is testable. Any failure is `ok: false`, and that HOLDS: a window nobody
 * could read is not a quiet one.
 */
export async function readQuietWindow(read) {
  try {
    const rows = await read(
      `select id::text as id from public.control_shows where output_seen_at > now() - interval '${QUIET_MINUTES} minutes' order by output_seen_at desc`,
    );
    if (!Array.isArray(rows) || rows.some((r) => typeof r?.id !== 'string')) throw new Error('unexpected answer shape');
    return { ok: true, shows: rows.map((r) => r.id) };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

/**
 * Which pending migrations this run applies and which it holds. Pure.
 *
 * Every file before the first live-path one applies as it always did. That file, and everything
 * after it, applies only when the window is quiet, or when it is named with `--live`; otherwise it
 * waits for the next run, and the files behind it wait too, because the ledger has no gaps.
 */
export function liveHold(migrations, { live = new Set(), window = null } = {}) {
  const first = migrations.findIndex((m) => m.livePath?.is && !live.has(m.version));
  if (first === -1) return { apply: migrations, held: [], window };
  if (window?.ok && window.shows.length === 0) return { apply: migrations, held: [], window };
  return { apply: migrations.slice(0, first), held: migrations.slice(first), window };
}

/** Is a hold that began at `since` (ISO time, or null when nobody could tell) overdue at `now`?
 *  Unknown counts as overdue: an alarm that cannot tell stays loud rather than silent. */
export function holdOverdue(since, now = Date.now()) {
  const t = since ? Date.parse(since) : NaN;
  return Number.isNaN(t) || now - t > HOLD_ALARM_HOURS * 3_600_000;
}

/** When a migration file reached this branch: the first-parent commit that added it. null in a
 *  shallow checkout (whose one commit "adds" every file) or for a file git does not know. */
function landedAt(file) {
  const git = (args) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (git(['rev-parse', '--is-shallow-repository']).stdout.trim() !== 'false') return null;
  const out = git(['log', '--first-parent', '--no-renames', '--diff-filter=A', '--format=%cI', '--', `supabase/migrations/${file}`]).stdout;
  return out.trim().split('\n').filter(Boolean).pop() || null;
}

/** A throwaway Supabase project directory holding every migration EXCEPT the held ones, so the
 *  CLI's own `db push` (which has no "up to version") applies exactly the files before the hold. */
export function stagedWorkdir(keep, root = ROOT) {
  const dir = mkdtempSync(join(tmpdir(), 'noacg-db-push-'));
  const migrations = join(dir, 'supabase', 'migrations');
  mkdirSync(migrations, { recursive: true });
  for (const file of ['config.toml', 'seed.sql']) {
    const from = resolve(root, 'supabase', file);
    if (existsSync(from)) copyFileSync(from, join(dir, 'supabase', file));
  }
  for (const file of keep) copyFileSync(resolve(root, 'supabase', 'migrations', file), join(migrations, file));
  return dir;
}

// ── The hosted project ───────────────────────────────────────────────────────────────────────────

/** Migration files on disk, by the CLI's own filename rule (`<digits>_<name>.sql`). */
export function localMigrations(dir = MIGRATIONS) {
  return readdirSync(dir)
    .map((file) => ({ file, m: /^([0-9]+)_(.*)\.sql$/.exec(file) }))
    .filter(({ m }) => m)
    .map(({ file, m }) => ({ version: m[1], name: m[2], file }))
    .sort((a, b) => a.version.localeCompare(b.version));
}

/** One Management API query. An explicit AbortController with a timer this CLEARS, rather than
 *  `AbortSignal.timeout()`: that helper leaves a live libuv handle behind and exiting while it is
 *  closing aborts the process on Windows (the trap scripts/migration-drift.mjs hit first). */
async function query(ref, token, sql) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`management API answered ${response.status}: ${body?.message || ''}`);
    if (!Array.isArray(body)) throw new Error(body?.message || 'unexpected response shape');
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Everything worth diffing, in ONE round trip, as sorted arrays of flat strings so a before/after
 * comparison is a set difference rather than a tree walk.
 *
 * Function EXECUTE is in here beside table privileges because the two have gone wrong together
 * before: Supabase's bootstrap grants both, and 0041/0042 were each an accidental function grant.
 */
const SNAPSHOT_SQL = `
select jsonb_build_object(
  'table_grants', (
    select coalesce(jsonb_agg(x order by x), '[]'::jsonb) from (
      select grantee || ' ' || privilege_type || ' on ' || table_name as x
      from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon', 'authenticated', 'service_role')
    ) t),
  'function_grants', (
    select coalesce(jsonb_agg(x order by x), '[]'::jsonb) from (
      select r || ' execute on ' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as x
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace,
      lateral unnest(array['anon', 'authenticated', 'service_role']) r
      where n.nspname = 'public' and has_function_privilege(r, p.oid, 'execute')
    ) t),
  'columns', (
    select coalesce(jsonb_agg(x order by x), '[]'::jsonb) from (
      select table_name || '.' || column_name || ' ' || data_type
             || case when is_nullable = 'NO' then ' not null' else '' end as x
      from information_schema.columns where table_schema = 'public'
    ) t),
  'policies', (
    select coalesce(jsonb_agg(x order by x), '[]'::jsonb) from (
      select schemaname || '.' || tablename || ' ' || policyname || ' ' || cmd || ' ' || roles::text
             || ' ' || md5(coalesce(qual, '') || '|' || coalesce(with_check, '')) as x
      from pg_policies where schemaname in ('public', 'storage')
    ) t),
  'ledger', (
    select coalesce(jsonb_agg(x order by x), '[]'::jsonb) from (
      select version || ' ' || coalesce(name, '') as x from supabase_migrations.schema_migrations
    ) t)
) as snapshot`;

const snapshot = async (ref, token) => (await query(ref, token, SNAPSHOT_SQL))[0].snapshot;

/** Set difference over the snapshot's flat string arrays: what appeared, and what went away. */
function diffSnapshots(before, after) {
  const out = {};
  for (const key of Object.keys(after)) {
    const had = new Set(before[key] || []);
    const has = new Set(after[key] || []);
    const added = [...has].filter((x) => !had.has(x)).sort();
    const removed = [...had].filter((x) => !has.has(x)).sort();
    if (added.length || removed.length) out[key] = { added, removed };
  }
  return out;
}

// ── The CLI ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Run the Supabase CLI. It is installed globally here rather than as a devDependency, so `npx` is
 * the fallback when it is not on PATH.
 *
 * On Windows the global install is a `.cmd` shim, and `spawnSync` refuses to start a batch file
 * directly (EINVAL, since the command-injection fix in 18.20/20.12) - it has to go through the
 * command interpreter. Doing that EXPLICITLY rather than with `shell: true` is the same execution
 * and no DEP0190: the deprecation exists because `shell: true` concatenates arguments without
 * escaping them, which is precisely the risk the check below removes. Every argument this script
 * passes is a flag or a project ref; anything else is a bug worth stopping for.
 */
let cliCommand = null;

function runSupabase(args, token, { capture = false, cwd = ROOT } = {}) {
  for (const arg of args) {
    if (!/^[A-Za-z0-9._-]+$/.test(arg)) throw new Error(`refusing to run the CLI with argument "${arg}"`);
  }
  const env = { ...process.env, SUPABASE_ACCESS_TOKEN: token };
  // `cwd` is the Supabase project directory the CLI reads: the checkout, or a staged copy that
  // leaves out held migrations (stagedWorkdir). A directory, not a `--workdir` argument, so the
  // argument check above stays as strict as it is.
  const spawn = (command, commandArgs, options = {}) =>
    (process.platform === 'win32'
      ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', [command, ...commandArgs].join(' ')],
        { cwd, env, encoding: 'utf8', windowsVerbatimArguments: true, ...options })
      : spawnSync(command, commandArgs, { cwd, env, encoding: 'utf8', ...options }));

  // Decide ONCE, with a probe, which command to use - never by retrying a failed run through the
  // other one. A `db push` that exits non-zero must not be attempted a second time just because
  // this could not tell "the CLI is missing" from "the CLI said no".
  if (cliCommand === null) {
    const probe = spawn('supabase', ['--version'], { stdio: 'ignore' });
    cliCommand = !probe.error && probe.status === 0 ? ['supabase', []] : ['npx', ['--yes', 'supabase']];
  }
  const [command, prefix] = cliCommand;
  // CAPTURED, then echoed, when the caller has to read what the CLI said: a lock timeout is told
  // apart from a broken migration only by its SQLSTATE in the CLI's error text.
  const result = spawn(command, [...prefix, ...args], { stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit' });
  if (result.error) throw result.error;
  if (!capture) return result.status ?? 1;
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  return { status: result.status ?? 1, output: `${result.stdout || ''}\n${result.stderr || ''}` };
}

/**
 * Did the push fail because a migration could not get its lock in time (SQLSTATE 55P03)? Returns
 * the file the CLI was applying, or null for any other outcome. Pure, so it is tested on the CLI's
 * real words (scripts/db-push.test.mjs).
 *
 * That failure is not a broken migration. The file runs in one transaction, so none of it applied;
 * the files before it did, with their ledger rows. Running the same push again later is the fix.
 */
export function lockTimeoutFailure(output) {
  // The server's words only: the CLI also echoes the failing statement, and a migration's own text
  // may mention a lock timeout.
  if (!/SQLSTATE 55P03|canceling statement due to lock timeout/.test(output)) return null;
  const applying = [...output.matchAll(/Applying migration (\S+?\.sql)/g)];
  return { file: applying.length ? applying[applying.length - 1][1] : 'a pending migration' };
}

/** Waits before the second and third attempt after a lock timeout. A reader that holds a table
 *  for a minute is rare; one that holds it for a few seconds is an ordinary busy moment. */
export const LOCK_RETRY_WAITS_MS = [10_000, 30_000];

const flag = (argv, name) => argv.includes(name);
/** A flag's value, with a trailing `--allow` (no version after it) reading as absent rather than
 *  crashing - the difference between "you forgot the version" and a stack trace. */
const value = (argv, name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] || '' : '');

/**
 * Is the remote ledger still the one this repository's filenames describe? Pure, so the refusal
 * that protects the worst documented failure is testable without a database.
 *
 * `supabase db push` keys each migration by the four-digit version in its filename. A Supabase MCP
 * `apply_migration` or an SQL-editor paste mints a generated timestamp instead, and `list_migrations`
 * keeps looking fine because it prints whatever is in the table. The damage arrives at the NEXT
 * push, which sees those files as pending and re-runs them against the live database - and
 * `create policy` and `create trigger` have no `if not exists`, so it dies partway through. That is
 * the moment this refusal exists to prevent, so it fires before anything is applied and points at
 * the repair: fix the ledger's version/name columns, never re-run the SQL (supabase/AGENTS.md).
 *
 * A four-digit version with no file on disk is the same disease read from the other end - either an
 * applied migration was deleted or renamed, or something wrote a version this repo never had.
 */
export function ledgerDrift(remote, localVersions) {
  const badVersions = remote.filter((r) => !/^[0-9]{4}$/.test(r.version));
  const onDisk = new Set(localVersions);
  const orphans = remote.filter((r) => /^[0-9]{4}$/.test(r.version) && !onDisk.has(r.version));
  if (!badVersions.length && !orphans.length) return null;
  return {
    status: 'drifted',
    badVersions: badVersions.map((r) => `${r.version} (${r.name})`),
    orphans: orphans.map((r) => `${r.version} (${r.name})`),
  };
}

/** Decide the whole push without changing anything - so a caller, and the test, can read the plan. */
export async function plan({ ref, token, allow = new Set() }) {
  const remote = (await query(ref, token, 'select version, name from supabase_migrations.schema_migrations'))
    .map((row) => ({ version: String(row.version), name: row.name || '' }));

  const local = localMigrations();
  const drifted = ledgerDrift(remote, local.map((m) => m.version));
  if (drifted) return drifted;

  const applied = new Set(remote.map((r) => r.version));
  const pending = local.filter((m) => !applied.has(m.version));
  if (!pending.length) return { status: 'up-to-date', applied: applied.size };

  const migrations = pending.map((m) =>
    classifyMigration(m.version, m.name, readFileSync(resolve(MIGRATIONS, m.file), 'utf8')));
  const blocked = migrations.filter((m) => m.blocked && !allow.has(m.version));
  return { status: blocked.length ? 'refused' : 'ready', migrations, blocked, pending: pending.map((m) => m.file) };
}

function describe(migration) {
  const lines = [`  ${migration.version}_${migration.name}.sql  (${migration.statements} statements)`];
  for (const f of migration.findings) {
    lines.push(`    ${f.verdict === 'unknown' ? 'UNKNOWN' : 'REFUSED'} at line ${f.line}: ${f.reasons.map((r) => r.why).join('; ')}`);
    lines.push(`      ${f.excerpt}${f.excerpt.length >= 140 ? '…' : ''}`);
  }
  const { livePath } = migration;
  if (livePath.is) {
    const touches = [...new Set(livePath.statements.flatMap((s) => s.names))].join(', ') || 'nothing the classifier names';
    lines.push(`    LIVE-PATH: ${livePath.declared || '(no header)'}  [touches ${touches}]`);
  }
  return lines.join('\n');
}

/** Who was live, for a CI log: production ids only, never titles. */
function describeWindow(ref, quiet) {
  if (!quiet.ok) return `\nQuiet window on ${ref}: could not be read (${quiet.error}), so it counts as NOT quiet.`;
  if (!quiet.shows.length) return `\nQuiet window on ${ref}: no renderer heartbeat in the last ${QUIET_MINUTES} minutes.`;
  const shown = quiet.shows.slice(0, 20).join(', ');
  const more = quiet.shows.length > 20 ? ` and ${quiet.shows.length - 20} more` : '';
  return `\nQuiet window on ${ref}: ${quiet.shows.length} production(s) had a renderer heartbeat in the last ${QUIET_MINUTES} minutes: ${shown}${more}.`;
}

/**
 * Say what is held and how to apply it, and decide the exit code: 0 while the hold is young (the
 * class requires the landed app to work without it, so waiting is not a failure), 1 once it is
 * older than HOLD_ALARM_HOURS, so a red post-land run reaches a person exactly as a refusal does.
 */
function reportHold(hold, { ref, target }) {
  const first = hold.held[0];
  const file = `${first.version}_${first.name}.sql`;
  const since = landedAt(file);
  const overdue = holdOverdue(since);
  const why = hold.window.ok ? `productions were live on ${ref}` : `the quiet window on ${ref} could not be read`;
  const command = `npm run db:push --${target} --live ${first.version}`;
  console.error(`\nHELD: ${file} is a live-path migration (${first.livePath.declared || 'no header'}) and ${why}.`);
  if (hold.held.length > 1) console.error(`  Held behind it: ${hold.held.slice(1).map((m) => `${m.version}_${m.name}.sql`).join(', ')}`);
  console.error(`  In the repository since ${since || 'an unknown time (a shallow checkout, or a file git does not know)'}.`);
  console.error('  The next landing retries it and applies it if the window is quiet. To apply it now,');
  console.error(`  at a moment you judge safe: ${command}`);
  if (overdue) {
    console.error(`  OVERDUE: held for more than ${HOLD_ALARM_HOURS} hours. Apply it by name when no show is on air.`);
  }
  if (process.env.GITHUB_ACTIONS === 'true') {
    const level = overdue ? 'error' : 'warning';
    console.log(`::${level} title=Live-path migration held::${file} waits for a quiet window (${why}). ${overdue ? `Held over ${HOLD_ALARM_HOURS} h. ` : 'The next landing retries it. '}Apply now: ${command}`);
  }
  return overdue ? 1 : 0;
}

async function main(argv) {
  const env = ambientEnv(ROOT);
  const asJson = flag(argv, '--json');
  const dryRun = flag(argv, '--dry-run');
  const allow = new Set(value(argv, '--allow').split(',').map((v) => v.trim()).filter(Boolean));
  const live = new Set(value(argv, '--live').split(',').map((v) => v.trim()).filter(Boolean));

  const token = env.SUPABASE_ACCESS_TOKEN || '';
  const named = value(argv, '--ref');
  // A ref reaches the Supabase CLI as an argument, and `runSupabase` refuses anything that is not
  // a flag or a plain ref. Checking it HERE says why, instead of throwing three steps later.
  if (named && !/^[a-z0-9]+$/i.test(named)) {
    console.error(`Cannot push: "${named}" is not a project ref (letters and digits, no scheme, no dots).`);
    return 2;
  }
  const ref = named || env.SUPABASE_PROJECT_REF || productionRef(env);
  if (!ref || !token) {
    const detail = !ref
      ? 'no project ref: pass --ref, set SUPABASE_PROJECT_REF, or put VITE_SUPABASE_URL in .env'
      : 'SUPABASE_ACCESS_TOKEN is not set (see .env.example)';
    console.error(`Cannot push: ${detail}`);
    return 2;
  }

  const decision = await plan({ ref, token, allow });

  if (decision.status === 'drifted') {
    console.error(`REFUSED: the ledger on ${ref} does not match this repository.`);
    for (const v of decision.badVersions) console.error(`  not a four-digit version: ${v}`);
    for (const v of decision.orphans) console.error(`  applied on the project, no file on disk: ${v}`);
    console.error('\nPushing onto a drifted ledger re-runs files that already ran and fails partway');
    console.error('through (`create policy` has no `if not exists`). Repair the ledger\'s version/name');
    console.error('columns to match the filenames - never re-run the SQL. supabase/AGENTS.md.');
    if (asJson) console.log(JSON.stringify(decision));
    return 1;
  }

  if (decision.status === 'up-to-date') {
    console.log(`${ref} holds all ${decision.applied} migration(s). Nothing to push.`);
    if (asJson) console.log(JSON.stringify(decision));
    return 0;
  }

  console.log(`Pending on ${ref}: ${decision.migrations.length} migration(s)\n`);
  for (const m of decision.migrations) console.log(describe(m));
  for (const version of allow) {
    const m = decision.migrations.find((x) => x.version === version);
    // Say when an --allow did nothing. A typo (`--allow 052`) would otherwise read as an accepted
    // override right up until the push refuses, and the refusal would look like the flag was ignored.
    if (!m) console.log(`\n  --allow ${version}: no pending migration has that version - check the number.`);
    else if (!m.blocked) console.log(`\n  --allow ${version}: nothing to accept; it has no refusals.`);
    else console.log(`\n  --allow ${version}: accepting the ${m.findings.length} refusal(s) above.`);
  }

  if (decision.status === 'refused') {
    console.error('\nREFUSED. These statements can remove something, or can queue every Take behind a');
    console.error('lock, and nothing here can tell whether that is intended. Read them, then fix the');
    console.error('file or re-run naming the versions you accept:');
    // Carry the ref through, or the pasted command applies to production instead of whatever this
    // run was actually pointed at - the one paste that must never go to the wrong database.
    const target = ref === productionRef(env) ? '' : ` --ref ${ref}`;
    console.error(`  npm run db:push --${target} --allow ${decision.blocked.map((m) => m.version).join(',')}`);
    if (asJson) console.log(JSON.stringify(decision));
    return 1;
  }

  // THE LIVE-PATH CLASS. The window is read only when a live-path file is pending, and read just
  // before the push; a named (`--live`) file applies whatever it says, after printing who is live.
  for (const version of live) {
    const m = decision.migrations.find((x) => x.version === version);
    if (!m) console.log(`\n  --live ${version}: no pending migration has that version - check the number.`);
    else if (!m.livePath.is) console.log(`\n  --live ${version}: not a live-path migration; it applies like any other.`);
    else console.log(`\n  --live ${version}: applying it now, whatever the quiet window says.`);
  }
  const quiet = decision.migrations.some((m) => m.livePath.is)
    ? await readQuietWindow((sql) => query(ref, token, sql))
    : null;
  if (quiet) console.log(describeWindow(ref, quiet));
  const hold = liveHold(decision.migrations, { live, window: quiet });
  const target = ref === productionRef(env) ? '' : ` --ref ${ref}`;
  const livePathJson = {
    apply: hold.apply.map((m) => m.version),
    held: hold.held.map((m) => m.version),
    window: quiet,
  };
  if (hold.held.length) {
    console.log(`\nApplying ${hold.apply.length} migration(s) and holding ${hold.held.length} (live-path, see below).`);
  }
  if (!hold.apply.length) {
    const status = reportHold(hold, { ref, target });
    if (asJson) console.log(JSON.stringify({ ...decision, livePath: livePathJson }));
    return status;
  }

  // Everything but the held files, so the CLI applies exactly the files before the hold. With
  // nothing held, the checkout itself, exactly as before the class existed.
  const heldFiles = new Set(hold.held.map((m) => `${m.version}_${m.name}.sql`));
  const cwd = heldFiles.size
    ? stagedWorkdir(localMigrations().map((m) => m.file).filter((f) => !heldFiles.has(f)))
    : ROOT;
  try {
    const status = await push({ ref, token, dryRun, asJson, decision, apply: hold.apply, cwd, livePathJson });
    return status !== 0 || !hold.held.length ? status : reportHold(hold, { ref, target });
  } finally {
    if (cwd !== ROOT) rmSync(cwd, { recursive: true, force: true });
  }
}

/** Snapshot, push `apply` from `cwd`, snapshot again, and prove the ledger took exactly `apply`. */
async function push({ ref, token, dryRun, asJson, decision, apply, cwd, livePathJson }) {
  console.log('\nSnapshotting before…');
  const before = await snapshot(ref, token);

  if (dryRun) {
    console.log('--dry-run: asking the CLI what it would do, and stopping.\n');
    const linkedForDryRun = runSupabase(['link', '--project-ref', ref], token, { cwd });
    const status = linkedForDryRun === 0 ? runSupabase(['db', 'push', '--linked', '--dry-run'], token, { cwd }) : linkedForDryRun;
    if (asJson) console.log(JSON.stringify({ ...decision, livePath: livePathJson, dryRun: true }));
    return status;
  }

  console.log(`\nLinking to ${ref} and pushing…\n`);
  // Link explicitly rather than trusting whatever this checkout was last pointed at: `db push`
  // takes no --project-ref, so the link IS the target, and a stale one is how a staging push
  // becomes a production push.
  const linked = runSupabase(['link', '--project-ref', ref], token, { cwd });
  if (linked !== 0) {
    console.error(`\nsupabase link failed (exit ${linked}). Nothing was pushed.`);
    return linked;
  }
  // A LOCK TIMEOUT IS RETRIED, anything else is not. Every migration from 0068 on gives up on a
  // lock after a couple of seconds rather than queueing Takes behind it, so "could not get the
  // lock" is an expected, harmless outcome at a busy moment, and pushing again picks up exactly
  // the files still pending.
  let pushed;
  let locked;
  for (let attempt = 0; ; attempt++) {
    const run = runSupabase(['db', 'push', '--linked'], token, { capture: true, cwd });
    pushed = run.status;
    locked = pushed === 0 ? null : lockTimeoutFailure(run.output);
    if (!locked || attempt >= LOCK_RETRY_WAITS_MS.length) break;
    const wait = LOCK_RETRY_WAITS_MS[attempt];
    console.error(`\n${locked.file} could not get a lock in time; nothing in it was applied. Trying again in ${wait / 1000}s…\n`);
    await new Promise((done) => setTimeout(done, wait));
  }

  console.log('\nSnapshotting after…');
  const after = await snapshot(ref, token);
  const changes = diffSnapshots(before, after);

  console.log(`\n── What changed on ${ref} ──────────────────────────────────────────`);
  if (!Object.keys(changes).length) {
    console.log('  nothing: no privilege, column, policy or ledger row differs.');
  }
  for (const [key, { added, removed }] of Object.entries(changes)) {
    console.log(`  ${key}: +${added.length} -${removed.length}`);
    for (const x of added) console.log(`    + ${x}`);
    for (const x of removed) console.log(`    - ${x}`);
  }

  if (locked) {
    console.error(
      `\nLOCK TIMEOUT: ${locked.file} could not get a lock within its lock_timeout, ` +
        `${LOCK_RETRY_WAITS_MS.length + 1} times. Nothing in that file was applied, and nothing after it ` +
        'was attempted; the diff above is what did land. Something held the table longer than the ' +
        'migration may wait, which is the guard working, not a broken migration. The next landing ' +
        'retries, or re-run this job.',
    );
    return pushed;
  }
  if (pushed !== 0) {
    console.error(`\nsupabase db push exited ${pushed}. The diff above is what actually landed.`);
    return pushed;
  }

  // The push says it worked; the ledger says what it wrote. A version that is not four digits
  // here means something applied the file by a route that is not `db push`.
  const ledgerAdded = changes.ledger?.added || [];
  const expected = apply.map((m) => m.version);
  const wrote = ledgerAdded.map((row) => row.split(' ')[0]).sort();
  if (wrote.join(',') !== expected.sort().join(',')) {
    console.error(`\nLEDGER MISMATCH: expected rows for ${expected.join(', ')}, got ${wrote.join(', ') || 'none'}.`);
    return 1;
  }
  console.log(`\nApplied ${expected.length} migration(s): ${expected.join(', ')}.`);
  if (asJson) console.log(JSON.stringify({ ...decision, livePath: livePathJson, changes }));
  return 0;
}

// Only run when invoked directly - the test imports the classifier from this same file.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = await main(process.argv.slice(2));
}
