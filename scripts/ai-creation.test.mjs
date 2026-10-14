// gate: factory
// needs: browser
// guards: src/ai/creation.ts
//
// THE CREATE WITH AI RUN, in Node (docs/work-specs/wizard-ai/spec.md section 4, AC-13).
//
// The step used to hold the tier dispatch inline, and the only test of it was a browser suite
// that had been skipped for months. Here every route runs against a stub provider whose answer
// the test holds and releases, so three things are pinned per route: which provider call runs
// with exactly which options (validation is forwarded per route, spec D3: the raw route passes
// the busy line only and is screened on display instead), what a late or thrown answer does, and
// that an answer arriving after the caller abandoned the run still goes to whoever awaits it -
// the module keeps no state between runs, so placing or dropping a late result stays the step's
// decision (issue #1165; `e2e/ai.spec.ts` pins what the step does with it today).
//
// The Pro tier is never selected while its door is closed (issue #771) but must keep running as
// written. It reaches no provider: its network is the reservation, the design-language call and
// the outcome report, so it runs against a stubbed `fetch`. Up to the design call that is plain
// Node; composing the graphic creates a catalog design, which parses html with `DOMParser`
// (`scripts/catalog-emit.mjs` measured every design failing in bare Node), so the one test that
// lets a Pro run finish does it on a blank Chromium page, as the catalog gates do.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { rolldown } from 'rolldown';
import { rawSuffix } from './rolldown-raw.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (file) => path.join(projectRoot, file).replaceAll('\\', '/');
const ENTRY = 'ai-creation-test-entry';

/** One bundle, so `LiteUnsupportedError` here is the class the module tests `instanceof`
 *  against. The backend is signed out: a bearer token is the run's only use of it. */
const harnessPlugin = {
  name: 'ai-creation-test',
  resolveId: (id) => (id === ENTRY ? id : null),
  load(id) {
    if (id === ENTRY) {
      return [
        `export * from '${src('src/ai/creation.ts')}';`,
        `export { LiteUnsupportedError } from '${src('src/ai/lite/client.ts')}';`,
        `export { validateTemplate } from '${src('src/validation/validateTemplate.ts')}';`,
      ].join('\n');
    }
    if (id.replaceAll('\\', '/').endsWith('/src/backend/auth.ts')) {
      return 'export async function getAccessToken() { return null; }';
    }
    return null;
  },
};

/** One build, as an offline build sees it (no environment, so settings take their defaults),
 *  emitted twice: an ES module for Node and a script for the one Chromium page. */
const built = await rolldown({
  input: ENTRY,
  platform: 'browser',
  plugins: [rawSuffix, harnessPlugin],
  transform: { define: { 'import.meta.env': '{}' } },
  logLevel: 'silent',
});
const emit = async (format) => (await built.generate({ format, codeSplitting: false, ...(format === 'iife' ? { name: 'NOACG_CREATION' } : {}) })).output[0].code;
const [esm, PAGE_SCRIPT] = [await emit('esm'), await emit('iife')];
await built.close();

const {
  creationError,
  creationRoute,
  runCreation,
  screenChange,
  LiteUnsupportedError,
  validateTemplate,
} = await import(`data:text/javascript;base64,${Buffer.from(esm, 'utf8').toString('base64')}`);

// ── Helpers ──────────────────────────────────────────────────────────────────────────────

const deferred = () => Promise.withResolvers();

/** Let every queued microtask and timer callback run. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

/** Whether a promise has settled yet, without awaiting it. */
function watch(promise) {
  const state = { done: false };
  promise.then(() => { state.done = true; }, () => { state.done = true; });
  return state;
}

/** A provider whose every call is recorded and answers only when the test says so. */
function stubProvider() {
  const calls = [];
  const profiles = [];
  const answer = (method) => (...args) => {
    const d = deferred();
    calls.push({ method, args, ...d });
    return d.promise;
  };
  const provider = {
    generate: answer('generate'),
    generateRaw: answer('generateRaw'),
    generateAlternatives: answer('generateAlternatives'),
    convertImport: answer('convertImport'),
    modify: answer('modify'),
  };
  return {
    calls,
    profiles,
    provider: (profile) => {
      profiles.push(profile);
      return provider;
    },
  };
}

const PASS = { ok: true, errors: [], warnings: [] };
const FAIL = { ok: false, errors: [{ rule: 'stub', message: 'fails' }], warnings: [] };

function harness() {
  const stub = stubProvider();
  const progress = [];
  const probed = [];
  const io = {
    provider: stub.provider,
    validate: async () => PASS,
    structuralCheck: async () => [],
    probeMark: async (asset) => {
      probed.push(asset);
      return null;
    },
    onProgress: (stage) => progress.push(stage),
  };
  return { stub, progress, probed, io };
}

/** A template as a provider returns one. The routes never read it; the screen does. */
const template = (name) => ({
  name,
  type: 'lower-third',
  resolution: { width: 1920, height: 1080 },
  fps: 50,
  html: '<div class="lt"><div id="f0">Name</div></div>',
  css: '.lt { position: absolute; }',
  js: 'function play() {}\nfunction stop() {}\nfunction update(data) {}\nfunction next() {}',
  fields: [],
  settings: {},
  assets: [],
  layers: [],
});
const change = (name, extra = {}) => ({ summary: name, template: template(name), ...extra });
const IMPORTED = template('Imported');
const PRO = { asIs: null, spec: null, proPackage: ['lower-third'], resolution: IMPORTED.resolution, fps: 50 };

function input(route, extra = {}) {
  return {
    route,
    brief: 'A lower third for the evening news',
    context: { images: [], palette: null, resolution: IMPORTED.resolution, fps: 50 },
    imported: route === 'convert' ? IMPORTED : null,
    pro: PRO,
    ...extra,
  };
}

/**
 * Section 4, one row each: the call, the profile asked of `io.provider`, the busy line the run
 * opens with, and whether the step's checks travel with the call.
 */
const ROWS = [
  { route: 'convert', method: 'convertImport', profile: undefined, label: 'Converting your template…', checked: true },
  { route: 'lite', method: 'generate', profile: 'lite', label: 'Creating your graphic…', checked: true },
  { route: 'raw', method: 'generateRaw', profile: undefined, label: 'Generating…', checked: false },
  { route: 'directions', method: 'generateAlternatives', profile: undefined, label: 'Designing three directions…', checked: true },
];

/** What the provider answers for a row: one change, or the directions' list. */
const answerFor = (row, name) => (row.route === 'directions' ? [change(`${name} A`), change(`${name} B`)] : change(name));
const asList = (answer) => (Array.isArray(answer) ? answer : [answer]);

// ── Which route runs ─────────────────────────────────────────────────────────────────────

test('a Generate press takes the route section 4 selects, in its order of precedence', () => {
  const state = (over) => ({ imported: null, liteActive: false, proMode: false, useHarness: true, ...over });
  assert.equal(creationRoute(state({ imported: { confirmed: true } })), 'convert');
  assert.equal(creationRoute(state({ proMode: true, liteActive: true })), 'pro');
  assert.equal(creationRoute(state({ liteActive: true, useHarness: false })), 'lite');
  assert.equal(creationRoute(state({ useHarness: false })), 'raw');
  assert.equal(creationRoute(state({})), 'directions');
  // An import is never converted unconfirmed, by Lite or by Pro; each says so before any call.
  assert.match(creationRoute(state({ imported: { confirmed: false }, liteActive: true })).refused, /^Confirm the imported template project format/);
  assert.match(creationRoute(state({ imported: { confirmed: true }, liteActive: true })).refused, /^Create with AI does not convert imported templates/);
  assert.match(creationRoute(state({ imported: { confirmed: true }, proMode: true })).refused, /^This route designs a new look/);
});

// ── Each provider route: the call, a late answer, a thrown one, an abandoned run ─────────

for (const row of ROWS) {
  test(`${row.route}: one ${row.method} call with the options section 4 names, answered late`, async () => {
    const { stub, progress, io } = harness();
    const run = runCreation(input(row.route), io);
    const state = watch(run);
    await settle();

    // The busy line opens before the provider is reached, and the run waits on the answer.
    assert.equal(progress[0], row.label);
    assert.equal(state.done, false);
    assert.deepEqual(stub.calls.map((c) => c.method), [row.method]);
    assert.deepEqual(stub.profiles, [row.profile]);

    const [call] = stub.calls;
    const { brief, context } = input(row.route);
    assert.deepEqual(call.args.slice(0, -1), row.route === 'convert' ? [brief, IMPORTED, context] : [brief, context]);
    if (row.route === 'convert') assert.equal(call.args[1], IMPORTED, 'the convert source is the imported template');
    const options = call.args.at(-1);
    if (row.checked) {
      // The step's own validator and structural check, not copies, ride with the call.
      const keys = ['onProgress', 'structuralCheck', 'validate', ...(row.profile ? ['profile'] : [])].sort();
      assert.deepEqual(Object.keys(options).sort(), keys);
      assert.equal(options.validate, io.validate);
      assert.equal(options.structuralCheck, io.structuralCheck);
      if (row.profile) assert.equal(options.profile, 'lite');
    } else {
      // The raw route (harness off) is the unvalidated baseline: only the busy line travels.
      assert.deepEqual(Object.keys(options), ['onProgress']);
    }
    assert.equal(options.onProgress, io.onProgress);
    options.onProgress('Testing it live…');
    assert.equal(progress.at(-1), 'Testing it live…');

    const answer = answerFor(row, 'Late');
    call.resolve(answer);
    const outcome = await run;
    assert.deepEqual(outcome, { changes: asList(answer), selected: 0 });
    assert.equal(outcome.changes[0], asList(answer)[0], 'the answer itself, not a copy');
  });

  test(`${row.route}: a thrown answer reaches the caller and says what failed`, async () => {
    const { stub, io } = harness();
    const run = runCreation(input(row.route), io);
    await settle();
    const refusal = new LiteUnsupportedError('unsupported_category', 'Only lower thirds today.', 'a lower third for the news');
    stub.calls[0].reject(refusal);
    const error = await run.then(() => null, (e) => e);
    assert.equal(error, refusal);
    // A whole-result route offers Lite's suggested brief; the directions say only the message.
    assert.equal(
      creationError(error, row.route),
      row.route === 'directions' ? 'Only lower thirds today.' : 'Only lower thirds today. Try: a lower third for the news',
    );
    assert.equal(creationError(new LiteUnsupportedError('unsupported_category', 'No suggestion.'), row.route), 'No suggestion.');
    assert.equal(creationError(new Error('Gateway down'), row.route), 'Gateway down');
    assert.equal(creationError('offline', row.route), 'offline');
  });

  test(`${row.route}: an answer after the caller abandoned the run still goes to that run`, async () => {
    const first = harness();
    const abandoned = runCreation(input(row.route), first.io);
    await settle();
    // The reader starts over: a second run answers while the first is still out.
    const second = harness();
    const fresh = runCreation(input(row.route), second.io);
    await settle();
    const freshAnswer = answerFor(row, 'Fresh');
    second.stub.calls[0].resolve(freshAnswer);
    assert.deepEqual((await fresh).changes, asList(freshAnswer));

    // The late stage and answer belong to the abandoned run and touch nothing of the fresh one.
    first.stub.calls[0].args.at(-1).onProgress('Testing it live…');
    const lateAnswer = answerFor(row, 'Late');
    first.stub.calls[0].resolve(lateAnswer);
    assert.deepEqual((await abandoned).changes, asList(lateAnswer));
    assert.equal(first.progress.at(-1), 'Testing it live…');
    assert.deepEqual(second.progress, [row.label]);
  });
}

test('convert: without an imported template there is nothing to convert, and no call', async () => {
  const { stub, io } = harness();
  await assert.rejects(runCreation(input('convert', { imported: null }), io), /Nothing imported to convert/);
  assert.equal(stub.calls.length, 0);
});

test('directions: the first passing direction is shown first, else the first; none is none', async () => {
  const cases = [
    { list: [change('A', { validation: FAIL }), change('B', { validation: PASS }), change('C', { validation: PASS })], selected: 1 },
    { list: [change('A', { validation: FAIL }), change('B')], selected: 0 },
    { list: [], selected: 0 },
  ];
  for (const { list, selected } of cases) {
    const { stub, io } = harness();
    const run = runCreation(input('directions'), io);
    await settle();
    stub.calls[0].resolve(list);
    assert.deepEqual(await run, { changes: list, selected });
  }
  // "Three more like this" says so on the busy line.
  const { stub, progress, io } = harness();
  const seeded = runCreation(input('directions', { context: { ...input('directions').context, seed: { variantId: 'ltc01' } } }), io);
  await settle();
  assert.equal(progress[0], 'Designing three more in that spirit…');
  stub.calls[0].resolve([]);
  await seeded;
});

// ── The raw route's screen ───────────────────────────────────────────────────────────────

test('the screen validates a result that carries no verdict and adds the safety findings', () => {
  // The raw route's result is shown through the screen: with no verdict of its own it gets the
  // static validator's, and a construct the safety screen forbids is added to it.
  const clean = change('Clean');
  assert.deepEqual(screenChange(clean), validateTemplate(clean.template));

  const leaky = change('Leaky');
  leaky.template.js += "\nfetch('https://example.com/collect');";
  const base = validateTemplate(leaky.template);
  const screened = screenChange(leaky);
  assert.equal(screened.ok, false);
  assert.deepEqual(screened.errors.slice(0, base.errors.length), base.errors);
  const added = screened.errors.slice(base.errors.length);
  assert.ok(added.length > 0 && added.some((e) => /fetch|network/i.test(`${e.rule} ${e.message}`)), JSON.stringify(added));

  // A verdict the result carries is kept and the screen adds to it; a clean one passes untouched.
  const carried = screenChange({ ...leaky, validation: FAIL });
  assert.deepEqual(carried.errors, [...FAIL.errors, ...added]);
  assert.equal(screenChange({ ...clean, validation: PASS }), PASS);

  // A construct the imported source already had is not reported as the AI's.
  assert.equal(screenChange({ ...leaky, validation: PASS }, leaky.template), PASS);
});

// ── The Pro tier, kept as written ────────────────────────────────────────────────────────

/** The hosted routes the Pro tier calls. Each reservation is its own deferred, so two runs can
 *  be held and released in any order; the design call answers with a language or a refusal. */
function proNetwork({ hold = false, refuse = false } = {}) {
  const requests = [];
  const reservations = [];
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fetch = async (url, init = {}) => {
    requests.push({ url, body: init.body ? JSON.parse(init.body) : null });
    if (url === '/api/ai/pro-generations') {
      const held = deferred();
      reservations.push(held);
      if (!hold) held.resolve();
      await held.promise;
      return json({ generationId: `pro-gen-${reservations.indexOf(held) + 1}`, expiresAt: '2099-01-01T00:00:00Z', maxGenerationCostUsd: 0.5 });
    }
    if (url === '/api/ai/generate') {
      if (refuse) return json({ error: { code: 'invalid_request', message: 'The brief was refused.', retryable: false } }, 400);
      return json({ output: { name: 'Evening Slate', rationale: 'Calm and legible.' }, usage: {}, model: 'stub-model' });
    }
    if (url === '/api/ai/pro-outcome') return json({ ok: true });
    throw new Error(`unexpected request ${url}`);
  };
  const outcomes = () => requests.filter((r) => r.url === '/api/ai/pro-outcome').map((r) => r.body);
  return { requests, reservations, fetch, outcomes };
}

async function withFetch(network, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = network.fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

test('pro: a late reservation holds the run; a refused design call is reported failed and thrown', async () => {
  const network = proNetwork({ hold: true, refuse: true });
  await withFetch(network, async () => {
    const { stub, progress, probed, io } = harness();
    const mark = { path: 'images/logo.png', data: 'data:image/png;base64,AAAA' };
    const run = runCreation(input('pro', { pro: { ...PRO, asIs: mark } }), io);
    const state = watch(run);
    await settle();
    // The mark is measured through the step's probe before anything is sent.
    assert.deepEqual(probed, [mark]);
    assert.equal(progress[0], 'Designing the on-air look…');
    assert.equal(state.done, false);
    assert.deepEqual(network.requests.map((r) => r.url), ['/api/ai/pro-generations']);

    network.reservations[0].resolve();
    const error = await run.then(() => null, (e) => e);
    assert.equal(creationError(error, 'pro'), 'The brief was refused.');
    assert.deepEqual(network.requests.map((r) => r.url), ['/api/ai/pro-generations', '/api/ai/generate', '/api/ai/pro-outcome']);
    assert.equal(network.requests[1].body.proGenerationId, 'pro-gen-1', 'the design call is booked on its reservation');
    assert.deepEqual(network.outcomes().map((o) => [o.generationId, o.status, o.reason]), [['pro-gen-1', 'failed', 'generation_failed']]);
    assert.equal(stub.calls.length, 0, 'the Pro tier asks no provider');
  });
});

test('pro: a reservation that lands after the caller abandoned the run still goes to that run', async () => {
  const network = proNetwork({ hold: true, refuse: true });
  await withFetch(network, async () => {
    const first = harness();
    const abandoned = runCreation(input('pro'), first.io).then(() => null, (e) => e);
    await settle();
    const second = harness();
    const fresh = runCreation(input('pro'), second.io).then(() => null, (e) => e);
    await settle();
    network.reservations[1].resolve();
    assert.equal((await fresh).message, 'The brief was refused.');
    assert.deepEqual(network.outcomes().map((o) => o.generationId), ['pro-gen-2']);

    network.reservations[0].resolve();
    assert.equal((await abandoned).message, 'The brief was refused.');
    assert.deepEqual(network.outcomes().map((o) => o.generationId), ['pro-gen-2', 'pro-gen-1']);
    assert.deepEqual([first.progress, second.progress], [['Designing the on-air look…', 'Designing the on-air look…'], ['Designing the on-air look…', 'Designing the on-air look…']]);
  });
});

test('pro: a finished run carries its package, ran the step validator, and reports usable', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ content: PAGE_SCRIPT });
    const seen = await page.evaluate(async () => {
      const requests = [];
      const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
      window.fetch = async (url, init = {}) => {
        requests.push({ url, body: init.body ? JSON.parse(init.body) : null });
        if (url === '/api/ai/pro-generations') return json({ generationId: 'pro-gen-1', expiresAt: '2099-01-01T00:00:00Z', maxGenerationCostUsd: 0.5 });
        if (url === '/api/ai/generate') return json({ output: { name: 'Evening Slate', rationale: 'Calm and legible.' }, usage: {}, model: 'stub-model' });
        return json({ ok: true });
      };
      const progress = [];
      const validated = [];
      const io = {
        provider: () => { throw new Error('the Pro tier asks no provider'); },
        validate: async (t) => {
          validated.push(t);
          return { ok: true, errors: [], warnings: [] };
        },
        structuralCheck: async () => [],
        probeMark: async () => null,
        onProgress: (stage) => progress.push(stage),
      };
      const outcome = await window.NOACG_CREATION.runCreation({
        route: 'pro',
        brief: 'A lower third for the evening news',
        context: { images: [], palette: null },
        imported: null,
        pro: { asIs: null, spec: null, proPackage: ['lower-third', 'countdown'], resolution: { width: 1920, height: 1080 }, fps: 50 },
      }, io);
      const [only] = outcome.changes;
      return {
        count: outcome.changes.length,
        selected: outcome.selected,
        path: only.path,
        summary: only.summary,
        validationOk: only.validation?.ok ?? null,
        detailsIsResult: outcome.pro.details.template === only.template,
        pack: outcome.pro.pack.map((m) => ({ id: m.id, html: m.template.html === only.template.html, name: m.template.name })),
        dropped: outcome.pro.dropped,
        validatedResult: validated.includes(only.template),
        validatedCount: validated.length,
        progress,
        urls: requests.map((r) => r.url),
        outcome: requests.at(-1).body,
      };
    });
    assert.equal(seen.count, 1);
    assert.equal(seen.selected, 0);
    assert.equal(seen.path, 'pro');
    assert.equal(seen.summary, 'Evening Slate: Calm and legible.');
    assert.equal(seen.detailsIsResult, true);
    // The package leads with the previewed graphic, the countdown composed from the same language,
    // each named for what it is (`namedPackage`).
    assert.deepEqual(seen.pack.map((m) => [m.id, m.html]), [['lower-third', true], ['countdown', false]]);
    assert.deepEqual(seen.pack.map((m) => m.name), ['Evening Slate lower third', 'Evening Slate countdown']);
    assert.deepEqual(seen.dropped, []);
    // Every member went through the step's validator (the primary, then the countdown).
    assert.equal(seen.validatedResult, true);
    assert.equal(seen.validatedCount, 2);
    assert.deepEqual(seen.progress, ['Designing the on-air look…', 'Designing the on-air look…', 'Building the graphic in it…', 'Validating and testing playout…']);
    assert.deepEqual(seen.urls, ['/api/ai/pro-generations', '/api/ai/generate', '/api/ai/pro-outcome']);
    assert.equal(seen.validationOk, true);
    assert.equal(seen.outcome.status, 'usable');
    assert.equal(seen.outcome.generationId, 'pro-gen-1');
  } finally {
    await browser.close();
  }
});
