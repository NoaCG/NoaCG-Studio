// The phone page's logo, published (interaction spec, "Joining" ▸ Logo; migration 0112).
//
// The look keeps its logo as a data URL in the synced record. Phones get a URL instead: the file
// goes once to the public `join-logos` bucket at `<user>/<production>/<sha-256 of the source>.<ext>`,
// so a new logo is a new path (a phone's next read shows it) and the same logo is never uploaded
// twice. An SVG is drawn to PNG first: the bucket serves raster images only, so nothing it serves
// can run a script.

import { getSupabase } from '../backend/supabase';
import { joinPageBrand } from '../audience/audienceBrand';
import type { AudienceBrand } from '../audience/audienceTypes';
import type { ProjectBrand } from '../model/brand';
import { assetBytes, sha256 } from '../model/foreignPackage';
import { parseDataUrl } from '../assets/assetUtils';

const BUCKET = 'join-logos';
const RASTER: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
/** The longest side an SVG logo is drawn at: twice the page's 56px logo height, with room. */
const DRAWN_SIDE = 512;

/** Uploads this tab already made or found, by path, so a re-push costs no request. */
const published = new Map<string, Promise<string | null>>();

/** Draw an image (an SVG) to a PNG no larger than DRAWN_SIDE on its longest side. */
async function drawnPng(source: Blob): Promise<Blob | null> {
  const url = URL.createObjectURL(source);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
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
 * no logo. `known` is the logo URL phones have: when it is this file, it is returned as it is.
 * Throws when a logo exists but could not be published (signed out, refused, offline), so
 * the caller can keep the logo phones already have rather than clear it.
 */
export async function publishJoinLogo(showId: string, look: ProjectBrand | undefined, known: string | null = null): Promise<string | null> {
  const asset = look?.logo;
  if (!asset?.data) return null;
  const mime = (typeof asset.data === 'string' ? parseDataUrl(asset.data)?.mime : asset.data.type)?.toLowerCase() ?? '';
  if (!mime.startsWith('image/')) return null;
  const [sb, bytes] = await Promise.all([getSupabase(), assetBytes(asset)]);
  if (!bytes) return null;
  if (!sb) throw new Error('This build has no cloud backend.');
  const [{ data: auth }, hash] = await Promise.all([sb.auth.getSession(), sha256(bytes)]);
  // Phones already have this very file: its path names the production and the file's hash.
  if (known && known.endsWith(`/${showId}/${hash}.${RASTER[mime] ?? 'png'}`)) return known;
  const user = auth.session?.user.id;
  if (!user) throw new Error('Sign in to publish the logo.');
  const raster = mime in RASTER;
  const path = `${user}/${showId}/${hash}.${RASTER[mime] ?? 'png'}`;
  const pending = published.get(path);
  if (pending) return pending;
  const run = (async () => {
    const source = new Blob([bytes as BlobPart], { type: mime });
    const body = raster ? source : await drawnPng(source);
    if (!body) return null;
    const { error } = await sb.storage.from(BUCKET).upload(path, body, {
      contentType: raster ? mime : 'image/png',
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
    logo = await publishJoinLogo(show.id, show.look, typeof previous === 'string' ? previous : null);
  } catch {
    logo = typeof previous === 'string' ? previous : null;
  }
  return joinPageBrand(show, logo);
}
