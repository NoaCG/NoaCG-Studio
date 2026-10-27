// A STRANGER'S OGRAF PACKAGE IN THE NORMAL LIBRARY (docs/work-specs/playout-ograf-rundown/spec.md,
// E3.1, AC-1). Two packages by two other authors (e2e/fixtures/ograf-library/PROVENANCE.md) go in
// through the Import graphic card, leave through Export byte for byte, join a production, take
// cues that are created, reordered and duplicated, survive a reload, and come back in with the same
// revision. Malformed archives are refused on the card with their reasons. A hostile package held by
// the library is mounted from its stored bytes on the real output stage, and every escape fails.
// covers: src/export/targets/ografForeign.ts, src/model/foreignPackage.ts, src/export/registry.ts
// covers: src/components/wizard/import/{ImportDesignStep.tsx,drop.ts}, src/components/ExportSurface.tsx
// covers: e2e/fixtures/ograf-library/**

import { test, expect, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addToProductionFromFinish } from './_create';
import { awaitDurableReady, settleDurableWrites } from './_durable';

const FIXTURES = fileURLToPath(new URL('fixtures/ograf-library/', import.meta.url));
const sha = (b: Buffer | Uint8Array) => createHash('sha256').update(b).digest('hex');

/** A fixture's package files, by path inside the package. */
function packageFiles(name: string): Map<string, Buffer> {
  const root = join(FIXTURES, name, 'package');
  const files = new Map<string, Buffer>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else files.set(relative(root, full).split('\\').join('/'), readFileSync(full));
    }
  };
  walk(root);
  return files;
}

async function zipOf(files: Map<string, Buffer | string>, folder: string): Promise<Buffer> {
  const zip = new JSZip();
  for (const [p, b] of files) zip.file(folder + p, b);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/** Drop a zip on the Import graphic card. */
async function dropZip(page: Page, name: string, buffer: Buffer) {
  // The wizard's front page by its route: once a production exists, a bare /app opens Home.
  await page.goto('/app#/new');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type="file"]').setInputFiles({ name, mimeType: 'application/zip', buffer });
}

/** Through the Export door: the window offers OGraf alone and the download is the package. */
async function exportFromFinish(page: Page): Promise<Map<string, Buffer>> {
  await page.getByTestId('wz-finish-export').click();
  const win = page.getByTestId('export-window');
  await expect(win).toBeVisible();
  await expect(win.locator('input[name="export-target"]')).toHaveCount(1);
  await expect(win.getByText('OGraf (EBU) export', { exact: true })).toBeVisible();
  await expect(win.getByTestId('ograf-usage')).toHaveCount(0);
  const [download] = await Promise.all([page.waitForEvent('download'), win.getByRole('button', { name: /Validate & download/ }).click()]);
  const zip = await JSZip.loadAsync(readFileSync(await download.path()));
  const out = new Map<string, Buffer>();
  for (const e of Object.values(zip.files)) if (!e.dir) out.set(e.name, await e.async('nodebuffer'));
  // Its own close control: Escape would close the wizard behind it too.
  await win.getByTitle('Close').click();
  await expect(win).toBeHidden();
  return out;
}

const library = (page: Page) =>
  page.evaluate(async () => {
    const { loadShows } = await import('/src/model/shows.ts');
    const { loadGraphics } = await import('/src/model/library.ts');
    const { verifyForeignPackage, readForeignPackage } = await import('/src/model/foreignPackage.ts');
    const show = loadShows().find((s) => s.name === 'Library walk');
    const pool = await Promise.all(
      (show?.graphics ?? []).map(async (g) => {
        const read = readForeignPackage(g.template);
        const check = await verifyForeignPackage(g.template);
        return { id: g.id, graphicId: g.graphicId ?? null, html: g.template.html, record: read.status === 'ok' ? read.record : null, verified: check.ok };
      }),
    );
    return {
      showId: show?.id ?? null,
      pool,
      cues: (show?.cues ?? []).map((c) => ({ id: c.id, sourceId: c.sourceId, label: c.label, typed: (c.typed as { values?: unknown } | undefined)?.values ?? null })),
      docs: loadGraphics().map((d) => ({ id: d.id, revision: (d.template.foreign as { revision?: string } | undefined)?.revision ?? null })),
    };
  });

test('two strangers\' packages go in, come out byte for byte, join a production, take cues and survive a reload', async ({ page }) => {
  test.setTimeout(110_000);
  const fixtures = [
    { name: 'ebu-scoreboard', folder: 'live_scoreboard', label: 'OGraf scoreboard 1.0.0', fields: /Home team, Away team/ },
    { name: 'nytamin-live-poll', folder: 'news_live_poll', label: 'OGraf news-live-poll 1.0.0', fields: /Poll Title, Poll Items/ },
  ];
  const revisions: string[] = [];
  for (const [i, f] of fixtures.entries()) {
    const files = packageFiles(f.name);
    await dropZip(page, `${f.name}.zip`, await zipOf(files, `${f.name}/`));
    await expect(page.getByTestId('import-template-package')).toHaveText(f.label);
    await expect(page.getByTestId('import-template-fields')).toContainText(f.fields);
    await expect(page.getByTestId('import-template-nofields')).toHaveCount(0);
    await page.locator('.wz-next').click();
    // Nothing here to edit: the artwork door is not offered.
    await expect(page.getByTestId('wz-finish-production-go')).toBeVisible();
    await expect(page.getByTestId('wz-finish-edit-artwork')).toHaveCount(0);
    await expect(page.locator('.wz-finish-summary')).toContainText(`${f.label}, kept byte for byte`);
    await expect(page.getByTestId('wz-finish-export')).toContainText('The OGraf package, exactly as it came in.');

    // Out: the files exactly as they came in, under the graphic's folder.
    const out = await exportFromFinish(page);
    expect([...out.keys()].sort()).toEqual([...files.keys()].map((p) => `${f.folder}/${p}`).sort());
    for (const [p, b] of files) expect(sha(out.get(`${f.folder}/${p}`)!), p).toBe(sha(b));

    // Into one production: a new one the first time, the same one the second.
    if (i === 0) {
      await page.getByTestId('wz-finish-production').selectOption('new');
      await page.getByTestId('wz-finish-production-name').fill('Library walk');
    } else {
      await page.getByTestId('wz-finish-production').selectOption({ label: 'Library walk (1 graphic)' });
    }
    await addToProductionFromFinish(page);
    await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 20_000 });

    // Back in: the exported zip re-imports with the same revision.
    const reread = await page.evaluate(
      async ({ bytes }) => {
        const { importForeignOgraf } = await import('/src/export/targets/ografForeign.ts');
        const read = await importForeignOgraf('back.zip', new Uint8Array(bytes));
        return read && read.ok ? read.record.revision : null;
      },
      { bytes: [...(await zipOf(out, ''))] },
    );
    expect(reread).toMatch(/^[0-9a-f]{64}$/);
    revisions.push(reread!);
  }

  // The production: two pool graphics that ARE the packages (no native scene, bytes verified), each
  // with its library record, and their package identity apart from every other id.
  await awaitDurableReady(page);
  let state = await library(page);
  expect(state.pool).toHaveLength(2);
  expect(state.pool.map((g) => g.record?.id)).toEqual(['scoreboard', 'news-live-poll']);
  expect(state.pool.map((g) => g.record?.revision)).toEqual(revisions);
  for (const g of state.pool) {
    expect(g.html).toBe('');
    expect(g.verified).toBe(true);
    expect(state.docs.find((d) => d.id === g.graphicId)?.revision).toBe(g.record?.revision);
  }

  // Cues: one per graphic as the production door made them, then a second scoreboard cue with typed
  // data, the poll's cue moved before the first, and the typed cue duplicated, both through the
  // rundown's own functions (the ones its Duplicate and its drag call) and their write door.
  const showId = state.showId!;
  await page.evaluate(
    async ({ showId, sourceId }) => {
      const shows = await import('/src/model/shows.ts');
      const { copyClip } = await import('/src/model/cueClipboard.ts');
      const { commitDurableWrites } = await import('/src/model/durableStore.ts');
      const { cueId } = shows.addShowCue(showId, sourceId, { label: 'Second half' });
      if (!cueId) throw new Error('no cue');
      if (shows.setCueTyped(showId, cueId, true).error) throw new Error('typed on');
      const r = shows.setCueTypedValues(showId, cueId, { homeShort: 'HJK', awayShort: 'KUP', homeScore: 2, awayScore: 1, homeColor: '#005ca9', awayColor: '#d4192c', minute: 46, seconds: 0 });
      if (r.error) throw new Error(r.error);
      const show = () => shows.loadShows().find((s) => s.id === showId)!;
      const poll = show().cues!.find((c) => c.sourceId !== sourceId)!;
      const first = show().cues![0];
      const moved = shows.moveInRundown(showId, { cueId: poll.id }, { before: first.id });
      if (moved.refused || moved.error) throw new Error(moved.refused ?? moved.error!);
      const copies = copyClip(show(), [cueId], (label) => `${label} copy`);
      const pasted = shows.pasteInRundown(showId, copies!, { after: cueId });
      if (pasted.refused || pasted.error) throw new Error(pasted.refused ?? pasted.error!);
      const failure = await commitDurableWrites();
      if (failure) throw new Error(failure);
    },
    { showId, sourceId: state.pool[0].id },
  );
  await settleDurableWrites(page);
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 30_000 });
  await awaitDurableReady(page);

  state = await library(page);
  const [board, poll] = state.pool;
  // The poll's cue was moved above the scoreboard's; the copy sits after its original.
  expect(state.cues.map((c) => (c.sourceId === board.id ? 'board' : 'poll'))).toEqual(['poll', 'board', 'board', 'board']);
  expect(state.cues.slice(2).map((c) => c.label)).toEqual(['Second half', 'Second half copy']);
  // Identities apart: four cue ids, two pool ids, two library ids, two packages; the copy has the
  // same typed data as its original and the same package, and nothing else in common.
  const ids = [...state.cues.map((c) => c.id), board.id, poll.id, board.graphicId, poll.graphicId, board.record!.revision, poll.record!.revision];
  expect(new Set(ids).size).toBe(ids.length);
  expect(state.cues[3].typed).toEqual(state.cues[2].typed);
  expect(state.cues[2].typed).toEqual({ homeShort: 'HJK', awayShort: 'KUP', homeScore: 2, awayScore: 1, homeColor: '#005ca9', awayColor: '#d4192c', minute: 46, seconds: 0 });
  expect(board.verified && poll.verified).toBe(true);
  expect(state.pool.map((g) => g.record?.revision)).toEqual(revisions);

  // Its library page offers no editor and no NoaCG panel: there is no code of ours to open.
  await page.goto(`/app#/control/${board.graphicId}`);
  await expect(page.getByTestId('control-add-production')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('control-open-editor')).toHaveCount(0);
  await page.goto(`/app#/production/${showId}`);
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 20_000 });

  // On the page: a cue over a package is not taken yet, and says why.
  await page.getByText('Second half copy').first().click();
  await expect(page.locator('[title="Imported OGraf packages do not play on outputs yet."]').first()).toBeAttached();
});

test('malformed archives and escaping references are refused on the card with their reasons', async ({ page }) => {
  const ok = packageFiles('nytamin-live-poll');
  const cases: Array<[string, Buffer, RegExp]> = [];
  // An escaping reference in a real hostile package: refused before it is kept, let alone loaded.
  const hostile = new Map<string, Buffer>();
  const dir = fileURLToPath(new URL('fixtures/foreign-ograf/hostile/', import.meta.url));
  for (const f of readdirSync(dir)) hostile.set(f, readFileSync(join(dir, f)));
  cases.push(['hostile.zip', await zipOf(hostile, 'hostile/'), /graphic\.mjs refers to "\.\.\/\.\.\/controller-secret\.json", which is outside the package/]);
  // A reference to a file the package does not have.
  const missing = new Map<string, Buffer | string>(ok);
  missing.set('live-poll.js', `import './gone.mjs';\n${ok.get('live-poll.js')!.toString('utf8')}`);
  cases.push(['missing.zip', await zipOf(missing, ''), /live-poll\.js refers to "\.\/gone\.mjs", which the package does not contain/]);
  // A bomb: 17 MB of zeros packed to a few kilobytes.
  const bomb = new Map<string, Buffer | string>(ok);
  bomb.set('data.bin', Buffer.alloc(17 * 1024 * 1024));
  cases.push(['bomb.zip', await zipOf(bomb, ''), /"data\.bin" is larger than 16 MB unpacked/]);
  for (const [name, buffer, expected] of cases) {
    await dropZip(page, name, buffer);
    await expect(page.getByTestId('import-drop-error')).toContainText('This OGraf package cannot be imported.');
    await expect(page.getByTestId('import-drop-error')).toContainText(expected);
    await expect(page.getByTestId('import-template-card')).toHaveCount(0);
  }
  // Path traversal: an entry named "../" plus its name, which JSZip will not write itself, so a
  // three-character name is written and then renamed in both of its headers.
  const three = new JSZip();
  for (const [p, b] of ok) three.file(p, b);
  three.file('Q7z', 'loot');
  const bytes = await three.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
  const evil = Buffer.from(bytes.toString('latin1').split('Q7z').join('../'), 'latin1');
  await dropZip(page, 'traversal.zip', evil);
  await expect(page.getByTestId('import-drop-error')).toContainText(/climbs out of the archive with "\.\."/);
});

const CREDENTIAL = `cap-e2e-${Math.random().toString(36).slice(2, 12)}`;
const EXFIL = 'https://exfil.example.com';
const TYPES: Record<string, string> = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };

/** The real /output shell with its boot module swapped for a stage that mounts the given packages
 *  (as foreign-ograf-sandbox.spec.ts does), each served under /__ograf-library/<key>/ from the bytes
 *  the library verified. A secret and a peer package sit beside them with CORS open. */
const HARNESS = `
import { createOutputStage } from '/src/output/stage.ts';
const q = new URLSearchParams(location.search);
const foreign = [];
for (const [i, key] of (q.get('keys') || '').split(',').filter(Boolean).entries()) {
  const packageBase = location.origin + '/__ograf-library/' + key + '/';
  const manifest = await (await fetch(packageBase + (key === 'benign' ? 'benign.ograf.json' : 'hostile.ograf.json'))).json();
  foreign.push({ key, layer: 20 + i, packageBase, manifest, data: {} });
}
const stage = createOutputStage(document.body, { v: 1, resolution: { width: 1920, height: 1080 }, graphics: [], cues: [] }, { foreign });
window.__stage = stage;
await stage.whenLoaded();
window.__stageReady = true;
`;

test('a hostile package held by the library is mounted from its verified bytes, and every escape fails', async ({ page }) => {
  // In through the importer and into a production; back out of storage after a reload, verified.
  await page.goto('/app');
  await awaitDurableReady(page);
  const pkg = await zipOf(packageFiles('hostile-dynamic'), 'hostile/');
  await page.evaluate(
    async ({ bytes }) => {
      const { importForeignOgraf } = await import('/src/export/targets/ografForeign.ts');
      const { createShowNamedChecked, addGraphicToShow } = await import('/src/model/shows.ts');
      const { commitDurableWrites } = await import('/src/model/durableStore.ts');
      const read = await importForeignOgraf('hostile.zip', new Uint8Array(bytes));
      if (!read?.ok) throw new Error(read ? read.reason : 'not foreign');
      const { show } = createShowNamedChecked('Hostile walk');
      addGraphicToShow(show!.id, read.template);
      const failure = await commitDurableWrites();
      if (failure) throw new Error(failure);
    },
    { bytes: [...pkg] },
  );
  await settleDurableWrites(page);
  await page.reload();
  await awaitDurableReady(page);
  const stored = await page.evaluate(async () => {
    const { loadShows } = await import('/src/model/shows.ts');
    const { verifyForeignPackage } = await import('/src/model/foreignPackage.ts');
    const g = loadShows().find((s) => s.name === 'Hostile walk')!.graphics[0];
    const check = await verifyForeignPackage(g.template);
    if (!check.ok) throw new Error(check.reason);
    return [...check.files].map(([p, b]) => [p, [...b]] as [string, number[]]);
  });
  const files = new Map(stored.map(([p, b]) => [p, Buffer.from(b)]));
  for (const [p, b] of packageFiles('hostile-dynamic')) expect(sha(files.get(p)!), p).toBe(sha(b));

  // The stage: two instances of it side by side, and a benign package beside them that the hostile
  // ones offer a bridge port and a play over it, on a page holding a credential.
  const benign = new Map<string, Buffer>();
  const benignDir = fileURLToPath(new URL('fixtures/foreign-ograf/benign/', import.meta.url));
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else benign.set(relative(benignDir, full).split('\\').join('/'), readFileSync(full));
    }
  };
  walk(benignDir);
  await page.addInitScript((credential) => {
    if (window.top === window) {
      localStorage.setItem('noacg-e2e-credential', credential);
      document.cookie = `noacg_e2e_session=${credential}; path=/`;
    }
  }, CREDENTIAL);
  let swapped = false;
  const exfil: string[] = [];
  await page.route('**/ograf-library/boot.js*', (route) => route.fulfill({ contentType: 'text/javascript', body: HARNESS }));
  await page.route('**/ograf-library/output*', async (route) => {
    const real = await route.fetch({ url: new URL('/output?production=probe', route.request().url()).toString() });
    const html = (await real.text()).replace(/<script type="module" src="\/src\/output\/main\.ts[^"]*"><\/script>/, '<script type="module" src="/ograf-library/boot.js"></script>');
    swapped = html.includes('/ograf-library/boot.js');
    await route.fulfill({ contentType: 'text/html', body: html });
  });
  await page.route('**/__ograf-library/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const open = { 'access-control-allow-origin': '*' };
    if (path === '/__ograf-library/controller-secret.json') return route.fulfill({ status: 200, contentType: 'application/json', headers: open, body: JSON.stringify({ credential: CREDENTIAL }) });
    if (path.startsWith('/__ograf-library/peer/')) return route.fulfill({ status: 200, contentType: TYPES[path.slice(path.lastIndexOf('.'))] ?? 'text/plain', headers: open, body: 'export const peer = 1;' });
    const m = /^\/__ograf-library\/(a|b|benign)\/(.+)$/.exec(path);
    const body = m ? (m[1] === 'benign' ? benign : files).get(decodeURIComponent(m[2])) : undefined;
    if (!body) return route.fulfill({ status: 404, headers: open, body: 'not in package' });
    return route.fulfill({ status: 200, contentType: TYPES[path.slice(path.lastIndexOf('.'))] ?? 'application/octet-stream', headers: open, body });
  });
  await page.route(`${EXFIL}/**`, (route) => {
    exfil.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' }, body: '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>' });
  });
  await page.goto(`/ograf-library/output?production=${CREDENTIAL}&keys=a,b,benign`);
  await page.waitForFunction(() => (window as unknown as { __stageReady?: boolean }).__stageReady === true, undefined, { timeout: 20_000 });
  expect(swapped).toBe(true);

  for (const key of ['a', 'b']) {
    const text = await page.frameLocator(`iframe[title="${key}"]`).locator('#probe').textContent({ timeout: 20_000 });
    const { results, seen } = JSON.parse(text!) as { results: Record<string, { outcome: string; detail: string }>; seen: string };
    for (const name of ['parent-dom', 'parent-url', 'parent-storage', 'own-storage', 'top-navigation', 'fetch-internet', 'image-internet', 'walk-out-fetch', 'walk-out-import', 'walk-out-image']) {
      expect(results[name]?.outcome, `${key} ${name}: ${results[name]?.detail}`).toBe('refused');
    }
    // An opaque origin has no cookie jar: reading it throws, or reads empty.
    expect(results['cookie'].outcome === 'refused' || results['cookie'].detail === '', `${key} cookie: ${results['cookie'].detail}`).toBe(true);
    expect(seen).not.toContain(CREDENTIAL);
  }
  expect(exfil).toEqual([]);
  // Each instance heard only its own answers: one mount each, none of the forged ones.
  const returns = await page.evaluate(() => {
    const stage = (window as unknown as { __stage: { ografReturns: Map<string, unknown[]> } }).__stage;
    return Object.fromEntries([...stage.ografReturns].map(([k, v]) => [k, v]));
  });
  expect(returns).toEqual({ a: [{ call: 'mount', statusCode: 200 }], b: [{ call: 'mount', statusCode: 200 }], benign: [{ call: 'mount', statusCode: 200 }] });
  // The neighbour never obeyed the port and the play the hostile instances offered it: still off.
  await expect(page.frameLocator('iframe[title="benign"]').locator('.board')).toHaveAttribute('data-on', 'false');
});
