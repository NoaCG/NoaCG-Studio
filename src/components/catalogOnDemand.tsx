// THE TEMPLATE CATALOG, LOADED WHEN SOMETHING LISTS DESIGNS.
//
// `templates/catalog.ts` pulls every design and graphic type, about 650 modules. Home, the
// wizard's Entry step and the production page need none of it, so nothing on the /app boot path
// imports it statically: a surface that lists designs asks here, and shows `CatalogLoading`
// until it arrives. The wizard steps that build on it are `lazyStep()` for the same reason. The
// Entry step's template card starts the load on hover or focus, so a person who is about to
// browse rarely sees the wait, and a visit that never browses never pays for it.
//
// A failed load offers a page reload rather than a retry: browsers may keep a failed module
// fetch, and after a deploy the old chunk is simply gone.
import { lazy, useEffect, useSyncExternalStore, type ComponentType } from 'react';

export type Catalog = typeof import('../templates/catalog');

let state: { catalog: Catalog | null; failed: boolean } = { catalog: null, failed: false };
let loading: Promise<Catalog> | null = null;
const listeners = new Set<() => void>();

function set(next: typeof state): void {
  state = next;
  for (const listener of listeners) listener();
}

/** The catalog module, fetched once. */
export function loadCatalog(): Promise<Catalog> {
  loading ??= import('../templates/catalog').then(
    (catalog) => {
      set({ catalog, failed: false });
      return catalog;
    },
    (error: unknown) => {
      set({ catalog: null, failed: true });
      throw error;
    },
  );
  return loading;
}

/** Start the load without waiting for it, e.g. on hover over a door that will list designs. */
export function preloadCatalog(): void {
  loadCatalog().catch(() => undefined);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const useCatalogState = () => useSyncExternalStore(subscribe, () => state);

/** The catalog once loaded, else null; `active` starts the load. */
export function useCatalog(active = true): Catalog | null {
  const { catalog } = useCatalogState();
  useEffect(() => {
    if (active) preloadCatalog();
  }, [active]);
  return catalog;
}

function NotLoaded({ what }: { what: string }) {
  return (
    <p className="hint catalog-loading" role="status" data-testid="catalog-loading">
      {what} did not load.{' '}
      <button className="link-inline" onClick={() => window.location.reload()}>Reload</button>
    </p>
  );
}

export function CatalogLoading() {
  const { failed } = useCatalogState();
  if (failed) return <NotLoaded what="The designs" />;
  return <p className="hint catalog-loading" role="status" data-testid="catalog-loading">Loading designs…</p>;
}

/** `lazy()` for a step that loads with the catalog. Nothing above the wizard catches a render
 *  error, so a chunk that fails to load says so in place instead of blanking the page. */
export function lazyStep<P extends object>(load: () => Promise<{ default: ComponentType<P> }>) {
  const failed: ComponentType<P> = () => <NotLoaded what="This step" />;
  return lazy(() => load().catch(() => ({ default: failed })));
}
