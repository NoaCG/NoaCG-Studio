// HOW MANY TESTS EACH TEST FILE ACTUALLY RAN - a `node --test` reporter, for scripts/gates.mjs.
//
// A test file is a gate too, and it has the same blind spot every other gate has. When a file's
// cases come from a resolved list - a catalog, a directory listing, a registry, a glob - and that
// list resolves to nothing, the file registers ZERO tests. `node --test` then reports the FILE
// itself as one passing test and exits 0, so 99 files can go green having asserted nothing.
//
// This reporter answers the one question the exit code cannot: per file, how many tests ran. It
// writes the same receipt scripts/measured.mjs writes for a check - the count, the subject (here
// the file), and whether zero is allowed - through the one module that owns that format, so the
// runner reads both writers with one function and no file spells the delimiter itself.
//
// It runs BESIDE the reporter a person reads (`node --test --test-reporter=spec ...
// --test-reporter=./scripts/gates-test-count.mjs --test-reporter-destination=<file>`), so the
// build's log is unchanged.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { receiptRow } from './measured-receipt.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export default async function* countTestsPerFile(source) {
  const counts = new Map();
  for await (const event of source) {
    // `test:summary` is emitted once per FILE with a `file` field, and once more for the run as a
    // whole without one. A file that registered no tests emits no per-file summary at all, which
    // is exactly the case worth catching - so absent and zero end in the same place.
    if (event.type !== 'test:summary' || !event.data?.file) continue;
    counts.set(path.relative(ROOT, event.data.file).replaceAll('\\', '/'), event.data.counts?.tests ?? 0);
  }
  for (const [file, count] of counts) yield receiptRow(count, file);
}
