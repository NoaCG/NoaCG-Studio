// The CasparCG servers this Bridge CONNECTED to (docs/BRIDGE.md §3, owner decision 2026-09-30): the
// one thing it keeps besides its token, so a browser that pairs, even one that forgets all of its
// own storage every session, never has the server's address typed again.
//
// Host and port, most recent first, at most MAX_SERVERS, and since 0.8.0 each server's STUDIO SETUP
// (its named channels, the NoaCG output's slot, the New media channel; owner decision 2026-10-01,
// docs/work-specs/studio-day-playout D7), so a second browser or another account opens with the same
// setup. A Connect adds or raises a server; `/studio` replaces the setup of a server already listed.
// Nothing else writes the file - not a test, the page's status poll or any command - and nothing here
// ever contacts a server. A file that cannot be read or parsed reads as an empty list: forgetting the
// servers is a nuisance, a Bridge that will not start is an outage. A field a newer Bridge wrote is
// carried through a rewrite untouched, so from 0.8.0 on, running an older Bridge for a day loses
// nothing. 0.7.0 itself rewrites host and port only: going back to it forgets every setup.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { configDir } from '../config.js';
import { isRememberedServerAddress, MAX_MEDIA_FOLDER, readStudio, type RememberedServer, type StudioSetup } from './protocol.js';

export { readStudio } from './protocol.js';

/** Enough for every server one studio laptop meets; the oldest falls off. */
export const MAX_SERVERS = 8;

export interface ServerMemory {
  list(): Promise<RememberedServer[]>;
  /** Put this server first, keeping its setup, and return the new list. */
  remember(server: RememberedServer): Promise<RememberedServer[]>;
  /** Replace the setup of a server in the list and return the new list, or null when the list does
   *  not hold that server. Its place in the list stays. */
  setStudio(server: RememberedServer, studio: StudioSetup): Promise<RememberedServer[] | null>;
  /** Keep (or, with null, forget) the media folder of a server in the list, as setStudio does. */
  setMediaFolder(server: RememberedServer, folder: string | null): Promise<RememberedServer[] | null>;
}

/** A media folder path as kept: text, not empty, bounded. */
export function readMediaFolder(v: unknown): string | null {
  return typeof v === 'string' && v.trim() && v.length <= MAX_MEDIA_FOLDER && !/[\0\r\n]/.test(v) ? v.trim() : null;
}

const same = (a: RememberedServer, b: RememberedServer) => a.host.toLowerCase() === b.host.toLowerCase() && a.port === b.port;

/** One row of the file as written, every field kept, so a field this Bridge does not know - even
 *  inside a setup - survives a rewrite. */
type Row = RememberedServer & Record<string, unknown>;

/** A row as the page sees it: host, port, and the setup when this Bridge can read it. */
function toServer(row: Row): RememberedServer {
  const studio = readStudio(row.studio);
  const mediaFolder = readMediaFolder(row.mediaFolder);
  return { host: row.host, port: row.port, ...(studio ? { studio } : {}), ...(mediaFolder ? { mediaFolder } : {}) };
}

/** The list kept in a file: `caspar-servers.json` beside the token unless a test names another. */
export function fileServerMemory(file = path.join(configDir(), 'caspar-servers.json')): ServerMemory {
  const read = async (): Promise<{ rows: Row[]; top: Record<string, unknown> }> => {
    try {
      const top = JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown> | null;
      const servers = top?.servers;
      const rows = Array.isArray(servers) ? (servers.filter(isRememberedServerAddress) as Row[]).slice(0, MAX_SERVERS) : [];
      return { rows, top: top && typeof top === 'object' && !Array.isArray(top) ? top : {} };
    } catch {
      return { rows: [], top: {} };
    }
  };
  const write = async (top: Record<string, unknown>, rows: Row[]) => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify({ ...top, servers: rows }, null, 2)}\n`, 'utf8');
    return rows.map(toServer);
  };
  // One write at a time: each is a read-modify-write of the whole file, so two Connects at once
  // (two tabs) would otherwise both read the old list and the second would drop the first server.
  let writing: Promise<unknown> = Promise.resolve();
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const done = writing.then(work);
    writing = done.catch(() => undefined);
    return done;
  };
  return {
    list: async () => (await read()).rows.map(toServer),
    remember(server) {
      return serial(async () => {
        const { rows, top } = await read();
        const known = rows.find((r) => same(r, server));
        // The address as typed this time, the setup and any other field as they were.
        const first: Row = { ...known, host: server.host, port: server.port };
        return write(top, [first, ...rows.filter((r) => r !== known)].slice(0, MAX_SERVERS));
      });
    },
    setStudio(server, studio) {
      return serial(async () => {
        const { rows, top } = await read();
        const known = rows.find((r) => same(r, server));
        if (!known) return null;
        return write(top, rows.map((r) => (r === known ? { ...r, studio } : r)));
      });
    },
    setMediaFolder(server, folder) {
      return serial(async () => {
        const { rows, top } = await read();
        const known = rows.find((r) => same(r, server));
        if (!known) return null;
        const keep = (r: Row): Row => {
          const { mediaFolder: _gone, ...rest } = r;
          return (folder ? { ...rest, mediaFolder: folder } : rest) as Row;
        };
        return write(top, rows.map((r) => (r === known ? keep(r) : r)));
      });
    },
  };
}
