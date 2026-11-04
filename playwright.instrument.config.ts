// TIMING INSTRUMENTS (e2e/instruments/): the live config's backend, server and browser, pointed at a
// folder no suite runs, the way playwright.endurance.config.ts keeps the endurance walk out of the
// suites. An instrument asserts behaviour only as far as its readings need and prints timings for a
// person to read, so it runs when asked: by hand, or hosted-latency.yml's `spec` dispatch.
//
//   npx playwright test --config=playwright.instrument.config.ts e2e/instruments/press-latency.ts
import { defineConfig } from '@playwright/test';
import live from './playwright.live.config';

export default defineConfig({
  ...live,
  testDir: './e2e/instruments',
  testMatch: '*.ts',
});
