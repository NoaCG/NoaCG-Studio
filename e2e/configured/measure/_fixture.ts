import { expect, type Page } from '@playwright/test';
import { publishProduction } from '../../_publish';
import { clearPublishedShows, signIn, wipeMyGraphics } from '../_helpers';

// THE TWO FIXTURES of docs/work-specs/live-publishing/spec.md ("How the agent tests and measures"):
// "Typical", 20 graphics from NoaCG templates with 3 MB of generated images, and "Large", 60
// graphics with 10 MB. 1 MB is 1,048,576 bytes of image FILE (the stored JSON holds them as
// base64, about a third larger, as the spec's size table counts them).
//
// The graphics are catalog variants built through the wizard's own create path (as e2e/_create.ts
// does), taken round-robin across categories so the code mix is a real one. Every template graphic
// carries one generated PNG of seeded noise (incompressible, so its bytes are real bytes) as an
// asset, shown by a small <img> in its markup, the way an uploaded logo travels in a graphic.
//
// Beyond the plain cues, the fixture holds one of each W1 path's subject:
//   - a stepped lower third of three lines ("Next", and two fast Nexts),
//   - the House Score board (its Goal button is the quick button, its number stepper the +1),
//   - a folder of two graphic cues ("folder Take"),
//   - the production's own picture graphic with one generated picture ("picture cue"),
//   - a CasparCG server clip ("server cue"), played through the fake NoaCG Bridge.

export type FixtureName = 'typical' | 'large';
export const FIXTURES: Record<FixtureName, { graphics: number; imageBytes: number }> = {
  typical: { graphics: 20, imageBytes: 3 * 1_048_576 },
  large: { graphics: 60, imageBytes: 10 * 1_048_576 },
};

export interface BuiltFixture {
  showId: string;
  name: string;
  graphics: number;
  imageFileBytes: number;
  storedOutputBytes: number;
  cues: { plain: string[]; stepped: string; score: string; picture: string; server: string; folder: string };
  build: { ms: number; publishMs: number };
}

/** Sign in, clear the account, build the fixture production and publish it. Leaves the page on
 *  the production page with the Playout panel closed. */
export async function buildFixture(page: Page, which: FixtureName): Promise<BuiltFixture> {
  const startedAt = Date.now();
  const step = (what: string) => console.log(`[fixture ${((Date.now() - startedAt) / 1000).toFixed(1)}s] ${what}`);
  await signIn(page);
  step('signed in');
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  step('cleared productions');
  await wipeMyGraphics(page);
  step('cleared graphics');
  await page.goto('/app#/home');
  await expect(page.getByTestId('home-page')).toBeVisible({ timeout: 30_000 });
  const name = `LP2 ${which} ${Date.now()}`;
  const spec = FIXTURES[which];
  const made = await page.evaluate(
    async ({ name, graphics, imageBytes }) => {
      const { CATALOG } = await import('/src/templates/catalog.ts');
      const { initialDraft, mergeDraft, buildDraftTemplate } = await import('/src/components/wizard/draft.ts');
      const { formatTemplate } = await import('/src/format/formatCode.ts');
      const m = await import('/src/model/shows.ts');
      const { commitDurableWrites } = await import('/src/model/durableStore.ts');
      const { createPictureTemplate, addPictureToTemplate } = await import('/src/templates/picture.ts');

      // Seeded noise, so every run builds the same bytes.
      let seed = 0x2468ace;
      const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
      const png = (target: number): { url: string; bytes: number } => {
        const width = 256;
        let height = Math.max(1, Math.round(target / (width * 3)));
        for (let attempt = 0; attempt < 3; attempt++) {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d')!;
          const img = ctx.createImageData(width, height);
          for (let i = 0; i < img.data.length; i += 4) {
            img.data[i] = (rnd() * 256) | 0;
            img.data[i + 1] = (rnd() * 256) | 0;
            img.data[i + 2] = (rnd() * 256) | 0;
            img.data[i + 3] = 255;
          }
          ctx.putImageData(img, 0, 0);
          const url = canvas.toDataURL('image/png');
          const b64 = url.slice(url.indexOf(',') + 1);
          const bytes = Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
          if (Math.abs(bytes - target) / target < 0.03 || attempt === 2) return { url, bytes };
          height = Math.max(1, Math.round(height * (target / bytes)));
        }
        throw new Error('unreachable');
      };

      const { show, error: notCreated } = m.createShowNamedChecked(name);
      if (notCreated) throw new Error(notCreated);
      const id = show.id;

      const build = async (variantName: string | null, index: number, steps = false) => {
        const all = Object.values(CATALOG).flat();
        const variant = variantName ? all.find((v) => v.name === variantName) : null;
        // Round-robin across categories: the i-th variant of category (i mod k).
        const cats = Object.values(CATALOG).filter((l) => (l ?? []).length > 0) as (typeof all)[];
        const pick = variant ?? cats[index % cats.length][Math.floor(index / cats.length) % cats[index % cats.length].length];
        const draft = mergeDraft(initialDraft(), {
          variantId: pick.id,
          lines: pick.suggestedLines.map((l) => ({ ...l })),
          zone: null,
          logoEnabled: null,
          animation: steps ? { presetId: null, outPresetId: null, steps: true } : { presetId: null, outPresetId: null },
          paletteId: null,
          customPalette: null,
          fontId: null,
        });
        return formatTemplate(buildDraftTemplate(pick, draft));
      };

      // The picture graphic holds one picture's share of the image bytes; the template graphics
      // share the rest evenly.
      const share = Math.floor(imageBytes / (graphics));
      let imageFileBytes = 0;
      const withImage = (t: Awaited<ReturnType<typeof build>>, i: number, name: string) => {
        const { url, bytes } = png(share);
        imageFileBytes += bytes;
        const path = `assets/lp2-${i}.png`;
        return {
          ...t,
          name,
          assets: [...t.assets, { path, data: url }],
          html: `${t.html}\n<img class="lp2-gen" src="${path}" alt="" style="position:absolute;left:0;top:0;width:8px;height:8px;opacity:0.02">`,
        };
      };

      const add = (t: Parameters<typeof m.addGraphicToShow>[1]) => {
        const { error } = m.addGraphicToShow(id, t, {});
        if (error) throw new Error(error);
        const g = m.loadShows().find((s) => s.id === id)!.graphics.find((x) => x.name === t.name)!;
        return m.loadShows().find((s) => s.id === id)!.cues!.find((c) => c.sourceId === g.id)!.id;
      };

      // Specials first, then plain graphics up to the count. The picture graphic is one of the count.
      // Three lines, so a Take leaves two Nexts to press ("two fast Nexts", AC-1).
      const stepped = add(withImage(await build('Stack Three', 0, true), 0, 'LP2 Stepped'));
      const score = add(withImage(await build('House Score', 0), 1, 'LP2 Score'));
      const pic = png(share);
      imageFileBytes += pic.bytes;
      const stage = { width: 1920, height: 1080 };
      const pictureTpl = addPictureToTemplate({ ...createPictureTemplate('', stage), name: 'Pictures' }, { fileName: 'lp2-picture.png', data: pic.url }).template;
      const picture = add(pictureTpl);
      const plain: string[] = [];
      let made = 3;
      for (let i = 0; made < graphics; i++, made++) {
        try {
          plain.push(add(withImage(await build(null, i), made, `LP2 G${String(made).padStart(2, '0')}`)));
        } catch (e) {
          // A variant that cannot be built off the wizard is skipped; the count is kept.
          made -= 1;
          if (i > graphics * 4) throw e;
        }
      }
      // The folder: two plain cues, played together.
      const { folderId, error: folderRefused } = m.addFolderFromSelection(id, [plain[plain.length - 2], plain[plain.length - 1]], 'LP2 Folder');
      if (!folderId) throw new Error(`folder: ${folderRefused}`);
      m.setFolderMode(id, folderId, 'together');
      // The server cue: a clip on channel 2 of the fake Bridge.
      m.addPlayoutItem(id, { adapter: 'casparcg', kind: 'media', channel: 2, name: 'OPENER', mediaKind: 'movie', frames: 375, fps: 25 } as never);
      const record = m.loadShows().find((s) => s.id === id)!;
      const server = record.cues!.find((c) => c.source === 'playout')!.id;
      const failure = await commitDurableWrites();
      if (failure) throw new Error(failure);
      return { id, plain: plain.slice(0, -2), picture, stepped, score, server, folder: folderId, imageFileBytes, graphics: record.graphics.length };
    },
    { name, graphics: spec.graphics, imageBytes: spec.imageBytes },
  );
  const builtMs = Date.now() - startedAt;
  step('built');
  await page.evaluate(async (id) => {
    const { useRouter } = await import('/src/app/router.ts');
    useRouter.getState().navigate({ view: 'production', id });
    await new Promise((resolve) => setTimeout(resolve));
  }, made.id);
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 30_000 });
  const publishAt = Date.now();
  await publishProduction(page);
  const publishMs = Date.now() - publishAt;
  step('published');
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'true', { timeout: 30_000 });
  const panel = page.getByTestId('production-status-panel');
  if (await panel.isVisible()) {
    await page.getByTestId('production-status').click();
    await expect(panel).toBeHidden();
  }
  const storedOutputBytes = await page.evaluate(async (id) => {
    const { loadShows } = await import('/src/model/shows.ts');
    const { getSupabase } = await import('/src/backend/supabase.ts');
    const s = loadShows().find((x) => x.id === id)!;
    const sb = await getSupabase();
    if (!sb || !s.hostedSlug) return -1;
    const { data } = await sb.from('control_shows').select('output').eq('slug', s.hostedSlug).maybeSingle();
    return data ? new TextEncoder().encode(JSON.stringify((data as { output: unknown }).output)).length : -1;
  }, made.id);
  return {
    showId: made.id,
    name,
    graphics: made.graphics,
    imageFileBytes: made.imageFileBytes,
    storedOutputBytes,
    cues: { plain: made.plain, stepped: made.stepped, score: made.score, picture: made.picture, server: made.server, folder: made.folder },
    build: { ms: builtMs, publishMs },
  };
}

/** Leave the account as it was found: unpublish and delete every production, through the sync. */
export async function cleanUp(page: Page): Promise<void> {
  await clearPublishedShows(page).catch((e) => console.log(`[fixture] clean-up failed: ${String(e).slice(0, 200)}`));
}

/** The open production's output slug. */
export async function outputSlugOf(page: Page, showId: string): Promise<string> {
  const slug = await page.evaluate(async (id) => {
    const { loadShows } = await import('/src/model/shows.ts');
    return loadShows().find((s) => s.id === id)?.outputSlug ?? null;
  }, showId);
  expect(slug, 'publishing mints an output slug').toBeTruthy();
  return slug as string;
}
