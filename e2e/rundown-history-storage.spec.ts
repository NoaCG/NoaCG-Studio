// covers: src/model/{durableStore,rundownHistory,shows}.ts
import { test, expect, type Page } from '@playwright/test';
import { settleDurableWrites } from './_durable';

async function seed(page: Page) {
  await page.goto('/app#/home');
  await expect(page.getByTestId('home-page')).toBeVisible();
  const ids = await page.evaluate(async () => {
    const m = await import('/src/model/shows.ts');
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const first = m.createShowNamedChecked('First').show, other = m.createShowNamedChecked('Other').show;
    m.addGraphicToShow(first.id, variantsFor('lower-third')[0].create({}));
    const saved = m.loadShows().find(s => s.id === first.id)!;
    m.upsertShow({ ...saved, cues: [{ id: 'cue', sourceId: saved.graphics[0].id, label: 'Original', values: { name: 'Ada' } }] });
    return { first: first.id, other: other.id };
  });
  await settleDurableWrites(page);
  return ids;
}

test('operation receipts keep a failed put distinct from a newer successful put', async ({ page }) => {
  await seed(page);
  const result = await page.evaluate(async () => {
    const d = await import('/src/model/durableStore.ts');
    const put = IDBObjectStore.prototype.put;
    let fail = true;
    IDBObjectStore.prototype.put = function(value, key) {
      if (fail && key === 'spx-gfx-shows') { fail = false; throw new DOMException('Injected quota refusal', 'QuotaExceededError'); }
      return put.call(this, value, key);
    };
    try {
      const original = d.durable.getItem('spx-gfx-shows')!;
      d.durable.setItem('spx-gfx-shows', original.replace('Original', 'Failed'));
      const failed = d.lastDurableWrite('spx-gfx-shows')!;
      d.durable.setItem('spx-gfx-shows', original.replace('Original', 'Newer'));
      const newer = d.lastDurableWrite('spx-gfx-shows')!;
      const error = await d.commitDurableReceipt(failed), success = await d.commitDurableReceipt(newer);
      return { error, success, different: failed.sequence !== newer.sequence, saved: d.durable.getItem('spx-gfx-shows') };
    } finally { IDBObjectStore.prototype.put = put; }
  });
  expect(result.error).toContain('storage is full'); expect(result.success).toBeNull(); expect(result.different).toBe(true);
  expect(result.saved).toContain('Newer'); expect(result.saved).not.toContain('Failed');
  await page.reload(); await expect(page.getByTestId('home-page')).toBeVisible();
  expect(await page.evaluate(async () => (await import('/src/model/shows.ts')).loadShows()[0].cues![0].label)).toBe('Newer');
});

test('a captured authoring operation retains every receipt including a reentrant write', async ({ page }) => {
  const ids = await seed(page);
  const result = await page.evaluate(async id => {
    const d = await import('/src/model/durableStore.ts'), m = await import('/src/model/shows.ts'), put = IDBObjectStore.prototype.put;
    let fail = true, nested = false;
    IDBObjectStore.prototype.put = function(value, key) {
      if (fail && key === 'spx-gfx-shows') { fail = false; throw new DOMException('Injected refusal', 'QuotaExceededError'); }
      return put.call(this, value, key);
    };
    const onChange = () => {
      if (nested) return; nested = true;
      d.durable.setItem('spx-gfx-shows', d.durable.getItem('spx-gfx-shows')!.replace('Failed', 'Newer'));
    };
    window.addEventListener('spx-data-changed', onChange);
    try {
      const captured = d.captureDurableWrites('spx-gfx-shows', () => m.updateShowCueChecked(id, 'cue', { label: 'Failed' }));
      return { count: captured.receipts.length, errors: await Promise.all(captured.receipts.map(d.commitDurableReceipt)), saved: d.durable.getItem('spx-gfx-shows') };
    } finally { IDBObjectStore.prototype.put = put; window.removeEventListener('spx-data-changed', onChange); }
  }, ids.first);
  expect(result.count).toBe(2); expect(result.errors[0]).toContain('storage is full'); expect(result.errors[1]).toBeNull(); expect(result.saved).toContain('Newer');
});

test('conditional inverse reads the actual database and refuses a stale mirror', async ({ page }) => {
  const ids = await seed(page);
  const result = await page.evaluate(async ids => {
    const m = await import('/src/model/shows.ts'), h = await import('/src/model/rundownHistory.ts');
    const expected = h.rundownSlice(m.loadShows().find(s => s.id === ids.first)!);
    const replacement = structuredClone(expected); replacement.cues[0].label = 'Inverse';
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('noacg-studio', 1); r.onsuccess = () => resolve(r.result); });
    await new Promise<void>(resolve => {
      const tx = db.transaction('kv', 'readwrite'), store = tx.objectStore('kv'), get = store.get('spx-gfx-shows');
      get.onsuccess = () => { const all = JSON.parse(get.result); all.find((s: {id: string}) => s.id === ids.first).cues[0].label = 'Other tab'; store.put(JSON.stringify(all), 'spx-gfx-shows'); };
      tx.oncomplete = () => resolve();
    });
    const result = await m.restorePersonalRundown(ids.first, expected, replacement, () => true);
    const saved = await new Promise<string>(resolve => { const r = db.transaction('kv').objectStore('kv').get('spx-gfx-shows'); r.onsuccess = () => resolve(r.result); });
    db.close(); return { result, saved };
  }, ids);
  expect(result.result.status).toBe('refused'); expect(result.result.error).toContain('changed elsewhere');
  expect(result.saved).toContain('Other tab'); expect(result.saved).not.toContain('Inverse');
});

test('two refused writes roll back to the database, and a refused inverse is retryable', async ({ page }) => {
  const ids = await seed(page);
  const result = await page.evaluate(async ids => {
    const d = await import('/src/model/durableStore.ts'), m = await import('/src/model/shows.ts'), h = await import('/src/model/rundownHistory.ts');
    const original = d.durable.getItem('spx-gfx-shows')!, put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, key) {
      if (key === 'spx-gfx-shows') throw new DOMException('Injected quota refusal', 'QuotaExceededError');
      return put.call(this, value, key);
    };
    try {
      d.durable.setItem('spx-gfx-shows', original.replace('Original', 'Failed first'));
      const first = d.lastDurableWrite('spx-gfx-shows')!;
      d.durable.setItem('spx-gfx-shows', original.replace('Original', 'Failed second'));
      const second = d.lastDurableWrite('spx-gfx-shows')!;
      await Promise.all([d.commitDurableReceipt(first), d.commitDurableReceipt(second)]);
      const rollback = d.durable.getItem('spx-gfx-shows');
      const expected = h.rundownSlice(m.loadShows().find(s => s.id === ids.first)!);
      const replacement = structuredClone(expected); replacement.cues[0].label = 'Inverse';
      const failed = await m.restorePersonalRundown(ids.first, expected, replacement, () => true);
      IDBObjectStore.prototype.put = put;
      const retry = await m.restorePersonalRundown(ids.first, expected, replacement, () => true);
      return { original, rollback, failed, retry };
    } finally { IDBObjectStore.prototype.put = put; }
  }, ids);
  expect(result.rollback).toBe(result.original); expect(result.failed.status).toBe('failed'); expect(result.failed.error).toContain('storage is full'); expect(result.retry.status).toBe('saved');
});

test('inverse preserves another production and unrelated latest metadata', async ({ page }) => {
  const ids = await seed(page);
  const result = await page.evaluate(async ids => {
    const m = await import('/src/model/shows.ts'), h = await import('/src/model/rundownHistory.ts');
    const first = m.loadShows().find(s => s.id === ids.first)!, expected = h.rundownSlice(first);
    const replacement = structuredClone(expected); replacement.cues[0].label = 'Restored';
    m.upsertShows(m.loadShows().map(s => ({ ...s, name: `${s.name} renamed`, data: { score: 12 } })));
    await (await import('/src/model/durableStore.ts')).commitDurableWrites();
    const result = await m.restorePersonalRundown(ids.first, expected, replacement, () => true);
    return { result, all: m.loadShows() };
  }, ids);
  expect(result.result.status).toBe('saved');
  expect(result.all.find(s => s.id === ids.first)).toMatchObject({ name: 'First renamed', data: { score: 12 }, cues: [{ id: 'cue', label: 'Restored', values: { name: 'Ada' } }] });
  expect(result.all.find(s => s.id === ids.other)).toMatchObject({ name: 'Other renamed', data: { score: 12 } });
});

test('newer pending write cancels an inverse during its database read', async ({ page }) => {
  const ids = await seed(page);
  const result = await page.evaluate(async ids => {
    const m = await import('/src/model/shows.ts'), h = await import('/src/model/rundownHistory.ts'), d = await import('/src/model/durableStore.ts');
    const expected = h.rundownSlice(m.loadShows().find(s => s.id === ids.first)!);
    const replacement = structuredClone(expected); replacement.cues[0].label = 'Inverse';
    const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function(key) {
      const request = get.call(this, key);
      if (key === 'spx-gfx-shows') request.addEventListener('success', () => {
        d.durable.setItem('spx-gfx-shows', d.durable.getItem('spx-gfx-shows')!.replace('Original', 'New pending edit'));
      }, { once: true });
      return request;
    };
    try {
      const result = await m.restorePersonalRundown(ids.first, expected, replacement, () => true);
      await d.commitDurableWrites();
      return { result, saved: d.durable.getItem('spx-gfx-shows') };
    } finally { IDBObjectStore.prototype.get = get; }
  }, ids);
  expect(result.result.status).toBe('refused'); expect(result.saved).toContain('New pending edit'); expect(result.saved).not.toContain('Inverse');
});

test('inverse refuses changed session and localStorage fallback', async ({ page }) => {
  const ids = await seed(page);
  const result = await page.evaluate(async ids => {
    const m = await import('/src/model/shows.ts'), h = await import('/src/model/rundownHistory.ts');
    const expected = h.rundownSlice(m.loadShows().find(s => s.id === ids.first)!);
    let valid = true; const writing = m.restorePersonalRundown(ids.first, expected, expected, () => valid); valid = false;
    return writing;
  }, ids);
  expect(result.status).toBe('refused');
  await page.addInitScript(() => Object.defineProperty(window, 'indexedDB', { value: undefined }));
  await page.reload(); await expect(page.getByTestId('home-page')).toBeVisible();
  const fallback = await page.evaluate(async () => (await import('/src/model/durableStore.ts')).conditionalDurableWrite('spx-gfx-shows', () => ({ value: '[]' }), () => true));
  expect(fallback.status).toBe('refused'); expect(fallback.error).toContain('IndexedDB');
});
