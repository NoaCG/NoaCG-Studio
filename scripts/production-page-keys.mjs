#!/usr/bin/env node
// The production-page plan run's key check (its spec, section 9 preflight): one harmless
// authenticated read per key, from the session that will use them, finding the keys where the
// scripts that use them do (`ambientEnv`). A key that is set can still be revoked, and a Sheet can
// be unshared, so each key does a read that works only when it is valid. Prints one line per key,
// pass or fail with a status, a count or a reason, never a value; exits 0 when every key passes,
// 1 otherwise.
//
//   node scripts/production-page-keys.mjs
//
// SUPABASE_ACCESS_TOKEN reads the production project itself (the one `VITE_SUPABASE_URL` names),
// so a valid token for another account fails. YOUTUBE_API_KEY reads one public video's
// id (one quota unit). NOACG_TEST_SHEET_IDS names six distinct Sheets; GOOGLE_SERVICE_ACCOUNT_JSON
// signs in with read-only scopes and, for each, reads it and asks the Drive API whether it may edit it.
import { createSign } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ambientEnv } from './read-dotenv.mjs';
import { productionRef } from './supabase-projects.mjs';

export const SHEETS = 6;
const VIDEO = 'jNQXAC9IVRw'; // public since 2005
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.metadata.readonly';
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** One { key, pass, note } per key, in a fixed order. */
export async function checkKeys(env = process.env, fetchImpl = fetch) {
  // Keys travel in headers, never in a URL, and a thrown error (a timeout too) is reduced to "network" all the same.
  const call = async (url, init) => { try { return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(15_000) }); } catch { return { status: 'network' }; } };
  const read = async (key, url, init) => {
    if (!env[key]) return [false, 'unset'];
    const { status } = await call(url, init);
    return [status === 200, status];
  };
  const ids = [...new Set((env.NOACG_TEST_SHEET_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean))];
  const project = productionRef(env);
  const checks = {
    SUPABASE_ACCESS_TOKEN: project || !env.SUPABASE_ACCESS_TOKEN
      ? read('SUPABASE_ACCESS_TOKEN', `https://api.supabase.com/v1/projects/${project}`,
        { headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` } })
      : [false, 'VITE_SUPABASE_URL names no project'],
    YOUTUBE_API_KEY: read('YOUTUBE_API_KEY', `https://www.googleapis.com/youtube/v3/videos?part=id&id=${VIDEO}`,
      { headers: { 'x-goog-api-key': env.YOUTUBE_API_KEY } }),
    NOACG_TEST_SHEET_IDS: [ids.length === SHEETS, `${ids.length} distinct IDs`],
    GOOGLE_SERVICE_ACCOUNT_JSON: serviceAccount(env.GOOGLE_SERVICE_ACCOUNT_JSON, ids, call),
  };
  const answers = await Promise.all(Object.values(checks));
  return Object.keys(checks).map((key, i) => ({ key, pass: answers[i][0], note: String(answers[i][1]) }));
}

async function serviceAccount(text, ids, call) {
  let account = null;
  try { account = JSON.parse(text ?? ''); } catch { /* answered below */ }
  if (!account?.client_email || !account?.private_key) return [false, text ? 'not a service account' : 'unset'];
  if (!ids.length) return [false, 'no Sheet to read'];
  const audience = account.token_uri ?? 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);
  const claim = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: account.client_email, scope: SCOPES, aud: audience, iat: now, exp: now + 300 })}`;
  let signature;
  try { signature = createSign('RSA-SHA256').update(claim).sign(account.private_key, 'base64url'); } catch { return [false, 'private key unreadable']; }
  const signIn = await call(audience, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${claim}.${signature}` }),
  });
  const token = signIn.status === 200 ? (await signIn.json().catch(() => null))?.access_token : null;
  if (!token) return [false, `sign-in ${signIn.status}`];
  const headers = { Authorization: `Bearer ${token}` };
  const sheets = await Promise.all(ids.map(encodeURIComponent).map(async (id) => {
    const [sheet, file] = await Promise.all([
      call(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=spreadsheetId`, { headers }),
      call(`https://www.googleapis.com/drive/v3/files/${id}?fields=capabilities(canEdit)&supportsAllDrives=true`, { headers }),
    ]);
    return { readable: sheet.status === 200, editable: file.status === 200 && (await file.json().catch(() => null))?.capabilities?.canEdit === true };
  }));
  const readable = sheets.filter((sheet) => sheet.readable).length, editable = sheets.filter((sheet) => sheet.editable).length;
  return [readable === ids.length && editable === ids.length, `read ${readable}/${ids.length}, editable ${editable}/${ids.length}`];
}

export async function main(env = process.env, fetchImpl = fetch, write = (line) => process.stdout.write(`${line}\n`)) {
  const results = await checkKeys(env, fetchImpl);
  for (const { key, pass, note } of results) write(`${key}: ${pass ? 'pass' : 'fail'} (${note})`);
  return results.every(({ pass }) => pass) ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(ambientEnv(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')));
}
