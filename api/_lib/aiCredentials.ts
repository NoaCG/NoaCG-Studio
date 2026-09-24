import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { AI_PROVIDER_IDS, type AiProviderId } from '../../src/ai/modelTypes.js';
import { verifyUser } from './auth.js';
import { bearerToken } from './http.js';

// WHOSE KEYS THESE ARE. The cookie is the browser's, not the account's: it lives for a year and
// rides along with every request to /api/ai whoever is signed in. Sealed without an owner, a key
// one account saved was used - and billed - by the next account to sign in on the same computer.
// So the sealed payload names its OWNER (the account id, or null for a key saved signed out), and
// a key is honoured only for that same caller. A payload from before owners were sealed cannot be
// attributed to anybody, so it reads as no keys at all and the person enters their key again.
const PAYLOAD_VERSION = 2;

/**
 * Who is calling, as far as a sealed key is concerned: null when the request carries no session
 * (a signed-out caller), the account id when it carries one that verifies, and undefined when it
 * carries one that does NOT verify - which matches no owner, so a verification outage never hands
 * a signed-in caller somebody's signed-out keys.
 */
export type KeyOwner = string | null | undefined;

export async function keyOwnerOf(req: Request): Promise<KeyOwner> {
  const token = bearerToken(req);
  if (!token) return null;
  return (await verifyUser(token))?.userId;
}

/** Whether the request carries a sealed-keys cookie at all - lets a caller skip verifying a
 *  session when there are no keys to match it against. */
export function hasUserAiKeysCookie(req: Request): boolean {
  return cookieValue(req) !== '';
}

const COOKIE_NAME = 'noacg_ai_keys';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

type StoredKeys = Partial<Record<AiProviderId, string>>;

function encryptionKey(): Buffer | null {
  const secret = (process.env.AI_KEY_ENCRYPTION_SECRET ?? '').trim();
  if (secret.length < 32) return null;
  return createHash('sha256').update(secret).digest();
}

function cookieValue(req: Request): string {
  const header = req.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === COOKIE_NAME) return value.join('=');
  }
  return '';
}

function validKeys(value: unknown): StoredKeys {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const keys: StoredKeys = {};
  for (const provider of AI_PROVIDER_IDS) {
    const key = source[provider];
    if (typeof key === 'string' && key.length >= 8 && key.length <= 512) keys[provider] = key;
  }
  return keys;
}

export function canStoreUserAiKeys(): boolean {
  return encryptionKey() !== null;
}

/** Decrypt the keys `owner` sealed into the HttpOnly cookie. Invalid or tampered state, an
 *  unversioned payload, and keys sealed by anybody else all read as none - fail closed. */
export function readUserAiKeys(req: Request, owner: KeyOwner): StoredKeys {
  const key = encryptionKey();
  const sealed = cookieValue(req);
  if (!key || !sealed || owner === undefined) return {};
  try {
    const packed = Buffer.from(sealed, 'base64url');
    if (packed.length < 12 + 16 + 2) return {};
    const iv = packed.subarray(0, 12);
    const tag = packed.subarray(12, 28);
    const ciphertext = packed.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    const payload = JSON.parse(plaintext) as { v?: unknown; owner?: unknown; keys?: unknown };
    if (payload?.v !== PAYLOAD_VERSION) return {};
    const sealedOwner = typeof payload.owner === 'string' ? payload.owner : null;
    if (sealedOwner !== owner) return {};
    return validKeys(payload.keys);
  } catch {
    return {};
  }
}

function secureRequest(req: Request): boolean {
  return req.url.startsWith('https:') || req.headers.get('x-forwarded-proto') === 'https';
}

/** Seal `owner`'s keys into one authenticated, browser-unreadable cookie. `owner` is the account
 *  id, or null for a caller who is signed out. */
export function userAiKeysCookie(req: Request, keys: StoredKeys, owner: string | null): string {
  const key = encryptionKey();
  if (!key) throw new Error('AI user-key storage is not configured');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const payload = JSON.stringify({ v: PAYLOAD_VERSION, owner, keys });
  const ciphertext = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const packed = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
  const secure = secureRequest(req) ? '; Secure' : '';
  return `${COOKIE_NAME}=${packed}; Path=/api/ai; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE}${secure}`;
}

export function clearUserAiKeysCookie(req: Request): string {
  const secure = secureRequest(req) ? '; Secure' : '';
  return `${COOKIE_NAME}=; Path=/api/ai; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

/**
 * The MANAGED credential for a provider - server environment only.
 *
 * `vercel` is the one with two sources, and the order is deliberate. A deployment on Vercel
 * is issued a short-lived `VERCEL_OIDC_TOKEN` automatically and rotates it without anyone
 * touching a secret, so OIDC is the intended production credential and the one to prefer
 * where both exist. `AI_GATEWAY_API_KEY` is the static fallback: what a self-host, a CI job
 * or a local `npm run dev` without `vercel env pull` can supply. An explicit key WINS over
 * an ambient token, matching the gateway's own precedence, so naming a key is never
 * silently ignored on a Vercel box.
 */
export function managedAiKey(provider: AiProviderId): string {
  const names: Record<AiProviderId, string> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    google: 'GOOGLE_API_KEY',
    vercel: 'AI_GATEWAY_API_KEY',
    // Hugging Face issues USER ACCESS TOKENS, not API keys - so the variable is named for what
    // the provider actually hands out, and `HF_TOKEN` is the name their own tooling reads.
    huggingface: 'HF_TOKEN',
  };
  const conventionalFallback = provider === 'huggingface'
    // HUGGINGFACE_TOKEN is the spelled-out twin; HUGGINGFACE_API_KEY is the name this repo
    // used before 2026-08-14 and is still read, because a deployment's secret cannot be
    // renamed by a commit here.
    ? process.env.HUGGINGFACE_TOKEN || process.env.HUGGINGFACE_API_KEY
    : provider === 'vercel'
      ? process.env.VERCEL_OIDC_TOKEN
      // Google's own SDKs and the Gemini docs both use GEMINI_API_KEY, so a machine set up
      // for Gemini already carries it under that name.
      : provider === 'google'
        ? process.env.GEMINI_API_KEY
        : '';
  return (process.env[names[provider]] || conventionalFallback || '').trim();
}

export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try {
    const expected = new URL(req.url);
    const forwardedHost = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
    const forwardedProto = req.headers.get('x-forwarded-proto');
    if (forwardedHost) expected.host = forwardedHost;
    if (forwardedProto === 'http:' || forwardedProto === 'https:') expected.protocol = forwardedProto;
    else if (forwardedProto === 'http' || forwardedProto === 'https') expected.protocol = `${forwardedProto}:`;
    return new URL(origin).origin === expected.origin;
  } catch {
    return false;
  }
}
