// covers: src/model/{outputSetup,shows,cueClipboard}.ts, src/backend/auth.ts
// covers: src/components/{DefaultOutputPreference,SettingsDialog,HostedControlPage,PlayoutSettingsDialog}.tsx, src/components/control/PrepareForLive.tsx
// covers: src/components/home/{RundownColors,ProductionPage,ProductionLinks,PlayoutPanel,PlayoutStatusControl,ProductionSetupMenu,ServerCueEditor,CueRundown,sections/ProductionsSection}.tsx
// covers: src/control/{playoutStatus,livePath,hostedControl,prepareBridge,prepareLive}.ts, src/output/main.ts, src/packs/graphicsPack.ts
// covers: e2e/_publish.ts
//
// PUBLISH ONCE, ONE SWITCH (docs/work-specs/playout-workflow-simplification AC-1, AC-3, AC-4, AC-5,
// AC-8): no output chooser; the account's "Use CasparCG in new productions" starts a new
// production's switch; the switch changes no playback; the browser source and its template file sit
// in the panel; the people links are under Setup › Links…; nothing in the UI unpublishes.
import { publishProduction, setCasparSwitch } from './_publish';
import { test, expect, type Page } from '@playwright/test';
import { awaitDurableReady } from './_durable';
import { fakeBridge, seedSettings } from './_fakeBridge';

const A='11111111-1111-4111-8111-111111111111';
const KEY='noacg_output_default_v1';
const choice=(profile:string,caspar=false)=>({v:1,destinations:[{id:'browser',profile},...(caspar?[{id:'casparcg',profile:'casparcg'}]:[])]});
const token=(id:string)=>[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),Buffer.from('fixture-signature').toString('base64url')].join('.');
type Backend = { defaults: Record<string,unknown>; failPublish:boolean; failDefault:boolean; published: Record<string,{id:string;slug:string;outputSlug:string;joinSlug:null;presenterSlug:null;output?:{ver?:unknown}}>; writes: number; preferences: string[] };
function backend():Backend { return {defaults:{},failPublish:false,failDefault:false,published:{},writes:0,preferences:[]}; }
async function account(page:Page,state:Backend) {
  // Network-owned fake Auth/PostgREST. Uses the real auth seam and real publish serializer;
  // no production backend, account or stored upcoming production is touched.
  await page.route('**/src/backend/config.ts', r=>r.fulfill({contentType:'application/javascript',body:`export const loadBackendConfig=()=>({url:'https://noacg-test.supabase.co',anonKey:'fixture-public-key'}); export const isBackendConfigured=()=>true;`}));
  await page.addInitScript(({id,access})=>{ if(window.top!==window || localStorage.getItem('sb-noacg-test-auth-token'))return; localStorage.setItem('sb-noacg-test-auth-token',JSON.stringify({access_token:access,refresh_token:'fixture-refresh',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:{id,aud:'authenticated',role:'authenticated',email:'fixture@example.test',user_metadata:{}}})); },{id:A,access:token(A)});
  await page.route('https://noacg-test.supabase.co/**',async r=>{
    const req=r.request(),url=new URL(req.url()),method=req.method();
    const bearer=req.headers().authorization?.split(' ')[1];
    const owner=bearer ? JSON.parse(Buffer.from(bearer.split('.')[1], 'base64url').toString()).sub : A;
    const user=()=>({id:owner,aud:'authenticated',role:'authenticated',email:'fixture@example.test',user_metadata:{[KEY]:state.defaults[owner]??null}});
    const answer=(body:unknown,status=200)=>r.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if(url.pathname==='/auth/v1/user') {
      if(method==='PUT') { if(state.failDefault)return answer({msg:'Default save refused for test'},503); state.preferences.push(owner); state.defaults[owner]=req.postDataJSON().data[KEY]; }
      return answer(user());
    }
    if(url.pathname.endsWith('/control_shows')) {
      const id=(url.searchParams.get('id')??'').replace('eq.','');
      if(method==='DELETE') { delete state.published[id]; return answer(null); }
      if(method==='PATCH'||method==='POST') {
        state.writes++; if(state.failPublish)return answer({message:'Publish refused for test',code:'test'},503);
        const data=req.postDataJSON(); const key=data.id??id;
        state.published[key]={...state.published[key],...data,id:key,slug:'control-'+key,outputSlug:'output-'+key,joinSlug:null,presenterSlug:null};
        return answer(method==='PATCH'?[{id:key}]:null);
      }
      if(method==='GET') {
        const row=state.published[id]; const select=url.searchParams.get('select')??'';
        if(select.startsWith('ver:'))return answer(row?[{ver:row.output?.ver}]:[]);
        const result=row??null;
        return answer(req.headers().accept?.includes('vnd.pgrst.object')?result:result?[result]:[]);
      }
    }
    if(url.pathname.includes('/rpc/'))return answer(null);
    return answer([]);
  });
}
async function seed(page:Page,legacy=false) {
  // A fresh mock account first reloads onto its isolated library. Allow that cold boot to
  // finish before seeding; the short interaction timeout was measuring Vite/auth startup.
  await page.goto('/app#/home'); await expect(page.getByTestId('home-page')).toBeVisible({timeout:30_000}); await awaitDurableReady(page);
  const owner=await page.evaluate(async()=>{const sb=await (await import('/src/backend/supabase.ts')).getSupabase();return sb ? (await sb.auth.getSession()).data.session?.user.id : null;});
  if(owner) await expect.poll(()=>page.evaluate(async()=> (await import('/src/model/durableStore.ts')).libraryInUse())).toBe(owner);
  const id=await page.evaluate(async old=>{
    const S=await import('/src/model/shows.ts'); const {variantsFor}=await import('/src/templates/catalog.ts');
    const show=S.createShowNamed('Output proof'); S.addGraphicToShow(show.id,variantsFor('lower-third')[0].create({}));
    if(old){const copy=S.loadShows().find(s=>s.id===show.id)!;delete copy.outputSetup;S.upsertShow(copy);}
    await (await import('/src/model/durableStore.ts')).commitDurableWrites();
    return show.id;
  },legacy);
  // Finish persistence and return the ID before mounting the production's renderers.
  await page.goto('/app#/production/'+id);
  await expect(page.getByTestId('production-page')).toBeVisible();return id;
}
async function record(page:Page,id:string){ return page.evaluate(async key=>(await import('/src/model/shows.ts')).loadShows().find(s=>s.id===key)!,id); }
async function openSettings(page:Page){await page.getByTestId('production-setup').click();await page.getByTestId('setup-playout-settings').click();const dialog=page.getByTestId('playout-settings');await expect(dialog).toBeVisible();return dialog;}

test('Publish asks nothing, the account default starts the CasparCG switch, and Publish changes keeps every URL',async({page})=>{
  const b=backend();b.defaults[A]=choice('browser',true);await account(page,b);const id=await seed(page);
  // One control and one action in the header; no timer, no output label.
  await expect(page.getByTestId('production-status')).toContainText('Pair NoaCG Bridge');
  await expect(page.getByTestId('production-publish')).toBeVisible();
  await expect(page.locator('.pd-clock')).toHaveCount(0);
  await expect(page.getByTestId('publish-output-choice')).toHaveCount(0);
  await page.getByTestId('production-status').click();
  const panel=page.getByTestId('production-status-panel');
  await expect(panel.getByTestId('caspar-switch')).toBeChecked();
  await expect(panel.getByTestId('output-url')).toHaveText('Available after publishing');
  await expect(panel.getByTestId('download-output-embed')).toBeDisabled();
  await page.screenshot({path:test.info().outputPath('panel-before-publish.png')});
  await page.keyboard.press('Escape');
  await page.getByTestId('production-publish').click();
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started','true',{timeout:30_000});
  await expect(page.getByTestId('output-setup-dialog')).toHaveCount(0);
  // The switch as it read at the first publish is now the production's own.
  expect((await record(page,id)).outputSetup).toEqual({...choice('browser',true),caspar:true});
  // Unpaired, Publish says the one step it could not take instead of failing silently.
  await expect(page.getByTestId('production-note')).toContainText('Pair NoaCG Bridge to load the output on 1-20');
  const first=await record(page,id);
  await page.evaluate(async key=>{const S=await import('/src/model/shows.ts');const current=S.loadShows().find(s=>s.id===key)!;S.upsertShow({...current,name:'Output proof again',updatedAt:new Date(Date.now()+1).toISOString()});},id);
  // The first publish opened the panel; a press on the status would close it again.
  if(!(await panel.isVisible()))await page.getByTestId('production-status').click();
  await expect(panel.getByTestId('panel-publish-changes')).toBeVisible();
  const writes=b.writes;await panel.getByTestId('panel-publish-changes').click();
  await expect.poll(()=>b.writes).toBeGreaterThan(writes);
  const again=await record(page,id);expect(again.outputSlug).toBe(first.outputSlug);expect(again.hostedSlug).toBe(first.hostedSlug);
  // Nothing in the operator's UI unpublishes.
  await expect(page.getByTestId('production-unpublish')).toHaveCount(0);
  await expect(panel.getByTestId('output-url')).toContainText('/output?production=');
  await page.screenshot({path:test.info().outputPath('panel-published.png')});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:test.info().outputPath('panel-published-phone.png')});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth)).toBe(false);
});

test('the CasparCG switch sends no playback command, reveals CasparCG doors only when on, and leaves the account default alone',async({page})=>{
  const b=backend();await account(page,b);await seedSettings(page);const bridge=await fakeBridge(page);const id=await seed(page);
  await expect(page.getByTestId('production-status')).toContainText('Not published');
  await page.getByTestId('rundown-add').click();
  await expect(page.getByRole('menuitem',{name:/CasparCG files/})).toHaveCount(0);
  await page.keyboard.press('Escape');
  await setCasparSwitch(page,true);
  expect((await record(page,id)).outputSetup).toEqual({...choice('browser',true),caspar:true});
  // Before any publish, native cues can already air: green, in words.
  await expect(page.getByTestId('production-status')).toContainText('CasparCG ready');
  await page.getByTestId('rundown-add').click();
  await expect(page.getByRole('menuitem',{name:/CasparCG files/})).toHaveCount(1);
  await page.keyboard.press('Escape');
  await setCasparSwitch(page,false);
  expect((await record(page,id)).outputSetup).toEqual({...choice('browser'),caspar:false});
  await expect(page.getByTestId('production-status')).toContainText('Not published');
  expect(bridge.actions).toEqual([]);expect(b.preferences).toEqual([]);expect(b.writes).toBe(0);
});

test('legacy productions open and publish unchanged, and a duplicate keeps its setup',async({page})=>{
  const b=backend();b.defaults[A]=choice('spx');await account(page,b);const id=await seed(page,true);
  const before=await record(page,id);
  await publishProduction(page);
  const published=await record(page,id);expect(published.outputSetup).toBeUndefined();expect(published.cues).toEqual(before.cues);expect(published.graphics).toEqual(before.graphics);
  const copy=await page.evaluate(async key=>{const S=await import('/src/model/shows.ts');const copy=S.duplicateShowChecked(key).show!;await (await import('/src/model/durableStore.ts')).commitDurableWrites();return copy;},id);
  expect(copy.outputSetup).toBeUndefined();expect(copy.outputSlug).toBeUndefined();expect(copy.cues).toEqual(published.cues);
});

test('Setup › Links… holds the people links, marked private or public; the panel holds the output',async({page})=>{
  const b=backend();await account(page,b);await seed(page);
  await page.getByTestId('production-setup').click();await page.getByTestId('setup-links').click();
  const links=page.getByTestId('production-links');
  await expect(links.getByTestId('control-url')).toContainText('Available after publishing');
  await links.getByTestId('production-links-close').click();
  await publishProduction(page);
  await page.getByTestId('production-setup').click();await page.getByTestId('setup-links').click();
  await expect(links.getByTestId('control-url')).toContainText('Private');
  await expect(links.getByTestId('control-url')).toContainText('/app?control=');
  await expect(links.getByTestId('copy-control-url')).toBeEnabled();
  await page.screenshot({path:test.info().outputPath('links-dialog.png')});
  await links.getByTestId('production-links-close').click();
  await page.getByTestId('production-status').click();
  const panel=page.getByTestId('production-status-panel');
  await expect(panel.getByTestId('control-url')).toHaveCount(0);
  const download=page.waitForEvent('download');await panel.getByTestId('download-output-embed').click();expect((await download).suggestedFilename()).toMatch(/html$/);
});

test('Setup and All out keep their place while the status and its action change',async({page})=>{
  const b=backend();await account(page,b);const id=await seed(page);
  const places=async()=>page.evaluate(()=>['production-setup','verb-out-all'].map(t=>Math.round(document.querySelector(`[data-testid="${t}"]`)!.getBoundingClientRect().x)));
  // The header clips rather than scrolls, so a page-width check cannot see All out pushed off the edge.
  const allOutOnScreen=async(width:number,state:string)=>expect(await page.evaluate(()=>Math.round(document.querySelector('[data-testid="verb-out-all"]')!.getBoundingClientRect().right)),`${width}: All out off screen ${state}`).toBeLessThanOrEqual(width);
  // 390 is the phone, where Setup stands down and the sync chip is a dot.
  for(const [pass,width] of [1920,1366,1280,390].entries()){
    await page.setViewportSize({width,height:800});
    const unpublished=await places();
    await allOutOnScreen(width,'before the first publish');
    await publishProduction(page);
    expect(await places(),`${width}: publishing moved Setup or All out`).toEqual(unpublished);
    await allOutOnScreen(width,'once published');
    await page.evaluate(async key=>{const S=await import('/src/model/shows.ts');const {variantsFor}=await import('/src/templates/catalog.ts');S.addGraphicToShow(key.id,variantsFor('lower-third')[key.pass+1].create({}));await (await import('/src/model/durableStore.ts')).commitDurableWrites();},{id,pass});
    await expect(page.getByTestId('production-publish-changes')).toBeVisible();
    expect(await places(),`${width}: Publish changes moved Setup or All out`).toEqual(unpublished);
    await allOutOnScreen(width,'with Publish changes due');
    await page.getByTestId('production-publish-changes').click();
    await expect(page.getByTestId('production-publish-changes')).toHaveCount(0,{timeout:30_000});
    // Back to a never-published copy for the next width.
    await page.evaluate(async key=>{const S=await import('/src/model/shows.ts');S.setShowHostedSlug(key,undefined);S.setShowOutputSlug(key,undefined);await (await import('/src/model/durableStore.ts')).commitDurableWrites();},id);
    await page.reload();await expect(page.getByTestId('production-page')).toBeVisible();
  }
});

test('Settings: "Use CasparCG in new productions" is one checkbox on the account',async({page})=>{
  const b=backend();b.defaults[A]=choice('obs');await account(page,b);await seed(page);
  await page.getByRole('button',{name:'Home',exact:true}).click();
  await page.getByTestId('account-button').click();await page.getByTestId('menu-settings').click();await page.getByTestId('settings-nav-workflow').click();
  const box=page.getByTestId('default-caspar');await expect(box).not.toBeChecked();
  await box.check();await expect(box).toBeEnabled();await expect.poll(()=>b.defaults[A]).toEqual(choice('browser',true));
  await box.uncheck();await expect(box).toBeEnabled();await expect.poll(()=>b.defaults[A]).toEqual(choice('browser'));
  // A refused save puts the box back.
  b.failDefault=true;await box.check();await expect(box).not.toBeChecked();await expect(page.getByTestId('default-output-preference').getByRole('alert')).toBeVisible();
});

test('shared route confirmation, highlights and palette remain independent of playback and folder routing',async({page})=>{
  await seedSettings(page);const bridge=await fakeBridge(page);const id=await seed(page);
  const refs=await page.evaluate(async key=>{const S=await import('/src/model/shows.ts');const {defaultChannelFor,loadPlayoutSettings}=await import('/src/control/playoutLink.ts');const settings=loadPlayoutSettings();const add=S.addPlayoutItem(key,{adapter:'casparcg',kind:'media',mediaKind:'still',name:'POSTER',channel:defaultChannelFor(settings,'media')});const cue=S.loadShows().find(s=>s.id===key)!.cues!.find(c=>c.id===add.cueId)!;S.addShowCue(key,cue.sourceId);await (await import('/src/model/durableStore.ts')).commitDurableWrites();return {cue:cue.id,item:cue.sourceId};},id);
  await page.reload();await expect(page.getByTestId('cue-list').locator('.pd-cue')).toHaveCount(3);
  const cue=page.getByTestId('cue-'+refs.cue);await cue.getByTestId('select-cue').click();await expect(page.getByTestId('shared-file-route')).toContainText('Shared file route: 2 cues');await expect(cue.getByTestId('cue-type-text')).toHaveText('Server image');await expect(cue.getByTestId('cue-layer')).toHaveText('2-10');
  await page.getByTestId('playout-channel').selectOption('1');await expect(page.getByTestId('shared-route-confirm')).toContainText('Change route for all 2 cues?');await page.getByRole('button',{name:'Cancel',exact:true}).click();expect((await record(page,id)).playoutItems![0].channel).toBe(2);
  const layerInput=page.getByTestId('playout-layer');await layerInput.fill('12');await layerInput.press('Enter');await expect(page.getByTestId('shared-route-confirm')).toContainText('Set layer to 12');await page.getByTestId('shared-route-confirm').getByRole('button',{name:'Cancel',exact:true}).click();await expect(layerInput).toHaveValue('10');
  await page.getByTestId('playout-channel').selectOption('1');await page.getByRole('button',{name:'Change all',exact:true}).click();await expect(cue.getByTestId('cue-layer')).toHaveText('1-10');expect(bridge.actions).toEqual([]);
  const badge=await cue.getByTestId('cue-layer').evaluate(el=>getComputedStyle(el).borderLeftColor);
  const color=page.getByTestId('control-area').getByLabel('Cue highlight color');await color.fill('#aabbcc');
  await expect.poll(async()=> (await record(page,id)).cues!.find(c=>c.id===refs.cue)?.accentColor).toBe('#aabbcc');expect(await cue.getByTestId('cue-layer').evaluate(el=>getComputedStyle(el).borderLeftColor)).toBe(badge);
  await cue.getByTestId('cue-menu').click();await page.getByTestId('cue-actions-menu').getByRole('menuitem',{name:/Duplicate/}).first().click();
  const current=await record(page,id);expect(current.cues!.filter(c=>c.accentColor==='#aabbcc')).toHaveLength(2);
  await page.getByTestId('control-area').getByRole('button',{name:'Reset to default',exact:true}).click();
  const fresh=await page.evaluate(async({id,item})=>(await import('/src/model/shows.ts')).addShowCue(id,item).cueId!,{id,item:refs.item});expect((await record(page,id)).cues!.find(c=>c.id===fresh)?.accentColor).toBeUndefined();
  const settings=await openSettings(page);await settings.getByTestId('rundown-colors').getByLabel('Channel 1 color').fill('#123456');await settings.getByTestId('playout-settings-close').click();expect(bridge.actions).toEqual([]);
  for(const theme of ['dark','light']){await page.emulateMedia({colorScheme:theme as 'dark'|'light'});await page.setViewportSize({width:1024,height:768});await page.screenshot({path:test.info().outputPath(`rundown-${theme}.png`)});}
});


test('cue highlight survives copy and reorder while a fresh reference uses its route color',async({page})=>{
  const id=await seed(page);const result=await page.evaluate(async key=>{
    const S=await import('/src/model/shows.ts');const {copyClip}=await import('/src/model/cueClipboard.ts');const show=S.loadShows().find(s=>s.id===key)!;const cue=show.cues![0];S.setCueAccentColor(key,cue.id,'#123456');
    const clip=copyClip(S.loadShows().find(s=>s.id===key)!,[cue.id])!;const pasted=S.pasteInRundown(key,clip,{end:true});if(pasted.error||pasted.refused)throw Error(pasted.error??pasted.refused!);S.moveShowCue(key,pasted.cueIds[0],-1);const fresh=S.addShowCue(key,cue.sourceId).cueId;await (await import('/src/model/durableStore.ts')).commitDurableWrites();return {show:S.loadShows().find(s=>s.id===key)!,fresh};
  },id);
  expect(result.show.cues!.filter(c=>c.accentColor==='#123456')).toHaveLength(2);expect(result.show.cues!.find(c=>c.id===result.fresh)?.accentColor).toBeUndefined();
  await page.reload();await expect(page.getByTestId('cue-type-text').first()).toHaveText('Graphic');
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:test.info().outputPath('rundown-phone.png')});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth)).toBe(false);
});

// AC-7: before the first publish a graphic's Take plays on this page only, and every word says so.
test('before the first publish a graphic Take is rehearsal, and the first publish clears it',async({page})=>{
  const b=backend();await account(page,b);await seed(page);
  const row=page.locator('.pd-cue').first();const take=page.getByTestId('verb-take');
  await row.getByTestId('select-cue').click();
  await expect(take).toHaveClass(/pd-verb-rehearsal/);
  await take.click();
  await expect(row.getByTestId('cue-up-here')).toHaveText('UP');
  await expect(row.locator('.pd-tag.air')).toHaveCount(0);
  await expect(take).toHaveClass(/pd-verb-rehearsal/);
  await expect(page.getByTestId('program-monitor-name')).toHaveText('PROGRAM · NOT PUBLISHED');
  await expect(page.getByTestId('program-monitor')).toHaveAttribute('data-live','false');
  await expect(page.locator('.pd-editor-kicker')).not.toContainText(/ON.AIR/);
  await page.screenshot({path:test.info().outputPath('rehearsal-1366.png')});
  await publishProduction(page);
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started','true',{timeout:30_000});
  await page.keyboard.press('Escape');
  // Nothing rehearsed is left up to be mistaken for air.
  await expect(row.getByTestId('cue-up-here')).toHaveCount(0);
  await expect(row.locator('.pd-tag.air')).toHaveCount(0);
  await expect(page.getByTestId('program-monitor').locator('.pd-what')).toHaveText('nothing on air');
  await expect(take).not.toHaveClass(/pd-verb-rehearsal/);
});

// AC-6: a native CasparCG cue plays through NoaCG Bridge before any publish, and is called on air.
test('native CasparCG cues take, update, next and clear before any publish',async({page})=>{
  await seedSettings(page);const bridge=await fakeBridge(page);
  const b=backend();await account(page,b);const id=await seed(page);
  const cueId=await page.evaluate(async showId=>(await import('/src/model/shows.ts')).addPlayoutItem(showId,{adapter:'casparcg',kind:'template',name:'HOUSE_STRAP/HOUSE_STRAP',channel:1,layer:21}).cueId,id);
  const cue=page.getByTestId(`cue-${cueId}`);
  await cue.getByTestId('select-cue').click();
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started','false');
  const take=page.getByTestId('verb-take');
  await expect(take).not.toHaveClass(/pd-verb-rehearsal/);
  await take.click();
  await expect.poll(()=>bridge.actions.map(a=>a.verb)).toEqual(['take']);
  await expect(cue.locator('.pd-tag.air')).toHaveText('ON AIR');
  await expect(page.getByTestId('program-monitor-name')).toHaveText('PROGRAM · ON AIR');
  await page.getByTestId('verb-update').click();
  await expect.poll(()=>bridge.actions.map(a=>a.verb)).toEqual(['take','update']);
  await page.getByTestId('verb-next').click();
  await expect.poll(()=>bridge.actions.map(a=>a.verb)).toEqual(['take','update','next']);
  await page.getByTestId('verb-out-all').click();
  await expect.poll(()=>bridge.actions.length).toBeGreaterThan(3);
  await expect(cue.locator('.pd-tag.air')).toHaveCount(0);
  expect(b.writes,'nothing was published').toBe(0);
  await page.unrouteAll({behavior:'ignoreErrors'});
});

// AC-9 / D10: the badge loses its output word; the layer, its clash repair and the server address stay.
test('the rundown badge reads the layer, with the CasparCG slot only when CasparCG is on',async({page})=>{
  await seedSettings(page);const bridge=await fakeBridge(page);
  const b=backend();await account(page,b);const id=await seed(page);
  const graphic=page.locator('.pd-cue').first().getByTestId('cue-layer');
  await expect(graphic).toHaveText(/^G\d+$/);
  const before=await page.locator('.pd-cue').first().boundingBox();
  await setCasparSwitch(page,true);
  await expect(graphic).toHaveText(/^1-20 · G\d+$/);
  expect((await page.locator('.pd-cue').first().boundingBox())!.height).toBe(before!.height);
  const cueId=await page.evaluate(async showId=>(await import('/src/model/shows.ts')).addPlayoutItem(showId,{adapter:'casparcg',kind:'media',name:'OPENER',channel:2,layer:10}).cueId,id);
  const clip=page.getByTestId(`cue-${cueId}`);
  await expect(clip.getByTestId('cue-layer')).toHaveText('2-10');
  await expect(clip.getByTestId('cue-caspar-off')).toHaveCount(0);
  // Switched off, a native cue says why it cannot be taken, in place.
  await setCasparSwitch(page,false);
  await expect(graphic).toHaveText(/^G\d+$/);
  await expect(clip.getByTestId('cue-caspar-off')).toHaveText('CasparCG off');
  expect(bridge.actions).toEqual([]);
  await page.unrouteAll({behavior:'ignoreErrors'});
});

// AC-14: a native cue's Take never waits on a save. The save is made to hang for real: a write
// transaction held open on the app's own store, so the cue's edit cannot land until it is released.
test('a native cue Take goes to the Bridge while the save of its edit still hangs',async({page})=>{
  await seedSettings(page);const bridge=await fakeBridge(page);
  const b=backend();await account(page,b);const id=await seed(page);
  const cueId=await page.evaluate(async showId=>(await import('/src/model/shows.ts')).addPlayoutItem(showId,{adapter:'casparcg',kind:'template',name:'HOUSE_STRAP/HOUSE_STRAP',channel:1,layer:21}).cueId,id);
  const cue=page.getByTestId(`cue-${cueId}`);
  await cue.getByTestId('select-cue').click();
  await page.evaluate(()=>new Promise<void>((resolve,reject)=>{
    const open=indexedDB.open('noacg-studio');
    open.onerror=()=>reject(open.error);
    open.onsuccess=()=>{
      const db=open.result;const tx=db.transaction('kv','readwrite');const store=tx.objectStore('kv');
      const w=window as unknown as {__hold:boolean;__held:number};w.__hold=true;w.__held=0;
      const spin=()=>{w.__held++;if(w.__hold)store.get('__e2e_hold').onsuccess=spin;};
      spin();tx.oncomplete=()=>db.close();resolve();
    };
  }));
  await page.getByTestId('cue-label').fill('Strap typed before the Take');
  const sent=Date.now();
  await page.getByTestId('verb-take').click();
  await expect.poll(()=>bridge.actions.map(a=>a.verb),{timeout:3_000}).toEqual(['take']);
  expect(Date.now()-sent,'the Take went within the Bridge round trip, not after the save').toBeLessThan(3_000);
  // The save is still held: the Take did not wait for it.
  expect(await page.evaluate(()=>(window as unknown as {__hold:boolean}).__hold)).toBe(true);
  expect(await page.evaluate(async()=>{const {commitDurableWrites}=await import('/src/model/durableStore.ts');return Promise.race([commitDurableWrites().then(()=>'landed'),new Promise(r=>setTimeout(()=>r('pending'),300))]);}),'the edit has not reached the disk yet').toBe('pending');
  // Released, the edit lands behind the Take, and nothing reports a failure.
  await page.evaluate(()=>{(window as unknown as {__hold:boolean}).__hold=false;});
  await expect.poll(()=>page.evaluate(async([showId,cid])=>{const {commitDurableWrites}=await import('/src/model/durableStore.ts');await commitDurableWrites();return (await import('/src/model/shows.ts')).loadShows().find(s=>s.id===showId)?.cues?.find(c=>c.id===cid)?.label??null;},[id,cueId] as const),{timeout:15_000}).toBe('Strap typed before the Take');
  await expect(page.getByTestId('production-note').filter({hasText:/not saved|failed/i})).toHaveCount(0);
  await page.unrouteAll({behavior:'ignoreErrors'});
});

// AC-3 item 4: the panel's CasparCG section ends in Playout settings, with the switch on or off,
// since the rundown colours live there too.
test('the panel opens Playout settings with CasparCG off and on',async({page})=>{
  const b=backend();await account(page,b);await seed(page);
  const panel=page.getByTestId('production-status-panel');const dialog=page.getByTestId('playout-settings');
  await page.getByTestId('production-status').click();
  await expect(panel.getByTestId('caspar-switch')).not.toBeChecked();
  await panel.getByTestId('panel-playout-settings').click();
  await expect(panel).toBeHidden();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('settings-playout')).toHaveCount(0);
  await page.getByTestId('playout-settings-close').click();
  await setCasparSwitch(page,true);
  await page.getByTestId('production-status').click();
  await panel.getByTestId('panel-playout-settings').click();
  await expect(dialog.getByTestId('settings-playout')).toBeVisible();
});
