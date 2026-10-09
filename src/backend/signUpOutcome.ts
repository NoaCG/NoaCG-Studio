import type { Session } from '@supabase/supabase-js';

/**
 * Where a sign-up the server ACCEPTED leaves the visitor, read from its reply and never from a
 * setting: whether the project confirms email addresses is server configuration the client cannot
 * see, and the reply already says it.
 *
 *   - Confirmations off (the hosted project, `mailer_autoconfirm: true`): GoTrue answers with the
 *     new user AND a session. supabase-js has stored it and emitted SIGNED_IN before `signUp`
 *     resolves, so the account is in use already and no email is sent.
 *   - Confirmations on: the user and no session, and a confirmation email is on its way.
 *
 * Every reply without a session counts as the second. That includes GoTrue's reply for an address
 * that is already registered (a user with `identities: []`), which it shapes like a fresh
 * unconfirmed sign-up on purpose so the form cannot be used to find out who has an account.
 */
export type SignUpOutcome = 'signed-in' | 'confirm-email';

export function signUpOutcome(reply: { session: Session | null }): SignUpOutcome {
  return reply.session ? 'signed-in' : 'confirm-email';
}
