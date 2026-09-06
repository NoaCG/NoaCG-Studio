// THE CORPUS PIN for the Pro Harness's exemplar measurements (src/ai/pro/harness/exemplars.ts,
// docs/PRO_HARNESS_PLAN.md §3.4).
//
// The module ships a CONSTANT - what the shipped catalog's stylesheets set, per kind of graphic -
// and a constant derived from 504 designs is worthless the moment a design changes and nobody
// notices. So this test re-derives the whole table from the LIVE catalog and the designs' own
// sources and fails on any difference, printing the regenerated block and the file it wrote it
// to. Nothing here is hand-maintained; the derivation is the single implementation, exported
// from the module and called by both sides.
//
// NO BROWSER, DELIBERATELY. The catalog resolves through Vite's SSR module graph - the same load
// `scripts/prerender.mjs` does in the build - which gives the real categories, ids and type
// back-pointers without a page. `variant.create()` is NOT called: it needs a real DOM
// (`scripts/catalog-emit.mjs` measured all 504 designs failing in bare Node on `DOMParser`), and
// the numbers wanted here are the AUTHORED ones, which live in the source text either way.
//
// The second half pins the withholding: a card carries numbers and role words, never a design's
// code, selectors, id or name, and a request that names no kind of graphic gets no card at all.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import { buildApiRuntime, projectRoot } from './api-runtime-build.mjs';

const runtime = await buildApiRuntime(['src/ai/pro/harness/agent.ts', 'src/ai/pro/harness/exemplars.ts']);
after(async () => { await runtime.cleanup(); });

/** tsc collapses rootDir to the common ancestor of its inputs, so find a module by its tail. */
function emitted(tail) {
  const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
  const hit = walk(runtime.outputDir).find((p) => p.replaceAll('\\', '/').endsWith(tail));
  if (!hit) throw new Error(`emitted module not found: ${tail}`);
  return import(pathToFileURL(hit).href);
}

const exemplars = await emitted('harness/exemplars.js');
const agent = await emitted('harness/agent.js');

// ── The corpus, read the way the module says it is read ──────────────────────────────────────

const TEMPLATES_DIR = path.join(projectRoot, 'src/templates');

function sourceFiles() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.ts')) out.push(p);
    }
  };
  walk(TEMPLATES_DIR);
  return out;
}

/** Every design list the catalog actually resolves, through Vite's SSR graph. */
async function loadCatalog() {
  const server = await createServer({
    root: projectRoot,
    configFile: path.join(projectRoot, 'vite.config.ts'),
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'warn',
  });
  try {
    const module = await server.ssrLoadModule('/src/templates/catalog.ts');
    return Object.entries(module.CATALOG).map(([category, variants]) => ({
      category,
      ids: (variants ?? []).map((v) => v.id),
      typeIds: [...new Set((variants ?? []).map((v) => v.typeId).filter(Boolean))],
    })).sort((a, b) => a.category.localeCompare(b.category));
  } finally {
    await server.close();
  }
}

/**
 * Which sources hold a category's design CSS. A file DECLARES a design when it writes that
 * design's id; a file in the same directory that declares no id at all is that category's shared
 * part (`scoreboards/shared.ts`, `scoreboards/scorebugShared.ts`) and carries CSS every design in
 * it inherits. `types/` is the one directory excluded from that widening: its files are the type
 * compilers, so a single declaring file there must not drag in every other type.
 */
function filesForCategory(files, textOf, ids) {
  const wanted = new Set(ids);
  const declaring = files.filter((f) => [...idsIn(textOf(f))].some((id) => wanted.has(id)));
  const dirs = new Set(
    declaring.filter((f) => !path.dirname(f).endsWith(`${path.sep}types`)).map((f) => path.dirname(f)),
  );
  const shared = files.filter((f) => dirs.has(path.dirname(f)) && idsIn(textOf(f)).size === 0);
  return [...new Set([...declaring, ...shared])].sort();
}

function idsIn(text) {
  return new Set([...text.matchAll(/\bid:\s*'([A-Za-z0-9_-]+)'/g)].map((m) => m[1]));
}

const remember = (read) => {
  const cache = new Map();
  return (key) => {
    if (!cache.has(key)) cache.set(key, read(key));
    return cache.get(key);
  };
};

const textOf = remember((f) => readFileSync(f, 'utf8'));
const measureOf = remember((f) => exemplars.measureCss(textOf(f)));

// ONE catalog load for the whole file. It boots a Vite SSR graph (~3 s), and a second call in a
// later test paid that again for the same answer.
const catalog = await loadCatalog();

function deriveCorpora() {
  const files = sourceFiles();
  const claims = new Map();
  const corpora = catalog
    .map(({ category, ids, typeIds }) => {
      const chosen = filesForCategory(files, textOf, ids);
      for (const f of chosen) {
        if (!claims.has(f)) claims.set(f, []);
        claims.get(f).push(category);
      }
      const measured = exemplars.mergeMeasurements(chosen.map(measureOf));
      return exemplars.reduceCorpus({ category, typeIds, designs: ids.length, files: chosen.length }, measured);
    })
    .filter((corpus) => exemplars.isCardWorthy(corpus));
  return { corpora, claims };
}

const { corpora: derived, claims } = deriveCorpora();

/** The checked-in constant, regenerated. Printed on a mismatch so the fix is a paste. */
function asSource(corpora) {
  const body = corpora.map((c) => `  ${JSON.stringify(c)},`).join('\n');
  return `export const EXEMPLAR_CORPORA: readonly ExemplarCorpus[] = [\n${body}\n];\n`;
}

// ── The pin ──────────────────────────────────────────────────────────────────────────────────

test('the shipped constant IS the catalog, re-derived', () => {
  const fresh = JSON.stringify(derived);
  const shipped = JSON.stringify(exemplars.EXEMPLAR_CORPORA);
  if (fresh !== shipped) {
    // OUTSIDE the repo. A failing gate that drops an untracked `.ts` in the project root is a
    // second failure waiting for the next `git add -A`: the name is in neither `.gitignore` nor
    // `check-tree-shape`'s allowed root entries, so committing it hard-fails the build.
    const out = path.join(os.tmpdir(), 'noacg-exemplars-derived.ts');
    writeFileSync(out, asSource(derived), 'utf8');
    assert.fail(
      'src/ai/pro/harness/exemplars.ts EXEMPLAR_CORPORA no longer matches the catalog. '
      + `The regenerated block is in ${out} - paste it over the constant, keeping the comment above it.`,
    );
  }
});

test('no source file feeds two kinds of graphic their numbers', () => {
  // A file is claimed by every category whose design ids it declares, and three type compilers
  // declare designs in two categories at once (`types/bugs.ts`, `types/clocks.ts`,
  // `types/goals.ts`). None of them carries CSS today, so nothing is contaminated - but the day
  // one gains a stylesheet, both categories would silently take on the other's numbers AND the
  // pin would re-derive the contaminated table as truth. That is the one way this test can
  // certify a lie, so it is the one thing it checks beyond the numbers themselves.
  const empty = JSON.stringify(exemplars.emptyMeasurement());
  for (const [file, categories] of claims) {
    if (categories.length < 2) continue;
    assert.equal(
      JSON.stringify(measureOf(file)),
      empty,
      `${path.relative(projectRoot, file)} is claimed by ${categories.join(' and ')} and now carries CSS - split it, or the two cards will quote each other's numbers`,
    );
  }
});

test('every corpus was measured from real designs, and carries what it was measured from', () => {
  assert.ok(exemplars.EXEMPLAR_CORPORA.length >= 15, 'the catalog has more than fifteen kinds of graphic');
  for (const corpus of exemplars.EXEMPLAR_CORPORA) {
    assert.ok(corpus.designs > 0, `${corpus.category} has designs`);
    assert.ok(corpus.files > 0, `${corpus.category} was read from files`);
    for (const entry of corpus.typeSizes) {
      assert.ok(entry.sizes.n >= exemplars.MIN_ROLE_SAMPLES, `${corpus.category}/${entry.role} has enough samples`);
      assert.ok(entry.sizes.min <= entry.sizes.median && entry.sizes.median <= entry.sizes.max);
      assert.ok(entry.sizes.min > 0, 'a type size is a positive number of pixels');
    }
    assert.ok(corpus.typeSizes.length <= exemplars.MAX_ROLES);
  }
});

test('the numbers are the designs\' own, not a re-statement of the ratified ranges', () => {
  // The lower thirds are where DESIGN_LANGUAGE's ranges were ratified, so they are the case
  // where a copy would be invisible. The corpus disagrees with the range in both directions,
  // which is the whole reason the card is worth its tokens.
  const l3 = exemplars.exemplarFor('lower-third');
  const name = l3.typeSizes.find((entry) => entry.role === 'name');
  assert.ok(name, 'the lower thirds measure a name');
  assert.ok(name.sizes.min < 44, `shipped lower thirds go below the ratified 44px floor (min ${name.sizes.min})`);
  assert.ok(name.sizes.max < 92, `and none of them reach the ratified 92px top (max ${name.sizes.max})`);
});

test('the scoreboards carry the numbers a scoreboard brief needs', () => {
  const board = exemplars.exemplarFor('scoreboard');
  const roles = board.typeSizes.map((entry) => entry.role);
  assert.ok(roles.includes('score'), `the score figure is measured (${roles.join(', ')})`);
  assert.ok(roles.includes('team'), 'so is the team name');
  assert.ok(board.designs >= 20, 'measured across the whole shipped bank, not a sample');
});

// ── The withholding ──────────────────────────────────────────────────────────────────────────

test('a card hands over numbers, never code', () => {
  const empty = JSON.stringify(exemplars.emptyMeasurement());
  for (const corpus of exemplars.EXEMPLAR_CORPORA) {
    const card = exemplars.renderExemplarCard(corpus);
    // The sharpest statement of "no code": the module's own CSS reader finds nothing in it.
    // A card carrying one rule of a shipped design would measure as that rule.
    assert.equal(JSON.stringify(exemplars.measureCss(card)), empty, `${corpus.category}: nothing in the card reads as CSS`);
    assert.ok(!card.includes('{') && !card.includes('}'), `${corpus.category}: no rule bodies`);
    assert.ok(!/\.[a-z0-9]+-[a-z0-9]/.test(card), `${corpus.category}: no selectors`);
    assert.ok(!card.includes('var(--'), `${corpus.category}: no custom properties`);
    assert.ok(!card.includes('calc('), `${corpus.category}: no authored expressions`);
    assert.ok(!/\d\s*(?:px|em|%)?\s*;/.test(card), `${corpus.category}: no declarations`);
  }
});

test('a card names no design - not its id, not its name', () => {
  const ids = new Set(catalog.flatMap((c) => c.ids));
  const cards = exemplars.EXEMPLAR_CORPORA.map((c) => exemplars.renderExemplarCard(c)).join('\n');
  for (const id of ids) {
    assert.ok(!new RegExp(`\\b${id}\\b`).test(cards), `the cards never name the design ${id}`);
  }
});

test('a card says it is a measurement before it says any number', () => {
  const card = exemplars.renderExemplarCard(exemplars.exemplarFor('scoreboard'));
  const preamble = card.slice(0, card.indexOf('Type sizes'));
  assert.match(preamble, /MEASUREMENT/, 'the card declares what kind of fact it carries');
  assert.match(preamble, /Not rules and not floors/, 'and that it is not a rule');
  assert.match(preamble, /1920x1080/, 'and the reference the numbers are in');
});

// ── The wiring ───────────────────────────────────────────────────────────────────────────────

test('a request that names a graphic type gets its card in the first message', () => {
  const message = agent.firstMessage({ brief: 'a hockey score strip for a school broadcast', typeId: 'scoreboard' });
  assert.match(message, /What the shipped scoreboard graphics measure/);
  assert.match(message, /- score: /, 'with the score figure the brief is about');
});

test('a request that names none gets nothing new', () => {
  const message = agent.firstMessage({ brief: 'something nice for our stream' });
  assert.ok(!message.includes('What the shipped'), 'no corpus is guessed at from a bare brief');
});

test('an unknown type is not an error, it is an absent card', () => {
  assert.equal(exemplars.exemplarFor('not-a-type'), null);
  assert.equal(exemplars.exemplarFor(null), null);
  assert.equal(exemplars.exemplarCardFor({ typeId: 'not-a-type' }), '');
});

test('a graphic type resolves to the category its designs actually live in', () => {
  // `scorebug` is a type, not a category: its designs sit among the scoreboards, and that is the
  // corpus a scorebug brief should read.
  const bug = exemplars.exemplarFor('scorebug');
  assert.ok(bug, 'a type id resolves');
  assert.equal(bug.category, 'scoreboard');
});

// ── The parser, on cases the catalog would not show ───────────────────────────────────────────

test('the parser reads the authored number and refuses to guess at the rest', () => {
  assert.equal(exemplars.pxValue('calc(44px * var(--scale) * var(--type-scale))'), 44);
  assert.equal(exemplars.pxValue('calc(12px)'), 12);
  assert.equal(exemplars.pxValue('18px'), 18);
  assert.equal(exemplars.pxValue('var(--panel-radius)'), null, 'a token has no authored number here');
  assert.equal(exemplars.pxValue('1.2em'), null);
  assert.equal(exemplars.pxValue('clamp(20px, 3vw, 40px)'), null, 'a range is not one number');
});

test('a bare zero is a length, not a missing number', () => {
  // `padding: 0 calc(35px * var(--scale))` is how a strap spends width and no height, and the
  // catalog writes it 46 times. Reading the zero as absent dropped the horizontal value too.
  assert.equal(exemplars.pxValue('0'), 0);
  assert.equal(exemplars.pxValue('0px'), 0);
  const measured = exemplars.measureCss('.x-strap {\n  padding: 0 calc(35px * var(--scale));\n}');
  assert.deepEqual(measured.paddingBlock, [0]);
  assert.deepEqual(measured.paddingInline, [35]);
});

test('a rule naming two parts is measured as both', () => {
  const measured = exemplars.measureCss('.x-title,\n.x-extra {\n  font-size: calc(22px * var(--scale));\n}');
  assert.deepEqual(measured.fontByRole, { title: [22], extra: [22] });
  assert.deepEqual(exemplars.rolesOf('.x-title, .x-extra'), ['title', 'extra']);
});

test('a declaration wrapped over two lines is still one declaration', () => {
  const css = '.x-panel {\n  padding: calc(20px * var(--scale)) calc(28px * var(--scale))\n           calc(20px * var(--scale)) calc(34px * var(--scale));\n}';
  const measured = exemplars.measureCss(css);
  assert.deepEqual(measured.paddingBlock, [20]);
  assert.deepEqual(measured.paddingInline, [28]);
});

test('a comment never becomes part of a value', () => {
  const measured = exemplars.measureCss('.x-name {\n  font-size: 40px;  /* the headline: 40px reads at distance */\n}');
  assert.deepEqual(measured.fontByRole, { name: [40] });
});

test('an even sample count puts the middle between the two middles', () => {
  assert.deepEqual(exemplars.spread([0.03, 0.12]), { n: 2, min: 0.03, median: 0.075, max: 0.12 });
  assert.deepEqual(exemplars.spread([20, 30, 40]), { n: 3, min: 20, median: 30, max: 40 });
});

test('a type id beats a category id that spells the same word', () => {
  // `poll` is a graphic type whose designs sit among the infographics, and also a wizard
  // category of five designs of another type. Resolving it by whichever map was written last
  // handed a poll brief the wrong corpus.
  const byType = exemplars.exemplarFor('poll');
  assert.equal(byType.category, 'infographic', 'the type resolves to where its own designs live');
  assert.ok(byType.typeIds.includes('poll'));
  const byCategory = exemplars.exemplarCardFor({ typeId: null, category: 'poll' });
  assert.match(byCategory, /shipped poll graphics/, 'the category still resolves for a caller that names one');
});

test('a shorthand splits at the top level, not inside a calc', () => {
  assert.deepEqual(
    exemplars.shorthandParts('calc(14px * var(--scale)) calc(38px * var(--scale))'),
    ['calc(14px * var(--scale))', 'calc(38px * var(--scale))'],
  );
});

test('the role word is the part, never the selector', () => {
  assert.equal(exemplars.roleOf('.scoreboard-score'), 'score');
  assert.equal(exemplars.roleOf('.scoreboard-group .scoreboard-team-mask'), 'mask');
  assert.equal(exemplars.roleOf(':root'), null, 'the token block names no part');
  assert.equal(exemplars.roleOf('body'), null);
});

test('a prefix written as a template hole still names its part', () => {
  // Half the catalog writes `.${P}-kicker`. Reading that as no role at all is how five whole
  // categories measured empty before the hole was flattened.
  assert.equal(exemplars.roleOf('.${P}-kicker'), 'kicker');
  assert.equal(exemplars.roleOf('.${PREFIX}-row-name'), 'name');
});

test('a two-value padding is read as its two axes', () => {
  const measured = exemplars.measureCss('.x-panel {\n  padding: calc(14px * var(--scale)) calc(38px * var(--scale));\n}');
  assert.deepEqual(measured.paddingBlock, [14]);
  assert.deepEqual(measured.paddingInline, [38]);
});

test('a one-value padding is both axes', () => {
  const measured = exemplars.measureCss('.x-panel {\n  padding: 20px;\n}');
  assert.deepEqual(measured.paddingBlock, [20]);
  assert.deepEqual(measured.paddingInline, [20]);
});

test('a role with too few samples is left out rather than shown as the type\'s number', () => {
  const css = '.x-name {\n  font-size: 40px;\n}\n.x-oneoff {\n  font-size: 13px;\n}\n';
  const measured = exemplars.mergeMeasurements([exemplars.measureCss(css), exemplars.measureCss('.x-name {\n  font-size: 44px;\n}'), exemplars.measureCss('.x-name {\n  font-size: 48px;\n}')]);
  const corpus = exemplars.reduceCorpus({ category: 'x', typeIds: [], designs: 3, files: 3 }, measured);
  assert.deepEqual(corpus.typeSizes.map((entry) => entry.role), ['name']);
  assert.deepEqual(corpus.typeSizes[0].sizes, { n: 3, min: 40, median: 44, max: 48 });
});
