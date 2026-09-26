import { useState } from 'react';
import { durableStoreHealth } from '../model/durableStore';

/**
 * The boot-health notice for a browser where the durable store could not run on IndexedDB
 * (model/durableStore.ts). Degrading was always silent; on locked-down machines (enterprise
 * site-data policies - the class of network a broadcaster demo failed on) that silence read as
 * "my work vanished". Two honest messages, one per failure shape:
 *
 *  - 'timeout' (a wedged backend): saved documents EXIST in IndexedDB and could not be
 *    loaded, and this session's work lands in localStorage a healthy boot will ignore -
 *    so the user must export anything they want to keep.
 *  - everything else: the browser never offered IndexedDB, so localStorage IS the store,
 *    ceiling and all - saves work until a big graphic does not fit.
 *
 * Health is fixed at boot (the hydration latch), so one read at first render is exact -
 * no subscription needed. Dismissal is session state; the condition returns next load.
 */
export default function StorageHealthNotice() {
  const [dismissed, setDismissed] = useState(false);
  const { degraded } = durableStoreHealth();
  if (!degraded || dismissed) return null;
  const wedged = degraded === 'timeout';
  return (
    <aside
      className="storage-health-notice"
      role="status"
      aria-label="Browser storage warning"
      data-testid="storage-health-notice"
      data-reason={degraded}
    >
      <div>
        <strong>{wedged ? 'Saved work could not be loaded' : 'Browser storage is limited here'}</strong>
        <p>
          {wedged
            ? 'Browser storage did not respond, so saved graphics are not shown - they are untouched, not lost. Anything you make now may not be here after a reload: export what you want to keep.'
            : 'This browser blocks its main storage, so saving falls back to a small reserve (about 5 MB). Large graphics may not fit - export what you want to keep.'}
        </p>
        <a href="/app?diag=1" target="_blank" rel="noreferrer">
          Run the connection check
        </a>
      </div>
      <div className="storage-health-notice-actions">
        <button onClick={() => setDismissed(true)}>Dismiss</button>
      </div>
    </aside>
  );
}
