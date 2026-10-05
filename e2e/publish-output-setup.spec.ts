// covers: src/model/{outputSetup,shows,cueClipboard}.ts, src/backend/auth.ts
// covers: src/components/{DefaultOutputPreference,SettingsDialog,HostedControlPage}.tsx, src/components/control/PrepareForLive.tsx
// covers: src/components/home/{OutputSetupDialog,RundownColors,ProductionPage,ProductionLinks,ServerCueEditor,CueRundown,sections/ProductionsSection}.tsx
// covers: src/control/{playoutStatus,livePath,hostedControl,prepareBridge,prepareLive}.ts, src/output/main.ts, src/packs/graphicsPack.ts
// covers: e2e/_publish.ts
import { publishProduction } from './_publish';
import { test, expect, type Page } from '@playwright/test';
import { awaitDurableReady, settleDurableWrites } from './_durable';
import { fakeBridge, seedSettings } from './_fakeBridge';

const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222';
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
  await page.goto('/app#/home'); await expect(page.getByTestId('home-page')).toBeVisible(); await awaitDurableReady(page);
  const owner=await page.evaluate(async()=>{const sb=await (await import('/src/backend/supabase.ts')).getSupabase();return sb ? (await sb.auth.getSession()).data.session?.user.id : null;});
  if(owner) await expect.poll(()=>page.evaluate(async()=> (await import('/src/model/durableStore.ts')).libraryInUse())).toBe(owner);
  const id=await page.evaluate(async old=>{
    const S=await import('/src/model/shows.ts'); const {variantsFor}=await import('/src/templates/catalog.ts');
    const show=S.createShowNamed('Output proof'); S.addGraphicToShow(show.id,variantsFor('lower-third')[0].create({}));
    if(old){const copy=S.loadShows().find(s=>s.id===show.id)!;delete copy.outputSetup;S.upsertShow(copy);}
    await (await import('/src/model/durableStore.ts')).commitDurableWrites();
    (await import('/src/app/router.ts')).useRouter.getState().navigate({view:'production',id:show.id}); return show.id;
  },legacy);
  await expect(page.getByTestId('production-page')).toBeVisible();return id;
}
async function record(page:Page,id:string){ return page.evaluate(async key=>(await import('/src/model/shows.ts')).loadShows().find(s=>s.id===key)!,id); }
async function openSetup(page:Page){const panel=page.getByTestId('production-status-panel');if(!await panel.isVisible())await page.getByTestId('production-status').click();const section=page.getByTestId('playout-panel-setup');if(!await section.getByRole('button',{name:'Change output…'}).isVisible())await section.locator('summary.pd-panel-section-title').click();return section;}

test('first Publish has no selection, cancellation is inert, remembered choice saves only after publication',async({page})=>{
  const b=backend();await account(page,b);const id=await seed(page);
  await page.getByTestId('production-publish').click();
  await expect(page.getByTestId('output-profile')).toHaveValue('');
  await expect(page.getByTestId('remember-output')).not.toBeChecked();
  await expect(page.getByTestId('confirm-output')).toBeDisabled();
  await page.screenshot({path:test.info().outputPath('publish-empty.png')});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:test.info().outputPath('publish-empty-phone.png')});
  await page.setViewportSize({width:1280,height:720});
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  expect(b.writes).toBe(0);expect((await record(page,id)).hostedSlug).toBeUndefined();
  await page.getByTestId('production-publish').click();await page.getByTestId('output-profile').selectOption('spx');await page.getByTestId('remember-output').check();
  await page.screenshot({path:test.info().outputPath('publish-spx-remember.png')});
  b.failPublish=true;await page.getByTestId('confirm-output').click();await expect(page.getByTestId('production-note')).toContainText('Publish failed');
  expect(b.preferences).toEqual([]);expect((await record(page,id)).hostedSlug).toBeUndefined();
  b.failPublish=false;b.failDefault=true;await page.getByTestId('production-publish').click();
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started','true');
  await expect(page.getByTestId('output-default-failure')).toContainText('Published successfully');
  expect((await record(page,id)).outputSetup).toEqual(choice('spx'));
  b.failDefault=false;await page.getByRole('button',{name:'Retry saving default'}).click();await expect(page.getByTestId('output-default-failure')).toBeHidden();
  expect(b.defaults[A]).toEqual(choice('spx'));expect(b.preferences).toEqual([A]);
  await expect(page.getByTestId('download-output-embed')).toHaveText('Download SPX template');
  await expect(page.getByTestId('caspar-put-on-air')).toHaveCount(0);
  const download=page.waitForEvent('download');await page.getByTestId('download-output-embed').click();expect((await download).suggestedFilename()).toMatch(/html$/);
  const next=await seed(page);await page.getByTestId('production-publish').click();await expect(page.getByTestId('production-status')).toHaveAttribute('data-started','true');
  await expect(page.getByTestId('output-setup-dialog')).toHaveCount(0);expect((await record(page,next)).outputSetup).toEqual(choice('spx'));
});

test('production override emits no playback commands and leaves default unchanged; account changes never reuse defaults',async({page})=>{
  const b=backend();b.defaults[A]=choice('obs');b.defaults[B]=choice('vmix');await account(page,b);const id=await seed(page);
  await publishProduction(page);
  const setup=await openSetup(page);const writes=b.writes;await setup.getByRole('button',{name:'Change output…'}).click();await page.getByTestId('output-profile').selectOption('browser');await page.getByTestId('output-also-caspar').check();
  await page.screenshot({path:test.info().outputPath('combined-output.png')});
  await page.getByTestId('confirm-output').click();
  expect(b.writes).toBe(writes);expect(b.defaults[A]).toEqual(choice('obs'));expect((await record(page,id)).outputSetup).toEqual(choice('browser',true));
  // Account isolation reloads onto B's library. Do not span that boundary with a read.
  const navigation=page.waitForEvent('domcontentloaded');
  await page.evaluate(async access=>{const sb=await (await import('/src/backend/supabase.ts')).getSupabase();void sb!.auth.setSession({access_token:access,refresh_token:'other-refresh'});},token(B));
  await navigation;await awaitDurableReady(page);
  const result=await page.evaluate(async({a,b})=>{const auth=await import('/src/backend/auth.ts');return {wrong:await auth.readDefaultOutput(a),right:await auth.readDefaultOutput(b),write:await auth.saveDefaultOutput(a,{v:1,destinations:[{id:'browser',profile:'obs'}]})};},{a:A,b:B});
  expect(result.wrong.setup).toBeNull();expect(result.write.error).toBeTruthy();expect(result.right.setup).toEqual(choice('vmix'));expect(b.preferences).toEqual([]);
});

test('legacy open, save, duplicate and republish preserve routes, cues, capability URLs and graphics',async({page})=>{
  const b=backend();b.defaults[A]=choice('spx');await account(page,b);const id=await seed(page,true);
  const before=await record(page,id);await page.getByTestId('production-publish').click();await expect(page.getByTestId('production-status')).toHaveAttribute('data-started','true');await expect(page.getByTestId('output-setup-dialog')).toHaveCount(0);
  const published=await record(page,id);expect(published.outputSetup).toBeUndefined();expect(published.cues).toEqual(before.cues);expect(published.graphics).toEqual(before.graphics);
  await page.getByTestId('production-republish').click();await expect(page.getByTestId('production-note')).toContainText('Changes published');
  const again=await record(page,id);expect(again.outputSlug).toBe(published.outputSlug);expect(again.hostedSlug).toBe(published.hostedSlug);expect(again.outputSetup).toBeUndefined();
  const copy=await page.evaluate(async key=>{const S=await import('/src/model/shows.ts');const copy=S.duplicateShowChecked(key).show!;await (await import('/src/model/durableStore.ts')).commitDurableWrites();return copy;},id);
  expect(copy.outputSetup).toBeUndefined();expect(copy.outputSlug).toBeUndefined();expect(copy.cues).toEqual(published.cues);
  await settleDurableWrites(page);await page.reload();await expect(page.getByTestId('production-page')).toBeVisible();expect((await record(page,id)).cues).toEqual(before.cues);
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
  const setup=await openSetup(page);await setup.getByTestId('rundown-colors').locator('summary').click();await setup.getByLabel('Channel 1 color').fill('#123456');expect(bridge.actions).toEqual([]);
  for(const theme of ['dark','light']){await page.emulateMedia({colorScheme:theme as 'dark'|'light'});await page.setViewportSize({width:1024,height:768});await page.screenshot({path:test.info().outputPath(`rundown-${theme}.png`)});}
});


test('workflow default, duplicate and fresh import keep account intent separate from production content',async({page,browser})=>{
  const b=backend();b.defaults[A]=choice('obs');await account(page,b);const id=await seed(page);
  await page.getByTestId('production-publish').click();await expect(page.getByTestId('production-status')).toHaveAttribute('data-started','true');
  await page.getByRole('button',{name:'Home',exact:true}).click();
  await page.getByTestId('account-button').click();await page.getByTestId('menu-settings').click();await page.getByTestId('settings-nav-workflow').click();
  const preference=page.getByLabel('Default production output');await expect(preference).toHaveValue('1');
  await preference.selectOption({label:'Ask every time'});await expect(page.getByTestId('default-output-preference')).toContainText('Default saved');expect(b.defaults[A]).toBeNull();
  await page.getByTestId('settings').getByTitle('Close', {exact:true}).click();
  await page.getByRole('button',{name:'More actions for Output proof'}).click();await page.getByTestId('duplicate-production').click();await expect(page.getByTestId('production-page')).toBeVisible();
  const copyId=await page.evaluate(async()=>{const route=(await import('/src/app/router.ts')).useRouter.getState().route;return route.view === 'production' ? route.id : null;});
  expect((await record(page,copyId!)).outputSetup).toEqual(choice('obs'));expect((await record(page,id)).outputSetup).toEqual(choice('obs'));
  await seed(page);await page.getByTestId('production-publish').click();await expect(page.getByTestId('output-profile')).toHaveValue('');await page.keyboard.press('Escape');await expect(page.getByTestId('output-setup-dialog')).toBeHidden();
  // A second browser session has no local output preference. It reads fresh account metadata.
  b.defaults[A]=choice('vmix');const otherContext=await browser.newContext({baseURL:new URL(page.url()).origin});const other=await otherContext.newPage();await account(other,b);const fresh=await seed(other);await other.getByTestId('production-publish').click();await expect(other.getByTestId('production-status')).toHaveAttribute('data-started','true');expect((await record(other,fresh)).outputSetup).toEqual(choice('vmix'));await otherContext.close();
  const imported=await page.evaluate(async id=>{
    const S=await import('/src/model/shows.ts');const pack=await import('/src/packs/graphicsPack.ts');const source=S.loadShows().find(s=>s.id===id)!;S.setCueAccentColor(id,source.cues![0].id,'#abcdef');
    const exported=await pack.buildPack(S.loadShows().find(s=>s.id===id)!);exported.outputSetup={v:1,destinations:[{id:'foreign-studio',profile:'casparcg'}]};
    const parsed=pack.parsePack(JSON.stringify(exported));if(parsed.error)throw Error(parsed.error);const installed=await pack.installPack(parsed.pack!);(await import('/src/app/router.ts')).useRouter.getState().navigate({view:'production',id:installed.id});return installed;
  },id);
  expect(imported.outputSetup).toEqual({v:1,destinations:[]});expect(imported.cues![0].accentColor).toBe('#abcdef');
  await page.getByTestId('production-publish').click();await expect(page.getByTestId('production-status')).toHaveAttribute('data-started','true');expect((await record(page,imported.id)).outputSetup).toEqual(choice('vmix'));
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
