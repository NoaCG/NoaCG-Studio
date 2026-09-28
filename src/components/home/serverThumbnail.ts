import { useEffect, useState } from 'react';
import { libraryThumbnail, loadPlayoutSettings } from '../../control/playoutLink';

/**
 * A server clip's THUMBNAIL (`THUMBNAIL RETRIEVE` through NoaCG Bridge), cached in memory by name
 * and the server's own timestamp, so a re-encoded clip gets a fresh picture and an unchanged one
 * costs nothing the next time. Shared by the server picker and the monitors, which show the same
 * picture of the same file.
 *
 * A picture the Bridge could not give (not running yet, no scanner) is forgotten rather than
 * cached, so the next look asks again instead of staying blank for the rest of the session.
 */
const thumbs = new Map<string, Promise<string | null>>();

export function serverThumbnail(name: string, changed = ''): Promise<string | null> {
  const key = `${name}:${changed}`;
  let p = thumbs.get(key);
  if (!p) {
    p = libraryThumbnail(loadPlayoutSettings(), name);
    thumbs.set(key, p);
    void p.then((url) => {
      if (!url) thumbs.delete(key);
    });
  }
  return p;
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
