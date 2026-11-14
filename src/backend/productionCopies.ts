// THE PRODUCTION-COPIES SWITCH, as this page reads it (live-publishing W2, designs/G1.md sections 4
// to 6). Migration 0115 answers two booleans: whether this request carried the build mark (the
// header `answeredFetch` adds), and whether the switch that refuses older pages' authoring is on.
// Adoption runs only once the switch reads on; a failed or missing answer reads as unknown, and
// adoption waits.

import { getSupabase } from './supabase';

export interface CopiesState {
  /** The request reached the database carrying the build mark. */
  mark: boolean;
  /** The switch is on: older pages only play out. */
  on: boolean;
}

/** The switch as the server sees it now, or null when it cannot say (offline, an instance without
 *  0115, a failed read). */
export async function readCopiesState(): Promise<CopiesState | null> {
  const sb = await getSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb.rpc('production_copies_state');
    if (error || !data || typeof data !== 'object') return null;
    const { mark, on } = data as { mark?: unknown; on?: unknown };
    return typeof mark === 'boolean' && typeof on === 'boolean' ? { mark, on } : null;
  } catch {
    return null;
  }
}
