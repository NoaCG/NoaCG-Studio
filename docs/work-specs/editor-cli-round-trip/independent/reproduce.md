# Reproduce the independent scoped task

Use a fresh dedicated feature worktree of fetched main containing
`2e164047f30ac1594144e82a55dcc91a6e727bda`. Inspect
`scripts/worktree-activity.mjs`, load applicable rules, and use the shared
scheduler. Do not build or edit the checkout holding main. Use one browser
worker. Keep generated files under an ignored folder such as
`.noacg/independent-check`.

## Reference

Download the exact [v0.4.0 Windows portable archive](https://github.com/storytold/vectorcraft/releases/download/v0.4.0/vectorcraft-0.4.0-windows-x64-portable.zip)
and verify both hashes in [reference-archive-verification.json](reference-archive-verification.json).
Start its `vectorcraft.exe --control <free-loopback-port>` as a hidden child.
The app's TCP control endpoint accepts one JSON object per line and returns one
JSON response per line. Bind/connect only to 127.0.0.1. A response must have
`ok:true`. The API and command definitions are pinned in
[reference-provenance.json](reference-provenance.json).

The following is the command recipe; replace paths and resolve node IDs from
`document.inspect` by `name`, as the actual run did. The actual IDs, parameters,
order and successful replies are in [reference-task.json](reference-task.json).
`text.setStyle` is measured by the resulting bounds, not by assuming an unexposed
style field exists in the inspection result.

```json
{"id":1,"method":"ui.resize","params":{"width":1366,"height":768}}
{"id":2,"method":"app.open","params":{"path":"<absolute>/reference-input.svg"}}
{"id":3,"method":"document.inspect","params":{}}
{"id":4,"method":"engine.execute","params":{"command":"text.setText","params":{"id":"<interview-name id>","text":"Mina Patel"}}}
{"id":5,"method":"document.inspect","params":{}}
{"id":6,"method":"engine.execute","params":{"command":"text.setStyle","params":{"id":"<interview-name id>","size":64,"fill":"#ffffff"}}}
{"id":7,"method":"document.inspect","params":{}}
{"id":8,"method":"ui.key","params":{"key":"Z","cmd":true}}
{"id":9,"method":"document.inspect","params":{}}
{"id":10,"method":"ui.key","params":{"key":"Z","cmd":true,"shift":true}}
{"id":11,"method":"document.inspect","params":{}}
{"id":12,"method":"engine.execute","params":{"command":"object.transform","params":{"ids":["<interview-panel id>"],"matrix":[1,0,0,1,40,-25]}}}
{"id":13,"method":"document.inspect","params":{}}
{"id":14,"method":"ui.key","params":{"key":"Z","cmd":true}}
{"id":15,"method":"document.inspect","params":{}}
{"id":16,"method":"ui.key","params":{"key":"Z","cmd":true,"shift":true}}
{"id":17,"method":"document.inspect","params":{}}
{"id":18,"method":"engine.execute","params":{"command":"file.saveAs","params":{"path":"<new-unique-path>.vectorcraft","format":"vectorcraft"}}}
{"id":19,"method":"ui.inspect","params":{}}
{"id":20,"method":"app.open","params":{"path":"<new-unique-path>.vectorcraft"}}
{"id":21,"method":"document.inspect","params":{}}
{"id":22,"method":"ui.render","params":{"path":"<ignored-output>/reference-render.png","scale":0.5}}
{"id":23,"method":"ui.screenshot","params":{"path":"<ignored-output>/reference-ui.png"}}
```

Wait for the relevant history state after each keyboard action. Compare font
Undo bounds with the snapshot after text replacement and Redo bounds with the
snapshot after the size edit. Compare panel Undo bounds with imported panel
bounds and Redo with translated bounds. Assert the native output did not exist
before Save As; wait for the file and an empty `ui.inspect.background` before
reopening. Reopened text/bounds must match the edits; role/static text must remain
unchanged. Inspect both captures. Stop only the app child created for this task.

Actual scheduled command was
`npm run queue -- "node .noacg/independent-check/reference-check.mjs" --cost 0.5 --cap 8`.
The private transport helper remains ignored; the authored SVG and the complete
public command recipe are retained here. No upstream native code is embedded.

## NoaCG normal product-route task

Use the merged `e2e/fixtures/cli-round-trip/riverlight.zip`; its SHA-256 is in
[main-task.json](main-task.json). This is the locally built CLI package qualified
by the parent phase, rather than a synthetic replacement for the importer.

1. Open `/app?editor=foundation#/new`, choose Import graphic, select the ZIP,
   continue with Riverlight festival, then choose Edit artwork.
2. Home the playhead, assert panel opacity 0, press Play and await the complete
   held pose. Select Name from Layers & Timeline. Set Artwork text to Mina Patel
   and press Apply text. Set Role to Stage producer in the same way.
3. Select Panel and set Solid fill to #18384c. Select Name and set font size to
   64. Its imported computed size is 48px. Undo must restore 48px while retaining
   both text edits; Redo must restore 64px. Enter a 90px draft and press Escape;
   the rendered size must remain 64px.
4. Save as Independent interview main, await Saved, then reload. Both edited
   texts, 64px size, panel fill, RIVERLIGHT and logo must remain. On a dev server,
   snapshot the active template before Save and compare it in full after reload.
   JavaScript/assets must equal the imported template; f0/f1 keys, updated values,
   IDs, JSON metadata and unrelated CSS must be retained.
5. Press actual Play to the held pose before captures. Capture 1920x1080,
   1366x768 and 1093x614. At the last viewport select Canvas zoom 200% of Fit.
   Inspect captures and record clipping, scrolling and responsive limits.
6. Home and Play again. Root/panel/name/role opacity must reach 1; root transform
   must be none. Press Out and await root opacity 0.
7. Build each current export target and serve its actual files in a fresh
   1920x1080 browser page. Execute the target's lifecycle below. Check defaults,
   64px size, panel rgb(24,56,76), static RIVERLIGHT, JSON metadata, logo natural
   width 72 and an Inter FontFace with status loaded. Compare the measured held
   root/child pose to rehearsal. Update f0/f1 to LIVE MINA / On-air producer;
   static RIVERLIGHT must remain. Capture, stop and assert root opacity 0 and no
   browser errors.
8. Repeat steps 1-6 in a new anonymous browser against production, after reading
   `/version.json` and confirming the deployed commit. Use only the visible
   product route there. Keep any real consent prompt visible and record its
   occlusion. No dev module or seeded private state is used in production.

The final helper's readiness source used actual playback:

```ts
const slider = page.getByRole('slider', {name:'Playhead', exact:true});
await slider.focus();
await slider.press('Home');
await expect(slider).toHaveAttribute('aria-valuenow', '0');
await expect.poll(async () => (await livePose(page)).panelOpacity).toBe('0');
await page.getByRole('button', {name:'Play', exact:true}).click();
await expect.poll(async () => (await livePose(page)).roleOpacity).toBe('1');
await expect(page.getByRole('button', {name:'Play', exact:true})).toBeVisible();
```

`livePose` reads computed styles in the Foundation preview iframe: `.graphic`
opacity/transform and `.graphic-box`, `#f0`, `#f1` opacities. It deliberately does
not require root opacity 0 while scrubbing. Text selection used
`.ef-track[data-selector="#f0"] .ef-layer`, `Artwork text` and `Apply text`;
font size used `data-testid=artwork-font-size`. Source snapshots on main used
`useTemplateStore.getState().template`, as the existing qualification spec does.

Lifecycle calls against the generated files were:

```js
// SPX / CasparCG globals
play();
update(JSON.stringify({f0:'LIVE MINA', f1:'On-air producer'}));
stop();

// OGraf: actual generated module in a fresh browser host
const module = await import('./graphic.mjs');
customElements.define('independent-graphic', module.default);
const element = document.createElement('independent-graphic');
document.body.append(element);
await element.load({data:{}});
await element.playAction({});
await element.updateAction({data:{f0:'LIVE MINA', f1:'On-air producer'}});
await element.stopAction({});
```

The generated OGraf host in this check was a blank HTML body with its default
8px margin. Do not mistake that host offset for a source artwork change. The
retained screenshots and pixel comparison document it explicitly.

The final main config extended `playwright.config.ts`, with `testDir:'.'`,
`workers:1`, `retries:0`, ignored output, the absolute
`e2e/_offline-guard.ts` global setup and `scripts/e2e-run-integrity.mjs` reporter,
and the inherited dev web server with `cwd:process.cwd()`. The inherited `devPort()` resolver selected
5258 for this worktree. Production used Desktop Chrome, baseURL https://noacg.studio, one worker,
no local web server, 180s test timeout and 7s expect timeout. Its browser context
was fresh and anonymous. The private independent harness is intentionally not a
new maintained product test; the committed qualification spec remains
`e2e/editor-cli-round-trip.spec.ts`.

Exact final scheduled invocations:

```powershell
npm run queue -- "node node_modules/@playwright/test/cli.js test --config .noacg/independent-check/playwright.main.config.ts --workers=1" --cost 0.5 --cap 8
npm run queue -- "node node_modules/@playwright/test/cli.js test --config .noacg/independent-check/playwright.production.config.ts --workers=1" --cost 0.5 --cap 8 --after j-4100
```

For the maintained phase regression cases, use the repository's normal queued
Playwright invocation targeting `e2e/editor-cli-round-trip.spec.ts` with one
worker. Keep its run artifacts ignored and do not overwrite reviewed docs PNGs.


## Assertion excerpts

These excerpts show the independent dev-only preservation and browser-resource
checks. They ran in the private checker harness; production used visible UI
assertions and reload instead.

```ts
expect(saved.js).toBe(imported.js);
expect(saved.assets).toEqual(imported.assets);
expect(saved.fields.map(field => field.field))
  .toEqual(imported.fields.map(field => field.field));
expect(saved.fields.find(field => field.field === 'f0').value).toBe('Mina Patel');
expect(saved.fields.find(field => field.field === 'f1').value).toBe('Stage producer');
expect(saved.html).toContain('id="festival-config"');
expect(saved.html).toContain('id="festival-panel"');
expect(saved.css).toContain('.festival-unused { border-color:var(--accent); }');
await page.reload();
expect(await currentTemplate(page)).toEqual(saved);

// Each actual executable export, after Play:
expect(exportedPose).toEqual(rehearsalHeldPose);
expect(await output.locator('#f0').evaluate(el => getComputedStyle(el).fontSize))
  .toBe('64px');
await expect.poll(() => output.locator('#festival-mark')
  .evaluate(el => el.naturalWidth)).toBe(72);
await expect.poll(() => output.locator('#f0').evaluate(() =>
  [...document.fonts].some(font =>
    font.family.replaceAll('"', '').replaceAll("'", '') === 'Inter' &&
    font.status === 'loaded'))).toBe(true);
```

The reference typography assertions compare actual node bounds across snapshots:

```js
assert.deepEqual(fontUndoneHeadline.bounds, afterTextHeadline.bounds);
assert.deepEqual(fontRedoneHeadline.bounds, afterSizeHeadline.bounds);
assert.ok(afterSizeHeadline.bounds.height > importedHeadline.bounds.height);
assert.deepEqual(reopenedHeadline.bounds, afterSizeHeadline.bounds);
assert.equal(reopenedHeadline.text, 'Mina Patel');
assert.deepEqual(reopenedPanel.bounds, movedPanel.bounds);
```
