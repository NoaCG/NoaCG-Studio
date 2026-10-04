import type { AssetFile, SoundAssetRef, SpxTemplate } from '../model/types';
import { readAudioBlob, writeAudioBlob } from '../model/durableStore';
import { audioHash } from './audioHash';

export const AUDIO_REF_PREFIX = 'noacg-audio:';
export const MAX_SOUND_BYTES = 20 * 1024 * 1024;
export const MAX_DECODED_SOUND_BYTES = 64 * 1024 * 1024;
export const WARN_DECODED_AUDIO_BYTES = 128 * 1024 * 1024;
export const MAX_DECODED_AUDIO_BYTES = 512 * 1024 * 1024;

/** Blob.arrayBuffer arrived after CasparCG 2.3's Chromium 71. */
export function soundBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve,reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error); reader.readAsArrayBuffer(blob);
  });
}

export function isSoundAssetRef(value: unknown): value is SoundAssetRef {
  const r = value as SoundAssetRef | null;
  return !!r && typeof r.hash === 'string' && /^[a-f0-9]{64}$/.test(r.hash) && typeof r.name === 'string' &&
    /\.(wav|mp3|ogg|m4a)$/i.test(r.name) && typeof r.mime === 'string' &&
    Number.isInteger(r.bytes) && r.bytes > 0 && r.bytes <= MAX_SOUND_BYTES && (r.storageKey === undefined || typeof r.storageKey === 'string');
}

export async function rememberSound(asset: AssetFile): Promise<SoundAssetRef> {
  if (asset.audio) { if (!isSoundAssetRef(asset.audio)) throw new Error('Invalid sound asset.'); return asset.audio; }
  const blob = typeof asset.data === 'string' ? await (await fetch(asset.data)).blob() : asset.data;
  if (!blob.size || blob.size > MAX_SOUND_BYTES) throw new Error('Sound files must be between 1 byte and 20 MiB.');
  const hash = audioHash(new Uint8Array(await soundBytes(blob)));
  await writeAudioBlob(hash, blob);
  return { hash, name: asset.path.split('/').pop()!, bytes: blob.size, mime: blob.type || 'application/octet-stream' };
}

/** Hash verification applies to disk cache hits too. A refusal is never cached as success. */
export async function soundBlob(ref: SoundAssetRef, download?: () => Promise<Blob>): Promise<Blob> {
  if (!isSoundAssetRef(ref)) throw new Error('Invalid sound asset reference.');
  let blob: Blob | null = null;
  try { blob = await readAudioBlob(ref.hash); } catch { /* A receiver can prepare in memory when its disk cache is unavailable. */ }
  if (blob && (blob.size !== ref.bytes || audioHash(new Uint8Array(await soundBytes(blob))) !== ref.hash)) blob = null;
  if (!blob && download) {
    blob = await download();
    if (blob.size !== ref.bytes || audioHash(new Uint8Array(await soundBytes(blob))) !== ref.hash) throw new Error(`Sound changed: ${ref.name}. Prepare again after replacing it.`);
    // Locked-down receivers can still prepare in memory; only authoring requires durable saving.
    try { await writeAudioBlob(ref.hash, blob); } catch { /* receiving-host cache unavailable */ }
  }
  if (!blob) throw new Error(`Sound unavailable: ${ref.name}. Prepare while connected.`);
  return blob;
}

export async function materializeSoundAssets(template: SpxTemplate): Promise<SpxTemplate> {
  return { ...template, assets: await Promise.all(template.assets.map(async asset => asset.audio
    ? { ...asset, data: await soundBlob(asset.audio) } : asset)) };
}
