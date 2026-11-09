// The phone page's logo, published (interaction spec, "Joining" ▸ Logo; migration 0112).
//
// The look keeps its logo as a data URL in the synced record. Phones get a URL instead: the file
// goes once to the public `join-logos` bucket at `<user>/<production>/<sha-256 of the source>.<ext>`,
// so a new logo is a new path (a phone's next read shows it) and the same logo is never uploaded
// twice. An SVG is drawn to PNG first: the bucket serves raster images only, so nothing it serves
// can run a script.

import { getSupabase } from '../backend/supabase';
import { lookLogoDataUrl, joinPageBrand } from '../audience/audienceBrand';
import type { AudienceBrand } from '../audience/audienceTypes';
import type { ProjectBrand } from '../model/brand';

const BUCKET = 'join-logos';
const RASTER: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
/** The longest side an SVG logo is drawn at: twice the page's 56px logo height, with room. */
const DRAWN_SIDE = 512;

/** Uploads this tab already made or found, by path, so a re-push costs no request. */
const published = new Map<string, Promise<string | null>>();

function bytesOf(dataUrl: string): { mime: string; bytes: Uint8Array } | null {
  const match = /^data:([^;,]+);base64,(.*)$/.exec(dataUrl);
  if (!match) return null;
  try {
    const raw = atob(match[2]);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return { mime: match[1].toLowerCase(), bytes };
  } catch {
    return null;
  }
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Draw an image (an SVG) to a PNG no larger than DRAWN_SIDE on its longest side. */
async function drawnPng(dataUrl: string): Promise<Blob | null> {
  const img = new Image();
  img.src = dataUrl;
  try {
    await img.decode();
  } catch {
    return null;
  }
  const w = img.naturalWidth || DRAWN_SIDE;
  const h = img.naturalHeight || DRAWN_SIDE;
  const scale = DRAWN_SIDE / Math.max(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}

/**
 * The public URL of the look's logo, uploading it when this path is new; null when the look has
 * no logo. Throws when a logo exists but could not be published (signed out, refused, offline), so
 * the caller can keep the logo phones already have rather than clear it.
 */
export async function publishJoinLogo(showId: string, look: ProjectBrand | undefined): Promise<string | null> {
  const dataUrl = await lookLogoDataUrl(look);
  const source = dataUrl ? bytesOf(dataUrl) : null;
  if (!dataUrl || !source) return null;
  const sb = await getSupabase();
  if (!sb) throw new Error('This build has no cloud backend.');
  const { data: auth } = await sb.auth.getSession();
  const user = auth.session?.user.id;
  if (!user) throw new Error('Sign in to publish the logo.');
  const hash = await sha256(source.bytes);
  const ext = RASTER[source.mime] ?? 'png';
  const path = `${user}/${showId}/${hash}.${ext}`;
  const known = published.get(path);
  if (known) return known;
  const run = (async () => {
    const body = RASTER[source.mime] ? new Blob([source.bytes as BlobPart], { type: source.mime }) : await drawnPng(dataUrl);
    if (!body) return null;
    const { error } = await sb.storage.from(BUCKET).upload(path, body, {
      contentType: RASTER[source.mime] ? source.mime : 'image/png',
      cacheControl: '31536000',
      upsert: false,
    });
    // Already there is success: the path is the file's hash, so it is this file.
    if (error && !/exist|duplicate|409/i.test(`${(error as { statusCode?: string }).statusCode ?? ''} ${error.message}`)) return null;
    return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  })();
  published.set(path, run);
  const url = await run;
  if (url) return url;
  published.delete(path);
  throw new Error('The logo could not be published.');
}

/**
 * Everything a published production's phone page shows, with the logo published. When the logo
 * cannot be published now, `previous` (what phones have) is kept: a failed upload never removes a
 * logo, and a removed logo (the look has none) always does.
 */
export async function publishedJoinBrand(
  show: { id: string; look?: ProjectBrand; joinPage?: { title?: string; waiting?: string } },
  previous: unknown = null,
): Promise<AudienceBrand> {
  let logo: string | null;
  try {
    logo = await publishJoinLogo(show.id, show.look);
  } catch {
    logo = typeof previous === 'string' ? previous : null;
  }
  return joinPageBrand(show, logo);
}
