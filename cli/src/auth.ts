// The scoped agent key on THIS machine: where it is kept, how it is found, and the calls that
// mint, describe and end it (docs/AGENT_SAVE.md). The key is the ONLY credential the CLI ever
// holds - never the user's session - and it can do one thing: put graphics in the library.
//
// WHERE. `<configDir>/credentials.json`, keyed by deployment origin, so one machine can hold a
// key for noacg.studio and another for a self-host. POSIX: the directory is 0700 and the file
// 0600. Windows has no mode bits; the directory's ACL is reset to the current user only
// (`icacls … /inheritance:r /grant:r <user>:(OI)(CI)F`), best effort - the default %APPDATA%
// is already per-user, so the reset narrows an unusual setup rather than creating safety from
// nothing. A keychain would be better and is a native dependency; stated, not hidden.
//
// PRECEDENCE. `NOACG_AGENT_KEY` (CI, containers) beats the file; a `--key` given to `noacg login`
// is the paste fallback for a machine with no browser, and is stored like a minted one.
//
// The secret never reaches stdout except at the moment `login --show` asks for it; `whoami`
// prints the prefix the Settings list shows, so a terminal log never carries the key.

import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { cliVersion, configDir, noacgUrl } from './config.js';

const execFileAsync = promisify(execFile);

export const AGENT_KEY_PREFIX = 'noacg_ak_';

export interface StoredKey {
  key: string;
  /** The display prefix the server reported ("noacg_ak_3f1c9a…"). */
  prefix: string;
  name: string;
  createdAt: string;
  /** The key row id (for `whoami` and self-revocation). */
  id?: string;
}

interface CredentialsFile {
  version: 1;
  deployments: Record<string, StoredKey>;
}

export function credentialsPath(): string {
  return path.join(configDir(), 'credentials.json');
}

async function readFile(): Promise<CredentialsFile> {
  try {
    const raw = JSON.parse(await fs.readFile(credentialsPath(), 'utf8')) as Partial<CredentialsFile>;
    if (raw && raw.version === 1 && raw.deployments && typeof raw.deployments === 'object') return raw as CredentialsFile;
  } catch {
    /* absent or unreadable = no keys */
  }
  return { version: 1, deployments: {} };
}

/** Narrow the config directory to the current user, once, best effort. */
async function protectDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  if (process.platform === 'win32') {
    const user = process.env.USERNAME || os.userInfo().username;
    try {
      await execFileAsync('icacls', [dir, '/inheritance:r', '/grant:r', `${user}:(OI)(CI)F`], { windowsHide: true });
    } catch {
      /* best effort - the default %APPDATA% is already per-user */
    }
  } else {
    await fs.chmod(dir, 0o700).catch(() => undefined);
  }
}

async function writeFile(file: CredentialsFile): Promise<void> {
  const target = credentialsPath();
  await protectDir(path.dirname(target));
  const tmp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(tmp, target);
  if (process.platform !== 'win32') await fs.chmod(target, 0o600).catch(() => undefined);
}

/** Remember a key for a deployment. */
export async function storeKey(origin: string, stored: StoredKey): Promise<void> {
  const file = await readFile();
  file.deployments[origin] = stored;
  await writeFile(file);
}

/** Forget a deployment's key. Returns whether one was there. */
export async function forgetKey(origin: string): Promise<boolean> {
  const file = await readFile();
  if (!(origin in file.deployments)) return false;
  delete file.deployments[origin];
  await writeFile(file);
  return true;
}

export interface ResolvedKey {
  key: string;
  source: 'env' | 'file';
  stored?: StoredKey;
}

/** The key to use for `origin` (the configured deployment by default), by precedence. */
export async function resolveKey(origin = noacgUrl()): Promise<ResolvedKey | null> {
  const env = process.env.NOACG_AGENT_KEY?.trim();
  if (env) return { key: env, source: 'env' };
  const file = await readFile();
  const stored = file.deployments[origin];
  return stored ? { key: stored.key, source: 'file', stored } : null;
}

export function isAgentKey(value: string): boolean {
  return value.startsWith(AGENT_KEY_PREFIX) && value.length > AGENT_KEY_PREFIX.length + 16;
}

export function displayPrefix(key: string): string {
  return `${key.slice(0, AGENT_KEY_PREFIX.length + 6)}…`;
}

// ── PKCE ──────────────────────────────────────────────────────────────────────────────────

export function newVerifier(): string {
  return randomBytes(32).toString('base64url');
}

/** The challenge the consent page receives: hex sha256 of the verifier (what the server checks). */
export function challengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('hex');
}

export function newState(): string {
  return randomBytes(16).toString('base64url');
}

// ── the calls ─────────────────────────────────────────────────────────────────────────────

export interface ApiFailure {
  status: number;
  code: string;
  message: string;
}

export class ApiError extends Error {
  constructor(readonly failure: ApiFailure) {
    super(failure.message);
  }
}

async function failureOf(response: Response): Promise<ApiFailure> {
  let code = 'error';
  let message = `HTTP ${response.status}`;
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    if (body.error?.code) code = body.error.code;
    if (body.error?.message) message = body.error.message;
  } catch {
    /* not JSON */
  }
  return { status: response.status, code, message };
}

/** Redeem a one-time code for a key (the second half of `noacg login`). */
export async function redeemCode(origin: string, code: string, verifier: string): Promise<StoredKey> {
  const response = await fetch(`${origin}/api/me/agent-keys`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'redeem', code, verifier }),
  });
  if (!response.ok) throw new ApiError(await failureOf(response));
  const body = (await response.json()) as { key: string; id: string; name: string; prefix: string; createdAt: string };
  if (!body.key || !isAgentKey(body.key)) throw new Error('The server returned no usable key.');
  return { key: body.key, id: body.id, name: body.name, prefix: body.prefix, createdAt: body.createdAt };
}

export interface KeyInfo {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

/** Ask the deployment what this key is (`noacg whoami`). Null = the key is not valid there. */
export async function describeKey(origin: string, key: string): Promise<KeyInfo | null> {
  const response = await fetch(`${origin}/api/me/agent-keys`, { headers: { authorization: `Bearer ${key}` } });
  if (response.status === 401) return null;
  if (!response.ok) throw new ApiError(await failureOf(response));
  const body = (await response.json()) as { key?: KeyInfo };
  return body.key ?? null;
}

/** Revoke this key on the server (`noacg logout`). True when it was live. */
export async function revokeSelf(origin: string, key: string): Promise<boolean> {
  const response = await fetch(`${origin}/api/me/agent-keys`, { method: 'DELETE', headers: { authorization: `Bearer ${key}` } });
  if (response.status === 401 || response.status === 404) return false;
  if (!response.ok) throw new ApiError(await failureOf(response));
  return true;
}

export interface SaveResult {
  id: string;
  url: string;
}

/** POST one library record to the save door (`noacg save`). */
export async function saveGraphic(origin: string, key: string, doc: Record<string, unknown>): Promise<SaveResult> {
  const response = await fetch(`${origin}/api/me/graphics`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify(doc),
  });
  if (!response.ok) throw new ApiError(await failureOf(response));
  return (await response.json()) as SaveResult;
}

/** POST a whole graphics package to the package door (`noacg pack --save`). It waits on the
 *  user's Home → Productions until they press Install. */
export async function savePackageToHome(origin: string, key: string, pack: Record<string, unknown>): Promise<SaveResult> {
  const response = await fetch(`${origin}/api/me/packages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, 'x-noacg-cli-version': cliVersion() },
    body: JSON.stringify(pack),
  });
  if (!response.ok) throw new ApiError(await failureOf(response));
  return (await response.json()) as SaveResult;
}

/** The error table of docs/AGENT_SAVE.md, in the CLI's words. */
export function explainFailure(f: ApiFailure): string {
  switch (f.status) {
    case 401:
      return `${f.message} (not logged in, or the key was revoked - run \`noacg login\`).`;
    case 403:
      return `${f.message} (this key or account may not create graphics here).`;
    case 409:
      return `${f.message} (packages already waiting on Home → Productions).`;
    case 413:
      return `${f.message} (keep inline assets small - a logo, not a video).`;
    case 429:
      return `${f.message} (wait a moment and retry).`;
    case 503:
      return `${f.message} (this NoaCG runs offline - zip the package and use the Import door).`;
    default:
      return f.message;
  }
}
