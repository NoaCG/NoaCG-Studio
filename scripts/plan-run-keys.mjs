#!/usr/bin/env node
// The plan-run preflight's key check: one harmless authenticated read per key, from the session
// that will use them. A key that is set can still be revoked, and a Sheet can be unshared, so
// each key does a read that works only when it is valid. Prints one line per key, pass or fail
// with an HTTP status or a count, never a value; exits 0 when every key passes, 1 otherwise.
//
//   node scripts/plan-run-keys.mjs
//
// SUPABASE_ACCESS_TOKEN lists the account's projects. YOUTUBE_API_KEY reads one public video's
// id (one quota unit). NOACG_TEST_SHEET_IDS names six distinct Sheets; GOOGLE_SERVICE_ACCOUNT_JSON
// signs in with read-only scopes and, for each, reads it and asks the Drive API whether it may edit it.
import { createSign } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SHEETS = 6;
const VIDEO = 'jNQXAC9IVRw'; // public since 2005
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.metadata.readonly';
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const json = async (response) => { try { const body = await response.json(); return body && typeof body === 'object' ? body : {}; } catch { return {}; } };

/** One { key, pass, note } per key. A note is an HTTP status or a count, never a value. */
export async function checkKeys(env = process.env, fetchImpl = fetch) {
  // Keys travel in headers, never in a URL, and a thrown error is reduced to "network" all the same.
  const call = async (url, init) => { try { return await fetchImpl(url, init); } catch { return { status: 'network' }; } };
  const results = [];
  const add = (key, pass, note) => results.push({ key, pass, note: String(note) });
  const read = async (key, url, init) => {
    if (!env[key]) return add(key, false, 'unset');
    const { status } = await call(url, init);
    add(key, status === 200, status);
  };

  await read('SUPABASE_ACCESS_TOKEN', 'https://api.supabase.com/v1/projects',
    { headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` } });
  await read('YOUTUBE_API_KEY', `https://www.googleapis.com/youtube/v3/videos?part=id&id=${VIDEO}`,
    { headers: { 'x-goog-api-key': env.YOUTUBE_API_KEY } });
  const ids = [...new Set((env.NOACG_TEST_SHEET_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean))];
  add('NOACG_TEST_SHEET_IDS', ids.length === SHEETS, `${ids.length} distinct IDs`);
  add('GOOGLE_SERVICE_ACCOUNT_JSON', ...await serviceAccount(env.GOOGLE_SERVICE_ACCOUNT_JSON, ids, call));
  return results;
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
  const token = signIn.status === 200 ? (await json(signIn)).access_token : null;
  if (!token) return [false, `sign-in ${signIn.status}`];
  const headers = { Authorization: `Bearer ${token}` };
  const sheets = await Promise.all(ids.map(encodeURIComponent).map(async (id) => {
    const sheet = await call(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=spreadsheetId`, { headers });
    const file = await call(`https://www.googleapis.com/drive/v3/files/${id}?fields=capabilities(canEdit)&supportsAllDrives=true`, { headers });
    return { readable: sheet.status === 200, editable: file.status === 200 && (await json(file)).capabilities?.canEdit === true };
  }));
  const readable = sheets.filter((sheet) => sheet.readable).length, editable = sheets.filter((sheet) => sheet.editable).length;
  return [readable === ids.length && editable === ids.length, `read ${readable}/${ids.length}, editable ${editable}/${ids.length}`];
}

export async function main(env = process.env, fetchImpl = fetch, write = (line) => process.stdout.write(`${line}\n`)) {
  const results = await checkKeys(env, fetchImpl);
  for (const { key, pass, note } of results) write(`${key}: ${pass ? 'pass' : 'fail'} (${note})`);
  return results.every(({ pass }) => pass) ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
