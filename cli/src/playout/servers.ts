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
import { MAX_CHANNEL_NAME, MAX_STUDIO_CHANNELS, type RememberedServer, type StudioSetup } from './protocol.js';

/** Enough for every server one studio laptop meets; the oldest falls off. */
export const MAX_SERVERS = 8;

export interface ServerMemory {
  list(): Promise<RememberedServer[]>;
  /** Put this server first, keeping its setup, and return the new list. */
  remember(server: RememberedServer): Promise<RememberedServer[]>;
  /** Replace the setup of a server in the list and return the new list, or null when the list does
   *  not hold that server. Its place in the list stays. */
  setStudio(server: RememberedServer, studio: StudioSetup): Promise<RememberedServer[] | null>;
}

function isServer(v: unknown): v is RememberedServer {
  if (!v || typeof v !== 'object') return false;
  const { host, port } = v as Record<string, unknown>;
  return (
    typeof host === 'string' &&
    host.length > 0 &&
    host.length <= 253 &&
    !/\s/.test(host) &&
    typeof port === 'number' &&
    Number.isInteger(port) &&
    port > 0 &&
    port < 65536
  );
}

const wholeIn = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/**
 * A studio setup, or null when it is not one. Read the same way from the page and from the file, so
 * what the Bridge hands a page is always whole. What it MEANS (a duplicate row, New media on a channel
 * no row names) is the page's to judge; this only keeps the shape and the sizes bounded.
 */
export function readStudio(v: unknown): StudioSetup | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const { channels, output, newMedia } = v as Record<string, unknown>;
  if (!Array.isArray(channels) || channels.length === 0 || channels.length > MAX_STUDIO_CHANNELS) return null;
  const rows: StudioSetup['channels'] = [];
  for (const row of channels) {
    const { channel, name } = (row ?? {}) as Record<string, unknown>;
    if (!wholeIn(channel, 1, 999) || typeof name !== 'string' || name.length > MAX_CHANNEL_NAME) return null;
    rows.push({ channel, name });
  }
  const { channel, layer } = (output ?? {}) as Record<string, unknown>;
  if (!wholeIn(channel, 1, 999) || !wholeIn(layer, 0, 9999) || !wholeIn(newMedia, 1, 999)) return null;
  return { channels: rows, output: { channel, layer }, newMedia };
}

const same = (a: RememberedServer, b: RememberedServer) => a.host.toLowerCase() === b.host.toLowerCase() && a.port === b.port;

/** One row of the file: the server as the page sees it, and the row as written, kept for rewriting. */
interface Row {
  server: RememberedServer;
  raw: Record<string, unknown>;
}

/** The list kept in a file: `caspar-servers.json` beside the token unless a test names another. */
export function fileServerMemory(file = path.join(configDir(), 'caspar-servers.json')): ServerMemory {
  const read = async (): Promise<{ rows: Row[]; top: Record<string, unknown> }> => {
    try {
      const top = JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown> | null;
      const servers = top?.servers;
      const rows = Array.isArray(servers)
        ? servers.filter(isServer).map((raw): Row => {
            const studio = readStudio((raw as { studio?: unknown }).studio);
            return { server: { host: raw.host, port: raw.port, ...(studio ? { studio } : {}) }, raw: raw as unknown as Record<string, unknown> };
          })
        : [];
      return { rows: rows.slice(0, MAX_SERVERS), top: top && typeof top === 'object' && !Array.isArray(top) ? top : {} };
    } catch {
      return { rows: [], top: {} };
    }
  };
  const write = async (top: Record<string, unknown>, rows: Row[]) => {
    // Each row is written over what was read for it, setup included unless `setStudio` replaced it,
    // so a field this Bridge does not know, even inside a setup, survives.
    const servers = rows.map(({ server, raw }) => ({ ...raw, host: server.host, port: server.port }));
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify({ ...top, servers }, null, 2)}\n`, 'utf8');
    return rows.map((r) => r.server);
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
    list: async () => (await read()).rows.map((r) => r.server),
    remember(server) {
      return serial(async () => {
        const { rows, top } = await read();
        const known = rows.find((r) => same(r.server, server));
        // The address as typed this time, the setup and any other field as they were.
        const first: Row = known
          ? { raw: known.raw, server: { ...known.server, host: server.host, port: server.port } }
          : { raw: {}, server: { host: server.host, port: server.port } };
        return write(top, [first, ...rows.filter((r) => r !== known)].slice(0, MAX_SERVERS));
      });
    },
    setStudio(server, studio) {
      return serial(async () => {
        const { rows, top } = await read();
        const known = rows.find((r) => same(r.server, server));
        if (!known) return null;
        known.server = { ...known.server, studio };
        known.raw = { ...known.raw, studio };
        return write(top, rows);
      });
    },
  };
}
