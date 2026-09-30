// The CasparCG servers this Bridge CONNECTED to (docs/BRIDGE.md §3, owner decision 2026-09-30): the
// one thing it keeps besides its token, so a browser that pairs, even one that forgets all of its
// own storage every session, never has the server's address typed again.
//
// Host and port only, most recent first, at most MAX_SERVERS. Written by a Connect and by nothing
// else - not by a test, the page's status poll or any command - and nothing here ever contacts a
// server. A file that cannot be read or parsed reads as an empty list: forgetting the servers is a
// nuisance, a Bridge that will not start is an outage.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { configDir } from '../config.js';
import type { RememberedServer } from './protocol.js';

/** Enough for every server one studio laptop meets; the oldest falls off. */
export const MAX_SERVERS = 8;

export interface ServerMemory {
  list(): Promise<RememberedServer[]>;
  /** Put this server first and return the new list. */
  remember(server: RememberedServer): Promise<RememberedServer[]>;
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

const same = (a: RememberedServer, b: RememberedServer) => a.host.toLowerCase() === b.host.toLowerCase() && a.port === b.port;

/** The list kept in a file: `caspar-servers.json` beside the token unless a test names another. */
export function fileServerMemory(file = path.join(configDir(), 'caspar-servers.json')): ServerMemory {
  const list = async (): Promise<RememberedServer[]> => {
    try {
      const rows = (JSON.parse(await fs.readFile(file, 'utf8')) as { servers?: unknown } | null)?.servers;
      return Array.isArray(rows)
        ? rows.filter(isServer).map(({ host, port }) => ({ host, port })).slice(0, MAX_SERVERS)
        : [];
    } catch {
      return [];
    }
  };
  return {
    list,
    async remember(server) {
      const next = [server, ...(await list()).filter((s) => !same(s, server))].slice(0, MAX_SERVERS);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, `${JSON.stringify({ servers: next }, null, 2)}\n`, 'utf8');
      return next;
    },
  };
}
