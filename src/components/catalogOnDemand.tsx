// THE TEMPLATE CATALOG, LOADED WHEN SOMETHING LISTS DESIGNS.
//
// `templates/catalog.ts` pulls every design and graphic type, about 650 modules. Home, the
// wizard's Entry step and the production page need none of it, so nothing on the /app boot path
// imports it statically: a surface that lists designs asks here, and shows `CatalogLoading`
// until it arrives. The wizard steps that build on it are `lazy()` for the same reason. The
// Entry step's template card starts the load on hover or focus, so a person who is about to
// browse rarely sees the wait, and a visit that never browses never pays for it.
import { useEffect, useSyncExternalStore } from 'react';

export type Catalog = typeof import('../templates/catalog');

let state: { catalog: Catalog | null; failed: boolean } = { catalog: null, failed: false };
let loading: Promise<Catalog> | null = null;
const listeners = new Set<() => void>();

function set(next: typeof state): void {
  state = next;
  for (const listener of listeners) listener();
}

/** The catalog module, fetched once. A failed fetch is forgotten, so the next ask retries. */
export function loadCatalog(): Promise<Catalog> {
  if (!loading) {
    if (state.failed) set({ catalog: null, failed: false });
    loading = import('../templates/catalog').then(
      (catalog) => {
        set({ catalog, failed: false });
        return catalog;
      },
      (error: unknown) => {
        loading = null;
        set({ catalog: null, failed: true });
        throw error;
      },
    );
  }
  return loading;
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
    if (active) loadCatalog().catch(() => undefined);
  }, [active]);
  return catalog;
}

/** Start the load ahead of a press that will list designs (a hover or focus on its door). */
export function preloadCatalog(): void {
  loadCatalog().catch(() => undefined);
}

export function CatalogLoading() {
  const { failed } = useCatalogState();
  if (failed) {
    return (
      <p className="hint catalog-loading" role="status" data-testid="catalog-loading">
        The designs did not load.{' '}
        <button className="link-inline" onClick={() => void loadCatalog().catch(() => undefined)}>Try again</button>
      </p>
    );
  }
  return <p className="hint catalog-loading" role="status" data-testid="catalog-loading">Loading designs…</p>;
}
