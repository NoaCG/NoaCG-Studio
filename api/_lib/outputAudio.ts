import { createClient } from '@supabase/supabase-js';
import { apiError, bearerToken, json, methodGuard, readJson } from './http.js';
import { supabaseSecretKey } from './jobStore.js';
import { checkDataIpRateLimit } from './rateLimit.js';

type Dependencies = {
  manifest: (slug: string, version: string) => Promise<unknown>;
  sign: (key: string) => Promise<string>;
};

/** Capability access is bounded by the pinned manifest and a server-derived upload owner. */
export function createOutputAudioHandler(deps: Dependencies) {
  return async (req: Request): Promise<Response> => {
    const guard = methodGuard(req,'POST'); if (guard) return guard;
    if (checkDataIpRateLimit(req)) return apiError('rate_limited','Too many preparation requests.',429);
    const slug = bearerToken(req); if (!slug) return apiError('unauthorized','Send the output capability.',401);
    let body: { version?: unknown; hash?: unknown };
    try { body = await readJson(req,2048); } catch { return apiError('invalid','Invalid preparation request.',400); }
    if (typeof body?.version !== 'string' || !body.version || body.version.length > 128 || typeof body.hash !== 'string' || !/^[a-f0-9]{64}$/.test(body.hash)) return apiError('invalid','Choose an exact published sound revision.',400);
    try {
      const manifest = await deps.manifest(slug,body.version) as { owner?: string; assets?: { hash?: string; storageKey?: string }[] } | null;
      const asset = manifest?.assets?.find(a=>a.hash === body.hash);
      if (!manifest?.owner || !asset || asset.storageKey !== `${manifest.owner}/audio-${body.hash}`) return apiError('unauthorized','This sound is not authorized by the published version.',403);
      return json({url:await deps.sign(asset.storageKey)});
    } catch { return apiError('unavailable','Sound preparation is temporarily unavailable. Retry Prepare.',503); }
  };
}

const client = () => createClient((process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').trim(),supabaseSecretKey(),{auth:{persistSession:false,autoRefreshToken:false}});
export const outputAudioHandler = createOutputAudioHandler({
  manifest: async(slug,version)=>{
    const {data,error} = await client().rpc('control_output_audio_manifest',{p_output_slug:slug,p_version:version});
    if(error) throw new Error('Manifest unavailable.'); return data;
  },
  sign: async key=>{
    const {data,error} = await client().storage.from('user-assets').createSignedUrl(key,300);
    if(error || !data) throw new Error('Sound unavailable.'); return data.signedUrl;
  },
});
