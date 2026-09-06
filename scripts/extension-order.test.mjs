// guards: supabase/migrations/**
//
// Can supabase/migrations/ be applied to an EMPTY database, in order?
//
// One class of answer, checked statically: a migration must not call an extension's function
// before some migration has created that extension, and on Supabase it must call it
// SCHEMA-QUALIFIED.
//
// WHY THIS EXISTS. On 2026-08-25 the migrations could not be applied to a fresh hosted Supabase
// project at all. 0003_show_chat.sql used `gen_random_bytes` - pgcrypto - and the extension was
// not created until 0004, one file too late: `ERROR: function gen_random_bytes(integer) does not
// exist (SQLSTATE 42883)`. 0004's own comment said it was creating pgcrypto "so this migration
// also applies on a fresh project", which was right about the need and wrong about the file.
//
// Nothing caught it for two reasons, and both are why a STATIC check earns its place here:
//   - The CLI's LOCAL Postgres image ships pgcrypto already reachable, so the local-stack CI
//     applies all 51 migrations green. The nightly cannot see this class of defect at all.
//   - Production has had the extension for months, so `supabase db push` there never re-runs the
//     early files. Only a from-scratch apply exercises the ordering, and nothing did that until
//     a staging project was created.
//
// A fix could not be added in a later migration either: on an empty database 0003 runs before
// anything you add, so the repair has to live in the file that needs the extension first. That
// makes the ordering property worth asserting rather than remembering.
//
// SECOND HALF, EQUALLY LOAD-BEARING: schema qualification. Creating the extension is not enough.
// Supabase puts extensions in the `extensions` schema, and the CLI's ephemeral migration role does
// not carry that schema on its search_path - so an unqualified call fails even once the extension
// exists. That is the second error the same push produced, after the first was fixed.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');

/**
 * Functions this repository uses that come from an EXTENSION rather than core Postgres, mapped to
 * the extension that provides them.
 *
 * Deliberately a short allowlist rather than a clever parser: it is the set actually used here, it
 * is cheap to extend, and a function nobody uses cannot regress. `gen_random_uuid` is NOT in this
 * list - it moved into core in Postgres 13 and needs no extension.
 */
const EXTENSION_FUNCTIONS = {
  gen_random_bytes: 'pgcrypto',
  digest: 'pgcrypto',
  hmac: 'pgcrypto',
  crypt: 'pgcrypto',
  gen_salt: 'pgcrypto',
  uuid_generate_v4: 'uuid-ossp',
};

/** Strip `-- line comments` and /* block comments *\/ so prose about a function is not a call. */
function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

function migrationFiles() {
  return readdirSync(DIR)
    .filter((name) => /^[0-9]+_.*\.sql$/.test(name))
    .sort();
}

test('every extension is created before the first migration that calls one of its functions', () => {
  const created = new Set();
  const problems = [];
  for (const name of migrationFiles()) {
    const sql = stripComments(readFileSync(path.join(DIR, name), 'utf8'));

    // `create extension [if not exists] <name>` - quoted or bare, since uuid-ossp needs quoting.
    for (const match of sql.matchAll(/create\s+extension\s+(?:if\s+not\s+exists\s+)?"?([a-z0-9_-]+)"?/gi)) {
      created.add(match[1].toLowerCase());
    }

    for (const [fn, extension] of Object.entries(EXTENSION_FUNCTIONS)) {
      // A call NOT preceded by a schema qualifier. `[^.\w]` keeps `extensions.gen_random_bytes`
      // and any other qualified form out of the match.
      const call = new RegExp(`(^|[^.\\w])${fn}\\s*\\(`, 'i');
      if (!call.test(sql)) continue;
      if (!created.has(extension)) {
        problems.push(
          `${name} calls ${fn}() but no migration up to and including it creates ${extension}. ` +
            `On an empty database this file runs before anything added later, so the fix belongs in ${name} itself.`,
        );
      }
    }
  }
  assert.deepEqual(problems, [], `\n${problems.join('\n')}\n`);
});

test('extension functions are called schema-qualified', () => {
  const problems = [];
  for (const name of migrationFiles()) {
    const sql = stripComments(readFileSync(path.join(DIR, name), 'utf8'));
    for (const fn of Object.keys(EXTENSION_FUNCTIONS)) {
      const unqualified = new RegExp(`(^|[^.\\w])${fn}\\s*\\(`, 'gi');
      const hits = [...sql.matchAll(unqualified)];
      if (hits.length) {
        problems.push(
          `${name} calls ${fn}() unqualified (${hits.length}x). Supabase installs extensions into ` +
            `the \`extensions\` schema and the CLI's migration role does not carry it on search_path, ` +
            `so write extensions.${fn}(...) as 0029/0035/0047 do.`,
        );
      }
    }
  }
  assert.deepEqual(problems, [], `\n${problems.join('\n')}\n`);
});
