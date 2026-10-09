// Turn the owner's own Supabase account into a short-lived user access token for
// scripts/ai-lite-eval.mjs, which needs a real server-validated identity (api/_lib/auth.ts
// verifies with supabase.auth.getUser).
//
// Reads the MAIN checkout's .env - a linked worktree has none, which is the whole reason this
// tooling exists. Prints the user id on stderr and the access token on stdout, so the token can
// be captured without the other secrets ever being echoed.
//
//   node scripts/lite-eval-token.mjs [email]        -> access token on stdout
//   node scripts/lite-eval-token.mjs --id [email]   -> user id on stdout instead
//
// Also the module the other tools import for identity, so "which account is the eval running
// as?" has exactly one answer.

import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { argv } from 'node:process';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { mainCheckout, mainEnv } from './lite-eval-paths.mjs';

/** The account the eval runs as when no argument names one. This repository is public, so the
 *  address is never committed: it comes from NOACG_EVAL_EMAIL (the environment, or the main
 *  checkout's .env), and otherwise from the git identity of whoever is running the tool - which
 *  on the machine that holds the Supabase service key is the owner's account anyway. Overridable
 *  by argument on every entry point. */
export function defaultEvalEmail() {
  const fromEnv = process.env.NOACG_EVAL_EMAIL ?? mainEnv().NOACG_EVAL_EMAIL;
  if (fromEnv) return fromEnv.trim();
  let fromGit;
  try {
    fromGit = execFileSync('git', ['config', 'user.email'], { encoding: 'utf8', windowsHide: true }).trim();
  } catch {
    fromGit = '';
  }
  if (fromGit) return fromGit;
  throw new Error('No eval account: set NOACG_EVAL_EMAIL, or pass the address as an argument.');
}

function adminClient() {
  const env = mainEnv();
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY;
  const serviceKey = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    throw new Error(`${mainCheckout()}/.env is missing the Supabase url, anon key, or service key.`);
  }
  return { url, anonKey, admin: createClient(url, serviceKey, { auth: { persistSession: false } }) };
}

/** The Supabase user record for an email. Walks the auth directory rather than guessing an id. */
async function findUser(admin, email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    if (!data.users.length) break;
    const match = data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
  }
  throw new Error(`No Supabase user with email ${email}.`);
}

/** The user id behind an email - what AI_LITE_OVERRIDE_USER_IDS needs. */
export async function resolveUserId(email = defaultEvalEmail()) {
  const { admin } = adminClient();
  return (await findUser(admin, email)).id;
}

/** A short-lived (about an hour) access token for that account. Returns `{ userId, email, token }`. */
export async function mintToken(email = defaultEvalEmail()) {
  const { url, anonKey, admin } = adminClient();
  const user = await findUser(admin, email);

  // generateLink mints a one-time hashed token WITHOUT emailing anything; verifyOtp on the anon
  // client exchanges it for a normal user session. No password is read or needed.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: user.email,
  });
  if (linkError) throw new Error(`generateLink failed: ${linkError.message}`);

  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: session, error: otpError } = await anon.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'email',
  });
  if (otpError || !session.session) {
    throw new Error(`verifyOtp failed: ${otpError?.message ?? 'no session'}`);
  }
  return { userId: user.id, email: user.email, token: session.session.access_token };
}

const invokedDirectly = argv[1] && realpathSync(argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const email = (argv.slice(2).find((a) => a.includes('@')) ?? defaultEvalEmail()).trim();
  try {
    if (argv.includes('--id')) {
      console.log(await resolveUserId(email));
    } else {
      const { userId, email: found, token } = await mintToken(email);
      console.error(`minted for user ${userId} (${found})`);
      console.log(token);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
