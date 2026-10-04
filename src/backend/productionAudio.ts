import { getSupabase } from './supabase';
import { externalizeAssets, dataUrlToBlob, classifyAssetRefusal } from './assets';
import type { SoundAssetRef } from '../model/types';

export async function authoringSoundLoader(asset: SoundAssetRef): Promise<Blob> {
  const sb = await getSupabase();
  if (!sb || !asset.storageKey) throw new Error(`Sound unavailable: ${asset.name}. Reopen while connected or upload it again.`);
  const {data,error} = await sb.storage.from('user-assets').download(asset.storageKey);
  if(error || !data) throw new Error(`Sound unavailable: ${asset.name}. Reopen while connected or upload it again.`);
  return data;
}

/** Publication and cloud sync use the same private bucket and byte identity. */
export async function publishAudio<T extends {graphics:{assets:{audio?:SoundAssetRef}[]}[]}>(body: T): Promise<T> {
  const sb = await getSupabase(); if (!sb) throw new Error('Sign in to publish sounds.');
  const { data,error } = await sb.auth.getUser(); if (error || !data.user) throw new Error('Sign in to publish sounds.');
  const published = await externalizeAssets(body,data.user.id,async(key,dataUrl)=>{
    const blob = dataUrlToBlob(dataUrl);
    const { error } = await sb.storage.from('user-assets').upload(key,blob,{contentType:blob.type,upsert:false});
    if (error && String(error.statusCode) !== '409') throw new Error(classifyAssetRefusal(error)?.reason ?? `Sound upload failed: ${error.message}`);
  },true) as T;
  // Private locations belong to the manifest. Graphic revisions describe playable content.
  for (const graphic of published.graphics) for (const asset of graphic.assets) if (asset.audio) delete asset.audio.storageKey;
  return published;
}

/** Prepare-only download. The output capability and pinned version authorize exact hashes. */
export function publishedSoundLoader(outputSlug: string, version: string) {
  return async (asset: { hash: string }): Promise<Blob> => {
    const abort = new AbortController(), deadline = setTimeout(()=>abort.abort(),14_000);
    try {
      const response = await fetch('/api/output/assets',{method:'POST',signal:abort.signal,headers:{'content-type':'application/json',authorization:`Bearer ${outputSlug}`},body:JSON.stringify({version,hash:asset.hash})});
      if (!response.ok) throw new Error('Sound preparation could not authorize this published version. Retry Prepare.');
      const { url } = await response.json() as { url?: string };
      if (!url) throw new Error('Sound preparation returned no asset.');
      const bytes = await fetch(url,{signal:abort.signal}); if (!bytes.ok) throw new Error('Sound unavailable. Retry Prepare while connected.');
      return await bytes.blob();
    } finally { clearTimeout(deadline); }
  };
}
