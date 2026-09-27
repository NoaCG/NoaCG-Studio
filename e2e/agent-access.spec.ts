// focus
//
// AGENT ACCESS (docs/AGENT_SAVE.md): the consent query route, the Settings key list, the
// browser client and the two /api/me routes it calls. The offline spec pins the no-backend
// posture; the live half is e2e/configured/agent-access.spec.ts (CONFIGURED_TRIGGERS).
// covers: {src/backend/agentAccess.ts,src/components/auth/AgentAccessConsent.tsx,src/components/SettingsDialog.tsx,api/_lib/me/{agentKeys*,graphics*,graphicShape.ts,packages*,packageShape.ts},api/_lib/{principal.ts,agentAccessStore.ts},src/entitlements/permissions.ts}

import { test, expect } from '@playwright/test';

// AGENT ACCESS, offline (docs/AGENT_SAVE.md): the consent route `/app?agent=…` a coding agent's
// CLI opens, the Settings "Agent access" list, and the save door - everything this offline suite
// can structurally see. The posture it pins is the auth posture (root AGENTS.md): an offline build
// grows ZERO auth UI, so the consent page says "no account backend" honestly and offers no Sign
// in; a malformed request is refused before anything else; Settings carries no key list; and the
// two API routes answer 503 rather than half-working. The live halves - consent with a session,
// the loopback handoff, redeem, save 201, revoke -> 401 - are e2e/configured/agent-access.spec.ts.

const CHALLENGE = 'a'.repeat(64);
const REQUEST = `/app?agent=state_12345678&port=43123&name=${encodeURIComponent('Claude Code on LAPTOP')}&challenge=${CHALLENGE}`;

test('offline: the consent page says there is no account backend, and grows no auth UI', async ({ page }) => {
  await page.goto(REQUEST);
  await expect(page.getByTestId('agent-consent')).toBeVisible();
  await expect(page.getByTestId('agent-consent-offline')).toContainText('without an account backend');
  // The studio is NOT rendered under it - the consent page is a question, not a surface.
  await expect(page.locator('.wz-modal')).toHaveCount(0);
  await expect(page.getByTestId('home-settings')).toHaveCount(0);
  // Zero auth UI, however the page is reached (e2e/auth.spec.ts' contract, extended).
  await expect(page.locator('.auth-gate')).toHaveCount(0);
  await expect(page.locator('.auth-signin')).toHaveCount(0);
  await expect(page.getByTestId('signin-prompt')).toHaveCount(0);
  await expect(page.getByTestId('agent-consent-allow')).toHaveCount(0);
});

test('a malformed request is refused before anything else - no port, no challenge, no code', async ({ page }) => {
  // Offline the backend card wins; the PARSE is pinned through the pure module instead, so the
  // refusal rules hold in the configured build too (where the page reads them).
  await page.goto('/app');
  const verdicts = await page.evaluate(async () => {
    const { parseAgentRequest, agentCallbackUrl } = await import('/src/backend/agentAccess.ts');
    const p = (q: string) => parseAgentRequest(new URLSearchParams(q));
    const ok = p('agent=state_12345678&port=43123&name=Claude%20Code&challenge=' + 'a'.repeat(64));
    return {
      ok: ok ? { port: ok.port, name: ok.name, permissions: [...ok.permissions] } : null,
      noPort: p('agent=state_12345678&name=x&challenge=' + 'a'.repeat(64)),
      lowPort: p('agent=state_12345678&port=80&name=x&challenge=' + 'a'.repeat(64)),
      badChallenge: p('agent=state_12345678&port=43123&name=x&challenge=nope'),
      shortState: p('agent=abc&port=43123&name=x&challenge=' + 'a'.repeat(64)),
      hostInjection: p('agent=state_12345678&port=43123&name=x&challenge=' + 'a'.repeat(64) + '&host=evil.example'),
      callback: agentCallbackUrl(43123, 'c0de', 'state_12345678'),
    };
  });
  expect(verdicts.ok).toEqual({ port: 43123, name: 'Claude Code', permissions: ['graphics:create'] });
  expect(verdicts.noPort).toBeNull();
  expect(verdicts.lowPort).toBeNull();
  expect(verdicts.badChallenge).toBeNull();
  expect(verdicts.shortState).toBeNull();
  // An extra parameter cannot move the callback: the host is NEVER read from the URL.
  expect(verdicts.hostInjection).not.toBeNull();
  expect(verdicts.callback).toBe('http://127.0.0.1:43123/callback#code=c0de&state=state_12345678');
});

test('offline: Settings carries no Agent access list, and the two API routes refuse honestly', async ({ page }) => {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.getByTestId('creation-wizard').locator('.gallery-close').click();
  await page.getByTestId('home-settings').click();
  await expect(page.getByTestId('settings')).toBeVisible();
  await expect(page.getByTestId('agent-keys')).toHaveCount(0);

  // The dev server mounts the real /api/me function (scripts/meDevPlugin.mjs); with no service
  // key the routes exist and say so - 503 with a reason, never a 404 that reads as "not built".
  const statuses = await page.evaluate(async () => {
    const keys = await fetch('/api/me/agent-keys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'begin', name: 'x', challenge: 'a'.repeat(64) }) });
    const save = await fetch('/api/me/graphics', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer noacg_ak_nope' }, body: '{}' });
    return { keys: keys.status, save: save.status, keysBody: await keys.json(), saveBody: await save.json() };
  });
  expect(statuses.keys).toBe(503);
  expect(statuses.save).toBe(503);
  expect((statuses.keysBody as { error: { message: string } }).error.message).toContain('no account backend');
  expect((statuses.saveBody as { error: { message: string } }).error.message).toContain('no account backend');
});
