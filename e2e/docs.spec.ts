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

test('the top bar is the landing top bar, with a readable button', async ({ page }) => {
  await page.goto('/docs');
  const nav = page.locator('header.top nav');
  await expect(nav.locator('a')).toHaveText(['How it works', 'Going live', 'OGraf', 'Docs', 'Contact', 'Start creating']);
  await expect(nav.locator('a[aria-current="page"]')).toHaveAttribute('href', '/docs');
  // The header's link colour once outranked the button's own, which painted the label grey on
  // amber. The label has to stay the landing's near-black.
  const button = nav.locator('a.btn-amber');
  await expect(button).toHaveAttribute('href', '/app#/new');
  await expect(button).toHaveCSS('color', 'rgb(20, 16, 10)');
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

// The Graphics topic: how to import an SVG, then one page per graphic type (owner, 2026-09-21:
// "a user should open the docs, find a scoreboard, click on that, and see how it should be laid
// out"). Each type is its own nested section so the left nav can link straight to it, and each
// one carries its example file, its layer panel and its layer names.
test('the graphics topic has one page per type, each with its file, layers and names', async ({ page }) => {
  await page.goto('/docs');
  const graphics = page.locator('#graphics');
  // The anchors are what the rest of the repo and the app link to (ImportDesignStep links
  // #svg), so every one of them has to survive inside the topic.
  for (const id of ['first-graphic', 'svg', 'svg-layers', 'svg-rules', 'svg-export', 'svg-fonts', 'first-air']) {
    await expect(graphics.locator(`[id="${id}"]`)).toHaveCount(1);
  }
  const types: [string, string, string[]][] = [
    ['scoreboards', 'scoreboard.svg', ['Team 1', 'Score 1', 'Flash 1', 'Full time']],
    ['quiz', 'quiz.svg', ['Question', 'Answer A', 'Selected A', 'Correct A', 'Wrong A', 'Locked in']],
    ['svg-vote', 'live-vote.svg', ['Option 1', 'Bar 1', 'Percent 1', 'Winner 1', 'Vote badge']],
    ['countdowns', 'countdown.svg', ['05:00', 'Timer bar', 'Warning', 'Paused', 'Time up']],
    ['end-credits', 'end-credits.svg', ['Director name', 'static:Director']],
    ['tickers', 'ticker.svg', ['Kicker', 'Story']],
  ];
  for (const [id, file, names] of types) {
    const type = graphics.locator(`section[id="${id}"]`);
    await expect(type).toHaveCount(1);
    // The nav reaches the page directly.
    await expect(page.locator(`.doc-nav a[href="#${id}"]`)).toHaveCount(1);
    // The example is downloadable and is really served: a 404 here is a reader told to
    // download a file that does not exist.
    const link = type.locator(`a[href="/docs/examples/${file}"]`);
    await expect(link).toHaveCount(1);
    const res = await page.request.get(`/docs/examples/${file}`);
    expect(res.status()).toBe(200);
    // The layer panel and the names list both name every layer the guide promises, and the
    // panel shows the one tree shape every type shares: Text on top, then Moments where the type
    // has any, then Board (docs/backlog/one-layer-naming-system-for-every-graphic.md).
    await expect(type.locator('.layers')).toHaveCount(1);
    for (const name of names) await expect(type).toContainText(name);
    const layers = type.locator('.layers > ul > li > .lyr .nm');
    const top = await layers.allTextContents();
    expect(top[0]).toBe('Text');
    expect(top[top.length - 1]).toBe('Board');
    expect(top.length === 3 ? top[1] : 'Moments').toBe('Moments');
  }
  // ONE example file per type, so a student never meets two structures for the same graphic
  // (owner, 2026-09-21). The lower-third variants are gone and stay gone.
  await expect(page.locator('a[href*="lower-third"]')).toHaveCount(0);
  // The Layer names page opens with the system: the three layers, the row rule, one full tree
  // and the table of every name, generated from words.json so it cannot drift from the matcher.
  const layerNames = page.locator('#svg-layers');
  await expect(layerNames.locator('#svg-layers-system')).toHaveCount(1);
  await expect(layerNames).toContainText('A name is a word and a row');
  await expect(layerNames).toContainText('The spelling does not matter, the words do');
  await expect(layerNames.locator('.layers')).toHaveCount(1);
  await expect(layerNames.locator('table.doc-words .doc-words-type')).toHaveCount(11);
  await expect(layerNames.locator('table.doc-words')).toContainText('Selected A');
  await expect(layerNames.locator('table.doc-words')).toContainText('Vastaus A');
  // The operator's buttons are named, or a type page is decoration.
  await expect(graphics).toContainText('Lock it in');
  await expect(graphics).toContainText('Reveal correct');
  await expect(graphics).toContainText('New game');
  await expect(graphics).toContainText('Call the winner');
  // The two text-box formats keep the rule each of them turns on.
  await expect(graphics).toContainText('A colon ends a role');
  await expect(graphics).toContainText('A colon ends a kicker');
  // A timer's content is a LENGTH read with parseFloat, so a colon truncates it silently
  // (templates/shared/clock.ts clockDurationSeconds). The guide exists to stop that mistake.
  await expect(graphics).toContainText('is two minutes, not two and a half');
  // The rules the whole import turns on: text stays text, and a moment layer is a hidden GROUP
  // because a hidden shape on its own is in no picker (svgImport.ts collects visible shapes only).
  await expect(graphics).toContainText('Keep text as text');
  await expect(graphics).toContainText('Illustrator');
  await expect(page.locator('#svg-layers')).toContainText('A hidden shape on its own is');
  // Measured on Illustrator 30.1 (2026-09-21): Export As writes no hidden layer at all, and the
  // legacy Save a Copy > SVG keeps them as a display:none class. The guide has to say which.
  await expect(page.locator('#svg')).toContainText('Save a Copy');
  await expect(page.locator('#svg')).toContainText('Use Artboards');
  await expect(page.locator('#svg-layers')).toContainText('Export As');
});

// A same-origin link with `download` saves the file even though the server says
// `Content-Disposition: inline` (noacg.studio does, measured 2026-09-21): the attribute decides.
// A reader who is told to download a file and gets a page of SVG markup instead is stuck.
test('an example link downloads the file rather than opening it', async ({ page }) => {
  await page.goto('/docs');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#svg-layers-files a[href="/docs/examples/quiz.svg"]').click(),
  ]);
  expect(download.suggestedFilename()).toBe('quiz.svg');
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

// The import walk. Short on purpose: the steps by the names the wizard uses, the two moments a
// reader would otherwise take for a fault (the canvas locks, a typed change does not air on its
// own), the Skip to finish shortcut, and the handoffs.
test('the import walk keeps its steps, its two surprises and its handoffs', async ({ page }) => {
  await page.goto('/docs');
  const walk = page.locator('#first-graphic');
  await expect(walk).toContainText('No account is needed until you publish');
  for (const step of ['Import graphic', 'Project format', 'Fields', 'What it does', 'Animation', 'Finish']) {
    await expect(walk).toContainText(step);
  }
  // Quoted from the app verbatim, so a reader searching the sentence lands here.
  await expect(walk).toContainText('Remove the current artwork before changing its authored canvas');
  await expect(walk).toContainText('1 change not on air yet');
  await expect(walk).toContainText('Update');
  await expect(walk).toContainText('Add to the production');
  await expect(walk).toContainText('Export it');
  // The footer shortcut goes to Finish, where both doors save (CreationWizard.tsx). Until
  // 2026-09-21 it was "Create project", which opened the code editor and saved nothing, and
  // the walk no longer names that door at all.
  await expect(walk).toContainText('Skip to finish');
  await expect(walk).not.toContainText('Create project');
  for (const href of ['#dashboard', '/app#/new']) {
    await expect(walk.locator(`a[href="${href}"]`).first()).toBeAttached();
  }
  await expect(page.locator('#getting-started a[href="#first-graphic"]')).toHaveCount(1);
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
  // And the consequence for the reader this section is written for. A student who joins a class
  // team and owns nothing cannot reach the dialog at all, so every Yes in the roles table carries
  // that condition. Without this line the table promises a member three things they cannot do.
  await expect(teams).toContainText('you need a production of your own to open');

  // (b) THE LINK IS THE ROUTE, AND A CODE ALONE IS NOT. `JoinTeamDialog` is reachable only at
  // `#/join-team/<code>` (App.tsx renders it purely from the route), so a code has nowhere to go
  // unless the reader already holds a link. The share dialog prints the code in the largest type
  // on the screen, which is exactly why the guide has to say this: the owner walked it on
  // 2026-09-04 and could not work out what the code was for.
  await expect(teams).toContainText('gets nobody in who does not already hold a link');
  await expect(teams).toContainText('There is no email invitation');
  // The other half of the same fact, which is a security note rather than a convenience one: the
  // join screen's code field IS editable (`data-testid="join-team-code"`), so anybody who has ever
  // held a link to any team can redeem a code they overheard. A guide that said a bare code is
  // useless would be telling a teacher that reading one out is safe.
  await expect(teams).toContainText('one paste away');

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

// THE WORKED EXAMPLE (#data-example, #audience-no-chat). The owner's read on 2026-09-16 was
// that production data, bindings and tables are "a bit confusing - how are those supposed to be
// used?", and the page had no concrete example of any of them: tables were not documented
// anywhere at all. This section is one show carrying all three, so what it must keep is the
// example's own nouns. A reader copies them literally, and a screenshot is a photograph of them.
test('the worked example carries one show a reader can copy exactly', async ({ page }) => {
  await page.goto('/docs');
  const example = page.locator('#data-example');

  // (a) THE ADDRESSES, and `#data-example` is load-bearing OUTSIDE this page: the Data tab's
  // "How this tab works" drawer ends with a link to it (ProductionDataPanel.tsx), so renaming
  // the section breaks a link inside the product. `#audience-no-chat` is what the Audience
  // section above hands off to. Pinned here so both survive a restructure of the headings.
  await expect(page.locator('section[id="data-example"]')).toHaveCount(1);
  await expect(example.locator('[id="audience-no-chat"]')).toHaveCount(1);
  await expect(page.locator('.doc-nav a[href="#data-example"]')).toHaveCount(1);

  // (b) THE TREE, VERBATIM. The block is a copy-paste, and every screenshot below it is of the
  // screen this exact JSON produces - so a tree edited here without re-running docs-shots.mjs
  // would teach one thing and show another.
  const tree = example.locator('pre').first();
  await expect(tree).toContainText('"match": { "teamA": "Otava", "scoreA": 2, "teamB": "Karhut", "scoreB": 1 }');
  await expect(tree).toContainText('"tickerItems"');

  // (c) THE FOUR GRAPHICS, by their catalog names, because "make a scoreboard" is not a
  // reproducible instruction and their FIELD TITLES are what the rest of the example binds by.
  // TWO of them are scoreboards on purpose: the section's headline claim is that one value
  // moves every graphic that reads it, and a pool where no two graphics want the same number
  // can only assert that. Dropping the second one would quietly cost the example its point.
  for (const name of ['Match Strip', 'Quiet Score', 'House Wire', 'House Strap']) {
    await expect(example).toContainText(name);
  }

  // (d) The rule the whole section exists to teach, in both directions: a title finds a path,
  // and a column name finds a field.
  await expect(example).toContainText('match.scoreA');
  await expect(example).toContainText('Bind all by title');
  await expect(example).toContainText('Load data row');

  // (e) The honest boundary. Publishing needs an account and the hosted backend, so the join
  // link is the one step the docs run could not take - and the page says which (src/docs/
  // AGENTS.md: where something is expected rather than measured, say so).
  await expect(example.locator('.callout.truth')).toContainText('taken on trust');

  // (f) The answer to the question this half was written for. Chat sources is the first panel on
  // the Audience tab and wants a Twitch channel, so a reader with neither has to be told, in
  // this many words, that they are not missing a thing.
  await expect(example).toContainText('Simulate 3 arrivals');
  await expect(example).toContainText('they are not missing anything');
});
// The screenshots. They are generated by `node scripts/docs-shots.mjs` and committed, so the
// failure mode is a RENAMED FILE rather than a broken layout: the page still reads fine with
// empty frames in it, and nothing else would say so. Checking that each one decoded is the
// whole point - a 404 gives a zero natural width.
//
// EVERY `.doc-shot` on the page, not just the SVG guide's. The guide was the only section with
// pictures when this was written and the selector said so, which meant the worked example's
// shots (#data-example, 2026-09-16) would have shipped past the one gate that catches a
// squashed or missing one. Each section's count is asserted too, so a shot that is quietly
// DELETED fails here rather than leaving a paragraph pointing at nothing.
test('every docs screenshot loads at the size the page reserved for it', async ({ page }) => {
  await page.goto('/docs');
  await expect(page.locator('#first-graphic .doc-shot img')).toHaveCount(2);
  // Two per type: the example as it renders, and the Fields step after the drop.
  await expect(page.locator('#graphics .doc-type .doc-shot img')).toHaveCount(12);
  await expect(page.locator('#data-example .doc-shot img')).toHaveCount(7);
  const shots = page.locator('.doc-shot img');
  const count = await shots.count();
  for (let i = 0; i < count; i++) {
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

// PRINTING. The page is a dark one and a browser drops backgrounds by default, so without the
// print block in src/docs/docs.css every word prints as near-white ink on white paper and the
// sheet comes out blank. That block is pure CSS - no gate reads it, and deleting it would break
// nothing a build can see - so this is what stands between it and a silent regression. Until
// 2026-09-20 the cover rode on a spec for two dated handout sections; they are gone and the
// print block is not, so the assertion is kept and pointed at the block itself.
test('the docs page prints as it reads, in ink rather than in white', async ({ page }) => {
  await page.goto('/docs');
  await page.emulateMedia({ media: 'print' });

  // The conversion: dark text on a white page. `--paper` is the body colour and `--void` the
  // background, and both are redeclared for print.
  const ink = await page.evaluate(() => {
    const cs = getComputedStyle(document.body);
    return { color: cs.color, background: cs.backgroundColor };
  });
  expect(ink).toEqual({ color: 'rgb(0, 0, 0)', background: 'rgb(255, 255, 255)' });

  // The nav is a screen affordance and its grid track goes with it, or every sheet carries an
  // empty column down the left.
  await expect(page.locator('.doc-nav')).toBeHidden();

  // And the whole page prints, rather than one section of it. Naming a section in the address
  // must not select it: that rule existed for the handout sheets and was removed with them.
  // The emulation is re-stated after the navigation on purpose - if it ever stopped persisting,
  // dropping it would leave this half asserting screen visibility and passing for nothing.
  await page.goto('/docs#casparcg');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#claude-code')).toBeVisible();
  await expect(page.locator('#getting-started')).toBeVisible();

  await page.emulateMedia({ media: null });
});

test('the docs page routes back into the product', async ({ page }) => {
  await page.goto('/docs');
  // At least one door into the studio, and it opens the creation wizard like the landing's CTAs.
  await expect(page.locator('a[href="/app#/new"]').first()).toBeVisible();
});
