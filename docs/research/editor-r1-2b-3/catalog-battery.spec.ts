import { test } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
test('catalog rendered battery for the shared editor helpers', async () => {
  test.setTimeout(120 * 60 * 1000);
  for (const args of [['scripts/type-floor.mjs'], ['scripts/overflow-sweep.mjs', '--baseline'], ['scripts/field-coverage.mjs'], ['scripts/numerals.mjs'], ['scripts/factory.mjs']]) {
    const result = await execute(process.execPath, args, { cwd: process.cwd(), env: process.env, timeout: 60 * 60 * 1000, maxBuffer: 20 * 1024 * 1024 });
    console.log(result.stdout); if (result.stderr) console.log(result.stderr);
  }
});
