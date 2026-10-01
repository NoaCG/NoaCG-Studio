// guards: src/export/spxProject.ts
//
// THE SPX PROJECT A PRODUCTION PACKAGE CARRIES (docs/SPX_ON_A_REAL_SERVER.md §11). The SPX flavour
// of the production export writes `DATAROOT/<project>/profile.json` and `data/rundown.json`, and
// SPX reads them as its own: an item that lacks a key SPX's controller reads, or carries a value
// in a form it does not expect, opens as a broken row. These pin the written files against the
// shape of SPX's own sample rundown, and the values, layers and ids the production hands over.

import test from 'node:test';
import assert from 'node:assert/strict';

const { SPX_RUNDOWN_NAME, spxProfileJson, spxRundownJson } = await import('../src/export/spxProject.ts');

// One item of the sample rundown SPX 1.4.1 ships (DATAROOT/MyFirstProject/data/MyFirstRundown.json,
// SPX-GC v.1.4.1, MIT), as it stood on disk after SPX had opened it.
const SPX_SAMPLE_ITEM = {
  description: 'Title or a headline',
  playserver: 'OVERLAY',
  playchannel: '1',
  playlayer: '2',
  webplayout: '2',
  out: 'manual',
  dataformat: 'json',
  steps: 2,
  uicolor: '3',
  DataFields: [
    { ftype: 'instruction', value: "This template has two steps. Click 'Play' and then 'Continue'..." },
    { field: 'f0', ftype: 'textfield', title: 'Main title', value: 'Now click continue' },
    { field: 'f1', ftype: 'textfield', title: 'Subtitle', value: 'Step two completed!' },
    { field: 'f99', ftype: 'filelist', title: 'Visual theme', assetfolder: './themes/', extension: 'css', value: './themes/Default.css' },
  ],
  onair: 'false',
  imported: '1773083291336',
  relpath: '/softpix/html/Template_Pack_1.4.0/TITLE_2_STEPS.html',
  itemID: '1773083297697',
};

const settings = (description, layer, steps = '1') => ({
  description,
  playserver: 'OVERLAY',
  playchannel: '1',
  playlayer: String(layer),
  webplayout: String(layer),
  out: 'manual',
  steps,
  dataformat: 'json',
  uicolor: '1',
});

const third = {
  relpath: '/my_show/hairline/hairline.html',
  settings: settings('Hairline', 1),
  fields: [
    { field: 'f0', ftype: 'textfield', title: 'Name', value: 'Alexandra Riva' },
    { field: 'f1', ftype: 'textfield', title: 'Title', value: 'Chief Correspondent' },
  ],
};
const quiz = {
  relpath: '/my_show/clean_quiz/clean_quiz.html',
  settings: settings('Clean Quiz', 2, '2'),
  fields: [
    { field: 'f0', ftype: 'textfield', title: 'Question', value: 'Which planet?' },
    { field: 'f1', ftype: 'dropdown', title: 'Correct answer', value: 'A', items: [{ text: 'A', value: 'A' }, { text: 'B', value: 'B' }] },
    { field: 'f2', ftype: 'checkbox', title: 'Show results', value: 'false' },
  ],
};
const bare = { relpath: '/my_show/bumper/bumper.html', settings: settings('Bumper', 7), fields: [] };
const templates = [third, quiz, bare];
const entries = [
  { template: 0, description: 'Anna Andersson, Presenter', values: { f0: 'Anna Andersson', f1: 'Presenter' } },
  { template: 1, description: 'Question 1', values: { f0: 'Red planet?', f1: 'B', f2: 'true' } },
  { template: 0, description: 'Ben Berg', values: { f0: 'Ben Berg' } },
  { template: 2, description: 'Bumper', values: {} },
];
const NOW = 1790900000000;
const profile = spxProfileJson(templates, NOW);
const rundown = spxRundownJson(templates, entries, NOW);
const keysOf = (o) => Object.keys(o).sort();

test('each rundown item has the keys of SPX\'s own sample item, and every setting is a string', () => {
  for (const item of rundown.templates) {
    assert.deepEqual(keysOf(item), keysOf(SPX_SAMPLE_ITEM));
    for (const [key, value] of Object.entries(item)) {
      if (key !== 'DataFields') assert.equal(typeof value, 'string', `${key} is a string`);
    }
    assert.ok(Array.isArray(item.DataFields) && item.DataFields.length > 0);
    for (const f of item.DataFields) {
      for (const key of ['ftype', 'value']) assert.equal(typeof f[key], 'string', `${key} of a field is a string`);
    }
  }
});

test('a profile template is the rundown item without its id, as SPX copies one into the other', () => {
  assert.deepEqual(keysOf(profile.templates[0]), keysOf(SPX_SAMPLE_ITEM).filter((k) => k !== 'itemID'));
  assert.equal(profile.templates.length, templates.length);
  // An item keeps its template's import stamp, the way SPX's "Add all" copies the profile entry.
  assert.deepEqual(rundown.templates.map((t) => t.imported), [0, 1, 0, 2].map((i) => profile.templates[i].imported));
});

test('both files carry SPX\'s header keys and say they are SPX-format projects', () => {
  for (const file of [profile, rundown]) {
    assert.equal(file.projectFormat, 'SPX');
    assert.equal(file.warning, 'Modifications done in the SPX will overwrite this file.');
    assert.equal(file.updated, new Date(NOW).toISOString());
    assert.ok(Array.isArray(file.templates));
  }
  assert.equal(SPX_RUNDOWN_NAME, 'rundown');
});

test('every item has its own id, in rundown order, as SPX makes them', () => {
  const ids = rundown.templates.map((t) => t.itemID);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => /^\d+$/.test(id)));
  assert.deepEqual(ids, ids.map((_, i) => String(NOW + i)));
});

test('an item plays its cue\'s values and name, on its template\'s path and layer', () => {
  const [anna, question, ben, bumper] = rundown.templates;
  assert.equal(anna.description, 'Anna Andersson, Presenter');
  assert.equal(anna.relpath, '/my_show/hairline/hairline.html');
  assert.deepEqual(anna.DataFields.map((f) => f.value), ['Anna Andersson', 'Presenter']);
  // A value the cue does not carry keeps the template's own.
  assert.deepEqual(ben.DataFields.map((f) => f.value), ['Ben Berg', 'Chief Correspondent']);
  assert.equal(question.steps, '2');
  assert.deepEqual([question.playlayer, question.webplayout], ['2', '2']);
  // A layer past SPX Solo's five is written as it is: SPX 1.2 and the paid editions hold it, and
  // Solo plays it on layer 5, which the package README says.
  assert.deepEqual([bumper.playlayer, bumper.webplayout], ['7', '7']);
  assert.deepEqual(question.DataFields[1].items, quiz.fields[1].items);
  // Defaults stay in the profile.
  assert.deepEqual(profile.templates[0].DataFields.map((f) => f.value), ['Alexandra Riva', 'Chief Correspondent']);
});

test('a checkbox is written "1" or "0", the values SPX\'s controller ticks and saves', () => {
  assert.equal(rundown.templates[1].DataFields[2].value, '1');
  assert.equal(profile.templates[1].DataFields[2].value, '0');
});

test('a template without fields gets the instruction row SPX\'s import gives it', () => {
  assert.deepEqual(rundown.templates[3].DataFields, [{ ftype: 'instruction', value: 'No editable fields' }]);
});
