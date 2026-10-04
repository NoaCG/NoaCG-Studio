import type { AssetFile } from '../model/types';
import { fileToDataUrl, isAudioAsset, uniqueAssetPath } from './assetUtils';

export const SOUND_ACCEPT = '.wav,.mp3,.ogg,.m4a';
export const MAX_SOUND_BYTES = 3 * 1024 * 1024;

/** Decode before saving; loading never starts playback. */
export async function readSound(file: File): Promise<AssetFile> {
  if (!isAudioAsset(file.name)) throw new Error('Choose a WAV, MP3, OGG or M4A sound.');
  if (file.size > MAX_SOUND_BYTES) throw new Error('Sound files must be at most 3 MB.');
  const context = new AudioContext();
  try { await context.decodeAudioData(await file.arrayBuffer()); }
  catch { throw new Error('This browser could not decode the sound. Try a WAV file.'); }
  finally { await context.close(); }
  return { path: uniqueAssetPath(file.name, []), data: await fileToDataUrl(file) };
}

/** Started only by an audition gesture. Stop also cancels an in-flight decode. */
export function auditionSound(asset: AssetFile, levelDb: number, loop: boolean): { ready: Promise<void>; finished: Promise<void>; stop: () => void } {
  const context = new AudioContext();
  let stopped = false, source: AudioBufferSourceNode | null = null, gain: GainNode | null = null;
  let finish = () => {};
  const finished = new Promise<void>(resolve => { finish = resolve; });
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (source) { source.onended = null; try { source.stop(); } catch { /* already ended */ } source.disconnect(); }
    gain?.disconnect(); void context.close().catch(() => {});
    finish();
  };
  const resumed = context.resume();
  void resumed.catch(() => {});
  const ready = (async () => {
    try {
      const bytes = typeof asset.data === 'string' ? await (await fetch(asset.data)).arrayBuffer() : await asset.data.arrayBuffer();
      const buffer = await context.decodeAudioData(bytes);
      await resumed;
      if (stopped) return;
      source = context.createBufferSource(); gain = context.createGain();
      source.buffer = buffer; source.loop = loop; gain.gain.value = Math.pow(10, levelDb / 20);
      source.connect(gain); gain.connect(context.destination); source.onended = stop; source.start();
    } catch (error) { const cancelled = stopped; stop(); if (!cancelled) throw error; }
  })();
  return { ready, finished, stop };
}
