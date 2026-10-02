import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { clearPublishedShows, haveCreds, signIn, wipeMyGraphics } from './_helpers';

// A PRODUCTION CONTROL PROFILE, DRIVEN ON THE HOSTED CONTROL PAGE (AC-5, AC-7 and AC-9's hosted
// half of docs/work-specs/control-panel-any-graphic). AC-6, Combined controls, was removed with
// the feature on 2026-10-02; this walk now proves a published profile that still carries one
// ignores it.
//
// WHY THIS FILE EXISTS. The control-profile chain - ARRANGE and the bound stepper - was built and reviewed without anybody ever seeing a profile on the surface the show is actually
// run from. `e2e/hosted-control.spec.ts` says at length why it cannot get there: the hosted page
// needs a published `control_shows` row, a real command log and a resolve, and an offline build
// has none of them, so that file drives the page's own modules over the published bytes and stops
// at the DOM. The in-app production page has the DOM covered, with a different road underneath it.
// Between them sat one gap - this page's rendered buttons - and it is the one that matters on
// 2026-10-20, because the hosted page is what the class operates from.
//
// This suite is the only rig in the repository that has both halves: a real Supabase stack and a
// signed-in account, on a runner, with nothing of the owner's in reach
// (`.github/workflows/configured-suite.yml` explains the local-stack choice). So the walk runs
// here, in CI, and the run is the evidence.
//
// WHAT IT ASSERTS ON, and this is the rule the whole file is written to. The hosted page's own
// belief about what it sent is not evidence: the press is optimistic, the button renders before
// the round trip, and the page's own "not sent" warning follows the wire rather than the DOM. So
// every claim about what a press DID is read back off `control_tail` - the durable log, with the
// server's own timestamps - and the DOM is asserted only for what the DOM is: what the operator
// can see, reach and read.
//
// THE FIXTURE IS THE PROOF CASE. The two vote-show boards under `e2e/fixtures/agent-made/`,
// authored through the CLI against the shipped skill rather than scaffolded from a type, so the
// controls this profile arranges are an agent's own declarations (plan §3a, §3b).
//
// WHAT IT DOES NOT REACH. The graphics are not rendered and compared here: PROGRAM's stages are
// sandboxed iframes and this walk's subject is the operator's surface and the wire, not paint.
// The picture belongs to `e2e/agent-made-graphics.spec.ts` and to the in-app walk.

const PACK = readFileSync(
  fileURLToPath(new URL('../fixtures/agent-made/vote-show.noacgpack.json', import.meta.url)),
  'utf8',
);

const VOTES = 'Votes board';
const TOTALS = 'Totals board';

/**
 * The production-data leaves this walk binds, and why there are TWO rather than the criterion's
 * one.
 *
 * AC-7's scenario is two graphics bound to one figure. This fixture cannot offer that honestly:
 * the votes board declares no number field at all, so the only leaf both boards can carry is the
 * panelist's NAME (the votes board's "Panelist 1", the totals board's "Name 1"), and the only
 * leaf a ± stepper can move is the POINTS the totals board alone shows. So the criterion's two
 * claims are proved on two leaves, through the one operator door, and the receipt says so.
 */
const POINTS = 'panel.katri.points';
const NAME = 'panel.katri.name';

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset - configured-mode spec');

/** One durable row as this walk reads it: what it is, which graphic it is for, and when the
 *  SERVER wrote it. The timestamp is the server's because the wait between two steps is the
 *  claim, and two browser clocks would be two opinions about it. */
interface WireRow {
  id: number;
  at: number;
  graphic: string;
  kind: string;
  event: string | null;
  data: Record<string, string>;
}

/**
 * The COMMAND rows the log holds for this production after `afterId`, in id order.
 *
 * `control_events` is not only commands: `control_stage` writes a `staged` row whenever a press
 * mirrors a moved figure into the shared buffer, and every renderer writes a `live` row when it
 * reports its machine state back (migration 0008). Both are traffic about a press rather than the
 * press itself, and counting them would make "one row per step" mean nothing. They are dropped
 * here, once, rather than at each assertion.
 */
async function wire(op: Page, slug: string, afterId: number): Promise<WireRow[]> {
  return op.evaluate(
    async ({ slug, afterId }) => {
      const { hostedControlTail } = await import('/src/control/hostedControl.ts');
      const rows = await hostedControlTail(slug, afterId);
      return rows
        .map((row) => {
          const msg = row.msg as { t: string; event?: string; data?: Record<string, string> };
          return {
            id: row.id,
            at: row.created_at ? Date.parse(row.created_at) : 0,
            graphic: row.graphic,
            kind: msg.t,
            event: msg.event ?? null,
            data: msg.data ?? {},
          };
        })
        .filter((row) => row.kind !== 'staged' && row.kind !== 'live');
    },
    { slug, afterId },
  );
}

/** The last COMMAND row id the log holds - the baseline a press is measured against. */
async function wireHead(op: Page, slug: string): Promise<number> {
  const rows = await wire(op, slug, 0);
  return rows.length > 0 ? rows[rows.length - 1].id : 0;
}

/** Wait until the log has settled on exactly `count` new command rows, then hand them back.
 *  Polling the WIRE rather than sleeping: a press is a round trip and a delayed step is a
 *  second one, and a fixed sleep would either race the first or outlast the evidence. */
async function wireAfter(op: Page, slug: string, afterId: number, count: number): Promise<WireRow[]> {
  let rows: WireRow[] = [];
  await expect
    .poll(
      async () => {
        rows = await wire(op, slug, afterId);
        return rows.length;
      },
      {
        timeout: 30_000,
        message: `the log should carry ${count} command row(s) after id ${afterId}`,
      },
    )
    .toBe(count);
  return rows;
}

test('a published profile arranges and moves the shared value on the hosted page', async ({
  page,
  browser,
}) => {
  // A real stack, a publish, a delayed step and several wire settles. This suite's budget is
  // minutes and this walk is one of them.
  test.setTimeout(240_000);
  const timings: string[] = [];

  await signIn(page);
  await page.keyboard.press('Escape'); // the wizard signIn leaves open - not this walk
  await clearPublishedShows(page);
  await wipeMyGraphics(page);

  // ── THE PRODUCTION: the proof case, imported whole ──────────────────────────────────────────
  //
  // One import installs both graphics and the two cues over them, on layers 7 and 8 - so both
  // boards can be on air at once.
  await page.goto('/app#/home/productions');
  const wizard = page.locator('.wz-modal');
  if (await wizard.isVisible().catch(() => false)) await page.keyboard.press('Escape');
  const card = page.getByTestId('import-pack-card');
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.getByTestId('import-pack-file').setInputFiles({
    name: 'vote-show.noacgpack.json',
    mimeType: 'application/json',
    buffer: Buffer.from(PACK),
  });
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('cue-list').locator('.pd-cue')).toHaveCount(2);

  // A first-visit operator answers the analytics prompt; it has covered a Publish row before
  // (hosted-control-recovery.spec.ts records that), so it is part of the walk rather than a dodge.
  const consent = page.getByTestId('analytics-consent');
  if (await consent.isVisible().catch(() => false)) {
    await consent.getByRole('button', { name: 'No thanks' }).click();
  }

  // ── THE PROFILE AND THE BINDINGS, on the record before the publish ──────────────────────────
  //
  // Both travel WITH the publish (`publishControlShow` pins them on `control_shows`), so they
  // have to be written first. They go in through the model's own doors rather than by clicking:
  // the composer is the in-app page's subject and is covered there, while what is unproven is
  // what the HOSTED page does with a PUBLISHED profile. A profile written through
  // `setShowProfile` is byte-identical to a composed one - it is the same canonical serializer.
  const refused = await page.evaluate(
    async ({ VOTES, TOTALS, POINTS, NAME }) => {
      const { loadShows, setShowProfile, setFieldBindings } = await import('/src/model/shows.ts');
      const show = loadShows().find((s) => s.graphics.some((g) => g.name === VOTES))!;

      // BINDINGS. `panel.katri.name` is one person's name on both boards, which is the shape the
      // owner asked for: a value entered once shows everywhere it is bound. `panel.katri.points`
      // is that person's running total, which only the totals board has a number field for.
      setFieldBindings(show.id, [
        { graphic: VOTES, fieldId: 'f5', path: NAME },
        { graphic: TOTALS, fieldId: 'f0', path: NAME },
        { graphic: TOTALS, fieldId: 'f5', path: POINTS },
      ]);

      // The RETURN is read: `setShowProfile` writes nothing and answers `refused` when the stored
      // profile reads as a newer version's. Dropped, that failure arrives 60 lines later as an
      // arrangement that never appears, with nothing saying the profile was never stored.
      const written = setShowProfile(show.id, {
        v: 1,
        arrange: {
          // ARRANGE, both directions at once: one control pinned above the fold and one hidden
          // behind the disclosure under a name this production chose. The hidden one is the
          // destructive "New game" - exactly the control a live show wants out of the way of a
          // thumb and still one tap away.
          [TOTALS]: {
            plus2: { pinned: true },
            newGame: { hidden: true, name: 'Reset the board' },
          },
        },
      });
      if (written.refused) return true;

      // A COMBINED CONTROL, as a build from before 2026-10-02 left it on the record. They were
      // removed, so it goes in past the write door (which would drop it). The publish pins the
      // canonical profile, and the hosted page must render the arrangement and nothing of the list.
      const { durable, commitDurableWrites } = await import('/src/model/durableStore.ts');
      const list = JSON.parse(durable.getItem('spx-gfx-shows') ?? '[]') as { id: string; profile?: Record<string, unknown> }[];
      const row = list.find((s) => s.id === show.id)!;
      row.profile = {
        ...row.profile,
        combine: [{ id: 'reveal-then-points', name: 'Reveal, then the points', steps: [{ kind: 'event', graphic: VOTES, control: 'reveal' }] }],
      };
      durable.setItem('spx-gfx-shows', JSON.stringify(list));
      return (await commitDurableWrites()) !== null;
    },
    { VOTES, TOTALS, POINTS, NAME },
  );
  expect(refused, 'the profile must actually be stored on the show record').toBe(false);

  // ── PUBLISH ─────────────────────────────────────────────────────────────────────────────────
  const publishStarted = Date.now();
  await page.getByTestId('production-publish').click();
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'true', { timeout: 60_000 });
  timings.push(`publish ${((Date.now() - publishStarted) / 1000).toFixed(1)}s`);
  await page.keyboard.press('Escape'); // publishing opens the links popover

  // WHAT PUBLISHING MINTED, and the TREE seeded behind it, in one pass over the show record.
  //
  // The publish deliberately does NOT send the live tree (`publishControlShow` says why: once
  // published, the server's column is its authority). So the production's starting values go in
  // the way a feed's would, with the owner's own data key - the road `production-data-key.spec.ts`
  // proves and the road the Data workspace itself takes.
  const published = await page.evaluate(async (VOTES) => {
    const { loadShows } = await import('/src/model/shows.ts');
    const { productionDataKey, patchProductionData } = await import('/src/control/productionDataApi.ts');
    const show = loadShows().find((s) => s.graphics.some((g) => g.name === VOTES));
    if (!show?.hostedSlug) return { slug: null, seeded: null };
    const key = await productionDataKey(show.id);
    if (!key) return { slug: show.hostedSlug, seeded: null };
    const seeded = await patchProductionData(key, { panel: { katri: { name: 'Katri', points: 0 } } });
    return { slug: show.hostedSlug, seeded };
  }, VOTES);
  expect(published.slug, 'publishing must mint a hosted control slug').toBeTruthy();
  expect(
    published.seeded,
    'the owner must be able to seed the published tree with their own data key',
  ).toBeTruthy();
  const hosted = published.slug as string;

  // ── THE OPERATOR'S SURFACE: signed out, on the capability URL ────────────────────────────────
  //
  // A SEPARATE BROWSER CONTEXT, and that is the whole point rather than tidiness. The Supabase
  // client persists its session in localStorage, so a page opened in the publisher's own context
  // carries the OWNER's token - and then every RPC below succeeds on the owner's grants whatever
  // `anon` holds. Drop `anon` from `control_data_patch_by_slug` or `control_tail` and a walk in
  // the shared context still goes green while a real operator, holding nothing but the link, gets
  // 42501 on every press. `e2e/configured/output-url-cannot-push.spec.ts` takes its own context
  // for exactly this reason.
  const opContext = await browser.newContext();
  const op = await opContext.newPage();
  await op.goto(`/app?control=${encodeURIComponent(hosted)}`);
  await expect(op.getByTestId('hosted-control-page')).toBeVisible({ timeout: 60_000 });

  const cues = op.getByTestId('hosted-cues').locator('.pd-cue');
  await expect(cues).toHaveCount(2);

  // WHICH CUE IS WHICH, pinned where it can break rather than 150 lines later. The order comes
  // from the fixture's graphic order and everything below indexes on it; read off the PUBLISHED
  // payload rather than off a cue's label, which the pack is free to change.
  const cueGraphics = await op.evaluate(async (slug) => {
    const { controlShowBySlug } = await import('/src/control/hostedControl.ts');
    const answer = await controlShowBySlug(slug);
    const show = answer.ok ? answer.value : null;
    return (show?.output.cues ?? []).map((c) => c.graphic);
  }, hosted);
  expect(cueGraphics, 'the votes board is cue 1 and the totals board cue 2').toEqual([VOTES, TOTALS]);

  // ── THE OPERATOR'S MINUTE (plan §3c), from here on, timed ───────────────────────────────────
  //
  // Take the votes board, take the totals board, then move the shared points. The wall clocks go
  // into the run log, which is AC-9's hosted half: the walk, on the
  // surface the show is run from, with its numbers.
  const takeStarted = Date.now();
  await cues.nth(0).getByTestId('hosted-select-cue').click();
  await op.getByTestId('hosted-take-cue').click();
  await expect(op.getByTestId('hosted-live-chip')).toContainText('on air:', { timeout: 30_000 });

  await cues.nth(1).getByTestId('hosted-select-cue').click();
  await op.getByTestId('hosted-take-cue').click();
  await expect(op.locator('.prod-log-take')).toHaveCount(2, { timeout: 30_000 });
  timings.push(`both cues on air ${((Date.now() - takeStarted) / 1000).toFixed(1)}s`);

  // ── AC-5 ON THIS SURFACE: the arranged block, with the totals board's cue selected ──────────
  //
  // The pinned control sits above the section headings; the hidden one is behind ONE disclosure,
  // under the name this production gave it, still declared and still guarded by the machine. This
  // is ARRANGE's third deployment and the one the criterion could not reach.
  const pinned = op.getByTestId('hosted-actions-pinned').locator('button');
  await expect(pinned).toHaveCount(1);
  await expect(pinned).toHaveText('⚡ +1');
  // …and it left its section, which is what pinning MEANS: "Panelist 2" keeps only its −1.
  const panelistTwo = op
    .getByTestId('hosted-actions')
    .locator('.pd-actions-section')
    .filter({ has: op.locator('h4', { hasText: /^Panelist 2$/ }) });
  await expect(panelistTwo.locator('button')).toHaveCount(1);
  await expect(panelistTwo.locator('button')).toHaveText('⚡ −1');

  const more = op.getByTestId('hosted-actions-more');
  await expect(more.locator('summary')).toHaveText('More (1)');
  await expect(more.locator('button')).toHaveText('⚡ Reset the board');
  // A renamed control is still the machine's own: a production renames what an operator reads,
  // never what the graphic accepts, so the hidden one is live rather than decorative.
  await expect(more.locator('button')).toBeEnabled();

  // THE PUBLISHED COMBINED CONTROL IS IGNORED. Combined controls were removed on 2026-10-02, and a
  // profile that still carries one renders its arrangement above and nothing of the list.
  await expect(op.getByTestId('hosted-actions')).not.toContainText('Combined');
  await expect(op.getByText('Reveal, then the points')).toHaveCount(0);

  // ── AC-7: a stepper on a BOUND field moves the shared value ─────────────────────────────────
  //
  // The totals cue is selected and on air, so its ± block is live. `f5` is bound, so the press
  // must NOT write the field: it writes the TREE, through `control_data_patch_by_slug` on the
  // control slug this page already holds (migration 0060), and the figure comes back as an
  // ordinary update row. Nothing here worked in any deployment until 0060 applied, which it did
  // on the post-land run after pull request 283.
  //
  // The page says as much before the press: a bound field reads out rather than being typed into.
  const boundBox = op.getByTestId('hosted-bound-f5').locator('input');
  await expect(boundBox).toHaveValue('0');
  await expect(boundBox).toHaveJSProperty('readOnly', true);

  const beforeStep = await wireHead(op, hosted);
  const steppedAt = Date.now();
  await op.getByTestId('hosted-live-number-f5-up').click();

  const stepped = await wireAfter(op, hosted, beforeStep, 1);
  timings.push(`bound +1 to its row ${((Date.now() - steppedAt) / 1000).toFixed(1)}s`);
  expect(stepped[0].graphic).toBe(TOTALS);
  expect(stepped[0].kind).toBe('update');
  // Nothing else moved f5, so this figure counts from the seeded zero: the operator's own +1 and
  // nothing else.
  expect(stepped[0].data.f5).toBe('1');
  await expect(boundBox).toHaveValue('1');

  // THE TREE MOVED, read back off the same door the press used, and it is still a NUMBER - so a
  // feed writing the same path does not find a string there.
  const tree = await op.evaluate(async (slug) => {
    const { fetchProductionDataBySlug } = await import('/src/control/productionDataApi.ts');
    return fetchProductionDataBySlug(slug);
  }, hosted);
  expect((tree?.data as { panel?: { katri?: { points?: unknown } } })?.panel?.katri?.points).toBe(1);

  // ── AC-7's other half: EVERY graphic bound to a value follows it ────────────────────────────
  //
  // On the NAME leaf, for the reason written at the top of this file, and through the SAME
  // operator door the stepper just used rather than a different one. One update row per bound
  // graphic is the whole claim: a value entered once shows everywhere it is bound.
  const beforeName = await wireHead(op, hosted);
  await op.evaluate(
    async ({ slug, NAME }) => {
      const { patchProductionDataBySlug } = await import('/src/control/productionDataApi.ts');
      const [root, person, leaf] = NAME.split('.');
      await patchProductionDataBySlug(slug, { [root]: { [person]: { [leaf]: 'Katri V.' } } });
    },
    { slug: hosted, NAME },
  );

  const followed = await wireAfter(op, hosted, beforeName, 2);
  expect(
    followed.map((r) => `${r.graphic}:${r.kind}`).sort(),
    'one update row per graphic bound to the moved value',
  ).toEqual([`${TOTALS}:update`, `${VOTES}:update`]);
  expect(followed.find((r) => r.graphic === VOTES)?.data.f5).toBe('Katri V.');
  expect(followed.find((r) => r.graphic === TOTALS)?.data.f0).toBe('Katri V.');

  // The operator's minute, in the run log. AC-9 asks for the numbers, and a number nobody can
  // read is not evidence.
  console.log(`hosted profile walk: ${timings.join(' | ')}`);

  await opContext.close();
});

/**
 * PUBLISH NOTHING BEHIND US, whether or not the walk got to the end.
 *
 * The account is shared by all 24 specs in this suite and the runner gives them one worker, so a
 * production left published keeps its reserved control and output addresses for whatever runs next
 * (migration 0040). An inline teardown only runs when everything passed, which is precisely the
 * case that does not need it.
 *
 * It is best-effort: on a failure the page may be anywhere, and a teardown that throws would
 * replace the real failure with its own.
 */
test.afterEach(async ({ page }) => {
  try {
    await clearPublishedShows(page);
    await wipeMyGraphics(page);
  } catch {
    /* the walk's own failure is the one worth reporting */
  }
});
