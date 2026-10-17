// A local plugin install is copied to Codex's cache. The explicitly prepared worktree owns
// the dependencies and editable source; never use the cache's copy of the fixture.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const { runtimeRoot } = JSON.parse(await readFile(new URL('./runtime.local.json', import.meta.url), 'utf8'));
if (!path.isAbsolute(runtimeRoot)) throw new Error('Run npm run build in the preview trial before installing it.');
const { start } = await import(pathToFileURL(path.join(runtimeRoot, 'server.mjs')).href);
await start();
