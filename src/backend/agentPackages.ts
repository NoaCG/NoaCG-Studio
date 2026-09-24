// The browser's half of WAITING PACKAGES (docs/AGENT_SAVE.md §7): the graphics packages a coding
// agent sent with `noacg pack --save`, waiting on Home → Productions for the user to press Install.
//
// The server writes them (api/_lib/me/packages.ts); this module only reads and deletes the
// signed-in user's own rows, through the app's Supabase client and the table's row-level security
// (supabase/migrations/0063_agent_packages.sql). Installing is NOT here: the Productions section
// hands the package's text to the same parse → validate → install path a pack file takes
// (src/packs/graphicsPack.ts), so an uploaded package and an imported file are one door.
//
// Offline-invariant, the communityData.ts rule: every function opens with `getSupabase()`, which
// resolves null in a build with no backend, so an offline studio asks nothing and shows nothing.

import { getSupabase } from './supabase';

/** One package waiting for Install - the row WITHOUT its body, which is only fetched on Install. */
export interface WaitingPackage {
  id: string;
  name: string;
  description: string;
  graphicCount: number;
  /** Which tool sent it (`noacg-cli`); provenance, never proof. */
  tool: string;
  createdAt: string;
}

interface Row {
  id: string;
  name: string;
  description: string | null;
  graphic_count: number;
  origin: { tool?: unknown } | null;
  created_at: string;
}

/** The signed-in user's waiting packages, newest first. Empty offline, signed out, or on error -
 *  a waiting row is a convenience on Home, never something that should break it. */
export async function listWaitingPackages(): Promise<WaitingPackage[]> {
  const sb = await getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('agent_packages')
    .select('id, name, description, graphic_count, origin, created_at')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return (data as Row[]).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description ?? '',
    graphicCount: r.graphic_count,
    tool: typeof r.origin?.tool === 'string' ? r.origin.tool : 'noacg-cli',
    createdAt: r.created_at,
  }));
}

/** The package itself, as pack-file TEXT - what `parsePack` reads, exactly as a file import does. */
export async function waitingPackageText(id: string): Promise<string> {
  const sb = await getSupabase();
  if (!sb) throw new Error('Not signed in.');
  const { data, error } = await sb.from('agent_packages').select('body').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('That package is no longer waiting - it may have been installed on another device.');
  return JSON.stringify((data as { body: unknown }).body);
}

/** Remove a waiting package - after Install, or when the user dismisses it. */
export async function removeWaitingPackage(id: string): Promise<{ error: string | null }> {
  const sb = await getSupabase();
  if (!sb) return { error: 'Not signed in.' };
  const { error } = await sb.from('agent_packages').delete().eq('id', id);
  return { error: error?.message ?? null };
}
