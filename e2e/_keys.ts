import { expect, type Page } from '@playwright/test';

// Helpers for the KEY-OWNERSHIP contracts (src/components/spaceKey.ts).
//
// Two surfaces want Space and several want Delete / Ctrl+C / Escape / the arrows. Asserting one
// of them acted is never enough - the bug these were written for was an unintended SECOND
// handler firing alongside the intended one, which every existing spec happily passed through.
// So the probes here answer "did the graphic play?" rather than "did the pan arm?".

// The preview iframe carries no allow-same-origin (it can render AI-generated/imported code),
// so these probes can't reach `contentWindow.__activeTl` directly any more. composeDocument's
// `simulate` script instead PUSHES its playhead every animation frame
// (`{ type: 'spx-preview-playhead', active, runId, ... }`, preview/previewProtocol.ts) — `runId`
// is a monotonic counter stamped onto every NEW running timeline, the wire equivalent of the old
// object-identity check against `__activeTl`. Sampling one incoming push is enough: `active`
// tells 'none' apart from a running timeline, and comparing `runId` against whatever was last
// stamped tells 'parked' (the same run survives) from 'fresh' (a new play() started).
//
// THESE ANSWER ABOUT THIS INSTANT, and since 2026-08-29 that is a real distinction: a run now
// releases itself when its own timeline completes (preview/simulatorRuntime.ts), where it used to
// be held until the NEXT play or stop. So a finished run reads as 'none', not 'parked', and
// 'parked' is only observable while the run is still going.
//
// What that means for a spec: to say "no new run started", assert `not.toBe('fresh')` - 'parked'
// pins how long the entrance happens to take, which is nobody's subject. To wait for a run to
// FINISH, remember that idle is the state on both sides of it, so watch for the run to start and
// only then for it to go inactive; polling straight for inactive answers from the idle before it.

export interface PlayheadSample {
  active: boolean;
  runId: number;
  phase: string;
  time: number;
  duration: number;
}

function readPlayhead(page: Page): Promise<PlayheadSample> {
  return page.evaluate(
    () =>
      new Promise<PlayheadSample>((resolve) => {
        const handler = (ev: MessageEvent) => {
          const msg = ev.data as {
            type?: string;
            active?: boolean;
            runId?: number;
            phase?: string;
            time?: number;
            duration?: number;
          } | undefined;
          if (msg?.type !== 'spx-preview-playhead') return;
          window.removeEventListener('message', handler);
          resolve({
            active: !!msg.active,
            runId: msg.runId ?? 0,
            phase: msg.phase ?? '',
            time: msg.time ?? 0,
            duration: msg.duration ?? 0,
          });
        };
        window.addEventListener('message', handler);
      }),
  );
}

/** Read the next pushed playhead sample, including its exact phase-local clock. */
export function timelineProgress(page: Page): Promise<PlayheadSample> {
  return readPlayhead(page);
}

/** 'none' = nothing running, 'parked' = the stamped timeline survives, 'fresh' = play() ran. */
export async function timelineState(page: Page): Promise<string> {
  const sample = await readPlayhead(page);
  if (!sample.active) return 'none';
  const stamped = await page.evaluate(() => (window as unknown as { __stampedRunId?: number }).__stampedRunId);
  return stamped === sample.runId ? 'parked' : 'fresh';
}

/** Mark the parked timeline (if any) so a later read can tell it from a fresh play(). */
export async function stampTimeline(page: Page): Promise<string> {
  const sample = await readPlayhead(page);
  await page.evaluate((runId) => {
    (window as unknown as { __stampedRunId: number }).__stampedRunId = runId;
  }, sample.active ? sample.runId : -1);
  return sample.active ? 'parked' : 'none';
}

/**
 * Real OS auto-repeat. `page.keyboard.down()` sends ONE keydown and never repeats, which is why
 * the first fix for the Space-pan bug looked green while the actual held-key gesture stayed
 * broken - only the first keydown was ever covered. Anything that guards a HELD key needs this.
 */
export async function holdKeyRepeats(page: Page, n: number, code = 'Space', key = ' '): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  for (let i = 0; i < n; i++) {
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyDown', code, key, windowsVirtualKeyCode: key === ' ' ? 32 : 0, autoRepeat: true,
    });
  }
  await cdp.detach();
  await page.waitForTimeout(250);
}

/**
 * Put focus somewhere Space means nothing, so a press can only be answered by the surface under
 * test.
 *
 * Space belongs to a FOCUSED BUTTON (spaceKey.ts), and
 * clicking any panel or toolbar control leaves one focused - the Data tab's "+ Add" is the usual
 * culprit, since adding a field is how these specs get something to aim at. Whether that button
 * is STILL focused when a later Space lands is decided by unrelated timing: the new field arrives
 * selected, and half a second later the Inspector's deferred reveal swaps the Data panel out from
 * under it, dropping focus to the body. Win that race and Space plays; lose it and Space clicks
 * "+ Add" again - a green run and a red one testing different things. So a spec about who owns
 * Space states this precondition instead of inheriting it.
 */
export async function parkFocusOffControls(page: Page): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  // ACTIVATABLE in spaceKey.ts - the same set the app asks about.
  const stillOnAControl = await page.evaluate(() =>
    !!(document.activeElement as HTMLElement | null)?.closest('button, [role="button"], a[href], summary'));
  expect(stillOnAControl).toBe(false);
}

/** How many times the graphic was told to play since the counter was installed. */
export async function countPlays(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const w = window as unknown as { __plays: number };
    w.__plays = 0;
    // Every sendControl bumps a nonce, so one play per press means one subscriber call.
    useTemplateStore.subscribe((s: { controlCommand: { action?: string } | null }) => {
      if (s.controlCommand?.action === 'play') w.__plays++;
    });
  });
}

export function playCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __plays: number }).__plays ?? 0);
}
