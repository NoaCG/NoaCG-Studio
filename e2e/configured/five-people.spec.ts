// CONFIGURED TRIGGERS: a change to a path below prints "also run npm run test:e2e:live:queued"
// (scripts/e2e-lists.mjs). Only a real backend holds a team, a publication and its automatic updates.
//
// FIVE PEOPLE AT ONCE (docs/work-specs/live-publishing/spec.md, AC-6). Five signed-in accounts in
// browser contexts of their own work one team production with automatic updates and partial writes
// on: one takes and outs, one pastes messages and prepares cues from them, one presses the score's
// Goal, and two type into their own cues at the same instant each tick. One editor's page reloads
// part way through; the other loses its connection and gets it back. Afterwards: no command lost
// (every Take ran on the output, the score moved once per Goal, every message became a cue), no
// different cue overwritten (each editor's last text is in the team's record, in the publication
// and on every page; the taker's cues are untouched), and no conflicted copy anywhere.
//
// This is the short run the suite can afford. The ten-minute run, press to ran against a single
// page, and the 10 and 15 page runs use the same scene (e2e/configured/_five.ts) from
// e2e/configured/measure/five.measure.ts; their numbers are in
// docs/work-specs/live-publishing/evidence/phase-8.md.
// covers: src/backend/teamProductions.ts, src/backend/savedRevision.ts, src/control/autoPublish.ts, src/components/home/useAutoPublish.ts
// covers: src/control/publishParts.ts, src/control/publishRevision.ts, src/control/messageStaging.ts
import { test, expect } from '@playwright/test';
import { haveCreds, SERVICE_ROLE_KEY } from './_helpers';
import { isLocalStack, pageCues, run, serverState, setSwitch, setUp, tearDown, type Scene } from './_five';

test.skip(!haveCreds || !SERVICE_ROLE_KEY || !isLocalStack(), 'five people: needs the local stack, its accounts and its service key (it mints accounts and writes the switches)');

let scene: Scene | null = null;
test.afterEach(async ({ page }) => {
  await tearDown(scene, page);
  scene = null;
  await setSwitch('auto_publish', false).catch(() => undefined);
  await setSwitch('partial_writes', false).catch(() => undefined);
});

test('five people on one production: no command lost, no different cue overwritten', async ({ page, browser }) => {
  test.setTimeout(120_000);
  await setSwitch('partial_writes', true);
  await setSwitch('auto_publish', true);
  scene = await setUp(browser, page, 5);
  const before = await serverState(scene);
  const report = await run(scene, { ms: 30_000, tickMs: 3_000, messageEveryMs: 9_000, reloadAt: 0.3, offlineAt: 0.5, offlineMs: 8_000 });
  expect(report.errors, 'every role ran to the end').toEqual([]);
  expect(report.reloads, 'one page reloaded').toBe(1);
  expect(report.offline, 'one page lost its connection and got it back').not.toBeNull();

  // No command lost.
  expect(report.takes.length).toBeGreaterThan(5);
  expect(report.takes.filter((t) => t.ranAt === null).map((t) => t.label), 'every Take ran on the output').toEqual([]);
  expect(report.goals).toBeGreaterThan(3);
  expect(report.messages.filter((m) => !m.prepared), 'every message became a cue').toEqual([]);

  // Everything settles: the record, the publication and every page.
  const last = Object.fromEntries(report.edits.map((e) => [e.cue, e.typed[e.typed.length - 1]]));
  const s = scene;
  await expect
    .poll(async () => (await serverState(s)).score, { timeout: 20_000, message: 'the score moved once per Goal' })
    .toBe(report.goals);
  await expect
    .poll(
      async () => {
        const state = await serverState(s);
        return Object.fromEntries(Object.keys(last).map((cue) => [cue, { record: state.cues[cue], published: state.published.includes(last[cue]) }]));
      },
      { timeout: 30_000, message: "each editor's last text is in the team's record and in the publication" },
    )
    .toEqual(Object.fromEntries(Object.entries(last).map(([cue, text]) => [cue, { record: text, published: true }])));
  for (const p of s.people) {
    await expect
      .poll(async () => pickCues(await pageCues(p.page, s.showId), Object.keys(last)), {
        timeout: 30_000,
        message: `${p.email}'s page holds each editor's last text`,
      })
      .toEqual(last);
  }
  const state = await serverState(s);
  for (const label of [...s.takes, s.score]) expect(state.cues[label], `${label} was edited by nobody and keeps its text`).toBe(before.cues[label]);
  for (const m of report.messages) expect(state.labels, `a cue from "${m.body}"`).toContain(m.body);
  expect(state.conflicted, 'no conflicted copy anywhere').toEqual([]);
  test.info().annotations.push({ type: 'press to ran (ms, not judged here)', description: JSON.stringify(report.takes.map((t) => Math.round(t.ranAt! - t.pressAt))) });
});

function pickCues(cues: Record<string, string>, labels: string[]): Record<string, string> {
  return Object.fromEntries(labels.map((l) => [l, cues[l]]));
}
