// Trusted operator role commands (docs/ADMIN.md section 3); no admin webpage is required.
//
// This is the ONLY way to create the first admin, and it deliberately runs outside the app:
// there is no self-promotion path, no "claim this instance" first-run screen, and no admin
// endpoint that can grant a role to someone who does not already have one. The service-role
// key is read from the environment and never stored.
//
// Usage (from a trusted machine):
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/admin.mjs list
//   node scripts/admin.mjs grant you@example.com owner
//   node scripts/admin.mjs revoke someone@example.com
//
// Roles: owner (may manage admin roles) > admin (may change any user's access) > support
// (read-only). Grants and revocations made here are written to admin_audit_log with a null
// actor, so an out-of-band change is visible in the same append-only operations log.

import { createClient } from '@supabase/supabase-js';

const ROLES = ['owner', 'admin', 'support'];
const [command, rawEmail, rawRole] = process.argv.slice(2);

const url = (process.env.SUPABASE_URL ?? '').trim();
const key = (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY).');
  process.exit(1);
}
if (!['list', 'grant', 'revoke'].includes(command ?? '')) {
  console.error('Usage: node scripts/admin.mjs <list | grant <email> [role] | revoke <email>>');
  console.error(`Roles: ${ROLES.join(', ')} (default: owner for the first admin, else admin)`);
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

/** Find an existing auth user by email. Paging because listUsers has no email filter. */
async function findUser(email) {
  const wanted = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const hit = data.users.find((user) => (user.email ?? '').toLowerCase() === wanted);
    if (hit) return hit;
    if (data.users.length < 200) break;
  }
  return null;
}

async function audit(action, targetId, summary, detail) {
  const { error } = await sb.from('admin_audit_log').insert({
    actor_id: null,
    actor_email: 'scripts/admin.mjs',
    actor_role: 'owner',
    action,
    target_type: 'user',
    target_id: targetId,
    summary,
    detail: detail ?? {},
  });
  // A missing audit row must not make the operator think the grant failed - it did not.
  if (error) console.warn(`warning: audit write failed (${error.message})`);
}

async function list() {
  const { data, error } = await sb
    .from('admin_users')
    .select('user_id, role, note, created_at')
    .order('created_at', { ascending: true });
  if (error) throw new Error(`select failed: ${error.message}`);
  if (!data.length) {
    console.log('No admins. Create the first one: node scripts/admin.mjs grant <email> owner');
    return;
  }
  for (const row of data) {
    const { data: user } = await sb.auth.admin.getUserById(row.user_id);
    const email = user?.user?.email ?? '(no email)';
    console.log(`${row.role.padEnd(8)} ${email.padEnd(36)} since ${row.created_at.slice(0, 10)}`);
  }
}

async function grant() {
  if (!rawEmail) throw new Error('grant needs an email');
  const role = rawRole ?? (await isFirstAdmin() ? 'owner' : 'admin');
  if (!ROLES.includes(role)) throw new Error(`unknown role "${role}" (expected ${ROLES.join(', ')})`);

  const user = await findUser(rawEmail);
  if (!user) {
    // Deliberately refuses rather than inviting: an admin role on an account that does not
    // exist yet would be waiting for whoever claims that email address first.
    throw new Error(`no account for ${rawEmail}. Have them sign up first, then grant.`);
  }

  const { error } = await sb
    .from('admin_users')
    .upsert({ user_id: user.id, role, note: 'granted via scripts/admin.mjs' }, { onConflict: 'user_id' });
  if (error) throw new Error(`upsert failed: ${error.message}`);

  await audit('admin.grant', user.id, `granted ${role} to ${user.email}`, { role });
  console.log(`Granted ${role} to ${user.email}.`);
}

async function isFirstAdmin() {
  const { count, error } = await sb.from('admin_users').select('user_id', { count: 'exact', head: true });
  if (error) throw new Error(`count failed: ${error.message}`);
  return (count ?? 0) === 0;
}

async function revoke() {
  if (!rawEmail) throw new Error('revoke needs an email');
  const user = await findUser(rawEmail);
  if (!user) throw new Error(`no account for ${rawEmail}`);

  const { error } = await sb.from('admin_users').delete().eq('user_id', user.id);
  if (error) throw new Error(`delete failed: ${error.message}`);

  await audit('admin.revoke', user.id, `revoked admin from ${user.email}`, {});
  console.log(`Revoked admin from ${user.email}.`);
}

try {
  if (command === 'list') await list();
  else if (command === 'grant') await grant();
  else await revoke();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
