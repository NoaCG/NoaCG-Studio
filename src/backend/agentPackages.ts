// The browser's half of WAITING PACKAGES (docs/AGENT_SAVE.md §7): the graphics packages a coding
// agent sent with `noacg pack --save`, waiting on Home → Productions for the user to press Install.
//
// The server writes them (api/_lib/me/packages.ts); this module only reads and deletes the
// signed-in user's own rows, through the app's Supabase client and the table's row-level security
// (supabase/migrations/0065_agent_packages.sql). Installing is NOT here: the Productions section
// hands the package's text to the same parse → validate → install path a pack file takes
// (src/packs/graphicsPack.ts), so an uploaded package and an imported file are one door.
//
// Offline-invariant: every function opens with `getSupabase()`, which
// resolves null in a build with no backend, so an offline studio asks nothing and shows nothing.
//
// INSTALL AND DISMISS SETTLE THE PACKAGE through the server (`POST /api/me/deliveries`, docs/
// AGENT_SAVE.md §9): the waiting row goes and its delivery receipt records the outcome - and the
// production Install made - in one statement, so the package's link keeps answering afterwards
// (`waitingPackageReceipt`). A deployment without that route still gets the plain delete.

import { getSupabase } from './supabase';
import { authedFetch, errorMessage } from './agentAccess';

/** One package waiting for Install - the row WITHOUT its body, which is only fetched on Install. */
export interface WaitingPackage {
  id: string;
  name: string;
  description: string;
  graphicCount: number;
  /** Which tool sent it (`noacg-cli`, or `noacg-connector` for a chat client); provenance, never proof. */
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

/** The signed-in user's waiting packages, newest first. Empty offline or signed out. A failed
 *  load THROWS: "nothing is waiting" and "we could not ask" must never look the same on Home. */
export async function listWaitingPackages(): Promise<WaitingPackage[]> {
  const sb = await getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('agent_packages')
    .select('id, name, description, graphic_count, origin, created_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message || 'The waiting packages could not be loaded.');
  if (!data) return [];
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

/** Remove a waiting package directly, with no receipt - what a deployment without the settle
 *  route gets, and the e2e clean-up. */
export async function removeWaitingPackage(id: string): Promise<{ error: string | null }> {
  const sb = await getSupabase();
  if (!sb) return { error: 'Not signed in.' };
  const { error } = await sb.from('agent_packages').delete().eq('id', id);
  return { error: error?.message ?? null };
}

/** Install (`productionId`, the production it made) or dismiss (null) a waiting package: the row
 *  goes and its receipt records which. Falls back to the plain delete where the route is missing. */
export async function settleWaitingPackage(id: string, productionId: string | null): Promise<{ error: string | null }> {
  try {
    const response = await authedFetch('/api/me/deliveries', {
      method: 'POST',
      body: JSON.stringify({ action: 'settle', package: id, production: productionId }),
    });
    if (response.ok) return { error: null };
    // 404 from our handler means it is no longer waiting; the delete below then removes nothing.
  } catch {
    /* fall through to the delete */
  }
  return removeWaitingPackage(id);
}

/** What became of a package that is no longer waiting, from its receipt (docs/AGENT_SAVE.md §9). */
export type PackageFate =
  | { state: 'installed'; productionId: string | null }
  | { state: 'dismissed' | 'missing' | 'pending_install' }
  /** No receipt for this id in this account: another account's package, or a mistyped link. */
  | { state: 'not_found' };

export async function waitingPackageFate(id: string): Promise<PackageFate> {
  const response = await authedFetch(`/api/me/deliveries?id=${encodeURIComponent(id)}`);
  if (response.status === 404) return { state: 'not_found' };
  if (!response.ok) throw new Error(await errorMessage(response, `Could not check this package (${response.status}).`));
  const { receipt } = (await response.json()) as {
    receipt?: { state?: string; resources?: Array<{ kind?: string; id?: string }> };
  };
  const state = receipt?.state;
  if (state === 'installed') {
    return { state, productionId: receipt?.resources?.find((r) => r.kind === 'production')?.id ?? null };
  }
  if (state === 'dismissed' || state === 'missing' || state === 'pending_install') return { state };
  return { state: 'not_found' };
}
