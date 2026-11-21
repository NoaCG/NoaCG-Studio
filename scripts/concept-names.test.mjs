// guards: src/templates/behaviours/**, src/templates/types/**, src/model/types.ts, docs/template-library/names.json, docs/SVG_AUTHORING.md, docs/tutorials/**, public/docs/examples/**, src/components/**, src/landing/**, src/docs/**, *.html, cli/README.md, cli/skill/**, cli/plugin/skills/**, .claude/skills/noacg-graphic-local/**, .agents/skills/noacg-graphic-local/**
//
// AC-8 of the SVG Template Library plan: one name per concept across the app, the docs, the
// templates and their inventories, with ids unchanged (docs/template-library/names.json).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkRegistryNames, findRetired, loadNames, retiredPattern, scanSurfaces, stripComments } from './concept-names.mjs';
import { withSsrServer } from './catalogIndexPlugin.mjs';
import { measured } from './measured.mjs';

const names = loadNames();

test('a retired label matches as a whole phrase in any case, never inside a longer word or a file name', () => {
  assert.ok(retiredPattern('Score tracker').test('the score  tracker shipped'));
  assert.ok(!retiredPattern('Vote result').test('Vote results'));
  assert.ok(!retiredPattern('Name tag').test('name-tag.svg'));
  const concepts = [{ name: 'Scoreboard', retired: ['Score tracker'] }];
  assert.deepEqual(findRetired('one\nA Score tracker here', concepts), [{ label: 'Score tracker', name: 'Scoreboard', line: 2 }]);
});

test('comments are not copy; strings and JSX text are', () => {
  const source = "// Score tracker\nconst a = 'Score tracker'; /* Score\ntracker */\n<p>Score tracker</p>\nconst url = 'https://x'; // Score tracker";
  const stripped = stripComments(source);
  assert.equal(stripped.split('\n').length, source.split('\n').length, 'line numbers are kept');
  assert.deepEqual(findRetired(stripped, [{ name: 'Scoreboard', retired: ['Score tracker'] }]).map((hit) => hit.line), [2, 4]);
});

test('the registries carry each concept name, and no two recipes or types share one', () => {
  const recipes = [{ id: 'score', name: 'Score tracker' }, { id: 'meter', name: 'Goal meter' }];
  const types = [{ id: 'a', name: 'Lineup' }, { id: 'b', name: 'Lineup' }];
  const problems = checkRegistryNames(
    { concepts: [{ name: 'Scoreboard', recipe: 'score', kind: ['countdown'] }, { name: 'Lower third', type: 'lower-third' }] },
    { recipes, types, kindLabel: () => 'Timer' },
  );
  assert.deepEqual(problems, [
    'recipe score is named "Score tracker" - say "Scoreboard"',
    'kind countdown reads "Timer" on a chip - say "Scoreboard"',
    'type lower-third (Lower third) is not registered',
    'a and b share the name "Lineup"',
  ]);
});

test('every user-facing surface uses the current names', () => {
  const { files, problems } = scanSurfaces();
  measured(files, 'files read for retired concept names');
  assert.deepEqual(problems, []);
});

test('the real registries and kind labels carry the concept names', { timeout: 120_000 }, async () => {
  await withSsrServer(async (server) => {
    const { TYPES } = await server.ssrLoadModule('/src/templates/types/registry.ts');
    const { BEHAVIOUR_RECIPES } = await server.ssrLoadModule('/src/templates/behaviours/registry.ts');
    const { graphicKindLabel } = await server.ssrLoadModule('/src/model/types.ts');
    measured(names.concepts.length, 'concept names');
    assert.deepEqual(checkRegistryNames(names, { recipes: BEHAVIOUR_RECIPES, types: TYPES, kindLabel: graphicKindLabel }), []);
  });
});
