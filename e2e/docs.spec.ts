import { test, expect } from '@playwright/test';

// The public docs home lives at /docs (docs.html - static, indexed, no React; the tenth MPA
// entry). Dev/preview serve the clean URL through the app-clean-url Vite plugin, production
// through Vercel cleanUrls, so this spec walking `/docs` is what keeps the route real in
// both worlds. Content assertions pin the load-bearing lines of each guide: the page's whole
// job is that a beginner can follow them cold, and a guide that silently lost its command or
// its honesty note is a broken promise, not a styling bug.

test('/docs serves the static docs home, not the app', async ({ page }) => {
  await page.goto('/docs');
  await expect(page.locator('h1')).toContainText('Guides');
  // Static page: no React mount points, no wizard.
  await expect(page.locator('#root')).toHaveCount(0);
  await expect(page.locator('.wz-modal')).toHaveCount(0);
  // Public and indexed: a noindex here would silently delist the whole surface.
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
});

test('every section-nav link points at a section that exists', async ({ page }) => {
  await page.goto('/docs');
  const links = page.locator('.doc-nav a[href^="#"]');
  const count = await links.count();
  expect(count).toBeGreaterThanOrEqual(8);
  for (let i = 0; i < count; i++) {
    const href = await links.nth(i).getAttribute('href');
    await expect(page.locator(`section[id="${href!.slice(1)}"]`)).toHaveCount(1);
  }
});

test('the graphics shelf holds one guide per kind', async ({ page }) => {
  await page.goto('/docs');
  const graphics = page.locator('#graphics');
  // The kinds are guides INSIDE one section now, because the left nav carries main topics only
  // (owner, 2026-08-26: end credits and tickers as top-level entries confused it). Their
  // anchors are what the rest of the repo links to, so they have to survive the nesting.
  for (const id of ['scoreboards', 'quiz', 'end-credits', 'tickers', 'countdowns']) {
    await expect(graphics.locator(`[id="${id}"]`)).toHaveCount(1);
  }
  // Quizzes and game shows are what the 2026-09-12 student production runs on, so the buttons
  // an operator presses are named here or the guide is decoration.
  await expect(graphics).toContainText('Lock it in');
  await expect(graphics).toContainText('Reveal correct');
  // The scoreboard's one non-obvious behaviour: the goal press moves the score with it.
  await expect(graphics).toContainText('Goal A');
  // And the two text-box formats keep the rule each of them turns on.
  await expect(graphics).toContainText('A colon ends a role');
  await expect(graphics).toContainText('A colon ends a kicker');
  // The countdown guide turns on one fact: a timer's content is a LENGTH, and the length is
  // read with parseFloat, so a colon truncates it silently (templates/shared/clock.ts
  // clockDurationSeconds). A reader who types the digits they want on screen gets two minutes
  // and no error, which is the mistake the guide exists to stop.
  await expect(graphics).toContainText('is two minutes, not two and a half');
  // The other half: the length has nowhere visible to go, and the class is what hides it. An
  // inline display:none is cleared by the entrance reset and airs the raw number
  // (templates/shared/base.ts DATA_SOURCE_CLASS), so the class name is load-bearing copy.
  await expect(graphics).toContainText('noacg-data-source');
});

test('the four guides carry their load-bearing content', async ({ page }) => {
  await page.goto('/docs');

  // (a) Coding agents: the one install command that has to work when copied cold, plus the
  // loop's verbs.
  const agents = page.locator('#claude-code');
  // The lead is one paste-to-agent prompt, and the warning that the user approves the installs
  // it runs belongs beside it rather than only inside the pasted text.
  await expect(agents).toContainText('Paste this to your agent');
  await expect(agents).toContainText('install commands that you have to approve');
  await expect(agents).toContainText('npm i -g @noacg/cli');
  await expect(agents).toContainText('scaffold');
  await expect(agents).toContainText('validate');
  await expect(agents).toContainText('save');
  await expect(agents).toContainText('Claude Code');

  // (b) CasparCG: the live-link command, and the honesty note. The connect feature has not
  // yet driven a real server, and the docs must stay true on the day someone tries it.
  const caspar = page.locator('#casparcg');
  await expect(caspar).toContainText('CG 1-20 ADD 1');
  await expect(caspar).toContainText('not yet driven a real CasparCG server');

  // (c) Browser sources: the rules that make or break an OBS/vMix setup.
  const browser = page.locator('#browser-source');
  await expect(browser).toContainText('Shutdown source when not visible');
  await expect(browser).toContainText('vMix');

  // (d) SVG authoring: the rule the whole feature turns on.
  const svg = page.locator('#svg');
  await expect(svg).toContainText('Keep text as text');
  await expect(svg).toContainText('Illustrator');

  // (e) The live vote's two layer names. The owner asked how you draw a board so the importer
  // reads it as a vote, and the answer is these two names and nothing else - so they are the
  // load-bearing content of that subsection in the way the install command is of (a). The
  // anchor is asserted too, because #audience and #behaviour both link to it and a broken
  // in-page link is silent.
  await expect(svg.locator('[id="svg-vote"]')).toHaveCount(1);
  await expect(svg).toContainText('Option 1');
  await expect(svg).toContainText('Bar 1');
  // And the trap that turns a correct-looking board into a wrong one, which is the half no
  // other page carries.
  await expect(svg).toContainText('read as one more');
});

// The chooser page. The rest of "Connect playout" documents how to play a package; this one is
// the question asked before any of that, and its whole job is that a reader finds the row for
// the system they already run. A host missing from the table is a reader with nowhere to go, so
// every target the product exports to is named here or this fails.
test('the package chooser names every export target, and the live route first', async ({ page }) => {
  await page.goto('/docs');
  const chooser = page.locator('#export');
  // Every host in export/registry.ts EXPORT_TARGETS, as a HAND-KEPT list. The registry cannot
  // be imported here - it reaches `../assets/gsap.min.js?raw`, a Vite-only specifier that
  // Playwright's transform does not resolve - so this does not catch a SEVENTH target added
  // without a row. It catches a row being lost from the six that exist, which is the likelier
  // edit; adding a target means adding it here too.
  for (const host of ['OBS', 'vMix', 'CasparCG', 'SPX', 'OGraf', 'LiveOS', 'H2R']) {
    await expect(chooser).toContainText(host);
  }
  // The honest lead: a production driven from NoaCG needs no package at all, and a reader who
  // downloads one for a show this page is about to run live has been sent the wrong way.
  await expect(chooser).toContainText('are you exporting at all');
  await expect(chooser.locator('a[href="#dashboard"]')).toHaveCount(1);
  // The two hosts that have their own guide are handed to it rather than re-explained.
  await expect(chooser.locator('a[href="#browser-source"]')).toHaveCount(1);
  await expect(chooser.locator('a[href="#casparcg"]')).toHaveCount(1);
});

// The non-SVG artwork guide. An SVG keeps its text and gets its own section; this one is for
// everything a reader actually turns up holding - a logo, a photograph, a Lottie file - and its
// value is the three facts nothing in the product says out loud.
test('the artwork guide carries the three facts a picture brings with it', async ({ page }) => {
  await page.goto('/docs');
  const artwork = page.locator('#artwork');

  // (a) A MISSING FONT IS SILENT. font-display: swap paints the fallback stack and keeps going
  // (export/bundledFonts.ts measured the heading's ink width moving ~5 px), so the only symptom
  // is a graphic that airs in the wrong face. Nothing warns; the page is the warning.
  await expect(artwork).toContainText('A missing font is silent');

  // (b) The exported operator page's image picker offers the pictures THAT GRAPHIC carries plus
  // None (control/controlPanelHtml.ts emitGraphic), which is not what "swap the file at playout"
  // leads a reader to expect. Getting this wrong is discovered on the night.
  await expect(artwork).toContainText('that graphic already carries');

  // (c) A Lottie autoplays and loops from load (blocks/lottieInsert.ts LOTTIE_BOOTSTRAP), so it
  // is not a thing you cue. A reader who reaches for one to hit a beat needs to know before
  // they build the graphic around it.
  await expect(artwork).toContainText('plays as soon as the graphic loads and it loops');

  // The guide hands the font-file case to the SVG guide rather than repeating it, so the target
  // of that link has to exist - an in-page link that goes nowhere is silent.
  await expect(artwork.locator('a[href="#svg-fonts"]')).toHaveCount(1);
  await expect(page.locator('[id="svg-fonts"]')).toHaveCount(1);
});

// The end-to-end walk. Every other guide on this page answers one question; this one is the only
// page that carries the whole road, so what it has to keep is (a) the shape of the walk, (b) the
// three moments where the product does something a reader would otherwise take for a fault, and
// (c) the handoffs, because this guide's job is to be short and point.
test('the step-by-step walk keeps the road, the three surprises and its handoffs', async ({ page }) => {
  await page.goto('/docs');
  const walk = page.locator('#first-graphic');

  // (a) The five steps, in order, by the names the wizard's own rail uses. A renamed step leaves
  // a reader looking for a heading that is not on their screen, which is the failure this guide
  // exists to prevent, and nothing else on the page names them. The NUMBERS are in the strings on
  // purpose: "Start" and "Finish" occur in the prose either side of the table, so the bare words
  // would keep passing after the table itself was deleted.
  for (const step of ['1. Start', '2. Design', '3. Fields', '4. Animation', '5. Finish']) {
    await expect(walk.locator('.doc-table')).toContainText(step);
  }

  // (b1) THE RAIL RENUMBERS. Measured 2026-09-09: the wizard opens on a six-step rail and an SVG
  // drop collapses it to five by removing Prepare (CreationWizard's step set is per file kind).
  // A reader who read the rail one second earlier sees different numbers and no explanation.
  await expect(walk).toContainText('Prepare');
  await expect(walk).toContainText('nothing to erase');

  // (b2) THE CANVAS LOCKS ONCE ARTWORK IS IN. Quoted from the app verbatim, so a reader searching
  // the sentence they are staring at lands here. A vertical graphic decided after the drop means
  // starting again, which is expensive to discover on your own.
  await expect(walk).toContainText('Remove the current artwork before changing its authored canvas');

  // (b3) A TYPED CHANGE DOES NOT AIR ON ITS OWN. The dashboard stages edits and says
  // "1 change not on air yet" until Update. An operator who does not know that airs the previous
  // guest's name, on air, and blames the graphic.
  await expect(walk).toContainText('1 change not on air yet');
  await expect(walk).toContainText('Update');

  // The Finish step's two doors, and the trap of its two name boxes. Both are the last thing a
  // first-time reader meets and neither is guessable from the screen.
  await expect(walk).toContainText('two name boxes and they are not the same box');
  await expect(walk).toContainText('Add to the production');
  await expect(walk).toContainText('Export it');
  // And the one thing on that screen that can cost a first-timer their work: `Create project`
  // calls `create` (CreationWizard.tsx), which hands the graphic to the editor WITHOUT saving,
  // while both Finish doors save first. A reader who takes it for a harmless "keep the defaults"
  // shortcut can close the tab on an unsaved graphic.
  await expect(walk).toContainText('it does not save');

  // (c) The handoffs. This guide stays short by pointing, so a link that goes nowhere is the one
  // failure that makes it worse than no guide. In-page anchors are silent when they break.
  // `.first()` rather than a count, because the guide legitimately links the same target twice
  // (the SVG rules, once for the file and once for outlined type); what has to hold is that at
  // least one link exists and that its target does.
  for (const href of ['#svg-rules', '#svg-layers', '#artwork', '#behaviour', '#svg-fonts', '#export', '#dashboard']) {
    await expect(walk.locator(`a[href="${href}"]`).first()).toBeAttached();
    await expect(page.locator(`[id="${href.slice(1)}"]`)).toHaveCount(1);
  }
  // And the door into the product, so the walk can actually be started from it.
  await expect(walk.locator('a[href="/app#/new"]').first()).toBeAttached();

  // Getting started is where a cold reader lands, and its three list items are the outline this
  // guide expands. The link between them is what stops the outline reading as the whole answer.
  await expect(page.locator('#getting-started a[href="#first-graphic"]')).toHaveCount(1);
  // The SVG guide is about the FILE and hands the road over rather than growing a second copy.
  await expect(page.locator('#svg a[href="#first-graphic"]')).toHaveCount(1);
});

// Working with other people. This guide is the only page that says what a TEAM is, and it is
// written while half the feature is still staged, so the load-bearing content is not the happy
// path - it is the boundary. A reader who follows it and expects a shared production gets a
// disabled button and no explanation, which is the one failure this section exists to prevent.
test('the teams guide sends people down the route that exists, and says which one does not', async ({ page }) => {
  await page.goto('/docs');
  const teams = page.locator('#teams');

  // (a) THE DOOR IS A PRODUCTION, and nothing else. `useTeamsAvailable` gates two mount points
  // (ProductionPage's header and ProductionsSection's row menu) and there is no team entry in the
  // topbar or in Settings, so a reader hunting for one finds nothing and concludes the feature is
  // missing. The label is quoted exactly as the button renders it.
  await expect(teams).toContainText('Share with a team');
  await expect(teams).toContainText('a production is the only door');

  // (b) THE LINK IS THE ROUTE, THE CODE IS NOT. `JoinTeamDialog` is reachable only at
  // `#/join-team/<code>` (App.tsx renders it purely from the route), so nowhere in the app takes a
  // typed code. The share dialog shows the code in the largest type on the screen, which is
  // exactly why the guide has to say it: the owner walked this on 2026-09-04 and could not work
  // out what the code was for.
  await expect(teams).toContainText('field for typing a bare code');
  await expect(teams).toContainText('There is no email invitation');

  // (c) THE HONEST BOUNDARY. `move-to-team` is present and disabled until stage 4 ships
  // (docs/TEAMS_PLAN.md §7), so a guide that described a shared production as working would be a
  // false claim on the one page a teacher reads before a class. Delete this assertion in the same
  // commit that enables the button, never before it.
  await expect(teams).toContainText('Moving a production into a team does not');

  // (d) The two rules a reader cannot guess from the screen and cannot recover from. An owner has
  // no Leave button at all (backend/teams.ts leaveTeam refuses it, and the dialog draws Delete
  // team instead), and deleting takes the team's productions with it.
  await expect(teams).toContainText('An owner gets out by deleting the team');
  await expect(teams).toContainText('takes the productions the team holds with it');

  // (e) The handoffs. The section's first answer is that operating together needs no accounts at
  // all, which is only useful if the link to that road works - an in-page anchor is silent when it
  // breaks.
  for (const href of ['#dashboard', '#audience']) {
    await expect(teams.locator(`a[href="${href}"]`).first()).toBeAttached();
    await expect(page.locator(`[id="${href.slice(1)}"]`)).toHaveCount(1);
  }
  // And the nav carries it, because the section is reached by scrolling otherwise.
  await expect(page.locator('.doc-nav a[href="#teams"]')).toHaveCount(1);
});
// The SVG guide is the one page read by somebody who has never opened the product, which is why
// it is the page that carries screenshots. They are generated by `node scripts/docs-shots.mjs`
// and committed, so the failure mode is a RENAMED FILE rather than a broken layout: the page
// still reads fine with three empty frames in it, and nothing else would say so. Checking that
// each one decoded is the whole point - a 404 gives a zero natural width.
test('the SVG guide ships its screenshots, and every one of them loads', async ({ page }) => {
  await page.goto('/docs');
  const shots = page.locator('#svg .doc-shot img');
  await expect(shots).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    const img = shots.nth(i);
    // `loading="lazy"` means nothing fetches until the frame is near the viewport.
    await img.scrollIntoViewIfNeeded();
    await expect(img).toHaveJSProperty('complete', true);
    const natural = await img.evaluate((el: HTMLImageElement) => ({
      width: el.naturalWidth, height: el.naturalHeight,
    }));
    expect(natural.width).toBeGreaterThan(0);
    // The DECLARED size has to match the real one. Each frame hard-codes width/height so the
    // page reserves the right box before the lazy image arrives, which means a regenerated
    // screenshot of a different shape ships SQUASHED and still decodes fine - and since
    // 2026-08-30 a change under public/docs/ plans only this spec and the landing one, so this
    // is the gate. Nothing else in the repo compares the two. The zero check above stays: a
    // missing attribute reads back as 0, which would otherwise match a 404's natural size.
    expect(natural).toEqual({
      width: Number(await img.getAttribute('width')),
      height: Number(await img.getAttribute('height')),
    });
    // Alt text is the caption for anyone who cannot see the picture, and the one thing about a
    // screenshot that no gate other than a person would otherwise catch.
    expect((await img.getAttribute('alt'))?.length ?? 0).toBeGreaterThan(20);
  }
});

test('every command block is one copy-paste, with a copy button', async ({ page }) => {
  await page.goto('/docs');
  const blocks = page.locator('.doc-body pre');
  const count = await blocks.count();
  expect(count).toBeGreaterThanOrEqual(10);
  // src/docs/docs.ts wraps each <pre> and adds the button; the page is complete without it,
  // so a broken module shows up here rather than as a silently unhelpful page.
  await expect(page.locator('.doc-body .cmd')).toHaveCount(count);
  await expect(page.locator('.doc-body .cmd-copy')).toHaveCount(count);

  // The bootstrap prompt is the block a beginner copies first, so prove that button really
  // writes the whole prompt to the clipboard - all four steps, not a truncated first line.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const bootstrap = page.locator('#claude-code .cmd').first();
  await expect(bootstrap.locator('pre')).toHaveClass(/prompt/);
  await bootstrap.locator('.cmd-copy').click();
  await expect(bootstrap.locator('.cmd-copy')).toHaveText('Copied');
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain('Set up NoaCG Studio');
  expect(clipboard).toContain('claude plugin install noacg@noacg-studio');
  expect(clipboard).toContain('codex plugin add noacg@noacg-studio');
  // The npx fallback is the reason the prompt exists: a freshly installed plugin only loads in
  // the next session, so the current one has to work without it.
  expect(clipboard).toContain('npx -y @noacg/cli doctor');
  // The angle brackets are written as entities in the markup; the clipboard must carry the
  // characters, or the pasted prompt tells the agent to type "&lt;dir&gt;".
  expect(clipboard).toContain('npx -y @noacg/cli save <dir>');
});

test('the agent guide offers both install routes, and they are the real ones', async ({ page }) => {
  await page.goto('/docs');
  const agents = page.locator('#claude-code');
  // The plugin route is the one that carries the skill and the /noacg:graphic command, so it
  // leads. `owner/repo` is the documented GitHub shorthand and the marketplace name comes from
  // the `name` field in .claude-plugin/marketplace.json - if either half drifts the command
  // silently installs nothing (owner, 2026-08-26: a personal handle here is fine, it is normal
  // practice; what is not fine is the guide not working).
  await expect(agents).toContainText('claude plugin marketplace add NoaCG/NoaCG-Studio');
  await expect(agents).toContainText('claude plugin install noacg@noacg-studio');
  // Codex installs the same plugin from the same root marketplace manifest, which is what
  // replaced the manual `~/.codex/skills/` copy and the separate `codex mcp add`. Both halves
  // are pinned for the same reason as the Claude pair: a drift here installs nothing, silently.
  await expect(agents).toContainText('codex plugin marketplace add NoaCG/NoaCG-Studio');
  await expect(agents).toContainText('codex plugin add noacg@noacg-studio');
  // The server on its own stays documented for people who do not want the skill.
  await expect(agents).toContainText('claude mcp add noacg -- npx -y @noacg/cli mcp');
  // Owner, 2026-08-28: the one bootstrap prompt leads and the per-agent commands move down into
  // Reference, deleted nowhere. Both halves are pinned, because the value of the move is that
  // nothing was lost - a reader who wants to run the commands by hand still finds them.
  const reference = page.locator('#claude-code h3#agent-setup');
  await expect(reference).toHaveText('Reference');
  await expect(page.locator('#claude-code .cmd').first().locator('pre')).toHaveClass(/prompt/);
});

test('Getting started points a coding-agent owner at the CLI', async ({ page }) => {
  await page.goto('/docs');
  // Owner, 2026-08-29: "we should inform people to use the NoaCG CLI tool straight from their
  // own Claude Code or Codex". The agent guide already existed, at the bottom, under "For
  // developers" - the last place a reader with Claude Code open would scroll to. So the route
  // is named on the FIRST section too, and this pins that it stays there: the callout, both
  // agent names, and a link that actually reaches the guide rather than restating it.
  const callout = page.locator('#getting-started .callout');
  await expect(callout).toHaveCount(1);
  await expect(callout).toContainText('Claude Code');
  await expect(callout).toContainText('Codex');
  await expect(callout).toContainText('NoaCG CLI');
  await expect(callout.locator('a[href="#claude-code"]')).toHaveCount(1);
  // The install commands stay in ONE place. A second copy here is the thing that goes stale.
  await expect(callout).not.toContainText('npx');
});

test('the docs page routes back into the product', async ({ page }) => {
  await page.goto('/docs');
  // At least one door into the studio, and it opens the creation wizard like the landing's CTAs.
  await expect(page.locator('a[href="/app#/new"]').first()).toBeVisible();
});
