import { type Page } from '@playwright/test';

// THE SAVED DOCUMENTS LAND A MOMENT AFTER THEY ARE ACCEPTED (src/model/durableStore.ts).
//
// A durable write updates the synchronous in-memory mirror and hands IndexedDB a transaction
// that settles on its own, so a mutator's return means ACCEPTED, not landed. Tearing the
// document down inside that window - `page.reload()`, a `goto`, closing the context - aborts
// whatever has not committed, and the next page reads a library missing exactly the last write
// or two. It is not deterministic WHICH one, which is what makes the resulting failure read as
// a mystery: three graphics saved in a row came back as three, or two, or one.
//
// The product is not what is wrong here. Every surface that tells the user a save succeeded
// already awaits `commitDurableWrites()` before it says so (store/saveActions.ts, the wizard,
// the Home rows, the production page), and the reads are synchronous by design - that is the
// whole reason the mirror exists. What a spec skips when it writes off the UI is that same
// wait, so these two helpers are it: settle before you tear the page down, and - when the read
// after a reload is an `evaluate` rather than a UI assertion - wait for the mirror to be loaded
// before believing what it says.

/**
 * Wait for every durable write queued so far to reach IndexedDB, and FAIL LOUDLY if one was
 * refused. Call before any `page.reload()` / `page.goto()` that follows a write made in the
 * page (createGraphic, addGraphicToShow, setShowHostedSlug, saveProject, …).
 *
 * It claims the failure the way a product surface would, so a refused write surfaces as a
 * named error here instead of a record that silently is not there.
 */
export async function settleDurableWrites(page: Page): Promise<void> {
  const failure = (await page.evaluate(`(async () => {
    const { commitDurableWrites } = await __noacgImport('/src/model/durableStore.ts');
    return await commitDurableWrites();
  })()`)) as string | null;
  if (failure) throw new Error(`a durable write was refused: ${failure}`);
}

/**
 * Wait for the reloaded page's mirror to be loaded before reading a model module from an
 * `evaluate`. Hydration is the ONE asynchronous step in the boot (src/main.tsx awaits it before
 * importing App), and the `load` event does not wait for it: a read that arrives first falls
 * through to localStorage, where these documents no longer live, and sees an empty library.
 *
 * A spec that asserts on rendered UI after the reload needs nothing extra - the shell cannot
 * render before hydration resolves. This is for the ones that read the model directly.
 */
export async function awaitDurableReady(page: Page): Promise<void> {
  await page.evaluate(`(async () => {
    const { hydrateDurableStore } = await __noacgImport('/src/model/durableStore.ts');
    await hydrateDurableStore();
  })()`);
}
