# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: playout-cues.spec.ts >> vMix media browses the selected folder and plays on separate clip and audio players
- Location: e2e\playout-cues.spec.ts:1159:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: getByTestId('cue-16fe354d-c102-4770-a468-048939187e3d')
Expected substring: "ON AIR"
Received string:    "⣿3▶Opening.mp4VideoReplays/Opening.mp4PVW0:10NoaCG Clips⋯"
Timeout: 7000ms

Call log:
  - Expect "toContainText" with timeout 7000ms
  - waiting for getByTestId('cue-16fe354d-c102-4770-a468-048939187e3d')
    18 × locator resolved to <div draggable="true" class="pd-cue selected on-pvw" data-row="16fe354d-c102-4770-a468-048939187e3d" data-testid="cue-16fe354d-c102-4770-a468-048939187e3d">…</div>
       - unexpected value "⣿3▶Opening.mp4VideoReplays/Opening.mp4PVW0:10NoaCG Clips⋯"

```

```yaml
- text: "3"
- img "Video · NoaCG Clips": ▶
- button "Opening.mp4 Video Replays/Opening.mp4":
  - strong: Opening.mp4
  - text: Video Replays/Opening.mp4
- text: PVW 0:10 NoaCG Clips
- button "More actions for Opening.mp4": ⋯
```

# Test source

```ts
  1230 |   const clips = saved.find(({ item }) => item.adapter === 'vmix' && item.name === movie)!;
  1231 |   const audio = saved.find(({ item }) => item.adapter === 'vmix' && item.name === sound)!;
  1232 |   expect(saved.filter(({ item }) => item.name === movie)).toHaveLength(2);
  1233 |   expect(clips.item).toMatchObject({ adapter: 'vmix', kind: 'media', layer: 0, mediaKind: 'movie', frames: 250, fps: 25 });
  1234 |   expect(audio.item).toMatchObject({ adapter: 'vmix', kind: 'media', layer: 0, mediaKind: 'audio' });
  1235 |   expect(clips.item).not.toHaveProperty('channel');
  1236 |   expect(audio.item).not.toHaveProperty('channel');
  1237 |   expect(media.paths).toContain('Replays');
  1238 | 
  1239 |   const clipRow = page.getByTestId('cue-' + clips.cueId);
  1240 |   const audioRow = page.getByTestId('cue-' + audio.cueId);
  1241 |   await clipRow.getByTestId('select-cue').click();
  1242 |   await expect(page.getByTestId('playout-cue-where')).toContainText('NoaCG Clips');
  1243 |   await expect(page.getByTestId('verb-target')).toHaveText('To: NoaCG Clips');
  1244 |   await expect(page.getByTestId('playout-channel')).toHaveCount(0);
  1245 |   await expect(page.getByTestId('playout-layer')).toHaveCount(0);
  1246 |   await expect(page.getByTestId('clip-end-hold')).toBeEnabled();
  1247 |   await expect(page.getByTestId('clip-end-loop')).toBeEnabled();
  1248 |   await expect(page.getByTestId('clip-end-clear')).toBeDisabled();
  1249 |   await expect(page.getByTestId('clip-end-next')).toBeDisabled();
  1250 |   await page.screenshot({ path: info.outputPath('vmix-cue-editor.png') });
  1251 |   await page.getByTestId('verb-take').click();
  1252 |   await expect(clipRow).toContainText('ON AIR');
  1253 |   const clipInstance = vmix.players.clips.instance;
  1254 |   expect(clipInstance).toBeTruthy();
  1255 |   await page.getByTestId('playout-pause').click();
  1256 |   await expect.poll(() => media.actions.length).toBe(2);
  1257 |   await page.getByTestId('playout-resume').click();
  1258 |   await expect.poll(() => media.actions.length).toBe(3);
  1259 | 
  1260 |   await audioRow.getByTestId('select-cue').click();
  1261 |   await expect(page.getByTestId('playout-cue-where')).toContainText('NoaCG Audio');
  1262 |   await expect(page.getByTestId('verb-target')).toHaveText('To: NoaCG Audio');
  1263 |   await page.getByTestId('verb-take').click();
  1264 |   await expect(audioRow).toContainText('ON AIR');
  1265 |   await expect(clipRow).toContainText('ON AIR');
  1266 |   const audioInstance = vmix.players.audio.instance;
  1267 |   expect(audioInstance).toBeTruthy();
  1268 |   await page.getByTestId('verb-out').click();
  1269 |   await expect(audioRow).not.toContainText('ON AIR');
  1270 |   await expect(clipRow).toContainText('ON AIR');
  1271 |   await clipRow.getByTestId('select-cue').click();
  1272 |   await page.getByTestId('verb-out').click();
  1273 |   await expect(clipRow).not.toContainText('ON AIR');
  1274 |   const player = (verb: string, slot: 'clips' | 'audio', name: string, identity: { cueId: string } | { expectedPlayerInstance: string }) => ({
  1275 |     target: { adapter: 'vmix' },
  1276 |     action: { verb, slot: { adapter: 'vmix', player: slot }, item: { kind: 'media', name }, ...identity },
  1277 |   });
  1278 |   expect(media.actions).toEqual([
  1279 |     player('take', 'clips', movie, { cueId: 'vmix:' + JSON.stringify([clips.showId, clips.cueId, clips.item.id]) }),
  1280 |     player('pause-player-held', 'clips', movie, { expectedPlayerInstance: clipInstance! }),
  1281 |     player('resume-player-held', 'clips', movie, { expectedPlayerInstance: clipInstance! }),
  1282 |     player('take', 'audio', sound, { cueId: 'vmix:' + JSON.stringify([audio.showId, audio.cueId, audio.item.id]) }),
  1283 |     player('out-player-held', 'audio', sound, { expectedPlayerInstance: audioInstance! }),
  1284 |     player('out-player-held', 'clips', movie, { expectedPlayerInstance: clipInstance! }),
  1285 |   ]);
  1286 |   expect(bridge.actions).toEqual([]);
  1287 |   expect(vmix.actions).toEqual([]);
  1288 | 
  1289 |   // Both pairing transitions can arrive before React commits another render. The original
  1290 |   // Bridge really accepted this Take, but its reply cannot establish ownership in the new scope.
  1291 |   const takeSent = Promise.withResolvers<void>();
  1292 |   const releaseTake = Promise.withResolvers<void>();
  1293 |   const holdTake = async (route: Route) => {
  1294 |     if (route.request().method() !== 'POST') return route.fallback();
  1295 |     takeSent.resolve();
  1296 |     await releaseTake.promise;
  1297 |     await route.fallback();
  1298 |   };
  1299 |   const unavailablePlayerReading = (route: Route) =>
  1300 |     route.request().method() === 'POST' && !route.request().postDataJSON()?.outputUrl
  1301 |       ? route.fulfill({ status: 503, headers: { 'Access-Control-Allow-Origin': '*' } })
  1302 |       : route.fallback();
  1303 |   await page.route(BRIDGE + '/state', unavailablePlayerReading);
  1304 |   await page.route(BRIDGE + '/act', holdTake);
  1305 |   try {
  1306 |     await page.getByTestId('verb-take').click();
  1307 |     await takeSent.promise;
  1308 |     await page.evaluate(() => {
  1309 |       const key = 'spx-gfx-caspar';
  1310 |       const current = localStorage.getItem(key)!;
  1311 |       const other = JSON.stringify({ ...JSON.parse(current), agentUrl: 'http://127.0.0.1:8900' });
  1312 |       const changed = (oldValue: string, newValue: string) => {
  1313 |         window.dispatchEvent(new StorageEvent('storage', { key, storageArea: localStorage, oldValue, newValue }));
  1314 |       };
  1315 |       changed(current, other);
  1316 |       changed(other, current);
  1317 |     });
  1318 |     releaseTake.resolve();
  1319 |     await expect(page.getByTestId('production-note')).toContainText('The vMix connection changed.');
  1320 |     await expect(clipRow).not.toContainText('ON AIR');
  1321 |   } finally {
  1322 |     releaseTake.resolve();
  1323 |     await page.unroute(BRIDGE + '/act', holdTake);
  1324 |     // With observations held off, this assertion checks the old reply alone. A fresh read
  1325 |     // from the current pairing may now recover the instance, independently of that reply.
  1326 |     await page.unroute(BRIDGE + '/state', unavailablePlayerReading);
  1327 |   }
  1328 |   await expect(page.getByTestId('verb-take')).toBeEnabled();
  1329 |   await page.getByTestId('verb-take').click();
> 1330 |   await expect(clipRow).toContainText('ON AIR');
       |                         ^ Error: expect(locator).toContainText(expected) failed
  1331 |   const retakenInstance = vmix.players.clips.instance;
  1332 |   expect(retakenInstance).toBeTruthy();
  1333 |   await page.getByTestId('verb-out').click();
  1334 |   await expect(clipRow).not.toContainText('ON AIR');
  1335 | 
  1336 |   await page.getByTestId('production-status').click();
  1337 |   await panel.getByTestId('panel-playout-settings').click();
  1338 |   const settings = page.getByTestId('playout-settings');
  1339 |   const mediaFolder = settings.getByTestId('vmix-media-folder');
  1340 |   const choose = settings.getByTestId('vmix-choose-folder');
  1341 |   await expect(choose).toHaveAccessibleName('Choose folder…');
  1342 |   await expect(mediaFolder).toHaveText(folder);
  1343 |   await settleDurableWrites(page);
  1344 |   const other = await page.context().newPage();
  1345 |   await other.goto(page.url());
  1346 |   await openPicker(other);
  1347 |   const otherPicker = other.getByTestId('playout-picker');
  1348 |   await expect(otherPicker.getByTestId('picker-folder').filter({ hasText: 'Replays' })).toBeVisible();
  1349 | 
  1350 |   await choose.click();
  1351 |   await expect(choose).toBeEnabled();
  1352 |   await expect(mediaFolder).toHaveText(folder);
  1353 |   await expect(otherPicker.getByTestId('picker-folder').filter({ hasText: 'Replays' })).toBeVisible();
  1354 | 
  1355 |   // Hold an old root response across a successful choice in the other tab. A late list
  1356 |   // must not replace the newly read root or make its old files addable again.
  1357 |   const oldRead = Promise.withResolvers<void>();
  1358 |   let held: Request | undefined;
  1359 |   await other.route(BRIDGE + '/list', async route => {
  1360 |     const request = route.request().postDataJSON();
  1361 |     if (held || request?.target?.adapter !== 'vmix' || request.path) return route.fallback();
  1362 |     held = route.request();
  1363 |     const snapshot = vmix.reply('/list', request);
  1364 |     await oldRead.promise;
  1365 |     await route.fulfill({ json: snapshot, headers: { 'Access-Control-Allow-Origin': '*' } });
  1366 |   });
  1367 |   try {
  1368 |     await otherPicker.getByTestId('picker-refresh').click();
  1369 |     await expect.poll(() => Boolean(held)).toBe(true);
  1370 |     media.choice = chosen;
  1371 |     await choose.click();
  1372 |     await expect(mediaFolder).toHaveText(chosen);
  1373 |     const newClip = otherPicker.getByTestId('picker-row').filter({ hasText: 'New clip.mov' });
  1374 |     await expect(newClip).toBeVisible();
  1375 |     const late = other.waitForResponse(response => response.request() === held);
  1376 |     oldRead.resolve();
  1377 |     await (await late).finished();
  1378 |     await other.evaluate(() => new Promise(resolve => setTimeout(resolve)));
  1379 |     await expect(newClip).toBeVisible();
  1380 |     await expect(otherPicker.getByTestId('picker-folder')).toHaveCount(0);
  1381 |     expect(media.choices).toBe(2);
  1382 | 
  1383 |     // Pairing changes in a different tab while the old Bridge's native picker is open.
  1384 |     const nextBridge = 'http://127.0.0.1:8900';
  1385 |     const nextFolder = 'E:/Other Bridge';
  1386 |     const nextVmix = fakeVmix(8, { folder: nextFolder, files: {} });
  1387 |     await slotBridge({ route: (_url, handler) => page.context().route(nextBridge + '/**', handler) }, { vmix: nextVmix });
  1388 |     // The picker still belongs to the original pairing when Refresh is pressed in this task.
  1389 |     await other.evaluate(bridgeUrl => {
  1390 |       const key = 'spx-gfx-caspar';
  1391 |       const saved = localStorage.getItem(key)!;
  1392 |       localStorage.setItem(key, JSON.stringify({ ...JSON.parse(saved), agentUrl: bridgeUrl }));
  1393 |       try {
  1394 |         document.querySelector<HTMLButtonElement>('[data-testid="picker-refresh"]')!.click();
  1395 |       } finally {
  1396 |         localStorage.setItem(key, saved);
  1397 |       }
  1398 |     }, nextBridge);
  1399 |     await otherPicker.getByTestId('picker-refresh').click();
  1400 |     await expect(newClip).toBeVisible();
  1401 |     expect(nextVmix.media!.paths).toEqual([]);
  1402 |     const opened = Promise.withResolvers<void>();
  1403 |     const finishChoice = Promise.withResolvers<void>();
  1404 |     await page.route(BRIDGE + '/vmix/choose-folder', async route => {
  1405 |       if (route.request().method() !== 'POST') return route.fallback();
  1406 |       opened.resolve();
  1407 |       await finishChoice.promise;
  1408 |       await route.fallback();
  1409 |     });
  1410 |     const pairedFromOtherTab = (agentUrl: string) => evaluateInPage(other, async (url: string) => {
  1411 |       const { savePlayoutSettings } = await __noacgImport('/src/control/playoutLink.ts');
  1412 |       savePlayoutSettings({ agentUrl: url });
  1413 |       await new Promise(resolve => setTimeout(resolve));
  1414 |     }, agentUrl);
  1415 |     try {
  1416 |       await choose.click();
  1417 |       await opened.promise;
  1418 |       await expect(choose).toBeDisabled();
  1419 |       await pairedFromOtherTab(nextBridge);
  1420 |       await expect(mediaFolder).toHaveText(nextFolder);
  1421 |       await expect(choose).toBeEnabled();
  1422 |       const oldChoice = page.waitForResponse(response =>
  1423 |         response.url() === BRIDGE + '/vmix/choose-folder' && response.request().method() === 'POST');
  1424 |       finishChoice.resolve();
  1425 |       await (await oldChoice).finished();
  1426 |       await expect(mediaFolder).toHaveText(nextFolder);
  1427 |       await pairedFromOtherTab(BRIDGE);
  1428 |       await expect(mediaFolder).toHaveText(chosen);
  1429 |       expect(media.choices).toBe(3);
  1430 | 
```