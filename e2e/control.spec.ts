import { test, expect, type Page, type Route } from '@playwright/test';
import { bootstrapGraphic, openExportWindow, skipOldEditor } from './_create';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';

// Era 4: control panels. The modular engine turns a graphic's SPX fields into an operator
// panel — text → input, number → stepper, textarea → line list, image → picker — with no
// per-template code.
//
// SCOREBOARD SCORES ARE NUMBER FIELDS, and this note used to say the opposite. They were
// textfields so an operator could type a composite score like "0 - 0", which reads sensibly
// until you watch someone work: a score is bumped far more often than it is typed, and the
// stepper turns awarding a goal into one press instead of a select-and-retype under pressure.
// The composite case moves to the period or note line, or to a design that declares its own
// fields. The clock deliberately did NOT follow — it parses on ':' and no number input holds
// "43:12" (src/templates/scoreboards/scorebugShared.ts carries the full reasoning).

async function createScoreboard(page: Page) {
  await bootstrapGraphic(page, { category: 'Scoreboards', name: 'Match Strip' });
}

test('control tab live-drives the preview from a field control', async ({ page }) => {
  skipOldEditor();
  await createScoreboard(page);
  await page.getByTestId('dock-tab-control').click();

  // Score A (f1) is a bound NUMBER field; editing it drives the preview live (Live is on).
  // Name the value box rather than taking the first input: a stepper renders the value AND an
  // operator step-size box, so `input` alone passed here by DOM order rather than by intent.
  await page.locator('.field-row', { hasText: 'Score A' })
    .locator('input.ctl-num:not(.ctl-num-step)').fill('7');
  const frame = page.frameLocator('iframe.preview-frame');
  await expect(frame.locator('#f1')).toHaveText('7');

  // The control panel's own Play button plays the graphic out.
  await page.locator('.panel-body').getByRole('button', { name: '▶ Play' }).click();
  await expect
    .poll(async () => frame.locator('.scoreboard').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');
});

test('a number field becomes a +/- stepper (no per-template code)', async ({ page }) => {
  skipOldEditor();
  // A design that SHIPS a genuine wired number field (Election Bars' percent). The old walk
  // added one to a scoreboard through the Data panel - which the panel now refuses, because
  // a scoreboard's fixed contract has no place for it and the add landed definition-only
  // (docs/GOALS_ARCHIVE.md "Student release" step 5). The stepper is this test's subject, not the add.
  await bootstrapGraphic(page, { category: 'infographic', name: 'Election Bars' });
  await page.getByTestId('dock-tab-control').click();
  const row = page.locator('.field-row', { hasText: 'percent' }).first();
  await expect(row.locator('.ctl-step')).toHaveCount(2); // − and +
  const num = row.locator('.ctl-num').first();
  const before = Number(await num.inputValue());
  await row.getByRole('button', { name: '+', exact: true }).click();
  await expect(num).toHaveValue(String(before + 1));
});

test("export bundles controlpanel.html + injects the receiver into the graphic's own html", async ({ page }) => {
  await createScoreboard(page);
  await openExportWindow(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Validate & download/ }).click(),
  ]);
  const zip = await JSZip.loadAsync(readFileSync(await download.path()));
  const names = Object.keys(zip.files);
  expect(names).toContain('match_strip/controlpanel.html');
  // The template file carries the graphic's own name — SPX rundowns list files, and an
  // index.html-per-folder package listed every template as "index".
  expect(names).toContain('match_strip/match_strip.html');

  const index = await zip.file('match_strip/match_strip.html')!.async('string');
  expect(index).toContain('spx-control-receiver');
  expect(index).toContain('new BroadcastChannel');

  const panel = await zip.file('match_strip/controlpanel.html')!.async('string');
  expect(panel).toContain('spx-control-match_strip'); // channel name matches the receiver's
  expect(panel).toContain('"key":"f0"'); // controls are field-derived
});

test('the exported control panel escapes the graphic name (it is the page title)', async ({ page }) => {
  // The panel's <title> and <h1> ARE the graphic name, which for an imported community template
  // is author-controlled — and the page carries the Supabase key and the hosted-control slug, so
  // an unescaped name is a real injection. Everything else on the page rides jsonForScript into
  // the <script>; the name is the one value written as markup.
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });

  const fired = await page.evaluate(async () => {
    const { renderControlPanelHtml } = await import('/src/control/controlPanelHtml.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const base = useTemplateStore.getState().template;
    const evil = {
      ...base,
      name: 'Pwn</title><script>parent.__cpx = 1</script><img src=x onerror="parent.__cpy = 1">',
    };
    const html = renderControlPanelHtml(evil, null, {});

    const w = window as unknown as { __cpx?: number; __cpy?: number };
    w.__cpx = 0;
    w.__cpy = 0;
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:-9999px;width:600px;height:400px';
    document.body.appendChild(f);
    f.contentDocument!.open();
    f.contentDocument!.write(html);
    f.contentDocument!.close();
    await new Promise((r) => setTimeout(r, 400));
    const out = { script: w.__cpx, img: w.__cpy, title: f.contentDocument!.title };
    f.remove();
    return out;
  });

  // Neither injected vector ran, and the name survived intact as plain text.
  expect(fired.script).toBe(0);
  expect(fired.img).toBe(0);
  expect(fired.title).toContain('Pwn</title>');
});

async function createHairline(page: Page) {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
}

test('live data: adding a Google Sheet appends an editable polling block, remove strips it', async ({ page }) => {
  skipOldEditor();
  await createHairline(page);
  await page.getByTestId('dock-tab-control').click();
  await page.getByPlaceholder(/pub\?output=csv/).fill('https://docs.google.com/x/pub?output=csv');
  await page.getByRole('button', { name: 'Add live data' }).click();

  const js1 = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.js;
  });
  expect(js1).toContain('== LIVE DATA');
  expect(js1).toContain('https://docs.google.com/x/pub?output=csv');
  expect(js1).toContain('"f0": "Name"');   // field → header map, seeded from field titles
  await expect(page.locator('.panel-body .status-ok')).toContainText('Live-data block is in the JS');

  await page.getByRole('button', { name: 'Remove' }).click();
  const js2 = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.js;
  });
  expect(js2).not.toContain('== LIVE DATA');
});

test('live data: a published CSV drives the graphic (mocked sheet)', async ({ page }) => {
  skipOldEditor();
  await page.route('http://sheet-test.local/data.csv', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/csv',
      headers: { 'access-control-allow-origin': '*' },
      body: 'Name,Title\nLive Ada,From The Sheet\n',
    }),
  );
  await createHairline(page);
  await page.getByTestId('dock-tab-control').click();
  await page.getByPlaceholder(/pub\?output=csv/).fill('http://sheet-test.local/data.csv');
  await page.locator('.panel-section', { hasText: 'Live data' }).locator('input[type="number"]').fill('1');
  await page.getByRole('button', { name: 'Add live data' }).click();

  // The polling block runs inside the preview and pulls the sheet into the fields.
  const frame = page.frameLocator('iframe.preview-frame');
  await expect(frame.locator('#f0')).toHaveText('Live Ada', { timeout: 6000 });
  await expect(frame.locator('#f1')).toHaveText('From The Sheet');
});

// ── Phase 5: the state machine's side of the panel ──────────────────────────
// A template with an explicit machine grows event buttons GENERATED from it — labels and
// sections from the machine's own `controls` metadata, legality from the graph.

test('the Control tab renders labeled event buttons from the machine and fires them', async ({ page }) => {
  skipOldEditor();
  await bootstrapGraphic(page, { name: 'Arena Quiz' });
  await page.getByTestId('dock-tab-control').click();

  // The quiz type's declared controls, by section, wearing their labels.
  const section = page.locator('.ctl-event-section', { hasText: 'Answer' });
  await expect(section.getByRole('button', { name: '⚡ Select answer' })).toBeVisible();
  await expect(section.getByRole('button', { name: '⚡ Lock it in' })).toBeVisible();
  await expect(section.getByRole('button', { name: '⚡ Reveal correct' })).toBeVisible();

  // Play, then Select — the event rides the store into the preview's machine.
  await page.locator('.ctl-actions').getByRole('button', { name: '▶ Play' }).click();
  await section.getByRole('button', { name: '⚡ Select answer' }).click();
  await expect
    .poll(async () =>
      page.frameLocator('iframe.preview-frame').locator('body').evaluate(() => {
        const w = window as unknown as { noacgMachineState?: () => { groups: Record<string, string> } };
        return w.noacgMachineState?.().groups.main ?? null;
      }),
    )
    .toBe('selected');
});

test('round-trip: the exported panel fires machine events, greys illegal ones, and shows the state', async ({ page, context }) => {
  await bootstrapGraphic(page, { name: 'Arena Quiz' });
  await openExportWindow(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Validate & download/ }).click(),
  ]);
  const zip = await JSZip.loadAsync(readFileSync(await download.path()));
  const files = new Map<string, string>();
  for (const n of Object.keys(zip.files)) {
    if (!zip.files[n].dir) files.set(n.replace(/^arena_quiz\//, ''), await zip.file(n)!.async('string'));
  }
  const serve = (route: Route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\//, '') || 'arena_quiz.html';
    const body = files.get(path);
    if (body == null) return route.fulfill({ status: 404, body: 'nf' });
    const ct = path.endsWith('.css') ? 'text/css' : path.endsWith('.js') ? 'application/javascript' : 'text/html';
    return route.fulfill({ status: 200, contentType: ct, body });
  };

  const graphic = await context.newPage();
  await graphic.route('http://cp-machine.local/**', serve);
  await graphic.goto('http://cp-machine.local/arena_quiz.html', { waitUntil: 'load' });

  const panel = await context.newPage();
  await panel.route('http://cp-machine.local/**', serve);
  await panel.goto('http://cp-machine.local/controlpanel.html', { waitUntil: 'load' });

  const select = panel.getByRole('button', { name: '⚡ Select answer' });
  const lock = panel.getByRole('button', { name: '⚡ Lock it in' });

  // The hello answer arrives with the resting state: everything machine-side is illegal.
  await expect(panel.locator('.state-chip')).toBeVisible();
  await expect(select).toBeDisabled();
  await expect(lock).toBeDisabled();
  // A graphic answered, so the connectivity story is honest the other way too: no
  // "nothing is answering" banner, and the footer reports the live pairing.
  await expect(panel.locator('#nolisten')).toBeHidden();
  await expect(panel.locator('#status')).toContainText('connected');

  // Play → the walk enters the question waypoint; select and lock both become legal (the
  // hidden-pick flow seals straight from the question) while revealChoice stays out — its
  // only arrow leaves `sealed`. The structural guard, mirrored as greying.
  await panel.getByRole('button', { name: '▶ Play' }).click();
  await expect(select).toBeEnabled();
  await expect(lock).toBeEnabled();
  await expect(panel.getByRole('button', { name: '⚡ Reveal choice' })).toBeDisabled();

  // Stage an answer with Live OFF, then Select: the value must land ONLY as the event's
  // payload (the atomic multi-part change), never as a live update.
  await panel.locator('#live').uncheck();
  // A short constrained choice renders as segmented buttons (the A/B/C/D row), not a dropdown.
  await panel.locator('.field', { hasText: 'Selected answer' }).getByRole('button', { name: 'C', exact: true }).click();
  await expect(graphic.locator('#f6')).not.toHaveText('C');
  await select.click();
  await expect(graphic.locator('#f6')).toHaveText('C');
  await expect(lock).toBeEnabled();
  await expect(panel.locator('.state-chip')).toContainText('Answer selected');

  await panel.close();
  await graphic.close();
});

test('the exported panel says so when no graphic is answering (file:// and cross-engine truth)', async ({ page, context }) => {
  // Student-release acceptance finding: opened from disk the panel used to claim
  // "local channel: …" while every post landed nowhere (file:// pages have private origins;
  // OBS/vMix run their own browser engine). The only proof of a listener is a state reply to
  // the hello — silence must surface, not pretend.
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  const panelHtml = await page.evaluate(async () => {
    const { renderControlPanelHtml } = await import('/src/control/controlPanelHtml.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return renderControlPanelHtml(useTemplateStore.getState().template, null, {});
  });

  const lone = await context.newPage();
  await lone.setContent(panelHtml, { waitUntil: 'load' });
  // Before the verdict: an honest "waiting", never a claimed connection.
  await expect(lone.locator('#status')).toContainText('waiting for a graphic');
  await expect(lone.locator('#nolisten')).toBeHidden();
  // After the grace period with nobody answering, the banner explains what is wrong.
  await expect(lone.locator('#nolisten')).toBeVisible({ timeout: 6000 });
  await expect(lone.locator('#nolisten')).toContainText('No graphic is answering');
  await expect(lone.locator('#nolisten')).toContainText('file://');
  await lone.close();
});

test('staging + event log: staged data airs only on take, and refresh recovers both sides', async ({ page, context }) => {
  await bootstrapGraphic(page, { name: 'Arena Quiz' });
  await openExportWindow(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Validate & download/ }).click(),
  ]);
  const zip = await JSZip.loadAsync(readFileSync(await download.path()));
  const files = new Map<string, string>();
  for (const n of Object.keys(zip.files)) {
    if (!zip.files[n].dir) files.set(n.replace(/^arena_quiz\//, ''), await zip.file(n)!.async('string'));
  }
  const serve = (route: Route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\//, '') || 'arena_quiz.html';
    const body = files.get(path);
    if (body == null) return route.fulfill({ status: 404, body: 'nf' });
    const ct = path.endsWith('.css') ? 'text/css' : path.endsWith('.js') ? 'application/javascript' : 'text/html';
    return route.fulfill({ status: 200, contentType: ct, body });
  };

  const graphic = await context.newPage();
  await graphic.route('http://cp-rec.local/**', serve);
  await graphic.goto('http://cp-rec.local/arena_quiz.html', { waitUntil: 'load' });
  const panel = await context.newPage();
  await panel.route('http://cp-rec.local/**', serve);
  await panel.goto('http://cp-rec.local/controlpanel.html', { waitUntil: 'load' });

  const machineStateOf = () =>
    graphic.evaluate(() => {
      const w = window as unknown as { noacgMachineState?: () => { groups: Record<string, string> } };
      return w.noacgMachineState?.().groups.main ?? null;
    });

  // On air: play, then select answer C via the event payload (staged with Live off).
  await panel.getByRole('button', { name: '▶ Play' }).click();
  await panel.locator('#live').uncheck();
  // Segmented buttons, not a dropdown — the same constrained-choice rule as the app.
  await panel.locator('.field', { hasText: 'Selected answer' }).getByRole('button', { name: 'C', exact: true }).click();
  await expect(panel.locator('.staged-chip')).toBeVisible(); // typed ≠ aired
  await panel.getByRole('button', { name: '⚡ Select answer' }).click();
  await expect(graphic.locator('#f6')).toHaveText('C');
  await expect(panel.locator('.staged-chip')).toBeHidden(); // the payload took it on air

  // Stage a question edit WITHOUT taking: it must not reach the graphic.
  const question = panel.locator('.field', { hasText: 'Question' }).locator('input[type="text"]');
  await question.fill('Staged, not aired');
  await expect(panel.locator('.staged-chip')).toBeVisible();
  await expect(graphic.locator('#f0')).not.toHaveText('Staged, not aired');

  // ── The graphic crashes (browser-source refresh): the panel's log rebuilds it — the
  // aired data (answer C, not the staged question) and a snap back to `selected`.
  await graphic.reload({ waitUntil: 'load' });
  await expect.poll(machineStateOf).toBe('selected');
  await expect(graphic.locator('#f6')).toHaveText('C');
  await expect(graphic.locator('#f0')).not.toHaveText('Staged, not aired');

  // Explicit take airs the staged question.
  await panel.getByRole('button', { name: '⟳ Take' }).click();
  await expect(graphic.locator('#f0')).toHaveText('Staged, not aired');
  await expect(panel.locator('.staged-chip')).toBeHidden();

  // ── The PANEL refreshes: it resumes from its log — sent values in the fields, the last
  // known state on the chip, legality right (lock is legal from `selected`).
  await panel.reload({ waitUntil: 'load' });
  // The segmented row recovers its selection from the log — C wears the active mark.
  await expect(panel.locator('.field', { hasText: 'Selected answer' }).locator('.seg button.on')).toHaveText('C');
  await expect(panel.locator('.field', { hasText: 'Question' }).locator('input[type="text"]')).toHaveValue('Staged, not aired');
  await expect(panel.locator('.state-chip')).toContainText('Answer selected');
  await expect(panel.getByRole('button', { name: '⚡ Lock it in' })).toBeEnabled();

  await panel.close();
  await graphic.close();
});

test('round-trip: the exported control panel drives the exported graphic over the channel', async ({ page, context }) => {
  await createScoreboard(page);
  await openExportWindow(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Validate & download/ }).click(),
  ]);
  const zip = await JSZip.loadAsync(readFileSync(await download.path()));
  const files = new Map<string, string>();
  for (const n of Object.keys(zip.files)) {
    if (!zip.files[n].dir) files.set(n.replace(/^match_strip\//, ''), await zip.file(n)!.async('string'));
  }

  // Serve both files from ONE origin so they share the BroadcastChannel (same-origin).
  const serve = (route: Route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\//, '') || 'match_strip.html';
    const body = files.get(path);
    if (body == null) return route.fulfill({ status: 404, body: 'nf' });
    const ct = path.endsWith('.css') ? 'text/css' : path.endsWith('.js') ? 'application/javascript' : 'text/html';
    return route.fulfill({ status: 200, contentType: ct, body });
  };

  const graphic = await context.newPage();
  await graphic.route('http://cp-rt.local/**', serve);
  await graphic.goto('http://cp-rt.local/match_strip.html', { waitUntil: 'load' });

  const panel = await context.newPage();
  await panel.route('http://cp-rt.local/**', serve);
  await panel.goto('http://cp-rt.local/controlpanel.html', { waitUntil: 'load' });

  // Drive from the control panel: type a score (Live is on → posts immediately), then Play.
  // The score is a number field, so the panel renders a stepper — the value box and a step-size
  // box share the class, so exclude the one that sets the increment.
  await panel.locator('.field', { hasText: 'Score A' })
    .locator('input.num-input:not([title="step size"])').fill('7');
  await panel.getByRole('button', { name: '▶ Play' }).click();

  // The graphic reacted over the channel.
  await expect(graphic.locator('#f1')).toHaveText('7');
  await expect
    .poll(async () => graphic.locator('.scoreboard').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');

  await panel.close();
  await graphic.close();
});
