import type { AssetFile, Resolution } from '../model/types';
import { fileToDataUrl, isAudioAsset, isFontAsset, isImageAsset, isVideoAsset, looksLikeLottie, MAX_VIDEO_ASSET_BYTES, uniqueAssetPath } from './assetUtils';
import { readSound } from './graphicSound';
import { describeImageImport, importImageFile } from './imageImport';

export const ASSET_ACCEPT = '.wav,.mp3,.ogg,.m4a,.png,.jpg,.jpeg,.gif,.webp,.svg,.avif,.woff,.woff2,.ttf,.otf,.json,.webm,.mp4';
export const IMAGE_ACCEPT = '.png,.jpg,.jpeg,.gif,.webp,.svg,.avif';

/** Read the entire chooser/drop batch before its caller commits anything. */
export async function readAssetFiles(files: readonly File[], resolution: Resolution, imagesOnly = false): Promise<{ assets: AssetFile[]; note: string }> {
  if (!files.length || files.length > 100) throw new Error('Choose between 1 and 100 files.');
  const assets: AssetFile[] = [], notes: string[] = [];
  for (const file of files) {
    if (imagesOnly && !isImageAsset(file.name)) throw new Error(`${file.name}: choose an image. SVG imports here as an image; editable artwork uses Import graphic.`);
    if (!isAudioAsset(file.name) && !isImageAsset(file.name) && !isFontAsset(file.name) && !isVideoAsset(file.name) && !/\.json$/i.test(file.name)) throw new Error(`${file.name}: unsupported asset format.`);
    if (isVideoAsset(file.name) && file.size > MAX_VIDEO_ASSET_BYTES) throw new Error(`${file.name}: video assets must be at most 3 MB.`);
    if (/\.json$/i.test(file.name) && !looksLikeLottie(await file.text())) throw new Error(`${file.name}: not a Lottie animation.`);
    const imported = isAudioAsset(file.name) ? { data: (await readSound(file)).data, note: null } : isImageAsset(file.name) ? await importImageFile(file, Math.max(resolution.width, resolution.height)) : { data: await fileToDataUrl(file), note: null };
    if (isImageAsset(file.name)) await imageSize(imported.data);
    if (isFontAsset(file.name)) {
      // Decode without installing the font. Import is a resource operation, not a type change.
      const face = new FontFace('NoaCG import check', `url(${imported.data})`);
      try { await face.load(); } catch { throw new Error(`${file.name}: the font could not be decoded.`); }
    }
    assets.push({ path: uniqueAssetPath(file.name, assets), data: imported.data });
    if (imported.note) notes.push(`${file.name}: ${describeImageImport(imported.note)}`);
  }
  return { assets, note: notes.length ? `Resized to fit the frame: ${notes.join('; ')}` : '' };
}

/** Decode before placement/replacement; broken image bytes never create an empty layer. */
export async function imageSize(data: string | Blob): Promise<{ width: number; height: number }> {
  const url = typeof data === 'string' ? data : URL.createObjectURL(data);
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('Empty image.');
    return { width: image.naturalWidth, height: image.naturalHeight };
  } catch { throw new Error('The image could not be decoded. Choose a valid image file.'); }
  finally { if (typeof data !== 'string') URL.revokeObjectURL(url); }
}
