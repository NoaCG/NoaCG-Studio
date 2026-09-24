import { json, methodGuard } from '../http.js';
import { hasUserAiKeysCookie, keyOwnerOf, managedAiKey, readUserAiKeys } from '../aiCredentials.js';
import { discoverProviderModels } from '../aiModelDiscovery.js';
import { isAiProviderId } from '../../../src/ai/modelTypes.js';

export default {
  async fetch(req: Request): Promise<Response> {
    const guard = methodGuard(req, 'GET');
    if (guard) return guard;
    const url = new URL(req.url);
    const provider = url.searchParams.get('provider');
    if (!isAiProviderId(provider)) {
      return json({ error: { code: 'invalid_request', message: 'Select a valid AI provider.' } }, 400);
    }
    const output = url.searchParams.get('output') ?? 'text';
    if (output !== 'text' && output !== 'image') {
      return json({ error: { code: 'invalid_request', message: 'Select a valid output modality.' } }, 400);
    }
    try {
      const userKeys = hasUserAiKeysCookie(req) ? readUserAiKeys(req, await keyOwnerOf(req)) : {};
      const userKey = userKeys[provider];
      const key = userKey || managedAiKey(provider) || undefined;
      // WHICH KEY PAYS travels with the rows, because a price nobody can attribute is half an
      // answer: the same model costs the user money on their own key and costs NoaCG money on
      // a managed one.
      return json(await discoverProviderModels(
        provider,
        key,
        output,
        key ? (userKey ? 'user' : 'managed') : undefined,
      ));
    } catch {
      return json({
        provider,
        syncedAt: new Date().toISOString(),
        models: [],
        warning: 'The live model catalog is temporarily unavailable. You can still enter a model id.',
      });
    }
  },
};
