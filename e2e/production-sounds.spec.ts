// covers: src/assets/{productionSounds.ts,productionSoundHooks.ts,soundAssets.ts,audioHash.ts,soundBridge.ts,graphicSoundRuntime.ts}
// covers: src/blocks/{productionSoundEdit.ts,animData.ts}, src/model/{shows.ts,library.ts,durableStore.ts,types.ts,packets.ts}
// covers: src/control/hostedControl.ts, src/output/{stage.ts,prepare.ts}, src/preview/composeDocument.ts
// covers: src/templates/**, src/components/home/ProductionSounds.tsx, src/packs/graphicsPack.ts, src/export/**, src/backend/{assets.ts,productionAudio.ts}
// focus
import { test, expect } from '@playwright/test';
import { awaitDurableReady } from './_durable';
import { bootstrapGraphic, openProductionWithCurrent } from './_create';
test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

// Independent PCM fixture; this session does not edit the health session's fixtures.
function wave(frequency=440) {
  const b = Buffer.alloc(44 + 96000); b.write('RIFF'); b.writeUInt32LE(b.length - 8,4); b.write('WAVE',8); b.write('fmt ',12);
  b.writeUInt32LE(16,16); b.writeUInt16LE(1,20); b.writeUInt16LE(1,22); b.writeUInt32LE(48000,24); b.writeUInt32LE(96000,28); b.writeUInt16LE(2,32); b.writeUInt16LE(16,34); b.write('data',36); b.writeUInt32LE(96000,40);
  for (let i=0;i<48000;i++) b.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*frequency/48000)*8000),44+i*2);
  return b.toString('base64');
}

const HARNESS = `
 const { createBlankTemplate } = await import('/src/templates/blank.ts');
 const { createPictureTemplate } = await import('/src/templates/picture.ts');
 const { runtimeJs } = await import('/src/templates/shared/base.ts');
 const { emitAnimRegion } = await import('/src/templates/shared/animRuntime.ts');
 const { replaceDefinitionInHtml } = await import('/src/model/spxDefinition.ts');
 const { rememberSound } = await import('/src/assets/soundAssets.ts');
 const { setProductionSound } = await import('/src/blocks/productionSoundEdit.ts');
 const { withProductionSounds } = await import('/src/assets/productionSounds.ts');
 const { createOutputStage } = await import('/src/output/stage.ts');
 const step = name => ({name,duration:.05,ease:'none',layers:{'#box':{opacity:[{time:0,value:1}]}}});
 function linear(quiz=false) {
   const t=createBlankTemplate(); t.name=quiz?'Quiz':'Linear'; t.type=quiz?'quiz':'blank';
   const fields=quiz?[{field:'f0',title:'Selected answer',value:''},{field:'f1',title:'Correct answer',value:'A'}]:[];
   t.html=replaceDefinitionInHtml('<html><head></head><body><div id="box">Proof</div><div id="f0"></div><div id="f1">A</div></body></html>',t.settings,fields); t.fields=fields;
   const d={version:2,root:'#box',speed:1,steps:[step('In'),step('Reveal'),step('Out')]};
   if(quiz)d.machine={groups:[{id:'main',initial:'off',defaultPath:['question','answer','out'],states:[{id:'off'},{id:'question'},{id:'selected',timeline:step('Pick')},{id:'answer'},{id:'out'}],transitions:[
    {from:'question',to:'selected',trigger:'operator',event:'select'}, {from:'selected',to:'selected',trigger:'operator',event:'select'},
    {from:'selected',to:'answer',trigger:'operator',event:'judge'},{from:'selected',to:'answer',trigger:'operator',event:'next'}]}]};
   t.js=runtimeJs(t.name,emitAnimRegion(d)); return t;
 }
 const ref=await rememberSound({path:'sounds/pro.wav',data:'data:audio/wav;base64,'+b64});
 function attach(t,keys,visual='graphic') {
   let c={v:1,assets:[],visuals:{}};
   for(const key of keys)c=setProductionSound(t,c,visual,key,{id:key,asset:'assets/sound-'+ref.hash+'.wav',enabled:true,mode:'one-shot',levelDb:-6},ref);
   return withProductionSounds(t,c);
 }
 function stage(t, program=true) {
   const root=document.createElement('div'); document.body.appendChild(root);
   const s=createOutputStage(root,{v:2,resolution:t.resolution,graphics:[{key:t.name,html:t.html,css:t.css,js:t.js,assets:t.assets,resolution:t.resolution,fps:t.fps}],cues:[]},program?{sound:'program'}:{});
   return s;
 }
`;

test('shared references prepare and execute PNG, linear and accepted quiz sounds without cue-time fetches', async ({ page }) => {
  await page.goto('/app'); await awaitDurableReady(page);
  const loaded = await page.evaluate(`(async(b64)=>{ ${HARNESS}
   const picture=createPictureTemplate('images/one.png'); picture.assets=[{path:'images/one.png',data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4XcAAAAASUVORK5CYII='}];
   const templates=[attach(picture,['in','out'],'picture:images/one.png'),attach(linear(),['in','["step",1]','out']),attach(linear(true),['in','selection','correct','wrong','out'])];
   window.proofStages=templates.map(t=>stage(t));
   await Promise.all(window.proofStages.map(s=>s.whenLoaded()));
   return Promise.all(window.proofStages.map((s,i)=>s.warm(templates[i].name)));
  })(${JSON.stringify(wave())})`);
  expect(loaded.every((a: {error: string | null}) => a && !a.error)).toBe(true);
  const frames = page.frames().filter(f=>f.parentFrame() === page.mainFrame());
  expect(frames).toHaveLength(3);
  for (const frame of frames) await frame.evaluate(`window.starts=[]; var raw=AudioBufferSourceNode.prototype.start; AudioBufferSourceNode.prototype.start=function(){starts.push({loop:this.loop,at:performance.now()}); return raw.apply(this,arguments);}; window.fetch=function(){throw Error('No fetch during live playback');};`);
  await frames[0].evaluate(`update(JSON.stringify({f0:'images/one.png'})); play(); stop(); stop();`);
  await frames[1].evaluate(`play(); next(); stop();`);
  const quiz=frames[2];
  const result=await quiz.evaluate(`(async()=>{ play(); noacgDispatch('judge',{f1:'B'}); noacgDispatch('select',{f0:'A'}); noacgDispatch('select',{f0:'A'}); noacgDispatch('judge',{f1:'B'}); noacgDispatch('judge',{f1:'A'}); const first=starts.length;
    noacgSoundSetQuiet(true); play(); noacgDispatch('select',{f0:'B'}); noacgDispatch('judge',{f1:'B'}); noacgSoundSetQuiet(false); const quiet=starts.length;
    play(); noacgDispatch('select',{f0:'A'}); noacgDispatch('judge',{f1:'A'}); stop(); return {first,quiet,all:starts.length,gain:Object.values(noacgSoundPlaying).map(p=>p.gain.gain.value)}; })()`);
  expect(result.first).toBe(3); expect(result.quiet).toBe(3); expect(result.all).toBe(7);
  expect(result.gain[0]).toBeCloseTo(Math.pow(10,-6/20),5);
  expect(await frames[0].evaluate('starts.length')).toBe(2);
  expect(await frames[1].evaluate('starts.length')).toBe(3);
  await frames[0].evaluate(`update(JSON.stringify({f0:'images/unconfigured.png'})); play(); stop();`);
  expect(await frames[0].evaluate('starts.length')).toBe(2);
});

test('countdown loops follow actual pause, resume, reset, finish, interruption and clearing',async({page})=>{
  await page.goto('/app'); await awaitDurableReady(page);
  await page.evaluate(`(async(b64)=>{ ${HARNESS}
    const { CATALOG } = await import('/src/templates/catalog.ts');
    const t=CATALOG['game-timer'][0].create({});
    let c={v:1,assets:[],visuals:{}};
    for(const key of ['countdown-running','countdown-paused','countdown-expired','out']) c=setProductionSound(t,c,'graphic',key,{id:key,asset:'assets/sound-'+ref.hash+'.wav',enabled:true,mode:key==='countdown-running'?'loop':'one-shot',levelDb:-6},ref);
    window.clockProof=stage(withProductionSounds(t,c)); await clockProof.whenLoaded(); await clockProof.warm(t.name,{f1:'1'});
  })(${JSON.stringify(wave())})`);
  const f=page.frames().find(f=>f.parentFrame()===page.mainFrame())!;
  await f.evaluate(`window.starts=[]; window.stops=[]; const original=AudioBufferSourceNode.prototype.start, finish=AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.start=function(){starts.push({loop:this.loop,at:noacgSoundContext.currentTime});return original.apply(this,arguments);};
    AudioBufferSourceNode.prototype.stop=function(at){stops.push({at,now:noacgSoundContext.currentTime});return finish.apply(this,arguments);};
    window.fetch=function(){throw Error('live fetch');}; play();`);
  await expect.poll(()=>f.evaluate(`starts.filter(s=>s.loop).length`)).toBe(1);
  const run=await f.evaluate(`(async()=>{
    pauseClock();pauseClock();resumeClock();resumeClock();startClock();
    const afterReset=starts.length;
    await noacgSoundContext.suspend(); const blocked=noacgSoundStatus();
    await noacgSoundContext.resume(); await new Promise(r=>setTimeout(r,30));
    const restored=starts.length; noacgSoundRestore(); noacgSoundRestore();
    const dedup=starts.length; clockDeadline=Date.now()-1; tickClock();tickClock();
    const finished=starts.length, loops=Object.values(noacgSoundPlaying).filter(p=>p.source.loop).length;
    stop(); const tail=Object.keys(noacgSoundPlaying).length;
    noacgSoundSetQuiet(true);stop();noacgSoundSetQuiet(false);
    return {afterReset,blocked,restored,dedup,finished,loops,tail,remaining:Object.keys(noacgSoundPlaying).length,fades:stops.filter(s=>s.at && Math.abs(s.at-s.now-.05)<.005).length};
  })()`);
  expect(run.afterReset).toBe(4); expect(run.blocked).toMatch(/blocked/);
  expect(run.restored).toBe(5); expect(run.dedup).toBe(5); expect(run.finished).toBe(6);
  expect(run.loops).toBe(0); expect(run.tail).toBe(1); expect(run.remaining).toBe(0); expect(run.fades).toBeGreaterThan(1);
  await page.evaluate('clockProof.destroy()'); expect(page.frames()).toHaveLength(1);
});

test('PNG single-file packaging preserves independent image selectors and invalid WAV bytes cannot report Ready',async({page})=>{
  await page.goto('/app');await awaitDurableReady(page);
  const html=await page.evaluate(`(async(b64)=>{ ${HARNESS}
    const { materializeSoundAssets } = await import('/src/assets/soundAssets.ts');
    const { composeSelfContainedHtml } = await import('/src/export/selfContained.ts');
    const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4XcAAAAASUVORK5CYII=';
    const t=createPictureTemplate('images/one.png');t.assets=[{path:'images/one.png',data:png}];
    const html=await composeSelfContainedHtml(await materializeSoundAssets(attach(t,['in','out'],'picture:images/one.png')));
    const invalid=await rememberSound({path:'sounds/not-a-wave.wav',data:new Blob(['This is not audio'],{type:'audio/wav'})});
    const c=setProductionSound(linear(),{v:1,assets:[],visuals:{}},'graphic','in',{id:'bad',asset:'assets/sound-'+invalid.hash+'.wav',enabled:true,mode:'one-shot',levelDb:0},invalid);
    window.invalidStage=stage(withProductionSounds(linear(),c));await invalidStage.whenLoaded();
    const answer=await invalidStage.warm('Linear');if(!answer.error || !/decode/.test(answer.error))throw Error('Invalid WAV reported Ready');
    invalidStage.destroy();return html;
  })(${JSON.stringify(wave())})`);
  expect(html.match(/data:audio\/wav;base64,/g)).toHaveLength(1);
  await page.evaluate(html=>{document.body.innerHTML='';const f=document.createElement('iframe');f.srcdoc=html;document.body.appendChild(f);},html);
  const f=page.frames().find(f=>f.parentFrame()===page.mainFrame())!;
  await expect.poll(()=>f.evaluate('typeof noacgSoundPrepare')).toBe('function');
  const result=await f.evaluate(`(async()=>{await noacgSoundPrepare();var starts=0,original=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(){starts++;return original.apply(this,arguments);};window.fetch=function(){throw Error('Live fetch');};play();stop();update(JSON.stringify({f0:'unconfigured.png'}));play();stop();noacgSoundDispose();return {starts,disposed:noacgSoundDisposed,remaining:Object.keys(noacgSoundPlaying).length};})()`);
  expect(result).toEqual({starts:2,disposed:true,remaining:0});
});

test('missing or corrupt preparation fails visibly, retries, and never delays a visual or replays its missed In',async({page})=>{
  await page.goto('/app');await awaitDurableReady(page);
  const first=await page.evaluate(`(async(b64)=>{ ${HARNESS}
    const { writeAudioBlob } = await import('/src/model/durableStore.ts');
    await writeAudioBlob(ref.hash,new Blob(['corrupt']));
    const t=attach(linear(),['in']);const root=document.createElement('div');document.body.appendChild(root);
    window.downloadAllowed=false;window.requests=0;
    const blob=await(await fetch('data:audio/wav;base64,'+b64)).blob();
    window.repairStage=createOutputStage(root,{v:2,resolution:t.resolution,graphics:[{key:t.name,html:t.html,css:t.css,js:t.js,assets:t.assets,resolution:t.resolution,fps:t.fps}],cues:[]},{sound:'program',loadSound:async()=>{requests++;if(!downloadAllowed)throw Error('Storage offline');return blob;}});
    await repairStage.whenLoaded();return repairStage.warm(t.name);
  })(${JSON.stringify(wave())})`);
  expect(first.error).toMatch(/Storage offline/);
  const f=page.frames().find(f=>f.parentFrame()===page.mainFrame())!;
  await f.evaluate(`window.starts=0;const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(){starts++;return start.apply(this,arguments);};play();`);
  expect(await f.evaluate(`noacgCurrent[noacgMachine.groups[0].id]`)).not.toBe('off');
  await page.evaluate(`downloadAllowed=true`);
  const repaired=await page.evaluate(`repairStage.warm('Linear')`); expect(repaired.error).toBeNull();
  expect(await f.evaluate('starts')).toBe(0);
  await f.evaluate(`stop();play();`); expect(await f.evaluate('starts')).toBe(1);
  const requests=await page.evaluate('requests'); expect(requests).toBe(2);
});

test('compact shared Sounds preserves substantial quiz fields and actions, swaps independently, and survives reopen',async({page})=>{
  const errors: string[]=[], failures: string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('requestfailed',r=>failures.push(r.url()));
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/app'); const name=await page.evaluate(async()=> (await import('/src/templates/catalog.ts')).variantById('qz15')!.name);
  await bootstrapGraphic(page,name);const id=await openProductionWithCurrent(page,'Shared quiz sounds');
  const sounds=page.getByTestId('production-sounds'), actions=page.getByTestId('cue-actions');
  await expect(sounds.locator('summary')).toHaveText('Sounds · None'); await expect(sounds).not.toHaveAttribute('open','');
  const before=await actions.locator('button').count(); expect(before).toBeGreaterThan(5);
  await sounds.locator('summary').click(); await sounds.getByRole('button',{name:'Add sound',exact:true}).click();
  await expect(sounds.getByLabel('Sound trigger')).toBeVisible();
  await sounds.getByLabel('Upload graphic sound').setInputFiles({name:'intro.wav',mimeType:'audio/wav',buffer:Buffer.from(wave(),'base64')});
  await expect(sounds.locator('summary')).toHaveText('Sounds · 1 attached');
  await sounds.getByRole('button',{name:'Close settings'}).click();
  await sounds.getByRole('button',{name:'Add sound',exact:true}).click(); await sounds.getByLabel('Sound trigger').selectOption('correct');
  await sounds.getByLabel('Choose sound').selectOption({label:'intro.wav'});await sounds.getByRole('button',{name:'Attach sound'}).click();
  await sounds.getByLabel('Sound level dB').fill('');await sounds.getByLabel('Sound level dB').pressSequentially('-6');await sounds.getByLabel('Sound level dB').blur();
  await expect(sounds.locator('.sound-attachment').filter({hasText:'Correct'})).toContainText('-6 dB');
  await sounds.getByLabel('Enabled',{exact:true}).uncheck();await expect(sounds.locator('summary')).toHaveText('Sounds · 2 attached');
  await sounds.getByLabel('Upload graphic sound').setInputFiles({name:'correct.wav',mimeType:'audio/wav',buffer:Buffer.from(wave(880),'base64')});
  await expect(sounds.locator('.sound-attachment').filter({hasText:'Correct'})).toContainText('correct.wav');
  await expect(sounds.locator('.sound-attachment').filter({hasText:'In'})).toContainText('intro.wav');
  await expect(sounds.getByLabel('Change sound')).toHaveValue('');
  await sounds.getByLabel('Change sound').selectOption({label:'intro.wav'});
  await expect(sounds.locator('.sound-attachment').filter({hasText:'Correct'})).toContainText('intro.wav');
  await sounds.getByLabel('Change sound').selectOption({label:'correct.wav'});
  await expect(sounds.locator('.sound-attachment').filter({hasText:'Correct'})).toContainText('correct.wav');
  const preserved=await actions.locator('button').count();expect(preserved).toBe(before);
  expect((await actions.boundingBox())!.y).toBeLessThan((await sounds.boundingBox())!.y);
  await page.getByTestId('verb-take').click();await page.getByTestId('cue-action-pickB').click();await page.getByTestId('cue-action-judge').click();
  await expect(page.getByTestId('machine-state-chip')).toHaveText(/Reveal/);
  const monitor=page.frameLocator('[data-testid="program-stage"] iframe'); await expect(monitor.locator('.quiz-option.quiz-correct')).toHaveCount(1);
  expect(await monitor.locator('body').evaluate(()=> (window as unknown as {noacgSoundContext?: unknown}).noacgSoundContext ?? null)).toBeNull();
  await page.getByTestId('verb-out').click();
  await sounds.scrollIntoViewIfNeeded();
  await page.screenshot({path:'docs/work-specs/playout-shared-sounds/built/quiz-expanded.png',fullPage:true});
  await sounds.locator('summary').click();await page.screenshot({path:'docs/work-specs/playout-shared-sounds/built/quiz-collapsed.png',fullPage:true});
  await page.reload();await awaitDurableReady(page);await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.getByTestId('production-sounds').locator('summary')).toHaveText('Sounds · 2 attached');
  const config=await page.evaluate(async sid=>{const {loadShows}=await import('/src/model/shows.ts');return loadShows().find(s=>s.id===sid)!.graphics[0].soundConfig!;},id);
  expect(config.assets).toHaveLength(2);expect(Object.keys(config.visuals.graphic.bindings)).toHaveLength(2);
  await page.setViewportSize({width:1093,height:768});await page.getByTestId('production-sounds').locator('summary').click();await expect(actions).toBeVisible();
  await expect(sounds.locator('.sound-attachment').first()).toBeVisible();
  await sounds.scrollIntoViewIfNeeded();
  await page.screenshot({path:'docs/work-specs/playout-shared-sounds/built/quiz-narrow.png',fullPage:true});
  expect(errors).toEqual([]);expect(failures).toEqual([]);
  const packaged=await page.evaluate(async sid=>{
    const {loadShows,setShowCues,setGraphicSounds}=await import('/src/model/shows.ts'); const {loadGraphics}=await import('/src/model/library.ts');
    const {commitDurableWrites}=await import('/src/model/durableStore.ts');
    const {buildPack,parsePack,installPack}=await import('/src/packs/graphicsPack.ts');
    const {buildOutputPayload}=await import('/src/control/hostedControl.ts');
    const {buildShowZipFor}=await import('/src/export/showExport.ts');
    const {externalizeAssets}=await import('/src/backend/assets.ts');
    let s=loadShows().find(s=>s.id===sid)!;
    setShowCues(sid,Array.from({length:200},(_,i)=>({sourceId:s.graphics[0].id,label:'Question '+i,values:{}})));await commitDurableWrites();
    s=loadShows().find(s=>s.id===sid)!;
    const wire=await buildPack(s),parsed=parsePack(JSON.stringify(wire));if(parsed.error)throw Error(parsed.error);
    const copy=await installPack(parsed.pack!);
    const copied=JSON.parse(JSON.stringify(copy.graphics[0].soundConfig!));copied.visuals.graphic.bindings.correct.levelDb=-12;
    const changed=setGraphicSounds(copy.id,copy.graphics[0].id,copied,JSON.stringify(copy.graphics[0].soundConfig));if(changed.error)throw Error(changed.error);
    await commitDurableWrites();
    const copyIndependent=loadShows().find(s=>s.id===sid)!.graphics[0].soundConfig!.visuals.graphic.bindings.correct.levelDb===-6 && loadShows().find(s=>s.id===copy.id)!.graphics[0].soundConfig!.visuals.graphic.bindings.correct.levelDb===-12;
    const payload=await buildOutputPayload(s,loadGraphics()), uploaded: string[]=[];
    const baseline=await buildOutputPayload({...s,graphics:s.graphics.map(g=>({...g,soundConfig:undefined}))},loadGraphics());
    const cloud=await externalizeAssets(s,'publisher',async(key)=>{uploaded.push(key);});
    const zip=await buildShowZipFor(s,'casparcg');
    const htmlFile=Object.values(zip.files).find(f=>f.name.endsWith('.html') && !/controlpanel/.test(f.name))!;
    const html=await htmlFile.async('string');
    return {assets:wire.soundAssets!.length,copy:copy.graphics[0].soundConfig,copyIndependent,payloadDelta:JSON.stringify(payload).length-JSON.stringify(baseline).length,cuesIdentical:JSON.stringify(payload.cues)===JSON.stringify(baseline.cues),cuesHaveSounds:s.cues.some(c=>'soundConfig' in c || 'assets' in c),cloudHasAudioBytes:JSON.stringify(cloud).includes('data:audio/wav'),uploaded,html};
  },id);
  expect(packaged.assets).toBe(2);expect(packaged.copy.assets).toHaveLength(2);
  expect(packaged.copyIndependent).toBe(true);
  expect(packaged.cuesHaveSounds).toBe(false);expect(packaged.cuesIdentical).toBe(true);expect(packaged.payloadDelta).toBeLessThan(20000);
  expect(packaged.uploaded).toHaveLength(2);expect(packaged.cloudHasAudioBytes).toBe(false);
  expect(packaged.html).not.toContain('noacg-audio:');expect(packaged.html.match(/data:audio\/wav;base64,/g)).toHaveLength(2);
  await page.evaluate(html=>{document.body.innerHTML='';const f=document.createElement('iframe');f.srcdoc=html;document.body.appendChild(f);},packaged.html);
  const exported=page.frames().find(f=>f.parentFrame()===page.mainFrame())!;
  await expect.poll(()=>exported.evaluate('typeof noacgSoundPrepare')).toBe('function');
  await exported.evaluate('noacgSoundPrepare()');expect(await exported.evaluate('noacgSoundStatus()')).toBeNull();
});

test('stalled preparation retries and restores the current countdown loop once without replaying its missed In',async({page})=>{
  await page.goto('/app');await awaitDurableReady(page);await page.clock.install();
  await page.evaluate(`(async(b64)=>{ ${HARNESS}
    const { writeAudioBlob } = await import('/src/model/durableStore.ts');
    await writeAudioBlob(ref.hash,new Blob(['corrupt']));
    const { CATALOG } = await import('/src/templates/catalog.ts');
    const original=CATALOG['game-timer'][0].create({});
    let c=setProductionSound(original,{v:1,assets:[],visuals:{}},'graphic','in',{id:'in',asset:'assets/sound-'+ref.hash+'.wav',enabled:true,mode:'one-shot',levelDb:0},ref);
    c=setProductionSound(original,c,'graphic','countdown-running',{id:'tick',asset:'assets/sound-'+ref.hash+'.wav',enabled:true,mode:'loop',levelDb:0},ref);
    const t=withProductionSounds(original,c),root=document.createElement('div');document.body.appendChild(root);window.stalledKey=t.name;
    window.requests=0;window.repaired=false;
    const blob=await(await fetch('data:audio/wav;base64,'+b64)).blob();
    window.stalled=createOutputStage(root,{v:2,resolution:t.resolution,graphics:[{key:t.name,html:t.html,css:t.css,js:t.js,assets:t.assets,resolution:t.resolution,fps:t.fps}],cues:[]},{sound:'program',loadSound:()=>{requests++;return repaired?Promise.resolve(blob):new Promise(()=>{});}});
    await stalled.whenLoaded();window.warming=stalled.warm(t.name,{f1:'60'});
  })(${JSON.stringify(wave())})`);
  await expect.poll(()=>page.evaluate('requests')).toBe(1);
  const f=page.frames().find(f=>f.parentFrame()===page.mainFrame())!;
  await f.evaluate(`window.starts=[];var raw=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(){starts.push(this.loop);return raw.apply(this,arguments);};play();`);
  await page.clock.fastForward(16_000);
  await expect.poll(()=>f.evaluate('noacgSoundStatus()')).toMatch(/timed out/);
  await page.evaluate('warming');await page.evaluate('repaired=true');
  const ready=await page.evaluate(`stalled.warm(stalledKey)`);expect(ready.error).toBeNull();
  expect(await page.evaluate('requests')).toBe(2);expect(await f.evaluate('starts')).toEqual([true]);
  await page.evaluate('stalled.warm(stalledKey)');await f.evaluate('noacgSoundRestore();noacgSoundRestore()');
  expect(await f.evaluate('starts')).toEqual([true]);
  await f.evaluate('stop();play()');await expect.poll(()=>f.evaluate('starts')).toEqual([true,false,true]);
});
