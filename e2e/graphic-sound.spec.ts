// covers: src/templates/shared/animRuntime.ts, src/assets/graphicSoundRuntime.ts, src/blocks/{animData.ts,animEdit.ts}
// covers: src/preview/{composeDocument.ts,previewProtocol.ts}, src/output/{stage.ts,main.ts}
// covers: src/export/targets/{ograf.ts,htmlOverlay.ts}, src/validation/{validateTemplate.ts,templateBench.ts}
// covers: src/control/{localReceiver.ts,receiverScript.ts,hostedReceiver.ts,hostedControl.ts,controlModel.ts,productionControllerHtml.ts,realtimeControl.ts,logFollow.ts}
// focus

import { test, expect } from '@playwright/test';
import { awaitDurableReady, settleDurableWrites } from './_durable';

test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

// Independent audio fixtures. The parallel health session owns its fixture helpers.
const HARNESS = `
  const { emitAnimRegion } = await import('/src/templates/shared/animRuntime.ts');
  const { runtimeJs } = await import('/src/templates/shared/base.ts');
  const { composeDocument } = await import('/src/preview/composeDocument.ts');
  const { createBlankTemplate } = await import('/src/templates/blank.ts');
  const { replaceDefinitionInHtml } = await import('/src/model/spxDefinition.ts');
  const { parseAnimData } = await import('/src/blocks/animData.ts');
  const sound = (id, mode = 'one-shot', levelDb = 0, enabled = true) => ({ id, asset: 'sounds/tone.wav', enabled, levelDb, mode });
  const step = (name, sound) => ({ name, duration: 0.05, ease: 'none', layers: { '#box': { opacity: [{ time: 0, value: 1 }] } }, ...(sound ? { sound } : {}) });
  function tone() {
    const n = 24000, bytes = new ArrayBuffer(44 + n * 2), v = new DataView(bytes);
    const str = (at, s) => [...s].forEach((c, i) => v.setUint8(at+i, c.charCodeAt(0)));
    str(0, 'RIFF'); v.setUint32(4, 36+n*2, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 48000, true); v.setUint32(28, 96000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, n*2, true);
    for(let i=0;i<n;i++) v.setInt16(44+i*2, Math.sin(i*2*Math.PI*1000/48000)*8000, true);
    return 'data:audio/wav;base64,' + btoa(String.fromCharCode(...new Uint8Array(bytes)));
  }
  function tpl(data) {
    const t = createBlankTemplate();
    t.name = 'Sound proof';
    t.html = replaceDefinitionInHtml('<!doctype html><html><head></head><body><div id="box">Sound proof</div></body></html>', t.settings, []);
    t.css = '#box { opacity: 0; color: white; font-size: 40px; }';
    t.js = runtimeJs(t.name, emitAnimRegion(data));
    t.assets = [{ path: 'sounds/tone.wav', data: tone() }];
    return t;
  }
  const linear = () => ({version:2, root:'#box', speed:1, steps:[step('In', sound('in')),step('Reveal',sound('reveal')),step('Out',sound('out'))]});
  function quiz() {
    const d = linear();
    d.steps[1].sound = sound('destination');
    d.machine = {groups:[{id:'main',initial:'off',defaultPath:['question','answer','out'],states:[
      {id:'off'}, {id:'question'}, {id:'answer'}, {id:'out'}, {id:'wrong',timeline:step('Wrong')}
    ],transitions:[
      {from:'question',to:'answer',trigger:'operator',event:'correct',style:'cut',sound:sound('correct')},
      {from:'question',to:'wrong',trigger:'operator',event:'incorrect',sound:sound('wrong')},
      {from:'answer',to:'answer',trigger:'operator',event:'correct',sound:sound('correct')},
      {from:'wrong',to:'question',trigger:'operator',event:'retry'}
    ]}]};
    return d;
  }
  function countdown() {
    const d = linear();
    d.machine = {groups:[{id:'main',initial:'off',defaultPath:['ready','hold','out'],states:[
      {id:'off'}, {id:'ready'}, {id:'hold'}, {id:'out'},
      {id:'running',timeline:step('Running',sound('tick','loop',-12))},
      {id:'paused',timeline:step('Paused')}, {id:'warning',timeline:step('Warning',sound('tick','loop',-12))}
    ],transitions:[
      {from:'ready',to:'running',trigger:'operator',event:'start'},
      {from:'running',to:'paused',trigger:'operator',event:'pause'},
      {from:'warning',to:'paused',trigger:'operator',event:'pause'},
      {from:'paused',to:'running',trigger:'operator',event:'resume'},
      {from:'running',to:'warning',trigger:'timer',after:0.1},
      {from:'running',to:'ready',trigger:'operator',event:'reset'},
      {from:'paused',to:'ready',trigger:'operator',event:'reset'},
      {from:'warning',to:'ready',trigger:'operator',event:'reset'}
    ]}]};
    return d;
  }
  async function boot(t, program = true) {
    const f = document.createElement('iframe'); document.body.appendChild(f);
    await new Promise(resolve => { f.onload = resolve; f.srcdoc = composeDocument(t, {liveControl:true, ...(program ? {sound:'program'} : {})}); });
    const w = f.contentWindow; await w.noacgSoundPrepare();
    const starts = [], raw = w.AudioBufferSourceNode.prototype.start;
    w.AudioBufferSourceNode.prototype.start = function(...args) { starts.push({at:performance.now(),loop:this.loop}); return raw.apply(this,args); };
    return { f, w, starts, active: () => Object.values(w.noacgSoundPlaying).map(p => ({id:p.sound.id,loop:p.source.loop,gain:p.gain.gain.value})),
      ids: () => Object.values(w.noacgSoundPlaying).map(p=>p.sound.id) };
  }
`;

test('linear In, Next, early Out, repeat, disabled sound and silent preview execute on the real buffer graph', async ({ page }) => {
  await page.goto('/app');
  const r = await page.evaluate(`(async () => {
    ${HARNESS}
    const t = tpl(linear()), b = await boot(t);
    const beforeOpacity=b.w.getComputedStyle(b.w.document.querySelector('#box')).opacity;
    const before = performance.now(); b.w.play(); const after = performance.now();
    const afterOpacity=b.w.getComputedStyle(b.w.document.querySelector('#box')).opacity;
    const first = b.ids(), skew = b.starts[0].at - before;
    b.w.next(); const next = b.ids(); b.w.stop(); const out = b.ids();
    b.w.stop(); const repeatedOut = b.starts.length;
    b.w.play(); b.w.stop(); const early = b.ids();
    b.w.noacgSoundDispose(); const disposed = b.active().length;
    const quiet = await boot(t,false); quiet.w.play(); quiet.w.next(); quiet.w.stop();
    const disabledData=linear(); disabledData.steps[0].sound.enabled=false;
    const disabled=await boot(tpl(disabledData)); disabled.w.play();
    return {first,next,out,repeatedOut,early,disposed,quiet:quiet.starts.length,disabled:disabled.starts.length,skew,pressSpan:after-before,beforeOpacity,afterOpacity};
  })()`);
  expect(r).toMatchObject({ first:['in'], next:['in','reveal'], out:['out'], repeatedOut:3, early:['out'],disposed:0,quiet:0,disabled:0,beforeOpacity:'0',afterOpacity:'1' });
  expect(r.skew).toBeGreaterThanOrEqual(0);
  expect(r.skew).toBeLessThanOrEqual(r.pressSpan);
});

test('branched quiz sounds follow structural acceptance including styled and self transitions', async ({ page }) => {
  await page.goto('/app');
  const r = await page.evaluate(`(async () => {
    ${HARNESS}
    const b=await boot(tpl(quiz())); b.w.noacgDispatch('correct'); const off=b.starts.length;
    b.w.play(); b.w.noacgDispatch('correct'); const correct=b.ids();
    b.w.noacgDispatch('incorrect'); const refused=b.starts.length;
    b.w.noacgDispatch('correct'); const self=b.starts.length, selfCopies=b.ids().filter(id=>id==='correct').length;
    b.w.play(); b.w.noacgDispatch('incorrect'); const wrong=b.ids();
    b.w.noacgSnap({main:'answer'}); const snap=b.starts.length, active=b.active().length;
    return {off,correct,refused,self,selfCopies,wrong,snap,active};
  })()`);
  expect(r).toEqual({off:0,correct:['in','correct'],refused:2,self:3,selfCopies:1,wrong:['in','wrong'],snap:5,active:0});
});

test('countdown leaves its loop on pause, reset, stop and recovery; current loop restores once', async ({ page }) => {
  await page.goto('/app');
  const r = await page.evaluate(`(async () => {
    ${HARNESS}
    const b=await boot(tpl(countdown())); b.w.play(); b.w.noacgDispatch('start'); const running=b.active();
    b.w.noacgDispatch('pause'); const paused=b.ids();
    b.w.noacgDispatch('resume'); const resume=b.active().filter(p=>p.loop).length;
    b.w.noacgDispatch('reset'); const reset=b.active().filter(p=>p.loop).length;
    const beforeQuiet=b.starts.length;
    b.w.noacgSoundSetQuiet(true); b.w.play(); b.w.noacgDispatch('start'); b.w.noacgDispatch('pause'); b.w.noacgDispatch('resume');
    const historical=b.starts.length; b.w.noacgSoundSetQuiet(false); const restored=b.active().filter(p=>p.loop).length;
    b.w.noacgSoundRestore(); const duplicate=b.starts.length;
    b.w.noacgSnap({main:'running'},{timers:false}); const parked=b.active().length;
    b.w.noacgSnap({main:'running'}); const snapped=b.active().filter(p=>p.loop).length;
    b.w.stop(); const stopped=b.active().filter(p=>p.loop).length;
    b.w.noacgSnap(null); return {running,paused,resume,reset,beforeQuiet,historical,restored,duplicate,parked,snapped,stopped,final:b.active().length};
  })()`);
  expect(r.running.find((p: {loop:boolean})=>p.loop)?.id).toBe('tick');
  expect(r.running.find((p: {loop:boolean})=>p.loop)?.gain).toBeCloseTo(Math.pow(10,-12/20),6);
  expect(r.paused).not.toContain('tick');
  expect(r).toMatchObject({resume:1,reset:0,restored:1,parked:0,snapped:1,stopped:0,final:0});
  expect(r.historical).toBe(r.beforeQuiet); expect(r.duplicate).toBe(r.historical+1);
});

test('timer execution and actual gain survive parallel groups and cleanup', async ({ page }) => {
  await page.goto('/app');
  const r = await page.evaluate(`(async () => {
    ${HARNESS}
    const d=countdown(); d.machine.groups[0].transitions.find(t=>t.trigger==='timer').to='paused';
    d.machine.groups[0].transitions.find(t=>t.trigger==='timer').sound=sound('warning');
    d.machine.groups.push({id:'other',initial:'idle',states:[{id:'idle'},{id:'on',timeline:step('Other',sound('other','loop',-6))}],
      transitions:[{from:'idle',to:'on',trigger:'operator',event:'start'}]});
    const b=await boot(tpl(d)); b.w.play(); b.w.noacgDispatch('start');
    const appliedGain=b.active().find(p=>p.id==='tick').gain;
    const parallel=b.active().filter(p=>p.loop).length;
    await new Promise((resolve,reject)=>{ const until=Date.now()+2000; const check=()=>{
      if(b.w.noacgMachineState().groups.main==='paused')resolve(); else if(Date.now()>until)reject(Error('Timer did not fire')); else setTimeout(check,10);
    }; check(); });
    const timer=b.ids(); b.w.noacgSoundDispose();
    // Independent OfflineAudioContext measures the exact GainNode value on real decoded samples.
    const measure=async(gain)=>{ const ctx=new OfflineAudioContext(1,4800,48000), src=ctx.createBufferSource(), g=ctx.createGain();
      src.buffer=Object.values(b.w.noacgSoundBuffers)[0];
      g.gain.value=gain; src.connect(g);g.connect(ctx.destination);src.start();
      const samples=(await ctx.startRendering()).getChannelData(0);return Math.sqrt(samples.reduce((n,s)=>n+s*s,0)/samples.length); };
    const gainDb=20*Math.log10((await measure(appliedGain))/(await measure(1)));
    return {timer,gainDb,parallel,closed:b.w.noacgSoundContext.state,active:b.active().length};
  })()`);
  expect(r.timer).toContain('warning');
  expect(r.timer).not.toContain('tick');
  expect(r.timer).toContain('other');
  expect(r.parallel).toBe(2);
  expect(r.gainDb).toBeCloseTo(-12,3);
  expect(r.active).toBe(0);
});

test('save/reopen, publication gate and output payload retain sound settings and bytes', async ({ page }) => {
  await page.goto('/app'); await awaitDurableReady(page);
  const id = await page.evaluate(`(async()=>{ ${HARNESS}
    const {createGraphic}=await import('/src/model/library.ts');
    const {publishGate}=await import('/src/validation/publishGate.ts');
    const t=tpl(quiz()), gate=publishGate(t);
    if(!gate.ok)throw Error(JSON.stringify(gate.errors));
    return createGraphic(t,{name:t.name}).doc.id;
  })()`);
  await settleDurableWrites(page); await page.reload(); await awaitDurableReady(page);
  const r = await page.evaluate(`(async()=>{ ${HARNESS}
    const {graphicById}=await import('/src/model/library.ts');
    const {createShowNamed,addGraphicToShow}=await import('/src/model/shows.ts');
    const {buildOutputPayload}=await import('/src/control/hostedControl.ts');
    const g=graphicById(${JSON.stringify(id)}),show=createShowNamed('Sound proof');
    const added=addGraphicToShow(show.id,g.template,{graphicId:g.id});
    const output=await buildOutputPayload(added.shows.find(s=>s.id===show.id));
    if(output.graphics[0].assets[0].data!==g.template.assets[0].data)throw Error('Publication changed sound bytes');
    if(parseAnimData(output.graphics[0].js).machine.groups[0].transitions.find(t=>t.event==='correct').sound.asset!=='sounds/tone.wav')throw Error('Publication lost sound');
    return {sound:parseAnimData(g.template.js).machine.groups[0].transitions.find(t=>t.event==='correct').sound,bytes:g.template.assets[0].data};
  })()`);
  expect(r.sound).toMatchObject({enabled:true,levelDb:0,mode:'one-shot'});
  expect(r.bytes).toContain('data:audio/wav;base64,');
});

test('dual package preserves the attachment on import, OGraf isolates audio and skips historical one-shots', async ({ page }) => {
  await page.goto('/app');
  const files = await page.evaluate(`(async()=>{ ${HARNESS}
    const {buildGraphicPackage}=await import('/src/export/noacgPackage.ts');
    const {validateOgrafOfflineCompatibility}=await import('/src/export/targets/ograf.ts');
    const {readOgrafPackage}=await import('/src/export/targets/ografImport.ts');
    const {importZipTemplate}=await import('/src/model/importTemplate.ts');
    const t=tpl(quiz()),zip=await buildGraphicPackage(t),files={};
    for(const [name,file] of Object.entries(zip.files))if(!file.dir)files[name]=await file.async('base64');
    const packageRead=readOgrafPackage(new Map(Object.entries(files).map(([path,b64])=>[path,Uint8Array.from(atob(b64),c=>c.charCodeAt(0))])));
    if(packageRead.errors.length || packageRead.stale)throw Error('Invalid or stale packaged source');
    const imported=await importZipTemplate('sound.zip',await zip.generateAsync({type:'arraybuffer'}));
    if(!imported.template || parseAnimData(imported.template.js).steps[0].sound.asset!=='sounds/tone.wav')throw Error('Import lost attachment');
    if(imported.template.assets.find(a=>a.path==='sounds/tone.wav').data!==t.assets[0].data)throw Error('Import changed sound bytes');
    if(validateOgrafOfflineCompatibility(t).compatible)throw Error('Enabled sounds advertised as offline compatible');
    return files;
  })()`);
  const folder = Object.keys(files).find(p=>p.endsWith('graphic.mjs'))!.replace('graphic.mjs','');
  let failOnce = false;
  await page.route('**/sound-package/**', async route => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname.split('/sound-package/')[1]);
    if (failOnce && path.endsWith('.wav')) { failOnce = false; return route.fulfill({body:'broken audio',contentType:'audio/wav'}); }
    const data = files[folder + path];
    if (!data) return route.fulfill({status:404,body:path});
    await route.fulfill({body:Buffer.from(data,'base64'),contentType:path.endsWith('.mjs')||path.endsWith('.js')?'text/javascript':path.endsWith('.wav')?'audio/wav':'application/json'});
  });
  const r = await page.evaluate(`(async()=>{
    const {default:Graphic}=await import('/sound-package/graphic.mjs');customElements.define('sound-package-proof',Graphic);
    const a=new Graphic(),b=new Graphic();document.body.append(a,b);
    const starts=[],contexts=[],Real=window.AudioContext;
    window.AudioContext=class extends Real{constructor(...args){super(...args);contexts.push(this);}
      createBufferSource(){const s=super.createBufferSource(),raw=s.start;s.start=(...args)=>{starts.push(s);return raw.apply(s,args)};return s;}};
    const loadA=await a.load({renderType:'realtime'}),loadB=await b.load({renderType:'realtime'});
    await a.playAction({skipAnimation:true});const skipped=starts.length;
    await a.customAction({id:'correct',skipAnimation:true});const skippedAnswer=starts.length;
    await a.stopAction({skipAnimation:true});await a.playAction({});await b.playAction({});
    const before=starts.length;await a.dispose({});const isolated=contexts[1].state;
    await b.dispose({});return{loadA,loadB,skipped,skippedAnswer,before,isolated,closed:contexts.map(c=>c.state)};
  })()`);
  expect(r.loadA.statusCode).toBe(200); expect(r.loadB.statusCode).toBe(200);
  expect(r).toMatchObject({skipped:0,skippedAnswer:0,before:2,isolated:'running',closed:['closed','closed']});
  failOnce = true;
  const recovery = await page.evaluate(`(async()=>{
    const {default:Graphic}=await import('/sound-package/graphic.mjs');const g=new Graphic();document.body.append(g);
    const failed=await g.load({renderType:'realtime'}),empty=g.childNodes.length===0;
    const retry=await g.load({renderType:'realtime'}),copies=g.querySelectorAll('#box').length;
    await g.dispose();return{failed:failed.statusCode,empty,retry:retry.statusCode,copies};
  })()`);
  expect(recovery).toEqual({failed:500,empty:true,retry:200,copies:1});
});

test('missing and malformed sounds block publication; the exact decoder exemption does not admit authored network code', async ({ page }) => {
  await page.goto('/app');
  const r=await page.evaluate(`(async()=>{ ${HARNESS}
    const {publishGate}=await import('/src/validation/publishGate.ts');
    const {unsafeJsConstructs}=await import('/src/validation/templateBench.ts');
    const t=tpl(linear()),missing=publishGate({...t,assets:[]});
    const d=linear();d.steps[0].sound.levelDb=7;
    const malformed=publishGate(tpl(d));
    const network=unsafeJsConstructs(t.js+';fetch("https://example.com");');
    return {missing:missing.errors.map(e=>e.rule),malformed:malformed.errors.map(e=>e.rule),network:network.map(e=>e.rule)};
  })()`);
  expect(r.missing).toContain('sound'); expect(r.malformed).toContain('sound'); expect(r.network).toContain('unsafe-js-network');
});

test('exported hosted recovery suppresses history, restores one loop and leaves empty polls alone', async ({ page }) => {
  await page.goto('/app');
  const r=await page.evaluate(`(async()=>{ ${HARNESS}
    const {hostedReceiverBlock}=await import('/src/control/hostedReceiver.ts');
    const d=countdown();d.machine.groups[0].transitions=d.machine.groups[0].transitions.filter(t=>t.trigger!=='timer');
    const b=await boot(tpl(d)),w=b.w,fetch=w.fetch.bind(w),sockets=[];
    let tail=[{id:1,msg:{t:'play'}},{id:2,msg:{t:'event',event:'start'}}],reads=0;
    w.fetch=(url,options)=>{
      if(!String(url).includes('/rest/v1/rpc/'))return fetch(url,options);
      const name=String(url).split('/').pop();
      const value=name==='control_show_by_slug'?[{id:'show',live:{'Sound proof':{state:{groups:{main:'running'}}}},last_event_id:0}]:name==='control_tail'?tail:[];
      if(name==='control_tail'){tail=[];reads++;}
      return Promise.resolve({ok:true,json:()=>Promise.resolve(value)});
    };
    w.WebSocket=class{constructor(){sockets.push(this);}send(){}close(){}};
    w.eval(hostedReceiverBlock({ref:'proof',key:'proof',slug:'proof',graphic:'Sound proof'}));
    await new Promise(resolve=>{const id=setInterval(()=>{if(reads&&b.ids().includes('tick')){clearInterval(id);resolve();}},10)});
    const recovered=b.starts.length;
    sockets[0].onmessage({data:JSON.stringify({event:'phx_reply',topic:'realtime:control-show',payload:{status:'ok'}})});
    await new Promise(resolve=>{const id=setInterval(()=>{if(reads>1){clearInterval(id);resolve();}},10)});
    const afterEmpty=b.starts.length;
    w.noacgSnap({main:'running'});const repeatedSnap=b.starts.length;
    const context=w.noacgSoundContext;b.f.remove();
    await new Promise(resolve=>setTimeout(resolve,0));
    return{recovered,afterEmpty,repeatedSnap,closed:context.state};
  })()`);
  expect(r).toEqual({recovered:1,afterEmpty:1,repeatedSnap:1,closed:'closed'});
});

test('undecodable sound refuses ready and Take instead of airing a silent graphic', async ({ page }) => {
  await page.goto('/app');
  const r=await page.evaluate(`(async()=>{ ${HARNESS}
    const t=tpl(linear());t.assets[0].data='data:audio/wav;base64,AAAA';
    const f=document.createElement('iframe');document.body.append(f);
    await new Promise(resolve=>{f.onload=resolve;f.srcdoc=composeDocument(t,{liveControl:true,sound:'program'});});
    const w=f.contentWindow;let failed=false;try{await w.noacgSoundPrepare();}catch{failed=true;}
    w.play();const result={failed,status:w.noacgSoundStatus(),steps:w.noacgStepsPlayed};f.remove();return result;
  })()`);
  expect(r.failed).toBe(true);expect(r.status).toContain('decode');expect(r.steps).toBe(0);
});

test('audio interruption drops one-shots and prepare restores the current loop once', async ({ page }) => {
  await page.goto('/app');
  const r=await page.evaluate(`(async()=>{ ${HARNESS}
    const d=countdown();d.machine.groups[0].transitions=d.machine.groups[0].transitions.filter(t=>t.trigger!=='timer');
    const b=await boot(tpl(d));b.w.play();b.w.noacgDispatch('start');
    const before=b.starts.length;await b.w.noacgSoundContext.suspend();
    await new Promise(resolve=>{const id=setInterval(()=>{if(!b.ids().length){clearInterval(id);resolve();}},5)});
    const suspended=b.w.noacgSoundStatus();await b.w.noacgSoundPrepare();
    await new Promise(resolve=>{const id=setInterval(()=>{if(b.ids().includes('tick')){clearInterval(id);resolve();}},5)});
    const restored=b.starts.length;await b.w.noacgSoundPrepare();const duplicate=b.starts.length;
    b.w.noacgSoundDispose();b.f.remove();return{before,suspended,restored,duplicate};
  })()`);
  expect(r.suspended).toContain('blocked');expect(r.restored).toBe(r.before+1);expect(r.duplicate).toBe(r.restored);
});

test('carried Out sound waits for the exit motion; interruption cancels it and the normal tail cleans itself', async ({ page }) => {
  await page.goto('/app');
  const r=await page.evaluate(`(async()=>{ ${HARNESS}
    const d=linear();d.steps[2].carried=0.2;d.steps[2].duration=0.3;
    const b=await boot(tpl(d));b.w.play();b.w.next();b.w.stop();const onPress=b.ids();
    const before=b.starts.length;b.w.play();
    await new Promise(resolve=>setTimeout(resolve,350));const canceled=b.starts.length===before+1;
    b.w.next();b.w.stop();const press=performance.now();
    await new Promise(resolve=>{const id=setInterval(()=>{if(b.ids().includes('out')){clearInterval(id);resolve();}},5)});
    const delay=b.starts.at(-1).at-press;
    await new Promise(resolve=>{const id=setInterval(()=>{if(!b.ids().length){clearInterval(id);resolve();}},10)});
    const beforeReplay=b.starts.length;b.w.noacgSoundSetQuiet(true);b.w.play();b.w.next();b.w.stop();b.w.noacgSoundSetQuiet(false);
    await new Promise(resolve=>{const id=setInterval(()=>{if(b.w.noacgOutTimeline.progress()===1){clearInterval(id);resolve();}},10)});
    const replaySilent=b.starts.length===beforeReplay;
    b.w.noacgSoundDispose();b.f.remove();return {onPress,canceled,delay,replaySilent};
  })()`);
  expect(r.onPress).toEqual([]);expect(r.canceled).toBe(true);expect(r.replaySilent).toBe(true);expect(r.delay).toBeGreaterThan(130);expect(r.delay).toBeLessThan(300);
});
