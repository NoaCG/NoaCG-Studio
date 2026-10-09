// guards: supabase/migrations/**
//
// Migration 0085 drops the closed community gallery's tables, and its promise is that it deletes no
// user data: it drops only tables it has just proven empty, and it leaves the community-assets
// bucket, which still holds an upload, alone. A database test cannot run here, so these pin the
// order and the absences that carry that promise.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const text = await readFile(
  new URL('../supabase/migrations/0085_community_gallery_retired.sql', import.meta.url),
  'utf8',
);
const sql = text.replace(/--[^\n]*/g, '').toLowerCase();

test('both tables are locked and counted, and a row raises, before anything is dropped', () => {
  const firstDrop = sql.search(/^drop\b/m);
  assert.ok(firstDrop > 0, 'the migration drops something');
  const guard = sql.slice(0, firstDrop);
  assert.match(guard, /lock table public\.community_templates, public\.community_reports in access exclusive mode/);
  assert.match(guard, /count\(\*\) into \w+ from public\.community_templates/);
  assert.match(guard, /count\(\*\) into \w+ from public\.community_reports/);
  assert.match(guard, /if \w+ > 0 or \w+ > 0 then\s+raise exception/);
});

test('nothing is deleted, cascaded or emptied, and the bucket is not touched', () => {
  assert.doesNotMatch(sql, /\bcascade\b/);
  assert.doesNotMatch(sql, /\b(delete\s+from|truncate)\b/);
  assert.doesNotMatch(sql, /^\s*(drop|delete|update)\b[^;]*storage\./m);
  assert.doesNotMatch(sql, /drop policy/);
});

test('what community packs use is kept', () => {
  assert.doesNotMatch(sql, /drop (table|function)[^;]*(moderators|is_moderator|feature_denied|community_pack)/);
});
