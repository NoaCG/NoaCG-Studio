// guards: supabase/migrations/0098_audience_imported_identity.sql
//
// Static guards on migration 0098, an imported message's one identity (docs/work-specs/data-sources
// spec, phase C3; audience spec, "Identity"). The migration's own self-check calls the functions on
// a throwaway production; these hold what a reviewer relies on when reading it: the unique index is
// per production on `external_id` and built concurrently on its own; the operator insert skips a
// clash instead of failing the batch; the settle is keyed on the control slug, bounded at 2,000,
// accepts only a Sheet source's prefix, removes only unused rows, and reaches only the inbox.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { classifyMigration, livePathProblem, splitStatements } from './db-push.mjs';

const sql = await readFile(new URL('../supabase/migrations/0098_audience_imported_identity.sql', import.meta.url), 'utf8');
const code = sql.replace(/--[^\n]*/g, '');

const body = (name) => {
  const m = new RegExp(String.raw`create (?:or replace )?function public\.${name}\([\s\S]*?\$\$;`, 'i').exec(code);
  assert.ok(m, `${name} is not defined in 0098`);
  return m[0];
};

test('the index is unique per production on external_id, partial, and built concurrently on its own', () => {
  assert.match(
    code,
    /create unique index concurrently audience_submissions_external_idx\s+on public\.audience_submissions \(show_id, external_id\) where external_id is not null;/,
  );
  const alone = splitStatements(sql)
    .map((s) => s.raw)
    .filter((s) => /concurrently/i.test(s.replace(/--[^\n]*/g, '')));
  assert.equal(alone.length, 1);
  assert.match(alone[0].replace(/--[^\n]*/g, '').trim(), /^create unique index concurrently/i);
  // A failed build's leftover is dropped first, and the index is proven valid before use.
  assert.ok(code.indexOf('drop index if exists public.audience_submissions_external_idx') < code.indexOf('create unique index concurrently'));
  assert.match(code, /indisvalid and i\.indisready and i\.indisunique/);
});

test('a duplicate id already in the table is cleared before the build, and nothing is deleted', () => {
  const clear = /update public\.audience_submissions x set external_id = null[\s\S]*?;/.exec(code);
  assert.ok(clear, 'the duplicate step is missing');
  assert.match(clear[0], /y\.show_id = x\.show_id and y\.external_id = x\.external_id/);
  assert.match(clear[0], /\(y\.created_at, y\.id\) < \(x\.created_at, x\.id\)/, 'the first row keeps its id');
  assert.ok(code.indexOf(clear[0]) < code.indexOf('create unique index concurrently'));
  assert.doesNotMatch(code.slice(0, code.indexOf('create unique index concurrently')), /delete from/i);
});

test('the withdrawn mark is a nullable column with no default', () => {
  assert.match(code, /add column if not exists withdrawn_at timestamptz;/);
  assert.doesNotMatch(code, /withdrawn_at timestamptz not null|withdrawn_at timestamptz default/i);
});

test('the operator insert keeps 0095 and skips a clash with the index instead of failing', () => {
  const fn = body('audience_operator_add');
  assert.match(fn, /public\.audience_owner_for_control\(p_slug\)/);
  assert.match(fn, /jsonb_array_length\(p_items\) > 100/);
  assert.match(fn, /on conflict \(show_id, external_id\) where external_id is not null do nothing/);
  assert.match(fn, /if not found then\s+continue;/);
  for (const forbidden of ['control_events', 'control_data', 'join_slug', 'audience_submit(']) {
    assert.equal(fn.includes(forbidden), false, `audience_operator_add names ${forbidden}`);
  }
  assert.match(code, /grant execute on function public\.audience_operator_add\(text, jsonb\) to anon, authenticated;/);
});

test('the settle: control slug, a Sheet prefix only, 2,000 at most, unused rows only removed', () => {
  const fn = body('audience_operator_settle');
  assert.match(fn, /public\.audience_owner_for_control\(p_slug\)/);
  assert.match(fn, /p_prefix !~ '\^sheet:\[A-Za-z0-9_-\]\{1,80\}:\$'/);
  assert.match(fn, /cardinality\(v_present\) > 2000/);
  const del = /delete from public\.audience_submissions x[\s\S]*?;/.exec(fn)[0];
  assert.match(del, /x\.show_id = v_show/);
  assert.match(del, /x\.used_at is null/);
  assert.match(del, /left\(x\.external_id, length\(p_prefix\)\) = p_prefix/);
  assert.doesNotMatch(fn, /\blike\b/i, 'a LIKE would read _ in a source id as a wildcard');
  for (const forbidden of ['control_events', 'control_data', 'join_slug', 'insert into']) {
    assert.equal(fn.includes(forbidden), false, `audience_operator_settle names ${forbidden}`);
  }
  assert.match(code, /revoke execute on function public\.audience_operator_settle\(text, text, text\[\]\) from public;/);
  assert.match(code, /grant execute on function public\.audience_operator_settle\(text, text, text\[\]\) to anon, authenticated;/);
});

test('both reads return the mark and still never the device', () => {
  for (const name of ['audience_list', 'audience_operator_add']) {
    const fn = body(name);
    assert.match(fn, /external_id text, source text, reference text, withdrawn_at timestamptz/);
    assert.match(code, new RegExp(String.raw`drop function if exists public\.${name}\(`));
  }
  assert.equal(/x\.device_token/.test(body('audience_list')), false);
});

test('the self-check calls the bodies on a throwaway production', () => {
  assert.match(code, /audience_operator_settle\(v_slug, 'sheet:s1:', '\{\}'\)/);
  assert.match(code, /delete from public\.control_shows where id = v_show;/);
});

test('it is additive, not live-path, and push applies it unattended', () => {
  const classified = classifyMigration('0098', 'audience_imported_identity', sql);
  assert.equal(classified.blocked, false, JSON.stringify(classified.findings));
  assert.equal(classified.livePath.is, false);
  assert.equal(livePathProblem(classified), null);
});
