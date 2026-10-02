// THE STUDIO SETUP BETWEEN THE BROWSER AND NOACG BRIDGE (docs/work-specs/studio-day-playout AC-11,
// D7, D17, D18). The setup is the server's channels with the studio's names for them, the NoaCG
// output's slot and the New media channel. A Bridge with the `studio` feature keeps one per server it
// connected to, so a second browser or another account opens with it; the browser keeps a copy, which
// is what every playout surface reads, and the only copy with an older Bridge.
//
// Pure, so the rules that decide which copy wins are tested without a browser
// (scripts/studio-setup.test.mjs). control/playoutLink.ts does the reading and writing.

import { MAX_CHANNEL_NAME, MAX_STUDIO_CHANNEL, MAX_STUDIO_LAYER, type RememberedServer, type StudioSetup } from './playoutProtocol.ts';

/** The setup's fields as the browser stores them (`PlayoutSettings`), under their old names. */
export interface StudioFields {
  /** The NoaCG output's channel. */
  channel: number;
  /** The NoaCG output's layer. */
  layer: number;
  channels: { channel: number; name: string }[];
  /** The New media channel. */
  clipChannel: number;
}

/** The name a channel row starts with until the operator renames it: `Channel 2`. */
export function defaultChannelName(channel: number): string {
  return `Channel ${channel}`;
}

/**
 * What a studio has before anybody sets it up (`PLAYOUT_DEFAULTS` is made from it). One channel: a
 * stock casparcg.config has exactly one, so a fresh studio never cues a clip onto a channel the
 * server does not have, and it is named by NUMBER, since NoaCG does not say what a channel is for.
 * Layer 20 is the one this project's CasparCG guide has always used (docs/PLAYOUT_INTEGRATION.md §3).
 */
export const DEFAULT_STUDIO: StudioSetup = {
  channels: [{ channel: 1, name: defaultChannelName(1) }],
  output: { channel: 1, layer: 20 },
  newMedia: 1,
};

const whole = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number.isFinite(n) ? n : min)));

/** The browser's fields as a setup the Bridge accepts: whole numbers in range, names within its
 *  length. The browser's own copy is left as it is. */
export function studioOf(s: StudioFields): StudioSetup {
  return {
    channels: s.channels.map((row) => ({ channel: whole(row.channel, 1, MAX_STUDIO_CHANNEL), name: row.name.slice(0, MAX_CHANNEL_NAME) })),
    output: { channel: whole(s.channel, 1, MAX_STUDIO_CHANNEL), layer: whole(s.layer, 0, MAX_STUDIO_LAYER) },
    newMedia: whole(s.clipChannel, 1, MAX_STUDIO_CHANNEL),
  };
}

/** A setup as the browser stores it. */
export function studioFields(studio: StudioSetup): StudioFields {
  return {
    channel: studio.output.channel,
    layer: studio.output.layer,
    channels: studio.channels.map((row) => ({ channel: row.channel, name: row.name })),
    clipChannel: studio.newMedia,
  };
}

export function sameStudio(a: StudioSetup, b: StudioSetup): boolean {
  return (
    a.output.channel === b.output.channel &&
    a.output.layer === b.output.layer &&
    a.newMedia === b.newMedia &&
    a.channels.length === b.channels.length &&
    a.channels.every((row, i) => row.channel === b.channels[i].channel && row.name === b.channels[i].name)
  );
}

/** One server as a key: a machine name is the same server in any case, another port is another one. */
export function serverKey(server: { host: string; port: number }): string {
  return `${server.host.trim().toLowerCase()}:${server.port}`;
}

export function sameServer(a: { host: string; port: number }, b: { host: string; port: number }): boolean {
  return serverKey(a) === serverKey(b);
}

/** What to do with the setup of the server in use: take the Bridge's, give it the browser's, or
 *  leave both alone. */
export type StudioStep = { kind: 'pull'; studio: StudioSetup } | { kind: 'push' } | { kind: 'none' };

/**
 * THE RULE. `entry` is the Bridge's entry for the server in use (undefined: the Bridge never
 * connected to it, so it keeps nothing for it), `pending` whether the browser holds a change of that
 * server's setup the Bridge has not confirmed.
 *
 *   - A change the Bridge has not confirmed goes to it, rather than being replaced by its older copy.
 *   - Otherwise the Bridge's copy is the setup (D17).
 *   - A server the Bridge keeps no setup for takes the browser's, unless the browser's is the untouched
 *     default, which is nobody's choice and must never overwrite somebody's (D18).
 */
export function studioStep(browser: StudioSetup, entry: RememberedServer | undefined, pending: boolean): StudioStep {
  if (!entry) return { kind: 'none' };
  if (entry.studio && !pending) return sameStudio(entry.studio, browser) ? { kind: 'none' } : { kind: 'pull', studio: entry.studio };
  if (entry.studio && sameStudio(entry.studio, browser)) return { kind: 'none' };
  if (!pending && sameStudio(browser, DEFAULT_STUDIO)) return { kind: 'none' };
  return { kind: 'push' };
}
