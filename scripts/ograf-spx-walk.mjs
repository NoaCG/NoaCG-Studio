// NOACG OGRAF PACKAGES, DRIVEN IN SPX 1.4.1 THROUGH SPX'S OWN CONTROLS.
//
// docs/SPX_ON_A_REAL_SERVER.md §10 walked OGraf packages on SPX 1.4.1 by hand on 2026-10-01. This
// is that walk as a script, so it runs on light packages (the baseline) and on shadow packages (the
// proof), and again on the branch that makes the shadow root the only mount
// (docs/work-specs/ograf-shadow-root/spec.md, AC-10). It does what an operator does:
//
//   1. builds Hairline, Clean Quiz, House Scorebug and Glass Mark with the real exporter in the
//      mount `--mount` names, and copies them into SPX's templates folder,
//   2. makes an OGRAF project and adds the packages, the custom-action handler and a rundown
//      through SPX's own endpoints (the ones its project and template pages post),
//   3. plays, continues, stops, saves fields, presses custom-action buttons and moves a layer
//      through the controller page's own functions, while a second page is SPX's `/renderer`,
//   4. judges every beat on the renderer's page, never on a status code: each graphic is read
//      inside its body (`graphicBody`) and compared with the same package after the same calls
//      on SPX's own blank page, which carries none of the renderer's rules.
//
// SPX IS NOT VENDORED. Build 1.4.1 from its MIT source once (docs/SPX_ON_A_REAL_SERVER.md §1):
//
//   git clone --depth 1 --branch v.1.4.1 https://github.com/TuomoKu/SPX-GC.git SPX_1_4_1_source
//   cd SPX_1_4_1_source && npm ci --omit=dev
//
// Usage (browser work - enqueue it, do not run it beside a suite; see AGENTS.md):
//
//   npm run queue -- "node scripts/ograf-spx-walk.mjs --spx <SPX_1_4_1_source> --mount shadow"
//   node scripts/ograf-spx-walk.mjs --spx <dir> [--mount light|shadow] [--out <dir>] [--headed]
//
// It starts SPX (port 5656, its default) and the app's dev server unless they are already up, and
// writes into SPX only what it names: `ASSETS/templates/noacg_walk_<mount>/` and the project
// `DATAROOT/NoaCG_Walk_<mount>/`, both replaced on every run. SPX also puts the rundown at the top
// of its `config.json` recent list.
//
// SPX's own gaps are recorded, not judged: Update does nothing for an OGraf item (the renderer
// calls the controller's `updateItem()`), and a custom action reaches the graphic without its
// payload. Exit 1 if any judged beat fails.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import JSZip from 'jszip';
import { GRAPHIC_BODY_SCRIPT } from '../e2e/_graphicBody.ts';
import {
  appOrigin, designTemplate, differences, flag, has, isUp, mountArg, ografZip, prepareOut, readGraphic, root, say,
  settledReading, startChild, startDevServer, stopChildren, waitFor,
} from './ograf-walk-common.mjs';

const spxDir = resolve(flag('--spx') ?? process.env.SPX_DIR ?? '');
const mount = mountArg();
const outDir = resolve(flag('--out') ?? join(root, 'ograf-spx-out', mount));
const headed = has('--headed');

/** SPX's default port (`utils/spx_getconf.js`). */
const spx = 'http://localhost:5656';
const folder = `noacg_walk_${mount}`;
const project = `NoaCG_Walk_${mount}`;
const rundown = 'Walk';
const LOGO = 'noacg_walk_logo.png';

/** The graphics of §10, by role. The rundown holds them in this order, then a second Hairline. */
const DESIGNS = [
  { key: 'lower', id: 'lt01' }, // Hairline: two text fields
  { key: 'quiz', id: 'qz04' }, // Clean Quiz: two steps, dropdowns, five custom actions
  { key: 'score', id: 'sb05' }, // House Scorebug: colours, numbers, a clock run by custom actions
  { key: 'mark', id: 'bug01' }, // Glass Mark: a file-list image
];
const ROW = { lower: 0, quiz: 1, score: 2, mark: 3, lowerTwo: 4 };

if (!flag('--spx') && !process.env.SPX_DIR) {
  console.error('Point --spx at an SPX 1.4.1 source checkout with its dependencies installed (see the header of this file).');
  process.exit(2);
}
if (!existsSync(join(spxDir, 'server.js')) || !existsSync(join(spxDir, 'node_modules'))) {
  console.error(`No installed SPX at ${spxDir}. Run \`npm ci --omit=dev\` in that checkout first.`);
  process.exit(2);
}
const framesDir = prepareOut(outDir);
const templatesDir = join(spxDir, 'ASSETS', 'templates', folder);
const projectDir = join(spxDir, 'DATAROOT', project);

/** Every step, request and reading, written whatever happens: a failed walk's transcript is the
 *  evidence, so it must survive the failure. */
const transcript = [];
const failures = [];
function expect(ok, what, detail) {
  if (!ok) failures.push(what);
  transcript.push({ step: 'judged', ok, what, ...(detail ? { detail } : {}) });
  say(`${ok ? 'ok  ' : 'FAIL'} ${what}${!ok && detail ? `\n       ${detail}` : ''}`);
}
function record(what, detail) {
  transcript.push({ step: 'recorded', what, detail });
  say(`note ${what}: ${JSON.stringify(detail)}`);
}

let launched = null;

// ── the packages, into SPX's templates folder ──────────────────────────────

/** Build every design in the mount and write it where SPX's template browser would find it. */
async function installPackages(appPage) {
  rmSync(templatesDir, { recursive: true, force: true });
  const out = {};
  for (const design of DESIGNS) {
    const template = await designTemplate(appPage, design.id);
    const zip = await JSZip.loadAsync(await ografZip(appPage, template, mount));
    let manifest = null;
    for (const [name, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      const file = join(templatesDir, name);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, await entry.async('nodebuffer'));
      if (name.endsWith('.ograf.json')) manifest = name;
    }
    if (!manifest) throw new Error(`the ${design.id} package has no manifest`);
    const json = JSON.parse(readFileSync(join(templatesDir, manifest), 'utf8'));
    const slugDir = dirname(manifest);
    out[design.key] = {
      ...design,
      name: template.name,
      dir: join(templatesDir, slugDir),
      manifestFile: manifest.slice(slugDir.length + 1),
      manifest: json,
      tag: `${json.id}-v${json.version}`,
      graphicPath: `/templates/${folder}/${slugDir}/${json.main}`,
    };
    say(`package: ${template.name} (${mount}) -> ASSETS/templates/${folder}/${slugDir}`);
  }
  // A picture in the Glass Mark's own images folder, for the file-list beat.
  const png = await appPage.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 96;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#e8562a';
    ctx.fillRect(0, 0, 96, 96);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  mkdirSync(join(out.mark.dir, 'images'), { recursive: true });
  writeFileSync(join(out.mark.dir, 'images', LOGO), Buffer.from(png, 'base64'));
  return out;
}

// ── the project, through SPX's own endpoints ────────────────────────────────

/** A form post as SPX's own pages send it. They answer with a redirect, which is success. */
async function spxPost(path, form) {
  const res = await fetch(`${spx}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
    redirect: 'manual',
  });
  transcript.push({ step: 'spx', method: 'POST', url: path, form, status: res.status });
  if (res.status >= 400) throw new Error(`SPX answered ${res.status} to ${path}`);
}

async function makeProject(pkgs) {
  rmSync(projectDir, { recursive: true, force: true });
  await spxPost('/shows/', { foldername: project, format: 'OGRAF' });
  // What the template browser posts for each package, in the rundown's order.
  for (const design of DESIGNS) {
    const pkg = pkgs[design.key];
    await spxPost(`/show/${project}/config`, { command: 'addtemplate', curFolder: pkg.dir, template: pkg.manifestFile, showFolder: project });
  }
  // The project's "Javascript function library": the handler SPX's custom-action buttons call,
  // which the package carries (docs/SPX_ON_A_REAL_SERVER.md §10).
  const handler = `/templates/${folder}/${dirname(pkgs.quiz.graphicPath.slice(`/templates/${folder}/`.length))}/spx-custom-actions.js`;
  await spxPost(`/show/${project}/config`, { command: 'addshowextrascript', customscript: handler, showFolder: project });
  await spxPost(`/show/${project}`, { filebasename: rundown });
  say(`spx: project ${project}, rundown ${rundown}, handler ${handler}`);
}

// ── the controller's own functions ─────────────────────────────────────────

/* global focusRow, addAllTemplatesToRundown, addSelectedTemplate -- SPX's, from static/js/spx_gc.js. Its
   playItem, nextItem, saveTemplateItemChangesByElement, updateItem and revealItemLayer are called in
   the strings rowCall runs in the controller page. */
/* global graphicBody -- the renderer page's, from GRAPHIC_BODY_SCRIPT */
const rowCall = (controller, index, body) =>
  controller.evaluate(({ index, body }) => {
    const row = document.querySelectorAll('.itemrow')[index];
    focusRow(row);
    return new Function('row', body)(row);
  }, { index, body });

const play = async (controller, index) => {
  const sent = controller.waitForResponse((r) => r.url().endsWith('/gc/playout'));
  await rowCall(controller, index, 'playItem(row)');
  await sent;
};
const next = async (controller, index) => {
  const sent = controller.waitForResponse((r) => r.url().endsWith('/gc/playout'));
  await rowCall(controller, index, 'nextItem(row)');
  await sent;
};
const stop = async (controller, index) => {
  const sent = controller.waitForResponse((r) => r.url().endsWith('/gc/playout'));
  await rowCall(controller, index, "playItem(row, 'stop')");
  await sent;
};

/** Type values into a row's fields and press its Save, as an operator does. */
async function saveFields(controller, index, values) {
  const saved = controller.waitForResponse((r) => r.url().endsWith('/gc/saveItemChanges'));
  await rowCall(controller, index, `
    for (const [field, value] of Object.entries(${JSON.stringify(values)})) {
      const input = row.querySelector('[data-update="' + field + '"]');
      if (!input) throw new Error('no field ' + field + ' in row');
      input.value = value;
    }
    saveTemplateItemChangesByElement(row);`);
  await saved;
}

/** Press a row's custom-action button. SPX's route never answers it, so wait for the request. */
async function pressAction(controller, index, id) {
  const sent = controller.waitForRequest((r) => r.url().endsWith('/gc/playout') && r.postData()?.includes('customAction'));
  await rowCall(controller, index, `
    const button = row.querySelector('button[onclick^="customActionHandler(\\'${id}\\'"]');
    if (!button) throw new Error('no ${id} button in row');
    button.click();`);
  return sent;
}

/** The values a row holds now, as SPX sends them to the graphic (`/gc/playout`, then
 *  `webPlayoutController`): every field by id, escaped by `cleanUpString`, and the item's id. */
function playedData(index) {
  const data = JSON.parse(readFileSync(join(projectDir, 'data', `${rundown}.json`), 'utf8'));
  const item = data.templates[index];
  const escape = (s) => s.replace(/\n/g, '<br>').replace(/\r/g, '').replace(/&/g, '&amp;').replace(/>/g, '&gt;')
    .replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;').replace(/\\/g, '&#92;');
  const out = {};
  for (const field of item.DataFields) if (field.field) out[field.field] = field.value ? escape(String(field.value)) : undefined;
  out.epochID = item.itemID;
  return { data: out, webplayout: item.webplayout };
}

// ── what the renderer shows, and what it should ────────────────────────────

/** The graphic now on SPX's layer `n`: the last element in `#div<n>`, since SPX disposes the
 *  previous one there but leaves it in place. */
const onLayer = (renderer, n) => renderer.locator(`#div${n} > *`).last();

/**
 * The same package on SPX's own blank page (`/templates/empty.html`), driven with the calls SPX
 * makes: `load`, `updateAction` and `playAction` with the item's data on Play (`loadTheGraphic`
 * in static/js/ograf_functions.js), then `playAction()` for Continue, `customAction({ id })` for a
 * button and `stopAction({})` for Stop. Sized as SPX sizes its element (`.ografRenderTarget`).
 * Each call waits for the graphic to settle, as the walk lets the renderer settle between presses:
 * a Stop sent during the entrance ends somewhere else than a Stop sent after it.
 */
async function bareReading(reference, renderer, pkg, data, calls) {
  await reference.goto(`${spx}/templates/empty.html`);
  const host = await reference.evaluateHandle(async ({ pkg, data }) => {
    const mod = await import(pkg.graphicPath);
    if (!customElements.get(pkg.tag)) customElements.define(pkg.tag, mod.Graphic || mod.default);
    const el = document.createElement(pkg.tag);
    el.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;margin:0;padding:0;overflow:hidden';
    document.body.append(el);
    await el.load({ renderType: 'realtime', data });
    await el.updateAction({ data });
    await el.playAction({ data });
    return el;
  }, { pkg, data });
  let reading = await settledReading(reference, host);
  for (const call of calls) {
    await host.evaluate(async (el, call) => {
      if (call === 'next') await el.playAction();
      else if (call === 'stop') await el.stopAction({});
      else await el.customAction({ id: call });
    }, call);
    reading = await settledReading(reference, host);
  }
  await renderer.bringToFront();
  return reading;
}

/** Judge the graphic on layer `n` against the bare page after the same calls. */
async function judge(renderer, reference, pkg, index, calls, what) {
  const { data, webplayout } = playedData(index);
  const shown = await settledReading(renderer, onLayer(renderer, Number(webplayout)));
  const bare = await bareReading(reference, renderer, pkg, data, calls);
  const diff = differences(shown, bare);
  if (!shown.settled) diff.push('the renderer never settled');
  expect(diff.length === 0, what, diff.join('; '));
  return shown;
}

let frameNo = 0;
async function frame(renderer, name) {
  frameNo += 1;
  const file = join(framesDir, `${String(frameNo).padStart(2, '0')}-${name}.png`);
  await renderer.bringToFront();
  await renderer.screenshot({ path: file });
  transcript.push({ step: `frame ${name}`, frame: file });
}

// ── the walk ─────────────────────────────────────────────────────────────────

async function main() {
  if (await isUp(`${spx}/api/v1/version`)) say(`spx: reusing the SPX already on ${spx}`);
  else {
    say(`spx: starting ${spxDir}`);
    startChild(process.execPath, ['server.js'], { cwd: spxDir });
  }
  await Promise.all([startDevServer(), waitFor(`${spx}/api/v1/version`, 'SPX')]);
  const version = await (await fetch(`${spx}/api/v1/version`)).json();
  transcript.push({ step: 'spx version', version });
  say(`spx: ${version.product} ${version.version}`);
  if (version.version !== '1.4.1') failures.push(`this walk is written against SPX 1.4.1, not ${version.version}`);

  const browser = await chromium.launch({ headless: !headed });
  launched = browser;
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await context.addInitScript(GRAPHIC_BODY_SCRIPT);

  const appPage = await context.newPage();
  await appPage.goto(`${appOrigin}/app`);
  const pkgs = await installPackages(appPage);
  await appPage.close();
  await makeProject(pkgs);

  // The renderer: SPX's program output at the configured HD size, over mid-grey so white type
  // shows (§1). Its console is the only place a mount error would surface.
  const renderer = await context.newPage();
  const pageErrors = [];
  renderer.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') transcript.push({ step: 'renderer console', level: msg.type(), text: msg.text().slice(0, 500) });
  });
  renderer.on('pageerror', (err) => {
    pageErrors.push(String(err).slice(0, 300));
    transcript.push({ step: 'renderer page error', text: String(err).slice(0, 500) });
    say(`renderer page error: ${String(err).slice(0, 300)}`);
  });
  await renderer.goto(`${spx}/renderer`);
  await renderer.addStyleTag({ content: 'html { background: #808080; }' });

  const controller = await context.newPage();
  await controller.goto(`${spx}/gc/${project}/${rundown}`);
  // "Add all", then the Hairline once more from the template list, as an operator adds a copy.
  await Promise.all([controller.waitForNavigation(), controller.evaluate(() => addAllTemplatesToRundown())]);
  await Promise.all([controller.waitForNavigation(), controller.evaluate(() => addSelectedTemplate(0))]);
  const reference = await context.newPage();
  await renderer.bringToFront();

  // 1. LAYERS AS IMPORTED: the package's `v_spx` hints, so the three land on their own layers.
  const layers = await controller.evaluate(() => [...document.querySelectorAll('.itemrow')].map((row) => row.querySelector('input[id^=webplayout]').value));
  record('layers as imported', layers);
  expect(layers.slice(0, 3).join(',') === '2,4,5', `Hairline, Clean Quiz and House Scorebug import on layers 2, 4 and 5 (got ${layers.slice(0, 3).join(', ')})`);

  // 2. FIELDS, then THREE ON AIR, the scorebug played 0.3 s into the quiz's entrance (§10 found the
  // quiz frozen half drawn when another graphic played during its entrance).
  await saveFields(controller, ROW.lower, { f0: 'Walk Alpha', f1: 'First copy' });
  await play(controller, ROW.lower);
  await settledReading(renderer, onLayer(renderer, 2));
  await play(controller, ROW.quiz);
  await renderer.waitForTimeout(300);
  await play(controller, ROW.score);
  const lower = await judge(renderer, reference, pkgs.lower, ROW.lower, [], "Hairline paints as on a bare page: SPX's renderer rules do not reach in");
  expect(lower.text.includes('Walk Alpha'), 'the name saved in the controller is on air');
  await judge(renderer, reference, pkgs.quiz, ROW.quiz, [], 'Clean Quiz finished its entrance though the scorebug played during it');
  await judge(renderer, reference, pkgs.score, ROW.score, [], "House Scorebug paints as on a bare page: SPX's renderer rules do not reach in");
  const tags = await renderer.evaluate(() => [2, 4, 5].map((n) => document.querySelector(`#div${n} > :last-child`)?.localName ?? null));
  expect(tags.join() === [pkgs.lower.tag, pkgs.quiz.tag, pkgs.score.tag].join(), `the three are on air together on layers 2, 4 and 5 (${tags.join(', ')})`);
  const shadowed = await renderer.evaluate(() => [2, 4, 5].map((n) => Boolean(document.querySelector(`#div${n} > :last-child`)?.shadowRoot)));
  expect(shadowed.every((s) => s === (mount === 'shadow')), `each graphic is in the ${mount} mount (shadow root: ${shadowed.join(', ')})`);
  await frame(renderer, 'three-on-air');

  // 3. CUSTOM ACTIONS through SPX's buttons and the package's handler script.
  const quizActions = (pkgs.quiz.manifest.customActions ?? []).map((a) => a.id);
  const pressed = [];
  for (const id of ['select', 'lock', 'judge'].filter((a) => quizActions.includes(a))) {
    const request = await pressAction(controller, ROW.quiz, id);
    pressed.push(id);
    if (pressed.length === 1) record('what a custom action sends (SPX forwards no payload)', JSON.parse(request.postData() || '{}'));
    await renderer.waitForTimeout(400);
  }
  expect(pressed.length === 3, `Clean Quiz offers Select, Lock and Reveal correct (declares ${quizActions.join(', ')})`);
  await judge(renderer, reference, pkgs.quiz, ROW.quiz, pressed, `Clean Quiz after ${pressed.join(', ')} shows what the same actions show on a bare page`);
  await frame(renderer, 'quiz-actions');

  const clockIds = (pkgs.score.manifest.customActions ?? []).map((a) => a.id);
  const startId = clockIds.find((id) => /start/i.test(id));
  const stopId = clockIds.find((id) => /stop/i.test(id));
  if (startId && stopId) {
    const scoreHost = onLayer(renderer, 5);
    const clock = async () => (await readGraphic(scoreHost)).text;
    await pressAction(controller, ROW.score, startId);
    await renderer.waitForTimeout(1500);
    const running = [await clock()];
    await renderer.waitForTimeout(2200);
    running.push(await clock());
    await pressAction(controller, ROW.score, stopId);
    await renderer.waitForTimeout(1500);
    const stopped = [await clock()];
    await renderer.waitForTimeout(2200);
    stopped.push(await clock());
    record('House Scorebug text while its clock runs, then after it stops', { running, stopped });
    expect(running[0] !== running[1] && stopped[0] === stopped[1], `House Scorebug's ${startId} runs its clock and ${stopId} stops it`);
  } else expect(false, `House Scorebug declares a start and a stop action (declares ${clockIds.join(', ')})`);

  // 4. CONTINUE takes the quiz to its next step; STOP takes all three off air.
  await next(controller, ROW.quiz);
  await judge(renderer, reference, pkgs.quiz, ROW.quiz, [...pressed, 'next'], 'Continue takes Clean Quiz to its next step as on a bare page');
  await frame(renderer, 'quiz-continued');
  await stop(controller, ROW.lower);
  await stop(controller, ROW.quiz);
  await stop(controller, ROW.score);
  await judge(renderer, reference, pkgs.lower, ROW.lower, ['stop'], 'Stop takes Hairline off air as on a bare page');
  await judge(renderer, reference, pkgs.quiz, ROW.quiz, [...pressed, 'next', 'stop'], 'Stop takes Clean Quiz off air as on a bare page');
  await frame(renderer, 'stopped');

  // 5. A FILE-LIST IMAGE: picked in SPX's own list, which hands back `./images/<file>`.
  const choices = await controller.evaluate((i) => [...document.querySelectorAll('.itemrow')[i].querySelectorAll('select option')].map((o) => o.value), ROW.mark);
  const logo = choices.find((v) => v.endsWith(LOGO));
  record('Glass Mark file-list choices', choices);
  if (logo) {
    const field = await controller.evaluate((i) => [...document.querySelectorAll('.itemrow')[i].querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value.endsWith('noacg_walk_logo.png')))?.getAttribute('data-update'), ROW.mark);
    await saveFields(controller, ROW.mark, { [field]: logo });
    await play(controller, ROW.mark);
    const mark = onLayer(renderer, Number(playedData(ROW.mark).webplayout));
    await judge(renderer, reference, pkgs.mark, ROW.mark, [], 'Glass Mark with a picked picture paints as on a bare page');
    const img = await mark.evaluate((el) => [...graphicBody(el).querySelectorAll('img')].map((i) => ({ src: i.currentSrc, w: i.naturalWidth })));
    record('Glass Mark pictures', img);
    expect(img.some((i) => i.w > 0 && i.src.includes(`/templates/${folder}/`) && i.src.endsWith(LOGO)), 'the picked picture loads from inside the package');
    await frame(renderer, 'file-list-image');
    await stop(controller, ROW.mark);
  } else expect(false, `SPX lists ${LOGO} for Glass Mark's file-list field`);

  // 6. TWO COPIES OF ONE DESIGN on two layers: the second Hairline moved to layer 3 with SPX's
  // own layer button, each with its own name; taking the first off air leaves the second alone.
  controller.once('dialog', (dialog) => dialog.accept('3'));
  const moved = controller.waitForResponse((r) => r.url().includes('/api/v1/changeItemData'));
  await rowCall(controller, ROW.lowerTwo, `
    const button = row.querySelector('[onclick^="revealItemLayer"]');
    if (!button) throw new Error('no layer button in row');
    revealItemLayer(button);`);
  await moved;
  await controller.reload();
  await saveFields(controller, ROW.lowerTwo, { f0: 'Walk Beta', f1: 'Second copy' });
  await play(controller, ROW.lower);
  await play(controller, ROW.lowerTwo);
  const one = await judge(renderer, reference, pkgs.lower, ROW.lower, [], 'the first copy paints its own data as on a bare page');
  const two = await judge(renderer, reference, pkgs.lower, ROW.lowerTwo, [], 'the second copy, on layer 3, paints its own data as on a bare page');
  expect(one.text.includes('Walk Alpha') && two.text.includes('Walk Beta'), 'each copy shows its own name');
  await frame(renderer, 'two-copies');
  await stop(controller, ROW.lower);
  await settledReading(renderer, onLayer(renderer, 2));
  const twoAfter = await settledReading(renderer, onLayer(renderer, 3));
  const twoDiff = differences(twoAfter, two);
  expect(twoDiff.length === 0, 'taking the first copy off air leaves the second exactly as it was', twoDiff.join('; '));
  await frame(renderer, 'second-copy-alone');
  await stop(controller, ROW.lowerTwo);
  expect(pageErrors.length === 0, `the renderer page threw nothing (${pageErrors.length} errors)`, pageErrors.join(' | '));

  // 7. UPDATE, recorded: SPX 1.4.1's renderer calls the controller's `updateItem()` for OGraf.
  await play(controller, ROW.lower);
  await settledReading(renderer, onLayer(renderer, 2));
  await saveFields(controller, ROW.lower, { f0: 'Walk Updated' });
  await rowCall(controller, ROW.lower, 'updateItem(row)');
  await renderer.waitForTimeout(1500);
  const updated = await readGraphic(onLayer(renderer, 2));
  record('Update on an OGraf item (an SPX gap)', { onAir: updated.text.slice(0, 80), changed: updated.text.includes('Walk Updated'), rendererErrors: pageErrors.slice(-2) });
  await stop(controller, ROW.lower);
}

let exitCode = 0;
try {
  await main();
  if (failures.length) {
    exitCode = 1;
    console.error(`\n${failures.length} beat(s) failed (${mount} mount):`);
    for (const f of failures) console.error(`  - ${f}`);
  } else say(`\nEvery judged beat passed on SPX 1.4.1 (${mount} mount).`);
} catch (err) {
  exitCode = 1;
  console.error(`\nThe walk stopped: ${err instanceof Error ? err.stack : String(err)}`);
} finally {
  writeFileSync(join(outDir, 'transcript.json'), JSON.stringify(transcript, null, 2));
  say(`transcript: ${join(outDir, 'transcript.json')}`);
  if (launched) await launched.close().catch(() => {});
  stopChildren();
}
process.exit(exitCode);
