import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import base from '../built-api-diagnostic/playwright.config';
const root = fileURLToPath(new URL('../..', import.meta.url));
const prefix = 'npm run build:e2e && ';
const servers = Array.isArray(base.webServer) ? base.webServer : [base.webServer];
let removals = 0;
const derived = servers.map(entry => {
  if (!entry?.command) throw new Error('Missing original server command');
  if (!entry.command.startsWith(prefix)) return entry;
  removals++;
  return { ...entry, command: entry.command.slice(prefix.length) };
});
if (removals !== 1 || derived.some(entry => entry?.command?.includes('build:e2e'))) throw new Error('Expected exactly one unique qualified build-prefix removal');
console.log('E5F_PROTOCOL_CONFIG ' + JSON.stringify({ removals, servers: servers.map((entry, i) => ({ original: entry!.command, derived: derived[i]!.command, url: entry!.url, reuseExistingServer: entry!.reuseExistingServer, timeout: entry!.timeout, cwd: entry!.cwd, envUnchanged: JSON.stringify(entry!.env) === JSON.stringify(derived[i]!.env) })), unchangedGlobalSetup: base.globalSetup, trace: base.use?.trace }));
export default defineConfig({ ...base, webServer: derived, tsconfig: path.resolve(root, 'e5f.local/built-api-protocol/tsconfig.observe.json') });
