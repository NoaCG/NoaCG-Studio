// covers: src/components/home/usePublishDrift.ts, src/control/hostedControl.ts
//
// WHAT A PUBLISH WOULD CHANGE IN WHAT THE OUTPUTS RENDER (docs/work-specs/studio-day-playout AC-5).
// A publish reads each graphic's design from the publisher's own library, so the production page
// compares, graphic by graphic, the digest a publish would write now with the published one. Only
// for the graphics this browser reads from ITS OWN library: in a team production a member who does
// not hold the publisher's record must never read the publisher's newer design as a change of their
// own, or their Prepare for Live republishes the older copy over it. The whole flow against a real
// backend (edit in the library, Prepare for Live publishes it, the output moves) is
// e2e/configured/live-prepare.spec.ts; this pins the rule underneath it offline.

import { test, expect } from '@playwright/test';
import { bootstrapGraphic } from './_create';

test("only graphics read from this browser's own library are compared, and a library edit moves exactly that one", async ({ page }) => {
  await bootstrapGraphic(page, { name: 'Hairline' });
  const result = await page.evaluate(async () => {
    const { createGraphic, updateGraphic, graphicById, loadGraphics } = await import('/src/model/library.ts');
    const { createShowNamedChecked, addGraphicToShow, loadShows } = await import('/src/model/shows.ts');
    const { libraryGraphicDigests } = await import('/src/control/hostedControl.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { commitDurableWrites } = await import('/src/model/durableStore.ts');
    const { template } = useTemplateStore.getState();
    const { doc } = createGraphic({ ...template, name: 'Mine' }, { name: 'Mine' });
    const { show } = createShowNamedChecked(`Drift ${Date.now()}`);
    addGraphicToShow(show.id, doc.template, { graphicId: doc.id });
    // A teammate's graphic: in the production, held in nobody's library on this machine.
    addGraphicToShow(show.id, { ...template, name: 'Theirs' }, { graphicId: 'held-in-another-library' });
    await commitDurableWrites();
    const read = () => libraryGraphicDigests(loadShows().find((s) => s.id === show.id)!, loadGraphics());
    const before = await read();
    // An edit is a save at a later moment, as every editor save is.
    await new Promise((r) => setTimeout(r, 5));
    const mine = graphicById(doc.id)!;
    updateGraphic(doc.id, { template: { ...mine.template, css: `${mine.template.css}\n/* edited in the library */` } });
    await commitDurableWrites();
    const after = await read();
    const again = await read();
    return { keys: Object.keys(before).sort(), moved: before.Mine !== after.Mine, settled: after.Mine === again.Mine };
  });
  expect(result).toEqual({ keys: ['Mine'], moved: true, settled: true });
});
