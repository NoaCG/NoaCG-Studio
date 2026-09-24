import { bearerToken, json, methodGuard } from '../http.js';
import { serverAuthConfigured, verifyUser } from '../auth.js';
import { canStoreUserAiKeys, managedAiKey, readUserAiKeys } from '../aiCredentials.js';
import { AI_PROVIDER_IDS } from '../../../src/ai/modelTypes.js';

export default {
  async fetch(req: Request): Promise<Response> {
    const guard = methodGuard(req, 'GET');
    if (guard) return guard;

    const token = bearerToken(req);
    const user = token ? await verifyUser(token) : null;
    // Only the caller's own keys: null when signed out, nothing at all for a session that failed
    // to verify (see aiCredentials.ts, "WHOSE KEYS THESE ARE").
    const userKeys = readUserAiKeys(req, token ? user?.userId : null);
    const requiresSignIn = serverAuthConfigured();
    const signedIn = !requiresSignIn || Boolean(user);
    return json({
      keyStorageAvailable: canStoreUserAiKeys(),
      providers: AI_PROVIDER_IDS.map((provider) => ({
        id: provider,
        userKey: Boolean(userKeys[provider]),
        managedKey: Boolean(managedAiKey(provider)),
        available: Boolean(userKeys[provider] || (managedAiKey(provider) && signedIn)),
        requiresSignIn: Boolean(!userKeys[provider] && managedAiKey(provider) && requiresSignIn && !signedIn),
      })),
    });
  },
};
