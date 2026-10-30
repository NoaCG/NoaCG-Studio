#!/usr/bin/env node
// gate: build
// guards: docs/tutorials/svg-examples/**, public/docs/examples/svg-examples/**, src/templates/behaviours/**
// The downloaded examples cover the actual recipe registry, and each advertised example has
// its editable Illustrator source, original SVG, preview and identical public download.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { measured } from './measured.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const text = (file) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

export function registeredRecipes(root = ROOT) {
  const dir = path.join(root, 'src/templates/behaviours');
  const registry = text(path.join(dir, 'registry.ts'));
  const list = registry.match(/BEHAVIOUR_RECIPES[^=]*=\s*\[([^\]]+)\]/)?.[1];
  assert.ok(list, 'behavior registry declaration must be readable');
  const names = list.split(',').map((name) => name.trim()).filter(Boolean);
  return names.map((name) => {
    const module = registry.match(new RegExp(`import\\s*\\{\\s*${name}\\s*\\}\\s*from\\s*['"]([^'"]+)['"]`))?.[1];
    assert.ok(module, `recipe ${name} must have its declared module`);
    const source = text(path.join(dir, `${module}.ts`));
    const value = source.match(new RegExp(`export const ${name}[^=]*=\\s*\\{\\s*id:\\s*([^,]+),`))?.[1].trim();
    assert.ok(value, `recipe ${name} must declare its id`);
    const literal = /^['"]([^'"]+)['"]$/.exec(value)?.[1];
    const constant = source.match(new RegExp(`const ${value}\\s*=\\s*['"]([^'"]+)['"]`))?.[1];
    assert.ok(literal ?? constant, `recipe ${name} id must resolve to its declared string`);
    return literal ?? constant;
  });
}

export function checkCoverage(root = ROOT, inventory) {
  const folder = path.join(root, 'docs/tutorials/svg-examples');
  const examples = inventory ?? JSON.parse(text(path.join(folder, 'examples.json')));
  const ids = registeredRecipes(root);
  assert.equal(new Set(examples.map((entry) => entry.slug)).size, examples.length, 'example filenames are unique');
  const supplied = examples.filter((entry) => entry.recipe).map((entry) => entry.recipe);
  for (const id of ids) assert.ok(supplied.includes(id), `SVG import behavior ${id} needs an example`);
  for (const id of supplied) assert.ok(ids.includes(id), `example refers to unsupported behavior ${id}`);
  assert.deepEqual(readdirSync(path.join(folder, 'SVG')).filter((file) => file.endsWith('.svg')).sort(), examples.map((entry) => `${entry.slug}.svg`).sort(), 'the inventory covers every SVG in the download');
  for (const entry of examples) {
    const original = text(path.join(folder, 'SVG', `${entry.slug}.svg`));
    assert.match(original, /Generator: Adobe Illustrator/, `${entry.slug}: export from the editable source in Illustrator`);
    assert.equal(text(path.join(root, 'public/docs/examples/svg-examples', `${entry.slug}.svg`)), original, `${entry.slug}: public SVG is the original export`);
    assert.equal(readFileSync(path.join(folder, 'Illustrator', `${entry.slug}.ai`)).subarray(0, 4).toString(), '%PDF', `${entry.slug}: PDF-compatible Illustrator source`);
    assert.equal(readFileSync(path.join(folder, 'Previews', `${entry.preview}.png`)).subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${entry.slug}: PNG preview`);
  }
  return { examples: examples.length, behaviors: ids.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = checkCoverage();
    measured(result.examples, 'SVG example source sets');
    measured(result.behaviors, 'supported SVG import behaviors');
    console.log(`check-svg-example-coverage: ${result.examples} Illustrator examples cover all ${result.behaviors} SVG import behaviors`);
  } catch (error) {
    console.error(`check-svg-example-coverage: ${error.message}`);
    process.exitCode = 1;
  }
}
