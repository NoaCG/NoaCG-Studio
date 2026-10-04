// Output-capability sound preparation is separate from operator/data ingress.
import { outputAudioHandler } from '../_lib/outputAudio.js';
export default { fetch: outputAudioHandler };
