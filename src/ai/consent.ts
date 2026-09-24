// Browser-side record of AI disclosure-notice acceptance (docs/AI_PLATFORM_PLAN.md §9,
// ratified decision 2). The rule: acceptance is stored client-side for everyone (it must
// work anonymous and offline-configured alike) and ALSO server-side for signed-in users,
// so an account carries its acceptance across browsers. A version bump invalidates both -
// the stored version must match AI_NOTICE_VERSION exactly.
//
// This module holds no UI: AiConsentDialog renders the notice for the legacy AI surfaces
// that still use an explicit first-use acknowledgement. Create with AI is governed by the
// public Terms and Privacy Policy and deliberately does not mount this gate.

import { getAccessToken } from '../backend/auth';
import { AI_NOTICE_VERSION } from './consentNotice';
import { accountKey } from '../model/accountScope';

const STORAGE_KEY = 'spx-gfx-ai-notice';

interface StoredAcceptance {
  version: string;
  acceptedAt: string;
}

function readLocal(): StoredAcceptance | null {
  try {
    const raw = localStorage.getItem(accountKey(STORAGE_KEY));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record.version !== 'string' || typeof record.acceptedAt !== 'string') return null;
    return { version: record.version, acceptedAt: record.acceptedAt };
  } catch {
    return null;
  }
}

function writeLocal(): void {
  try {
    localStorage.setItem(
      accountKey(STORAGE_KEY),
      JSON.stringify({ version: AI_NOTICE_VERSION, acceptedAt: new Date().toISOString() }),
    );
  } catch {
    // Storage unavailable (private mode quota) - the session-local dialog state still
    // carries the acceptance for this visit; nothing else to do.
  }
}

/** Synchronous check against the local record only - the fast path every gate tries first. */
export function noticeAcceptedLocally(): boolean {
  return readLocal()?.version === AI_NOTICE_VERSION;
}

/** Local record, else the signed-in user's server record (cached locally on a hit). */
export async function loadNoticeAccepted(): Promise<boolean> {
  if (noticeAcceptedLocally()) return true;
  const token = await getAccessToken().catch(() => null);
  if (!token) return false;
  try {
    const response = await fetch('/api/ai/consent', {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) return false;
    const body = await response.json() as { accepted?: boolean };
    if (body.accepted === true) {
      writeLocal();
      return true;
    }
  } catch {
    // Unreachable consent endpoint reads as not-yet-accepted - the notice shows again,
    // which errs on the side of disclosure, never silence.
  }
  return false;
}

/** Record acceptance of the CURRENT notice version: locally always, server-side when
 *  signed in. A failed server write never blocks the user - they did accept, and the
 *  local record stands until a later session syncs. */
export async function recordNoticeAcceptance(): Promise<void> {
  writeLocal();
  const token = await getAccessToken().catch(() => null);
  if (!token) return;
  await fetch('/api/ai/consent', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ noticeVersion: AI_NOTICE_VERSION }),
  }).catch(() => undefined);
}
