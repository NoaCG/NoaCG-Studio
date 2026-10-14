// THE SEALED EXAM (docs/work-specs/noacg-harness/spec.md D7, AC-2). `exam/briefs.sealed` is the
// exam briefs encrypted (format noacg-sealed-v1: AES-256-GCM, the key scrypt(passphrase, salt,
// 32, N 16384, r 8, p 1)); `exam/briefs.sha256` is the sha256 of the plaintext. The passphrase
// exists only in the main checkout's gitignored `docs/private/harness-exam/passphrase.txt`, so
// everywhere else (CI included) only the file's shape and the refusal of a wrong passphrase can
// be checked. Nothing here writes or prints the plaintext: H8 opens it in memory.
//
// A Windows checkout hands both committed files back with CRLF, so they are read
// whitespace-tolerant; the hash is of the private plaintext, which is LF.

import { createDecipheriv, createHash, scryptSync } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const SEALED_FORMAT = 'noacg-sealed-v1';

/** The shape of a sealed file, or the first thing wrong with it. */
export function sealedShape(json) {
  if (!json || typeof json !== 'object') return 'not a JSON object';
  if (json.format !== SEALED_FORMAT) return `format is ${json.format}, not ${SEALED_FORMAT}`;
  if (json.cipher !== 'aes-256-gcm' || json.kdf !== 'scrypt') return `cipher ${json.cipher} / kdf ${json.kdf}`;
  if (json.N !== 16384 || json.r !== 8 || json.p !== 1) return `scrypt N ${json.N}, r ${json.r}, p ${json.p}`;
  const bytes = (field, n) => {
    const b = Buffer.from(String(json[field] ?? ''), 'base64');
    return n === undefined ? b.length > 0 : b.length === n;
  };
  if (!bytes('salt', 16)) return 'salt is not 16 bytes';
  if (!bytes('iv', 12)) return 'iv is not 12 bytes';
  if (!bytes('tag', 16)) return 'tag is not 16 bytes';
  if (!bytes('ciphertext')) return 'no ciphertext';
  return null;
}

export function readSealed(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** `<hex>  briefs.json` -> the hex. */
export function readHash(file) {
  return readFileSync(file, 'utf8').trim().split(/\s+/)[0];
}

/** Decrypt in memory. A wrong passphrase fails GCM authentication and throws. */
export function openSealed(json, passphrase) {
  const problem = sealedShape(json);
  if (problem) throw new Error(`not a sealed file: ${problem}`);
  const key = scryptSync(passphrase, Buffer.from(json.salt, 'base64'), 32, { N: json.N, r: json.r, p: json.p });
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(json.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(json.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(json.ciphertext, 'base64')), decipher.final()]);
}

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** The main checkout's private passphrase file, or null where this machine has none. */
export function privatePassphraseFile(repoRoot) {
  let common;
  try {
    common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
  const file = path.join(path.dirname(common), 'docs', 'private', 'harness-exam', 'passphrase.txt');
  return existsSync(file) ? file : null;
}

/** Open and verify against the committed hash; true or a throw. Never returns the plaintext. */
export function verifySealed({ sealedFile, hashFile, passphrase }) {
  const plain = openSealed(readSealed(sealedFile), passphrase);
  const got = sha256(plain);
  plain.fill(0);
  if (got !== readHash(hashFile)) throw new Error('the sealed briefs decrypt to something other than the committed hash');
  return true;
}
