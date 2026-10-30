// Output-capability preparation is separate from operator/data ingress: a sound's signed URL
// (POST), an imported OGraf package's sealed base (POST ?ograf) and that package's files (GET,
// reached by the /ograf/ rewrite in vercel.json). One function, so the budget stays as it is.
import { outputAudioHandler } from '../_lib/outputAudio.js';
import { outputOgrafHandler } from '../_lib/outputOgraf.js';
export default {
  fetch: (req: Request) => (req.method === 'GET' || new URL(req.url).searchParams.has('ograf') ? outputOgrafHandler(req) : outputAudioHandler(req)),
};
