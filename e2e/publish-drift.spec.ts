// covers: src/components/home/usePublishDrift.ts, src/control/hostedControl.ts
// covers: src/control/liveCue.ts, src/control/cueItems.ts
// covers: src/control/airState.ts, src/control/sessionWire.ts
// covers: src/control/graphicVerbs.ts, src/control/verbDispatch.ts, src/control/verbView.ts
// covers: src/control/cueDraft.ts
//
// WHAT A PUBLISH WOULD CHANGE IN WHAT THE OUTPUTS RENDER (docs/work-specs/studio-day-playout AC-5).
// The production page compares, graphic by graphic, the digest a publish would write now with the
// published one. A publish reads each graphic from the production's own copy (live-publishing W2:
// the copy is the only truth), so every copy is compared, a teammate's included, and a library edit
// is no change until Update takes it into the copy. The whole flow against a real backend is
// e2e/configured/live-prepare.spec.ts; this pins the rule underneath it offline.

import { test, expect } from '@playwright/test';
import { bootstrapGraphic } from './_create';

test('every copy is compared; a library edit moves nothing, and Update moves exactly that copy', async ({ page }) => {
  await bootstrapGraphic(page, { name: 'Hairline' });
  const result = await page.evaluate(async () => {
    const { createGraphic, updateGraphic, graphicById, loadGraphics, newerLibraryDesign } = await __noacgImport('/src/model/library.ts');
    const { createShowNamedChecked, addGraphicToShow, loadShows, updateCopyFromLibrary } = await __noacgImport('/src/model/shows.ts');
    const { libraryGraphicDigests } = await __noacgImport('/src/control/hostedControl.ts');
    const { useTemplateStore } = await __noacgImport('/src/store/templateStore.ts');
    const { commitDurableWrites } = await __noacgImport('/src/model/durableStore.ts');
    const { template } = useTemplateStore.getState();
    const { doc } = createGraphic({ ...template, name: 'Mine' }, { name: 'Mine' });
    const { show } = createShowNamedChecked(`Drift ${Date.now()}`);
    addGraphicToShow(show.id, doc.template, { graphicId: doc.id });
    // A teammate's graphic: in the production, held in nobody's library on this machine.
    addGraphicToShow(show.id, { ...template, name: 'Theirs' }, { graphicId: 'held-in-another-library' });
    await commitDurableWrites();
    const record = () => loadShows().find((s) => s.id === show.id)!;
    const read = () => libraryGraphicDigests(record(), loadGraphics());
    const before = await read();
    // An edit is a save at a later moment, as every editor save is.
    await new Promise((r) => setTimeout(r, 5));
    const mine = graphicById(doc.id)!;
    updateGraphic(doc.id, { template: { ...mine.template, css: `${mine.template.css}\n/* edited in the library */` } });
    await commitDurableWrites();
    const afterEdit = await read();
    const pooled = record().graphics.find((g) => g.name === 'Mine')!;
    const newer = newerLibraryDesign(pooled, loadGraphics());
    const updated = newer ? updateCopyFromLibrary(show.id, pooled.id, newer, pooled.savedAt).error : 'no newer design';
    await commitDurableWrites();
    const afterUpdate = await read();
    return {
      keys: Object.keys(before).sort(),
      editMoved: before.Mine !== afterEdit.Mine,
      updated,
      updateMoved: afterEdit.Mine !== afterUpdate.Mine,
      theirsStill: before.Theirs === afterUpdate.Theirs,
    };
  });
  expect(result).toEqual({ keys: ['Mine', 'Theirs'], editMoved: false, updated: null, updateMoved: true, theirsStill: true });
});

// THE LOOK'S IMPORTED FACE (playout adjustments, phase 3): Publish carries it with the first graphic,
// so the digest read here must be the one Publish writes. Otherwise a production published with it
// reads "Publish changes" forever, and one given a new brand's typeface after its Publish never says
// the output still lacks the face a send names.
test('a look with an imported face reads clean once published, and a new face is a publish due', async ({ page }) => {
  await bootstrapGraphic(page, { name: 'Hairline' });
  const result = await page.evaluate(async () => {
    const { createGraphic, loadGraphics } = await __noacgImport('/src/model/library.ts');
    const { createShowNamedChecked, addGraphicToShow, loadShows, setShowLook } = await __noacgImport('/src/model/shows.ts');
    const { buildOutputPayload, libraryGraphicDigests } = await __noacgImport('/src/control/hostedControl.ts');
    const { stampPayload } = await __noacgImport('/src/control/payloadVersion.ts');
    const { useTemplateStore } = await __noacgImport('/src/store/templateStore.ts');
    const { commitDurableWrites } = await __noacgImport('/src/model/durableStore.ts');
    const { template } = useTemplateStore.getState();
    const { doc } = createGraphic({ ...template, name: 'Mine' }, { name: 'Mine' });
    const { show } = createShowNamedChecked(`Look drift ${Date.now()}`);
    addGraphicToShow(show.id, doc.template, { graphicId: doc.id });
    const lookWith = (data: string) => ({
      styleTag: 'clean',
      palette: { id: 'custom', name: 'Custom', styleTags: [], accent: '#ff7a00', text: '#ffffff', textDim: '#cccccc', panel: '#101820' },
      fontId: null,
      customFont: { family: 'Brand Sans', format: 'woff2', asset: { path: 'fonts/brand-sans.woff2', data } },
    }) as never;
    const now = () => loadShows().find((s) => s.id === show.id)!;
    const read = async () => ({ local: (await libraryGraphicDigests(now(), loadGraphics())).Mine, published: (await stampPayload(await buildOutputPayload(now(), loadGraphics()), null)).g.Mine });
    setShowLook(show.id, lookWith('data:font/woff2;base64,AAAA'));
    await commitDurableWrites();
    const first = await read();
    setShowLook(show.id, lookWith('data:font/woff2;base64,BBBB'));
    await commitDurableWrites();
    const second = await read();
    await new Promise((r) => setTimeout(r));
    return { firstClean: first.local === first.published, secondClean: second.local === second.published, moved: second.local !== first.published };
  });
  expect(result).toEqual({ firstClean: true, secondClean: true, moved: true });
});
