// AN IMPORTED-SVG GRAPHIC THAT BEHAVES, DRIVEN IN SOMEBODY ELSE'S OGRAF RENDERER.
//
// docs/OGRAF.md records two hand walks against SuperFly.tv's ograf-server (2026-08-18 and
// 2026-08-22). Both drove a CATALOG or CLI-made package. The graphic the SVG road
// actually promises - somebody else's own drawing, imported as SVG, carrying behaviour - had
// never been through a renderer nobody here wrote, and that is the whole claim.
//
// This script is that walk, written down so it is repeatable rather than remembered. It does
// exactly what a person would do, in one process:
//
//   1. drives the REAL import door in the app (drop `quiz-board.svg`, take the proposed quiz
//      binding, create the graphic) and exports it through the REAL export dialog as OGraf,
//   2. uploads that zip to a running ograf-server through its own zip endpoint,
//   3. opens the server's renderer page in a browser and drives the graphic ONLY through the
//      server's HTTP control API - load, playAction, the three custom actions, stopAction -
//      never by calling our own class,
//   4. screenshots the renderer's own page after each beat and writes a transcript of every
//      request and response,
//   5. puts two copies of the board on two layers, then the board and a Hairline on two layers,
//      and requires each to keep its own data and drawn states while the other plays, acts and
//      is cleared.
//
// IN EITHER MOUNT. `--mount light` (the default) exports through the dialog as before; `--mount
// shadow` builds the same graphic in the app page with the shadow-root mount, which the dialog
// does not offer until the flip (docs/work-specs/ograf-shadow-root/spec.md, AC-9). Every read
// inside a mounted graphic goes through `graphicBody`, so the beats are the same in both.
//
// WHY THE PACKAGE IS BUILT THROUGH THE APP rather than by calling `ografTarget.build()` in a
// bundle the way scripts/ograf-starters-emit.mjs does: the SVG import road is the wizard. The
// layer inventory, the field binding, the behaviour proposal and the drawn-state stamps are all
// produced by steps a person clicks, and a walk that reconstructed them in Node would be
// checking a pipeline the product does not have.
//
// THE RENDERER IS NOT VENDORED. It is ~110 MB of somebody else's dependencies and it is their
// release cadence, not ours - pinning a copy here would make this walk check a renderer frozen
// on the day it was pinned, which is the opposite of the point. Fetch and build it first:
//
//   curl -sSL -o ograf-server.tar.gz \
//     https://codeload.github.com/SuperFlyTV/ograf-server/tar.gz/refs/heads/main
//   tar -xzf ograf-server.tar.gz
//   cd ograf-server-main && corepack enable && yarn && yarn build
//
// Usage (browser work - enqueue it, do not run it beside a suite; see AGENTS.md):
//
//   npm run queue -- "node scripts/ograf-external-walk.mjs --server <ograf-server-main> --mount shadow"
//   node scripts/ograf-external-walk.mjs --server <dir> [--mount light|shadow] [--out <dir>] [--sample <file>] [--headed]
//
// Exit 1 if any beat fails. A failure here is a NoaCG defect until the transcript says
// otherwise - the platform owns OGraf compatibility.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { GRAPHIC_BODY_SCRIPT } from '../e2e/_graphicBody.ts';
import { shadowOgraf } from '../e2e/_ografMount.ts';
import {
  appOrigin, designTemplate, differences, flag, has, isUp, mountArg, ografZip, prepareOut, root, say, settledReading,
  startChild, startDevServer, stopChildren, waitFor,
} from './ograf-walk-common.mjs';

const serverDir = resolve(flag('--server') ?? process.env.OGRAF_SERVER_DIR ?? '');
const mount = mountArg();
const outDir = resolve(flag('--out') ?? join(root, 'ograf-external-out', mount));
const sample = resolve(flag('--sample') ?? join(root, 'docs', 'svg-samples', 'quiz-board.svg'));
const headed = has('--headed');

/** The server's own port, fixed in packages/server/src/server.ts. */
const OGRAF_PORT = 8080;
const ograf = `http://localhost:${OGRAF_PORT}`;

if (!flag('--server') && !process.env.OGRAF_SERVER_DIR) {
  console.error(
    'Point --server at a built SuperFly.tv ograf-server checkout (see the header of this file for\n' +
      'the four lines that fetch and build one).',
  );
  process.exit(2);
}
if (!existsSync(join(serverDir, 'packages', 'server', 'dist', 'main.js'))) {
  console.error(`No built server at ${serverDir}. Run \`yarn && yarn build\` in that checkout first.`);
  process.exit(2);
}
if (!existsSync(sample)) {
  console.error(`No such sample: ${sample}`);
  process.exit(2);
}

const framesDir = prepareOut(outDir);

/** Every HTTP call to the renderer's API, in order, with what came back. Written whatever
 *  happens - a failed walk's transcript is the evidence, so it must survive the failure. */
const transcript = [];
let frameNo = 0;

/** The Chromium this run launched, closed in the `finally` whether the walk finished or threw. */
let launched = null;

// ── the renderer's server ────────────────────────────────────────────────────

async function startOgrafServer() {
  if (await isUp(`${ograf}/api/ograf/v1/graphics`)) {
    say(`renderer: reusing the ograf-server already on ${ograf}`);
    return;
  }
  say(`renderer: starting ograf-server on ${ograf}`);
  startChild(process.execPath, ['dist/main.js'], { cwd: join(serverDir, 'packages', 'server') });
  await waitFor(`${ograf}/api/ograf/v1/graphics`, 'ograf-server');
}

// ── beat 1: the package, out of the product's own doors ──────────────────────

/**
 * Drop the sample on the Import door, take the proposed behaviour, create the graphic, then
 * export it as OGraf through the export dialog. Returns the zip's path.
 *
 * Nothing here reaches past the UI: the walk is only worth anything if the package is the one a
 * student would get by clicking the same buttons. The one exception is the shadow mount, which
 * the dialog does not offer yet: that package is the same graphic built in the page by the same
 * exporter, told the mount (`shadowOgraf`, e2e/_ografMount.ts).
 */
async function exportOgrafPackage(page) {
  say(`app: dropping ${sample.replace(root + '\\', '').replace(root + '/', '')} on the Import door`);
  await page.goto(`${appOrigin}/app`);
  const modal = page.locator('.wz-modal');
  await modal.waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type="file"]').setInputFiles(sample);
  await page.getByTestId('import-svg-card').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('.wz-next').click();
  await page.getByTestId('map-svg-fields').waitFor({ state: 'visible', timeout: 30_000 });

  // THE BEHAVIOUR IS THE POINT OF THE WALK, so read it back rather than assuming the proposal
  // fired. A board that arrives with no behaviour bound would export a package that loads
  // perfectly and does nothing, which is the failure this row exists to rule out.
  const kind = await page.getByTestId('map-svg-behaviour-kind').inputValue();
  if (kind !== 'quiz') throw new Error(`the import proposed behaviour "${kind}", not a quiz`);
  say('app: the quiz binding is proposed from the layer names');

  await page.getByRole('button', { name: 'Create project' }).click();
  await modal.waitFor({ state: 'hidden', timeout: 60_000 });

  const zipPath = join(outDir, 'imported-quiz-ograf.zip');
  if (mount === 'shadow') {
    say('app: the shadow package, built in the page from the same graphic (the dialog has no mount)');
    const zip = await shadowOgraf(page, 'Live');
    writeFileSync(zipPath, await zip.generateAsync({ type: 'nodebuffer' }));
  } else {
    say('app: Export -> OGraf (EBU) export -> Validate & download');
    await page.getByTestId('dock-tab-export').click();
    await page.locator('.issue', { hasText: 'OGraf (EBU) export' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      page.getByRole('button', { name: /Validate & download/ }).click(),
    ]);
    await download.saveAs(zipPath);
  }
  say(`app: package written to ${zipPath}`);
  return zipPath;
}

/** A second, different design for the two-designs beat: the catalog's Hairline, in the mount. */
async function hairlinePackage(page) {
  const zipPath = join(outDir, 'hairline-ograf.zip');
  writeFileSync(zipPath, await ografZip(page, await designTemplate(page, 'lt01'), mount));
  say(`app: Hairline package written to ${zipPath}`);
  return zipPath;
}

// ── beat 2: hand it to the renderer ──────────────────────────────────────────

/**
 * Hand the package to the renderer, and return the id the SERVER says it stored it under.
 *
 * The id matters: this script happily reuses a server that is already up, and that server still
 * holds everything previous runs uploaded. Picking "the first graphic whose id starts with
 * noacg-" out of its listing would let a warm server hand back a STALE package, and the walk
 * would drive and green-light something it did not just export.
 */
async function uploadPackage(zipPath) {
  const body = new FormData();
  body.set('graphic', new Blob([readFileSync(zipPath)], { type: 'application/zip' }), zipPath.split(/[\\/]/).pop());
  const res = await fetch(`${ograf}/api/serverApi/internal/graphics/graphic`, { method: 'POST', body });
  const text = await res.text();
  transcript.push({ step: 'upload', method: 'POST', url: '/api/serverApi/internal/graphics/graphic', status: res.status, body: text.slice(0, 2000) });
  if (!res.ok) throw new Error(`upload answered ${res.status}: ${text.slice(0, 400)}`);
  let stored;
  try {
    stored = JSON.parse(text).graphics?.[0]?.id;
  } catch {
    stored = undefined;
  }
  if (!stored) throw new Error(`the upload answered ${res.status} but named no graphic: ${text.slice(0, 200)}`);
  say(`renderer: upload ${res.status}, stored as ${stored}`);
  return stored;
}

async function api(step, method, path, body) {
  const res = await fetch(`${ograf}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let payload;
  const text = await res.text();
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text.slice(0, 2000);
  }
  transcript.push({ step, method, url: path, requestBody: body, status: res.status, response: payload });
  return { status: res.status, payload };
}

/**
 * Which of the designer's DRAWN STATES are lit right now, read out of the renderer's own page.
 *
 * A status code is not a graphic. Every action in the 2026-08-18 and 2026-08-22 rounds answered
 * 200 and the frame was checked by eye afterwards; on an imported board there are a dozen drawn
 * states and "the frame looks the same" is the failure, so this reads the DOM as well. The
 * tokens are the ones the import stamped on the artwork (`data-noacg-role`), and a lit layer
 * carries the runtime's on-class.
 */
/* global graphicBody -- the renderer page's, from GRAPHIC_BODY_SCRIPT */
async function litRoles(page, layer = 0) {
  return (await onLayer(page, layer)).evaluate((host) => {
    if (!host) return { stamped: 0, lit: [] };
    const roots = graphicBody(host).querySelectorAll('[data-noacg-role]');
    const lit = [];
    for (const el of roots) {
      if (el.classList.contains('imported-design-on')) lit.push(el.getAttribute('data-noacg-role'));
    }
    return { stamped: roots.length, lit };
  });
}

/**
 * The NoaCG Graphic on the renderer's layer `layer`, or null. The renderer names its element
 * after the graphic id (`ograf-<id>`, `getCustomElementName` in renderer-layer's GraphicsCache.ts),
 * so this does not guess a tag: our Graphic stamps its element `data-noacg-graphic` while it is
 * loaded, in either mount, and each layer is a fixed div whose z-index is its number.
 */
const onLayer = (page, layer) =>
  page.evaluateHandle((z) => [...document.querySelectorAll('[data-noacg-graphic]')].find((el) => el.parentElement?.style.zIndex === String(z)) ?? null, layer);

async function frame(page, name, layer = 0) {
  frameNo += 1;
  const file = join(framesDir, `${String(frameNo).padStart(2, '0')}-${name}.png`);
  // THE RENDERER'S OWN PAGE, not ours. Waiting on the graphic's animation is the only place a
  // wall-clock wait is honest here: the exit is a GSAP tween in somebody else's document and
  // there is nothing of ours to query for it. It is enough only because the page is in front
  // (see bringToFront above) - a throttled page would still be mid-tween after any wait.
  await page.bringToFront();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: file });
  const roles = await litRoles(page, layer);
  transcript.push({ step: `frame ${name}`, frame: file, drawnStates: roles });
  say(`frame: ${name} - ${roles.stamped} drawn states, lit: ${roles.lit.join(', ') || '(none)'}`);
  return roles;
}

// ── the walk ─────────────────────────────────────────────────────────────────

async function main() {
  await Promise.all([startDevServer(), startOgrafServer()]);

  const browser = await chromium.launch({ headless: !headed });
  // Closed in the `finally` at the bottom rather than here: every `throw` in this walk would
  // otherwise skip the close and leave a Chromium behind, on a laptop where the queue's own
  // memory floor is what stops the next browser job from starting.
  launched = browser;
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
  const appPage = await context.newPage();

  const zipPath = await exportOgrafPackage(appPage);
  const hairlineZip = await hairlinePackage(appPage);
  await appPage.close();

  const graphicId = await uploadPackage(zipPath);
  const hairlineId = await uploadPackage(hairlineZip);

  const listed = await api('list graphics', 'GET', '/api/ograf/v1/graphics');
  const graphics = listed.payload?.graphics ?? [];
  if (!graphics.some((g) => g.id === graphicId)) {
    throw new Error(`the renderer does not list ${graphicId}: ${JSON.stringify(graphics).slice(0, 400)}`);
  }

  // THE MANIFEST AS THE RENDERER SERVES IT BACK, not as we wrote it. Everything below is driven
  // off this - the field ids, the operator actions, the enum a picker would offer - so what the
  // walk exercises is what a foreign host can actually read out of the package.
  const detail = await api('read manifest', 'GET', `/api/ograf/v1/graphics/${graphicId}`);
  const manifest = detail.payload?.graphic;
  if (!manifest) throw new Error(`the renderer served no manifest for ${graphicId}`);
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  say(`renderer: listed as ${graphicId} v${manifest.version}, "${manifest.name}"`);

  // The renderer page has to be OPEN for a graphic to render: this server's renderer is a web
  // page that registers itself over a websocket, and the control API reaches the graphic
  // through it. This is the browser a playout machine would point at a channel. The page is
  // `/renderer/default/` - the server's route matcher reads the renderer's TYPE, and the only
  // type it serves is `default`, from the renderer-layer build.
  const rendererPage = await context.newPage();
  // Somebody else's page, so its console is the only place a mount error would surface. A
  // silent failure inside a Web Component is exactly the shape of the three defects the
  // 2026-08-18 round found, and two of them were invisible rather than loud.
  rendererPage.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      transcript.push({ step: 'renderer console', level: msg.type(), text: msg.text().slice(0, 500) });
      say(`renderer console [${msg.type()}] ${msg.text().slice(0, 300)}`);
    }
  });
  rendererPage.on('pageerror', (err) => {
    transcript.push({ step: 'renderer page error', text: String(err).slice(0, 500) });
    say(`renderer page error: ${String(err).slice(0, 300)}`);
  });
  // Every read inside the mounted graphic goes through its body (e2e/_graphicBody.ts).
  await rendererPage.addInitScript(GRAPHIC_BODY_SCRIPT);
  await rendererPage.goto(`${ograf}/renderer/default/`);
  // THE PAGE MUST BE IN FRONT, and this is not cosmetic. A browser throttles
  // requestAnimationFrame in a page that is not the visible one, GSAP rides that clock, and a
  // graphic whose entrance and state changes are tweens then sits frozen part-way through. It
  // reads EXACTLY like a graphic that will not play: the actions answer 200, the machine moves,
  // and the drawn states never appear. Two runs of this walk on 2026-09-09 reported a dead
  // board for that reason alone, and the same reading in a foregrounded page was correct.
  await rendererPage.bringToFront();
  let renderer = null;
  for (let i = 0; i < 60 && !renderer; i++) {
    const res = await fetch(`${ograf}/api/ograf/v1/renderers`);
    renderer = (await res.json()).renderers?.[0] ?? null;
    if (!renderer) await new Promise((r) => setTimeout(r, 500));
  }
  if (!renderer) throw new Error('the renderer page never registered with its own server');
  const rendererId = renderer.id;
  say(`renderer: page registered as ${rendererId}`);

  const info = await api('renderer info', 'GET', `/api/ograf/v1/renderers/${rendererId}`);
  const renderTarget = info.payload?.renderer?.renderTargetSchema?.default ?? { layerId: '1' };
  say(`renderer: render target ${JSON.stringify(renderTarget)}`);

  const target = `/api/ograf/v1/renderers/${rendererId}/target/graphicInstance`;
  const failures = [];
  const expect = (ok, what) => {
    if (!ok) failures.push(what);
    say(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  };

  // The question, the four answers, and the answer key - the data a quiz operator types. The
  // keys are `fN` ids, which is what the manifest's `schema` declares and what FIELDS.md in the
  // package translates; a renderer never sees a label. Titles are how a person finds the right
  // id, which is exactly what this does.
  const props = manifest.schema?.properties ?? {};
  const fields = Object.keys(props);
  const idTitled = (title) => fields.find((f) => props[f]?.title === title);
  say(`renderer: the served manifest declares ${fields.length} fields and ` +
    `${(manifest.customActions ?? []).length} custom actions`);

  const data = Object.fromEntries(fields.map((f) => [f, props[f]?.default ?? '']));
  // THE ANSWER KEY IS SET TO C, so the reveal has something to say: the walk then picks B, which
  // is wrong, and the frames show three rows taking the wrong treatment while C lights. Leaving
  // the key on its default A and picking A would prove the same code path and show nothing.
  const keyField = idTitled('Correct answer');
  if (keyField && (props[keyField].enum ?? []).includes('C')) data[keyField] = 'C';

  const load = await api('load', 'POST', `${target}/load`, {
    renderTarget,
    graphicId,
    params: { data },
  });
  expect(load.status === 200 && load.payload?.statusCode === 200, `load answered ${load.status}/${load.payload?.statusCode}`);
  const graphicInstanceId = load.payload?.graphicInstanceId;
  const shadowed = await (await onLayer(rendererPage, 0)).evaluate((host) => (host ? Boolean(host.shadowRoot) : null));
  expect(shadowed === (mount === 'shadow'), `the graphic is in the ${mount} mount (shadow root: ${shadowed})`);
  await frame(rendererPage, 'loaded');

  const play = await api('playAction', 'POST', `${target}/playAction`, { renderTarget, graphicInstanceId, params: {} });
  expect(play.status === 200 && play.payload?.statusCode === 200, `playAction answered ${play.status}/${play.payload?.statusCode}`);
  await frame(rendererPage, 'on-air');

  // THE OPERATOR VERBS THE BOARD DREW. Names come off the manifest rather than from here,
  // because the whole claim is that the renderer reads them out of the package.
  const declared = (manifest.customActions ?? []).map((a) => a.id);
  say(`renderer: custom actions declared - ${declared.join(', ') || '(none)'}`);
  expect(declared.length > 0, "the manifest declares the board's operator actions");

  // EVERY ACTION IS JUDGED ON THE FRAME, not on its status code. A quiz whose select, lock and
  // reveal all answer 200 and light nothing is a board that goes to air and does not play - the
  // exact failure this walk exists to catch, and one no status code can report.
  let painted = false;
  /** The first action that lit a drawn state, which the layer beats below press again. */
  let lighting = null;
  for (const action of declared) {
    const params = payloadFor(action, manifest, props);
    const res = await api(`customAction ${action}`, 'POST', `${target}/customActions/${action}`, {
      renderTarget,
      graphicInstanceId,
      params,
    });
    expect(res.status === 200 && res.payload?.statusCode === 200, `customAction ${action} answered ${res.status}/${res.payload?.statusCode}`);
    const roles = await frame(rendererPage, `action-${action}`);
    if (roles.lit.length) {
      painted = true;
      lighting ??= action;
    }
  }
  expect(painted, 'the operator actions light the drawn states the designer named');

  // An id the graphic does not declare must come back 4xx with OUR message, through their host.
  const unknown = await api('customAction (unknown)', 'POST', `${target}/customActions/no-such-action`, {
    renderTarget,
    graphicInstanceId,
    params: {},
  });
  expect(
    unknown.payload?.statusCode === 400,
    `an unknown custom action answered ${unknown.payload?.statusCode} - "${unknown.payload?.statusMessage}"`,
  );

  const stop = await api('stopAction', 'POST', `${target}/stopAction`, { renderTarget, graphicInstanceId, params: {} });
  expect(stop.status === 200 && stop.payload?.statusCode === 200, `stopAction answered ${stop.status}/${stop.payload?.statusCode}`);
  await frame(rendererPage, 'off-air');

  // `clear` is the renderer's own verb for dropping the instance, and it takes a list of
  // FILTERS rather than one target - a controller clears "everything matching this" in one call.
  const cleared = await api('clear', 'PUT', `${target}/clear`, { filters: [{ renderTarget }] });
  expect(cleared.status === 200, `clear answered ${cleared.status}`);

  // ── beat 5: two graphics on two layers ─────────────────────────────────────
  //
  // What a broadcaster running several graphics on one renderer needs, and what the light DOM
  // could not promise (docs/work-specs/ograf-shadow-root/spec.md): the renderer caches the
  // element class per graphic id, so two copies of one design are two elements of one class on
  // one page. Each layer is judged by what it shows - its text, its boxes and its lit drawn
  // states - before and after the other one plays, acts and is cleared.
  const layerIds = info.payload?.renderer?.renderTargetSchema?.properties?.layerId?.enum ?? [];
  const secondId = layerIds.find((id) => id !== renderTarget.layerId);
  if (!secondId || !lighting) {
    expect(false, `the layer beats need a second layer (${layerIds.join(', ')}) and an action that lights a state (${lighting})`);
    return failures;
  }
  const secondTarget = { layerId: secondId };
  // A layer's z-index is its place in the renderer's list (LayersManager.ts).
  const firstLayer = Math.max(0, layerIds.indexOf(renderTarget.layerId));
  const secondLayer = layerIds.indexOf(secondId);

  const loadAndPlay = async (step, onTarget, id, withData) => {
    const loaded = await api(`${step}: load`, 'POST', `${target}/load`, { renderTarget: onTarget, graphicId: id, params: { data: withData } });
    const instance = loaded.payload?.graphicInstanceId;
    const played = await api(`${step}: playAction`, 'POST', `${target}/playAction`, { renderTarget: onTarget, graphicInstanceId: instance, params: {} });
    expect(loaded.payload?.statusCode === 200 && played.payload?.statusCode === 200, `${step}: load and play answered ${loaded.payload?.statusCode}/${played.payload?.statusCode}`);
    return instance;
  };
  const press = async (step, onTarget, instance) => {
    const res = await api(`${step}: customAction ${lighting}`, 'POST', `${target}/customActions/${lighting}`, {
      renderTarget: onTarget,
      graphicInstanceId: instance,
      params: payloadFor(lighting, manifest, props),
    });
    expect(res.payload?.statusCode === 200, `${step}: customAction ${lighting} answered ${res.payload?.statusCode}`);
  };
  const clearLayer = async (step, onTarget) => {
    const res = await api(step, 'PUT', `${target}/clear`, { filters: [{ renderTarget: onTarget }] });
    expect(res.status === 200, `${step} answered ${res.status}`);
  };
  /** What a layer shows once it has stopped moving, with its lit drawn states. */
  const shows = async (layer) => {
    const reading = await settledReading(rendererPage, await onLayer(rendererPage, layer));
    return { ...reading, lit: (await litRoles(rendererPage, layer)).lit };
  };
  /** Nothing about `layer` changed between two readings. */
  const unchanged = (now, before, what) => {
    const diff = differences(now, before);
    if (now.lit.join() !== before.lit.join()) diff.push(`lit ${now.lit.join(', ') || '(none)'} against ${before.lit.join(', ') || '(none)'}`);
    transcript.push({ step: `compare: ${what}`, diff });
    expect(diff.length === 0, `${what}${diff.length ? ` - ${diff.join('; ')}` : ''}`);
  };

  // Two copies of the board, each with its own question.
  const questionField = idTitled('Question') ?? fields.find((f) => props[f]?.type === 'string' && !props[f]?.enum);
  const asked = (question) => (questionField ? { ...data, [questionField]: question } : data);
  const copyOne = await loadAndPlay('copy one', renderTarget, graphicId, asked('Copy one'));
  await loadAndPlay('copy two', secondTarget, graphicId, asked('Copy two'));
  const one = await shows(firstLayer);
  const two = await shows(secondLayer);
  await frame(rendererPage, 'two-copies', firstLayer);
  expect(
    one.text.includes('Copy one') && !one.text.includes('Copy two') && two.text.includes('Copy two') && !two.text.includes('Copy one'),
    `two copies on two layers each show their own question ("${one.text.slice(0, 40)}" / "${two.text.slice(0, 40)}")`,
  );
  await press('copy one', renderTarget, copyOne);
  const oneActed = await shows(firstLayer);
  expect(oneActed.lit.join() !== one.lit.join(), `${lighting} on copy one lights its own drawn states (${oneActed.lit.join(', ') || '(none)'})`);
  unchanged(await shows(secondLayer), two, "copy one's action leaves copy two exactly as it was");
  await frame(rendererPage, 'copy-one-acted', firstLayer);
  await clearLayer('copy one: clear', renderTarget);
  unchanged(await shows(secondLayer), two, 'clearing copy one leaves copy two exactly as it was');
  await frame(rendererPage, 'copy-two-alone', secondLayer);
  await clearLayer('copy two: clear', secondTarget);

  // The board and a different design, the catalog's Hairline, on the second layer.
  const hairline = (await api('read Hairline manifest', 'GET', `/api/ograf/v1/graphics/${hairlineId}`)).payload?.graphic;
  const hairlineProps = hairline?.schema?.properties ?? {};
  const hairlineData = Object.fromEntries(Object.keys(hairlineProps).map((f) => [f, hairlineProps[f]?.default ?? '']));
  const board = await loadAndPlay('board', renderTarget, graphicId, data);
  const boardAlone = await shows(firstLayer);
  await loadAndPlay('Hairline', secondTarget, hairlineId, hairlineData);
  const lowerThird = await shows(secondLayer);
  expect(lowerThird.text.length > 0, `the Hairline is on air on the second layer ("${lowerThird.text.slice(0, 40)}")`);
  unchanged(await shows(firstLayer), boardAlone, 'the Hairline arriving on another layer leaves the board as it was');
  await press('board', renderTarget, board);
  unchanged(await shows(secondLayer), lowerThird, "the board's action leaves the Hairline as it was");
  await frame(rendererPage, 'board-and-hairline', firstLayer);
  await clearLayer('board: clear', renderTarget);
  unchanged(await shows(secondLayer), lowerThird, 'clearing the board leaves the Hairline as it was');
  await clearLayer('Hairline: clear', secondTarget);

  return failures;
}

/**
 * What to send with a custom action, read off the manifest's own declaration for it.
 *
 * The spec puts the action id at the top level and its parameters in `payload`, typed by the
 * action's `schema`. A parameterless action declares `schema: null` and takes nothing.
 *
 * Where an action's parameter shares a key with a data field - which is how a quiz's "select"
 * carries the answer chosen - the field's own `enum` in the top-level `schema` is where the
 * choices are, and the action's copy of the property carries only the type and a default. An
 * operator surface derived from this manifest offers that enum; so does this, taking the first
 * choice that is not the empty "nothing selected" one. Sending the empty default instead would
 * fire the action and select nothing, which answers 200 and proves nothing.
 */
function payloadFor(actionId, manifest, dataProps) {
  const action = (manifest?.customActions ?? []).find((a) => a.id === actionId);
  const actionProps = action?.schema?.properties;
  if (!actionProps) return {};
  const payload = {};
  for (const [key, prop] of Object.entries(actionProps)) {
    const choices = (dataProps?.[key]?.enum ?? prop?.enum ?? []).filter((v) => v !== '');
    if (choices.length) payload[key] = choices[1] ?? choices[0];
    else if (prop?.default !== undefined && prop.default !== '') payload[key] = prop.default;
    else if (prop?.type === 'number') payload[key] = 0;
    else if (prop?.type === 'boolean') payload[key] = false;
    else payload[key] = '';
  }
  return { payload };
}

let exitCode = 0;
try {
  const failures = await main();
  if (failures.length) {
    exitCode = 1;
    console.error(`\n${failures.length} beat(s) failed:`);
    for (const f of failures) console.error(`  - ${f}`);
  } else {
    say('\nEvery beat answered as the contract says it should.');
  }
} catch (err) {
  exitCode = 1;
  console.error(`\nThe walk stopped: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  writeFileSync(join(outDir, 'transcript.json'), JSON.stringify(transcript, null, 2));
  say(`transcript: ${join(outDir, 'transcript.json')}`);
  if (launched) await launched.close().catch(() => {});
  stopChildren();
}
process.exit(exitCode);
