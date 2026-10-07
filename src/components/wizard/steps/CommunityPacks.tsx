import { useEffect, useMemo, useState } from 'react';
import type { Show } from '../../../model/shows';
import { installPack, parsePack } from '../../../packs/graphicsPack';
import { trackEvent } from '../../../backend/events';

/**
 * COMMUNITY PACKS - Browse's third answer (docs/work-specs/community-packs/spec.md).
 *
 * A community pack is a FINISHED package: install it and it is a production, ready to run. Its
 * design cannot be changed (the operator still types into its fields), so this surface has one
 * action per card - Install - and no route into the editor. Install is the same parse -> export
 * gate -> production path as Home's "Import a package" (`installPack`), so a pack from the
 * shelf, from a file and from an agent are one installer.
 *
 * The shelf is the built index under public/packs/community/ (scripts/build-production-pack.mjs
 * assembles it from packs/community/). NoaCG seeds it; shared packs join it once the review
 * path exists.
 */

/** One shelf entry, as public/packs/community/index.json lists it. */
export interface CommunityPackEntry {
  id: string;
  name: string;
  description: string;
  author: string;
  graphics: number;
  cues: number;
  file: string;
  preview: string;
}

const SHELF = '/packs/community/';

interface Props {
  /** The search box above Browse's branch - it filters the shelf by name and description. */
  query: string;
  onClearQuery: () => void;
  /** The production exists: the wizard closes and opens it. */
  onInstalled: (show: Show) => void;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The shelf index, read once per page: switching Browse's answer back and forth remounts this
 *  component, and the list is static for the life of the deployment. A failed read is not kept,
 *  so the next visit tries again. */
let shelfRead: Promise<CommunityPackEntry[]> | null = null;
function readShelf(): Promise<CommunityPackEntry[]> {
  shelfRead ??= fetch(`${SHELF}index.json`)
    .then((res) => (res.ok ? (res.json() as Promise<{ packs?: CommunityPackEntry[] }>) : Promise.reject(new Error())))
    .then((index) => index.packs ?? [])
    .catch(() => {
      shelfRead = null;
      throw new Error('The community shelf could not be read. Check the connection and open it again.');
    });
  return shelfRead;
}

export default function CommunityPacks({ query, onClearQuery, onInstalled }: Props) {
  const [packs, setPacks] = useState<CommunityPackEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Install is single-flight (every button disables while one runs), so one refusal at a time.
  const [refusal, setRefusal] = useState<{ id: string; message: string } | null>(null);

  useEffect(() => {
    let live = true;
    readShelf()
      .then((list) => live && setPacks(list))
      .catch((error: Error) => live && setLoadError(error.message));
    return () => {
      live = false;
    };
  }, []);

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!packs || !words.length) return packs ?? [];
    return packs.filter((p) => {
      const text = `${p.name} ${p.description} ${p.author}`.toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [packs, query]);

  const install = async (entry: CommunityPackEntry) => {
    setBusy(entry.id);
    setRefusal(null);
    try {
      const res = await fetch(`${SHELF}${entry.file}`);
      if (!res.ok) throw new Error(`The pack could not be downloaded (${res.status}).`);
      const { pack, error } = parsePack(await res.text());
      if (!pack) throw new Error(error ?? 'That file is not a NoaCG graphics pack.');
      const show = await installPack(pack);
      trackEvent('activation', 'community-pack');
      onInstalled(show);
    } catch (error) {
      setRefusal({ id: entry.id, message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="wz-community" data-testid="community-packs">
      <p className="wz-kit-lede">
        Install one and it opens as a production, rundown included.
      </p>
      {loadError && <p className="wz-community-error" role="alert">{loadError}</p>}
      {!packs && !loadError && <p className="hint">Loading the shelf…</p>}
      {packs && packs.length === 0 && <p className="hint">No packs on the shelf yet.</p>}
      {packs && packs.length > 0 && shown.length === 0 && (
        <div className="wz-browse-empty">
          <p className="hint">No pack matches “{query.trim()}”.</p>
          <button type="button" className="wz-filter" onClick={onClearQuery}>✕ Clear the search</button>
        </div>
      )}
      <ul className="wz-community-grid">
        {shown.map((p) => (
          <li key={p.id} className="wz-community-card" data-community-pack={p.id}>
            <img
              className="wz-community-preview"
              src={`${SHELF}${p.preview}`}
              alt={`${p.name} on air`}
              loading="lazy"
              width={640}
              height={360}
            />
            <div className="wz-community-body">
              <strong>{p.name}</strong>
              <span className="hint">{p.description}</span>
              <span className="wz-community-meta">
                {plural(p.graphics, 'graphic')} · {plural(p.cues, 'cue')} · by {p.author}
              </span>
            </div>
            <button
              type="button"
              className="primary wz-community-install"
              disabled={busy !== null}
              onClick={() => void install(p)}
              aria-label={`Install ${p.name}`}
            >
              {busy === p.id ? 'Installing…' : 'Install'}
            </button>
            {refusal?.id === p.id && <p className="wz-community-error" role="alert">{refusal.message}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
