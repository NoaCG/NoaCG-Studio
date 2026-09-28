import { useEffect, useState } from 'react';
import { libraryThumbnail, loadPlayoutSettings } from '../../control/playoutLink';

/**
 * A server clip's THUMBNAIL (`THUMBNAIL RETRIEVE` through NoaCG Bridge), cached in memory by
 * server and name. Shared by the server picker and the monitors, which show the same picture of
 * the same file: the picker knows the server's timestamp for it and passes it, so a re-encoded
 * clip gets a fresh picture the next time the list is open, and the monitors, which do not, take
 * whatever picture is there.
 *
 * A picture the Bridge could not give (not running yet, no scanner) is forgotten rather than
 * cached, so the next look asks again instead of staying blank for the rest of the session.
 */
const thumbs = new Map<string, { changed?: string; picture: Promise<string | null> }>();

export function serverThumbnail(name: string, changed?: string): Promise<string | null> {
  const settings = loadPlayoutSettings();
  const key = `${settings.host.trim()}:${settings.amcpPort} ${name}`;
  const hit = thumbs.get(key);
  if (hit && (changed === undefined || hit.changed === changed)) return hit.picture;
  const entry = { changed, picture: libraryThumbnail(settings, name) };
  thumbs.set(key, entry);
  void entry.picture.then((url) => {
    if (!url && thumbs.get(key) === entry) thumbs.delete(key);
  });
  return entry.picture;
}

/** The thumbnail of `name` once it arrives; null before then, and for no name. */
export function useServerThumbnail(name: string | null): string | null {
  const [thumb, setThumb] = useState<{ name: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!name) return;
    let alive = true;
    void serverThumbnail(name).then((url) => {
      if (alive) setThumb({ name, url });
    });
    return () => {
      alive = false;
    };
  }, [name]);
  return name && thumb?.name === name ? thumb.url : null;
}
