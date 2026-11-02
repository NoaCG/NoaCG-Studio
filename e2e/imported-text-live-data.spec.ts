// covers: src/templates/importedDesign/svg.ts, src/control/contentFormats.ts
// covers: e2e/fixtures/jev-svg/qualification/multiline.svg
//
// A LINKED MULTILINE SVG FIELD ON AIR (jev-svg-import row 24, AC-14 and AC-24). An imported
// design's text layer follows a Sheet through the existing keyed-values adapter, and a refresh
// reaches the graphic on air through update(): the words change in the drawn styling, fitted to the
// drawn room by the import's own ladder, and nothing else moves. The entrance is not played again and motion running elsewhere in
// the graphic is neither restarted nor stopped. Replace, empty (which clears), fill again, and
// Pause then Resume (the source reconnecting) each reach air the same way. No text layout or
// motion engine is added: the field is the import's own, fitted by its own ladder.
//
// Row 25 (AC-14): the same field when the Sheet fails on air. The page reads a local fake of the
// export (e2e/fixtures/jev-sheet-server.mjs) that denies, never answers, drops the connection and
// serves a sign-in page; each is said on the source line, writes nothing, and the field keeps its
// last good lines with its motion running. The next good read reconnects with the newest lines.
// No model is asked anything on the way.

import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { settleDurableWrites } from './_durable';
import { dropSvg, intoProduction } from './_svg-import';
import { startSheetServer, csvOf } from './fixtures/jev-sheet-server.mjs';

const NOTICE_SVG = fileURLToPath(new URL('./fixtures/jev-svg/qualification/multiline.svg', import.meta.url));
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1NoaCGNoticeSheet000000000/edit#gid=0';
const tabOf = (body: string) => [['Field ID', 'Label', 'Value'], ['f0', 'Title', 'COMMUNITY NOTICE'], ['f1', 'Body', body]];

async function stubSheet(page: Page, rows: string[][]) {
  const tab = { csv: csvOf(rows) };
  await page.context().route(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[^/]+\/export/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/csv', headers: { 'access-control-allow-origin': '*' }, body: tab.csv }),
  );
  return { set: (next: string[][]) => { tab.csv = csvOf(next); } };
}

test('a Sheet refresh changes a multiline SVG field on air in its drawn styling, without replaying or resetting any motion', async ({ page }) => {
  test.setTimeout(120_000);
  const sheet = await stubSheet(page, tabOf('Doors open at 18:00\nEntry from the courtyard\nStep-free access on the east side'));
  await page.goto('/app');
  await dropSvg(page, NOTICE_SVG);
  await intoProduction(page, 'Notice', 'Notice night');
  await settleDurableWrites(page);

  await page.getByTestId('cue-connect').click();
  const review = page.getByTestId('cue-connect-menu');
  await review.getByTestId('cue-connect-link').fill(SHEET_URL);
  await review.getByTestId('cue-connect-read').click();
  await review.getByTestId('cue-connect-label').fill('Notices');
  await review.getByTestId('cue-connect-confirm').click();
  await expect(page.getByTestId('sources-line')).toContainText('checked');

  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('action-log')).toContainText('Took');
  const program = page.getByTestId('program-stage');
  const air = page.frameLocator('[data-testid="program-stage"] iframe');
  const body = air.locator('#f1');
  await expect(body).toContainText('Doors open at 18:00');
  // The drawn styling of the body, as taken.
  const look = () => body.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { size: cs.fontSize, fill: cs.fill, family: cs.fontFamily, x: el.getAttribute('x') };
  });
  const drawn = await look();
  expect(drawn.size).toBe('34px');
  expect(drawn.fill).toBe('rgb(255, 255, 255)');
  // The entrance has settled once; a motion of the design's own keeps running beside the text.
  await expect(program).toHaveAttribute('data-plays', '1');
  await air.locator('body').evaluate(() => {
    const w = window as unknown as { gsap: { to(t: Element, v: object): { totalTime(): number; isActive(): boolean } }; __spin: { totalTime(): number; isActive(): boolean } };
    const dot = document.querySelector('circle[cx="1000"]')!; // the drawing's own decoration, turning
    w.__spin = w.gsap.to(dot, { rotation: 360, svgOrigin: '1000 95', duration: 4, repeat: -1, ease: 'none' });
  });
  const motion = () => air.locator('body').evaluate(() => {
    const w = window as unknown as { __spin: { totalTime(): number; isActive(): boolean } };
    return { progress: w.__spin.totalTime(), active: w.__spin.isActive() };
  });
  // The words on air, in order. The import treats a drawn block of stacked lines as one value its
  // fit ladder wraps into the drawn room, so a typed line break reads as a space (#1977).
  const lines = () => body.evaluate((el) => (el.textContent ?? '').split(/\s+/).filter(Boolean).join(' '));
  // The block starts where it was drawn and stays inside the artwork's frame (0 to 1100). Where
  // the ladder sets its room on this drawing is the import's own rule, not this row's (#1977).
  const inside = () => body.evaluate((el) => {
    const b = (el as SVGTextElement).getBBox();
    return { inside: b.x === 85 && b.x + b.width <= 1100, x: b.x, right: b.x + b.width };
  });

  // REPLACE: three new lines arrive as three lines, in the drawn look, and nothing replays.
  const before = await motion();
  sheet.set(tabOf('Doors open at 19:00\nEntry from the main gate\nTickets at the door'));
  await expect.poll(lines, { timeout: 20_000, message: 'the refresh reached air' }).toBe('Doors open at 19:00 Entry from the main gate Tickets at the door');
  expect(await inside(), 'where it was drawn, inside the frame').toMatchObject({ inside: true });
  expect(await look(), 'the drawn styling is kept').toEqual(drawn);
  const after = await motion();
  expect(after.active, 'the motion beside the text still runs').toBe(true);
  expect(after.progress, 'and was not restarted').toBeGreaterThan(before.progress);
  await expect(program).toHaveAttribute('data-plays', '1');

  // EMPTY clears the field on air; FILLED AGAIN it comes back, in the same look.
  sheet.set(tabOf(''));
  await expect.poll(() => body.evaluate((el) => (el.textContent ?? '').trim()), { timeout: 20_000, message: 'an empty value clears' }).toBe('');
  sheet.set(tabOf('Doors open at 18:00\nEntry from the courtyard'));
  await expect.poll(lines, { timeout: 20_000 }).toBe('Doors open at 18:00 Entry from the courtyard');
  expect(await look()).toEqual(drawn);

  // PAUSE holds what is on air; RESUME reconnects and the newest value arrives.
  await page.getByTestId('source-pause').click();
  await expect(page.getByTestId('sources-line')).toContainText('paused');
  sheet.set(tabOf('Closed today'));
  await page.waitForTimeout(6000);
  expect(await lines(), 'paused: nothing read').toBe('Doors open at 18:00 Entry from the courtyard');
  await page.getByTestId('source-pause').click();
  await expect.poll(lines, { timeout: 20_000, message: 'reconnected' }).toBe('Closed today');
  expect(await look()).toEqual(drawn);
  const end = await motion();
  expect(end.active && end.progress > after.progress, 'the motion ran through every update').toBe(true);
  await expect(program).toHaveAttribute('data-plays', '1');
  // A plain text field holds no list for a later take: nothing on the line waits.
  await expect(page.getByTestId('source-waiting')).toHaveCount(0);
});

test('a failing Sheet keeps the multiline field\'s last good lines on air, says why, and reconnects to the newest lines with no model request', async ({ page }) => {
  test.setTimeout(120_000);
  const fake = await startSheetServer();
  const SHEET = '1NoaCGNoticeFake000000000';
  const tab = (body: string) => csvOf(tabOf(body));
  fake.set(SHEET, tab('Doors open at 18:00\nEntry from the courtyard'));
  await page.context().route(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[^/]+\/export/, fake.routeTo());
  const asked: string[] = [];
  page.on('request', (r) => { if (/\/api\/ai\b|anthropic|openai|generativelanguage|ai-gateway/.test(r.url())) asked.push(r.url()); });
  try {
    await page.goto('/app');
    await dropSvg(page, NOTICE_SVG);
    await intoProduction(page, 'Notice', 'Notice night');
    await settleDurableWrites(page);
    await page.getByTestId('cue-connect').click();
    const review = page.getByTestId('cue-connect-menu');
    await review.getByTestId('cue-connect-link').fill(`https://docs.google.com/spreadsheets/d/${SHEET}/edit#gid=0`);
    await review.getByTestId('cue-connect-read').click();
    await review.getByTestId('cue-connect-label').fill('Notices');
    await review.getByTestId('cue-connect-confirm').click();
    const status = page.getByTestId('sources-line').getByTestId('source-status');
    await expect(status).toContainText('checked');

    await page.getByTestId('verb-take').click();
    const program = page.getByTestId('program-stage');
    const air = page.frameLocator('[data-testid="program-stage"] iframe');
    const body = air.locator('#f1');
    const words = () => body.evaluate((el) => (el.textContent ?? '').split(/\s+/).filter(Boolean).join(' '));
    await expect.poll(words).toBe('Doors open at 18:00 Entry from the courtyard');
    await expect(program).toHaveAttribute('data-plays', '1');
    await air.locator('body').evaluate(() => {
      const w = window as unknown as { gsap: { to(t: Element, v: object): unknown }; __spin: unknown };
      w.__spin = w.gsap.to(document.querySelector('circle[cx="1000"]')!, { rotation: 360, svgOrigin: '1000 95', duration: 4, repeat: -1, ease: 'none' });
    });
    const spin = () => air.locator('body').evaluate(() => (window as unknown as { __spin: { totalTime(): number } }).__spin.totalTime());

    // Each failure is said on the line, and the field keeps its last good lines on air.
    const failures: [Parameters<typeof fake.mode>[1], RegExp][] = [
      ['deny', /can’t read it \(not shared\) since/],
      ['hang', /Google did not answer in 10 seconds since/],
      ['reset', /not shared, or offline\) since/],
      ['signin', /can’t read it \(not shared\) since/],
    ];
    let turned = await spin();
    for (const [mode, said] of failures) {
      fake.mode(SHEET, mode);
      await expect(status, mode).toHaveText(said, { timeout: 25_000 });
      expect(await words(), `${mode}: the last good lines stay on air`).toBe('Doors open at 18:00 Entry from the courtyard');
      const now = await spin();
      expect(now, `${mode}: the drawing's own motion keeps running`).toBeGreaterThan(turned);
      turned = now;
    }

    // Reconnect: the newest lines arrive, the line is healthy again, nothing replays.
    fake.set(SHEET, tab('Doors open at 19:00\nTickets at the door'));
    await expect.poll(words, { timeout: 20_000, message: 'reconnected' }).toBe('Doors open at 19:00 Tickets at the door');
    await expect(status).toContainText('checked');
    await expect(program).toHaveAttribute('data-plays', '1');
    expect(await spin()).toBeGreaterThan(turned);
    expect(asked, 'no model request on any refresh').toEqual([]);
  } finally {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.context().unrouteAll({ behavior: 'ignoreErrors' });
    await fake.close();
  }
});
