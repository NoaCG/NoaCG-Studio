// AN IMPORTED OGRAF PACKAGE, SERVED TO ITS OUTPUT (docs/work-specs/playout-ograf-rundown/spec.md,
// E3.2a; docs/OGRAF_ECOSYSTEM.md §3 "What the package's server owes").
//
// A stranger's package runs in an opaque-origin frame whose network policy confines every load to
// the package's base URL (src/control/ografHost.ts). That base must be a real http(s) folder, since
// its modules import each other and resolve `import.meta.url`, and it must carry no capability: the
// frame can navigate itself away with whatever its URL says. So the output asks once, with its own
// capability, for a base (`POST /api/output/assets {kind: 'ograf'}`), and is answered
// `/ograf/<sealed>/`: the production and the package revision sealed with a server-held key, which
// the frame can neither read nor forge. Every file is then `GET /ograf/<sealed>/<path>`, rewritten to
// this handler (vercel.json, scripts/dataDevPlugin.mjs).
//
// What the server owes, in order: answer only the package's own files, from the published payload's
// file list (an exact path match: nothing is decoded into a separator, nothing walks a folder), with
// `Access-Control-Allow-Origin: *` because the frame's origin is opaque and sends no credentials,
// never a redirect (it would relax the policy's path match), never as a document of this origin
// (`Content-Security-Policy: sandbox`, and HTML as text), and `nosniff`.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { apiError, bearerToken, ipHash, json, readJson } from './http.js';
import { supabaseSecretKey } from './jobStore.js';
import { hitRateLimit } from './rateLimit.js';

export interface OgrafDependencies {
  /** The production behind the output capability, when its published `version` holds `revision`. */
  show: (slug: string, version: string, revision: string) => Promise<string | null>;
  /** One file of that package in the production's current payload, as its data URL, or null. */
  file: (show: string, revision: string, path: string) => Promise<string | null>;
  /** The key the sealed bases are made with (32 bytes), or null when this server has none. */
  key: () => Buffer | null;
}

const HEX64 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** The longest path a package file may have (ografForeign.ts refuses names past 240 characters). */
const PATH_MAX = 512;
/** A sealed base: 12 bytes of IV, the 101-byte plaintext, the 16-byte tag. */
const SEALED_MAX = 256;

/** Package fetches per address and minute: a package loads once per output boot, its files read at
 *  most a few hundred times, and a CDN in front answers the repeats. */
export const OGRAF_RATE = { windowMs: 60_000, max: 1200 };

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/** `show\nrevision`, sealed (AES-256-GCM, a fresh IV each time). */
export function sealBase(key: Buffer, show: string, revision: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(`${show}\n${revision}`, 'utf8'), cipher.final()]);
  return b64url(Buffer.concat([iv, body, cipher.getAuthTag()]));
}

/** What a sealed base says, or null for anything this key did not seal. */
export function openBase(key: Buffer, sealed: string): { show: string; revision: string } | null {
  if (!sealed || sealed.length > SEALED_MAX || !/^[A-Za-z0-9_-]+$/.test(sealed)) return null;
  const raw = fromB64url(sealed);
  if (raw.length < 12 + 16 + 1) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(raw.length - 16));
    const text = Buffer.concat([decipher.update(raw.subarray(12, raw.length - 16)), decipher.final()]).toString('utf8');
    const [show, revision, extra] = text.split('\n');
    return extra === undefined && UUID.test(show ?? '') && HEX64.test(revision ?? '') ? { show, revision } : null;
  } catch {
    return null;
  }
}

/** The media type a package file is served as. A page (html, xml) goes out as text: nothing of a
 *  stranger's package may become a document of this origin. */
const TYPES: Record<string, string> = {
  mjs: 'text/javascript; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  css: 'text/css; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  mp4: 'video/mp4',
  webm: 'video/webm',
  txt: 'text/plain; charset=utf-8',
  md: 'text/plain; charset=utf-8',
  html: 'text/plain; charset=utf-8',
  htm: 'text/plain; charset=utf-8',
  xml: 'text/plain; charset=utf-8',
};
export function ografFileType(path: string): string {
  const dot = path.lastIndexOf('.');
  return (dot >= 0 && TYPES[path.slice(dot + 1).toLowerCase()]) || 'application/octet-stream';
}

/** A data URL's bytes, or null for anything else. */
function dataUrlBytes(data: string): Buffer | null {
  const m = /^data:[^,]*?(;base64)?,/.exec(data);
  if (!m) return null;
  const body = data.slice(m[0].length);
  try {
    return m[1] ? Buffer.from(body, 'base64') : Buffer.from(decodeURIComponent(body), 'utf8');
  } catch {
    return null;
  }
}

const FILE_HEADERS = {
  'access-control-allow-origin': '*',
  'cross-origin-resource-policy': 'cross-origin',
  'x-content-type-options': 'nosniff',
  'content-security-policy': "sandbox; default-src 'none'",
  'referrer-policy': 'no-referrer',
};
const missing = () => new Response('Not found', { status: 404, headers: { ...FILE_HEADERS, 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });

export function createOutputOgrafHandler(deps: OgrafDependencies) {
  /** POST: the output capability asks for its package's base. */
  const base = async (req: Request): Promise<Response> => {
    const slug = bearerToken(req);
    if (!slug) return apiError('unauthorized', 'Send the output capability.', 401);
    let body: { version?: unknown; revision?: unknown };
    try {
      body = await readJson(req, 2048);
    } catch {
      return apiError('invalid', 'Invalid package request.', 400);
    }
    if (typeof body?.version !== 'string' || !body.version || body.version.length > 128 || typeof body.revision !== 'string' || !HEX64.test(body.revision)) {
      return apiError('invalid', 'Choose an exact published package revision.', 400);
    }
    const key = deps.key();
    if (!key) return apiError('unavailable', 'Imported OGraf packages are not served by this server.', 503);
    try {
      const show = await deps.show(slug, body.version, body.revision);
      if (!show || !UUID.test(show)) return apiError('unauthorized', 'This package is not in the published version.', 403);
      return json({ base: `/ograf/${sealBase(key, show, body.revision)}/` });
    } catch {
      return apiError('unavailable', 'The package is temporarily unavailable. Reload the output.', 503);
    }
  };

  /** GET: one file, by the sealed base and its exact path inside the package. */
  const file = async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const sealed = url.searchParams.get('ograf') ?? '';
    const path = url.searchParams.get('path') ?? '';
    const key = deps.key();
    if (!key) return missing();
    const opened = openBase(key, sealed);
    if (!opened || !path || path.length > PATH_MAX || path.includes('\0')) return missing();
    let data: string | null;
    try {
      data = await deps.file(opened.show, opened.revision, path);
      // A router that hands the path on as the browser escaped it (a space as %20): read once more.
      if (data === null && path.includes('%')) {
        let read: string | null = null;
        try { read = decodeURIComponent(path); } catch { read = null; }
        if (read && read !== path && !read.includes('\0')) data = await deps.file(opened.show, opened.revision, read);
      }
    } catch {
      return new Response('Unavailable', { status: 503, headers: { ...FILE_HEADERS, 'cache-control': 'no-store' } });
    }
    const bytes = typeof data === 'string' ? dataUrlBytes(data) : null;
    if (!bytes) return missing();
    return new Response(new Uint8Array(bytes), {
      status: 200,
      // The same sealed base names the same bytes for as long as the package is published; a
      // republish that drops it answers 404 again once this hour has passed.
      headers: { ...FILE_HEADERS, 'content-type': ografFileType(path), 'cache-control': 'public, max-age=3600' },
    });
  };

  return async (req: Request): Promise<Response> => {
    if (req.method !== 'GET' && req.method !== 'POST') return apiError('invalid', `${req.method} not allowed`, 405);
    const decision = hitRateLimit(`ograf-ip:${ipHash(req)}`, OGRAF_RATE, Date.now());
    if (!decision.allowed) return apiError('rate_limited', 'Too many package requests.', 429, {}, { 'retry-after': String(decision.retryAfterSec) });
    return req.method === 'POST' ? base(req) : file(req);
  };
}

/** The sealing key: derived from the server's secret, never the secret itself, and never sent. */
function serverKey(): Buffer | null {
  const secret = supabaseSecretKey();
  return secret ? Buffer.from(hkdfSync('sha256', secret, 'noacg', 'ograf-package-base-v1', 32)) : null;
}

const client = () => createClient((process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').trim(), supabaseSecretKey(), { auth: { persistSession: false, autoRefreshToken: false } });
export const outputOgrafHandler = createOutputOgrafHandler({
  show: async (slug, version, revision) => {
    const { data, error } = await client().rpc('control_output_ograf_show', { p_output_slug: slug, p_version: version, p_revision: revision });
    if (error) throw new Error('Package unavailable.');
    return typeof data === 'string' ? data : null;
  },
  file: async (show, revision, path) => {
    const { data, error } = await client().rpc('control_output_ograf_file', { p_show: show, p_revision: revision, p_path: path });
    if (error) throw new Error('Package unavailable.');
    return typeof data === 'string' ? data : null;
  },
  key: serverKey,
});
