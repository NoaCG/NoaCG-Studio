// HOW MANY TESTS EACH TEST FILE ACTUALLY RAN - a `node --test` reporter, for scripts/gates.mjs.
//
// A test file is a gate too, and it has the same blind spot every other gate has. When a file's
// cases come from a resolved list - a catalog, a directory listing, a registry, a glob - and that
// list resolves to nothing, the file registers ZERO tests. `node --test` then reports the FILE
// itself as one passing test and exits 0, so 99 files can go green having asserted nothing.
//
// This reporter answers the one question the exit code cannot: per file, how many tests ran. It
// writes `<count>\t<repo-relative file>\trequired` rows, which is the same receipt shape
// scripts/measured.mjs writes for a check, so the runner reads both with one function.
//
// It runs BESIDE the reporter a person reads (`node --test --test-reporter=spec ...
// --test-reporter=./scripts/gates-test-count.mjs --test-reporter-destination=<file>`), so the
// build's log is unchanged.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  for (const [file, count] of counts) yield `${count}\t${file}\trequired\n`;
}
