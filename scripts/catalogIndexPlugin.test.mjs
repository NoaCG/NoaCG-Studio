// guards: src/templates/**, src/model/fonts.ts, src/model/templateVocabulary.ts
//
// The catalog index the remote MCP connector reads (scripts/catalogIndexPlugin.mjs,
// src/templates/catalogIndex.ts), built from the REAL registry the way the dev server and the build
// build it. Everything here would otherwise fail silently in a chat: a design whose palette or font
// is not in the index is a recipe the send tool cannot honour, a duplicate id makes a recipe
// ambiguous, and a type with no designs or no fields is one a chat client can name but not fill.

import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { catalogIndexJson } from './catalogIndexPlugin.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the catalog index holds every registered type, and every name in it resolves', { timeout: 120_000 }, async () => {
  const server = await createServer({ root, configFile: path.join(root, 'vite.config.ts'), server: { middlewareMode: true }, appType: 'custom', logLevel: 'warn' });
  try {
    const json = await catalogIndexJson(server);
    const index = JSON.parse(json);
    const { TYPES } = await server.ssrLoadModule('/src/templates/types/registry.ts');

    assert.equal(index.version, 1);
    assert.deepEqual(index.types.map((t) => t.id), TYPES.map((t) => t.id), 'every registered type, in registry order');
    const palettes = new Set(index.palettes.map((p) => p.id));
    const fonts = new Set(index.fonts.map((f) => f.id));
    const categories = new Set(index.categories.map((c) => c.id));
    const designIds = new Set();
    for (const type of index.types) {
      assert.ok(categories.has(type.category), `${type.id}: category ${type.category} is listed`);
      assert.ok(type.fields.length > 0, `${type.id} has fields`);
      assert.ok(type.designs.length > 0, `${type.id} has designs`);
      assert.equal(new Set(type.fields.map((f) => f.key)).size, type.fields.length, `${type.id}: field keys are unique`);
      for (const design of type.designs) {
        assert.ok(!designIds.has(design.id), `design id ${design.id} is unique across the catalog`);
        designIds.add(design.id);
        assert.ok(palettes.has(design.palette), `${design.id}: palette ${design.palette} is in the index`);
        assert.ok(fonts.has(design.font), `${design.id}: font ${design.font} is in the index`);
      }
    }
    // Read by a serverless function on a cold start and cached per instance: it stays small.
    assert.ok(json.length < 400_000, `${json.length} bytes`);
    console.log(`catalog index: ${index.types.length} types, ${designIds.size} designs, ${palettes.size} palettes, ${fonts.size} fonts, ${json.length} bytes`);
  } finally {
    await server.close();
  }
});
