// WHAT THE TWO OGRAF RENDERER WALKS SHARE.
//
// scripts/ograf-external-walk.mjs drives a NoaCG package in SuperFly.tv's ograf-server and
// scripts/ograf-spx-walk.mjs drives packages in SPX 1.4.1. Each runs in one mount, light or
// shadow (`--mount`, docs/work-specs/ograf-shadow-root/spec.md, phase 3): the packages are built
// in the app page by the real exporter with that mount (`ografZips`, e2e/_ografMount.ts), and
// every read inside a mounted graphic goes through `graphicBody` (e2e/_graphicBody.ts), so one
// walk proves both mounts.
//
// What lives here is plumbing: arguments, the app's dev server, the children a walk starts, the
// output directory, a package as zip bytes, and a reading of a mounted graphic to compare.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { devPort } from './dev-port.mjs';
import { graphicTemplate, installOgrafZips } from '../e2e/_ografMount.ts';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const appOrigin = `http://localhost:${devPort()}`;

const args = process.argv.slice(2);
/** The value after `name` on the command line, or null. */
export const flag = (name) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : null;
};
export const has = (name) => args.includes(name);

/** `--mount light|shadow`, light when absent; anything else stops the walk before it starts. */
export function mountArg() {
  const mount = flag('--mount') ?? 'light';
  if (mount !== 'light' && mount !== 'shadow') {
    console.error(`--mount is light or shadow (got ${mount})`);
    process.exit(2);
  }
  return mount;
}

export function say(line) {
  console.log(line);
}

/**
 * Empty `outDir` for a run and make its `frames/` folder. `--out` is a path somebody types, so it
 * is checked before anything is deleted: `--out .` would otherwise take the checkout with it.
 */
export function prepareOut(outDir) {
  if (!outDir.startsWith(root + (process.platform === 'win32' ? '\\' : '/'))) {
    console.error(`--out must be a directory INSIDE the repository (got ${outDir}); this run empties it.`);
    process.exit(2);
  }
  rmSync(outDir, { recursive: true, force: true });
  const framesDir = join(outDir, 'frames');
  mkdirSync(framesDir, { recursive: true });
  return framesDir;
}

// ── the servers a walk starts ────────────────────────────────────────────────

const children = [];

/** Start `command` and remember it, so `stopChildren` takes it down with the walk. */
export function startChild(command, commandArgs, options) {
  const child = spawn(command, commandArgs, {
    stdio: 'ignore',
    // Its own process group off Windows, so stopChildren can take the whole tree down.
    detached: process.platform !== 'win32',
    ...options,
    // Shares the terminal console so Ctrl+C stops it too: scripts/windows-hide.test.mjs.
    windowsHide: false,
  });
  children.push(child);
  return child;
}

/**
 * Stop a child this run started.
 *
 * SYNCHRONOUSLY, which is the whole point: `process.exit()` follows immediately, and an async
 * `spawn('taskkill')` never gets to run - measured on 2026-09-09, when three runs in a row each
 * left a 640 MB Vite server behind and the queue's own memory floor then blocked the next one.
 *
 * THE TREE, not the leader, on either platform: a shelled `npm run dev` is a `.cmd` (or an `sh`)
 * wrapping the node process that actually holds the port, and signalling the wrapper leaves the
 * server running. Windows takes the tree with `taskkill /T`; elsewhere the child is its own
 * process group (`detached`) and the group is signalled by negating the pid.
 */
export function stopChild(child) {
  if (!child) return;
  const at = children.indexOf(child);
  if (at !== -1) children.splice(at, 1);
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else process.kill(-child.pid, 'SIGTERM');
  } catch {
    /* the walk is over either way */
  }
}

/** Stop everything this run started, before this process exits. */
export function stopChildren() {
  for (const child of [...children]) stopChild(child);
}

export const isUp = (url) => fetch(url).then((res) => res.ok, () => false);

export async function waitFor(url, what, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (!(await isUp(url))) {
    if (Date.now() > deadline) throw new Error(`${what} never came up at ${url}`);
    await new Promise((r) => setTimeout(r, 400));
  }
}

/**
 * The app's dev server, pinned OFFLINE exactly as playwright.config.ts pins it, so the walk never
 * touches a developer's real backend and the import road behaves as the suite's does. Answers the
 * child it started, or null when it reused one, so a walk can stop it (`stopChild`) as soon as
 * its packages are built: the renderer beats never touch the app, and 640 MB of Vite is better
 * spent on the renderer's pages.
 */
export async function startDevServer() {
  if (await isUp(`${appOrigin}/app`)) {
    say(`app: reusing the dev server already on ${appOrigin}`);
    return null;
  }
  say(`app: starting the dev server on ${appOrigin}`);
  const child = startChild('npm', ['run', 'dev'], {
    cwd: root,
    shell: true,
    env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_PREVIEW_DEBOUNCE_MS: '50' },
  });
  await waitFor(`${appOrigin}/app`, 'the app dev server');
  return child;
}

// ── packages ────────────────────────────────────────────────────────────────

/** A catalog design's template exactly as it ships, made in the app page. */
export const designTemplate = (appPage, id) => graphicTemplate(appPage, { kind: 'design', id });

/**
 * `template`'s OGraf package in `mount` as zip bytes, laid out as the export dialog's download is
 * (`<slug>/...`): the target's own build, and for a shadow package the same zip written again by
 * the target's own writer told the mount.
 */
/* global ografZips -- the app page's, from installOgrafZips */
export async function ografZip(appPage, template, mount) {
  await installOgrafZips(appPage);
  const zips = await appPage.evaluate(({ template, mount }) => ografZips(template, { mounts: [mount] }), { template, mount });
  const zip = zips[mount];
  if (!zip || !('b64' in zip)) throw new Error(`the ${mount} package of "${template?.name}" did not build: ${zip?.error}`);
  return Buffer.from(zip.b64, 'base64');
}

// ── reading a mounted graphic ───────────────────────────────────────────────

/**
 * What a mounted graphic shows, read inside its body: its visible text (style and script text
 * left out), and one line per element with its box relative to the body, opacity, visibility,
 * colour and type. Two graphics that read the same paint the same layout in the same state, so
 * this is what a walk compares against the same package on a bare page.
 */
/* global graphicBody -- the page's, from GRAPHIC_BODY_SCRIPT */
export function readGraphic(host) {
  return host.evaluate((el) => {
    // A handle that found no Graphic reads as absent, so a beat fails rather than the walk.
    if (!el) return { text: '', boxes: [], absent: true };
    const body = graphicBody(el);
    const origin = body.getBoundingClientRect();
    const text = [];
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.parentElement?.closest('style, script')) text.push(node.data);
    }
    const boxes = [];
    for (const child of body.querySelectorAll('*')) {
      if (child.closest('style, script')) continue;
      const r = child.getBoundingClientRect();
      const cs = getComputedStyle(child);
      boxes.push(
        `${child.tagName.toLowerCase()}${child.id ? `#${child.id}` : ''} ` +
          `${Math.round(r.x - origin.x)},${Math.round(r.y - origin.y)} ${Math.round(r.width)}x${Math.round(r.height)} ` +
          `o${Number(cs.opacity).toFixed(2)} ${cs.visibility} ${cs.color} ${cs.fontSize} ${cs.fontFamily.split(',')[0]}`,
      );
    }
    return { text: text.join(' ').replace(/\s+/g, ' ').trim(), boxes };
  });
}

/**
 * Read `host` until two readings 300 ms apart agree: the graphic has finished moving. The page is
 * brought to the front first, because a browser throttles requestAnimationFrame in a page that is
 * not the visible one, GSAP rides that clock, and a graphic in a background page sits frozen
 * part-way through its entrance (two walks on 2026-09-09 reported a dead board for that alone).
 * Answers the last reading and whether it settled, so a graphic that never stops moving is
 * reported rather than hung on.
 */
export async function settledReading(page, host) {
  await page.bringToFront();
  const deadline = Date.now() + 8_000;
  let last = await readGraphic(host);
  for (;;) {
    await page.waitForTimeout(300);
    const next = await readGraphic(host);
    if (JSON.stringify(next) === JSON.stringify(last)) return { ...next, settled: true };
    last = next;
    if (Date.now() > deadline) return { ...last, settled: false };
  }
}

/** How two readings differ: nothing when they agree, else the count and the first difference. */
export function differences(a, b) {
  const out = [];
  if (a.absent || b.absent) out.push(`no graphic mounted (${a.absent ? 'shown' : 'reference'})`);
  if (a.text !== b.text) out.push(`text "${a.text.slice(0, 80)}" against "${b.text.slice(0, 80)}"`);
  const lines = Math.max(a.boxes.length, b.boxes.length);
  let differing = 0;
  let first = null;
  for (let i = 0; i < lines; i++) {
    if (a.boxes[i] !== b.boxes[i]) {
      differing += 1;
      first ??= `${a.boxes[i] ?? '(none)'} against ${b.boxes[i] ?? '(none)'}`;
    }
  }
  if (differing) out.push(`${differing} of ${lines} elements, first: ${first}`);
  return out;
}
