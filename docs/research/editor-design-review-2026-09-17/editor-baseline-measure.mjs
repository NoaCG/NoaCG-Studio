import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const out=dirname(fileURLToPath(import.meta.url));
const project='C:/Users/ahonemi/.codex/worktrees/editor-baseline-design/NoaCG-Studio';
const studio='C:/Users/ahonemi/.codex/research/ograf-2026-09-13/ograf-studio';
const require=createRequire(project+'/package.json');
const { chromium }=require('playwright');
const servers=[];
const offline={VITE_PREVIEW_DEBOUNCE_MS:'350',VITE_SUPABASE_URL:'',VITE_SUPABASE_ANON_KEY:'',VITE_RENDER_API:'1',VITE_AI_PROVIDER:'',VITE_AI_MODEL:'',VITE_AI_PROXY_URL:'',ANTHROPIC_API_KEY:'',OPENAI_API_KEY:'',GOOGLE_API_KEY:'',GEMINI_API_KEY:'',AI_GATEWAY_API_KEY:'',VERCEL_OIDC_TOKEN:'',HF_TOKEN:'',HUGGINGFACE_TOKEN:'',HUGGINGFACE_API_KEY:'',AI_KEY_ENCRYPTION_SECRET:'',AI_PRO_ENABLED:''};
async function server(root,cwd,port,env={}){
 const child=spawn(process.execPath,[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd,env:{...process.env,...env},windowsHide:true,stdio:['ignore','pipe','pipe']});
 servers.push(child);let log='';child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);
 for(let i=0;i<100;i++){if(child.exitCode!==null)throw new Error(log);try{const r=await fetch(`http://127.0.0.1:${port}`);if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,200));}throw new Error('Server did not become ready: '+log);
}
let browser;
const results={at:new Date().toISOString(),method:'Aided scripted baseline; render geometry sampling, not human usability',debounceMs:350,tasks:[],performance:[]};
const save=(name,value)=>writeFileSync(out+'/'+name,JSON.stringify(value,null,2));
try{
 await server(project,project,5291,offline);await server(studio,studio+'/apps/editor',5292);browser=await chromium.launch();results.browser=browser.version();
 const p=await browser.newPage({viewport:{width:1366,height:768}});p.setDefaultTimeout(15000);
 await p.addInitScript(()=>{try{localStorage.setItem('spx-gfx-prefs',JSON.stringify({advancedMode:true}));}catch{}});
 await p.goto('http://127.0.0.1:5291/app#/home');await p.locator('.topbar').waitFor();
 const f1=JSON.parse((await import('node:fs')).readFileSync(project+'/docs/research/editor-baseline-2026-09-17/hairline.json','utf8').replace(/^\uFEFF/,''));
 const fixture=await p.evaluate(async(template)=>{
  const {spliceAnimData,parseAnimData}=await import('/src/blocks/animData.ts');
  const data={version:2,root:'#stress-root',speed:1,steps:[{name:'Enter',duration:4,ease:'none',layers:{}},{name:'Out',duration:.5,ease:'none',layers:{}}]};
  template.name='F4 - 30 layers 300 property keys';template.type='blank';template.fps=25;template.fields=[];template.layers=[];template.assets=[];
  const elements=[],rules=[];
  for(let i=0;i<30;i++){const id='stress-'+i;elements.push(`<div id="${id}" class="stress-layer" data-gfx="baseline"></div>`);rules.push(`#${id}{left:${120+(i%6)*280}px;top:${100+Math.floor(i/6)*170}px}`);data.steps[0].layers['#'+id]={x:Array.from({length:5},(_,j)=>({time:j,value:j%2?80:0})),opacity:Array.from({length:5},(_,j)=>({time:j,value:j%2?1:.6}))};}
  template.html='<!doctype html><html><head><script src="js/gsap.min.js"></script><link rel="stylesheet" href="css/template.css"><script src="js/template.js"></script></head><body><div id="stress-root">'+elements.join('')+'</div></body></html>';
  template.css='*{box-sizing:border-box}html,body{margin:0;width:1920px;height:1080px;overflow:hidden}#stress-root{position:absolute;inset:0}.stress-layer{position:absolute;width:180px;height:90px;background:#edb24f;color:#122537;font:36px Arial;display:flex;align-items:center;justify-content:center}'+rules.join('\n');
  template.js=spliceAnimData(template.js,data);if(!parseAnimData(template.js))throw Error('Invalid fixture');
  const {getTemplateParts}=await import('/src/model/structure.ts');if(getTemplateParts(template.html,template.fields).length!==30)throw Error('Fixture must have 30 addressable parts');const {useTemplateStore}=await import('/src/store/templateStore.ts');useTemplateStore.getState().applyTemplate(template,{resetSampleData:true});return template;
 },f1);save('f4-noacg.json',fixture);await p.evaluate(()=>{location.hash='';});
 await p.getByTestId('timeline-v2').waitFor();await p.frameLocator('iframe.preview-frame').locator('#stress-0').waitFor();
 const st=await browser.newPage({viewport:{width:1366,height:768}});st.setDefaultTimeout(15000);await st.goto('http://127.0.0.1:5292');await st.getByRole('combobox',{name:'Add broadcast recipe'}).waitFor();
 const studioFixture=await st.evaluate(async()=>{
  const {createLowerThirdExampleProject}=await import('/src/examples/lowerThirdExample.ts');const {useProjectStore}=await import('/src/state/projectStore.ts');
  const x=createLowerThirdExampleProject(),c=x.compositions[0],base=c.layers[0];c.frameRate=25;c.name='F4';c.dataFields=[];c.layers=[];c.transitions[0].durationFrames=100;c.transitions[1].durationFrames=13;
  for(let i=0;i<30;i++){const l=structuredClone(base);l.id='stress-'+i;l.name='Layer '+(i+1);l.bindings=[];l.effects={};l.element.fill='#edb24f';l.element.borderRadius={topLeft:0,topRight:0,bottomLeft:0,bottomRight:0};l.element.strokeWidth=0;l.keyframes=[];l.transform={...base.keyframes[1].transform,x:120+(i%6)*280,y:100+Math.floor(i/6)*170,width:180,height:90,opacity:.6};l.animationTracks={x:Array.from({length:5},(_,j)=>({id:`x-${i}-${j}`,frame:j*25,value:l.transform.x+(j%2?80:0),easing:'linear'})),opacity:Array.from({length:5},(_,j)=>({id:`o-${i}-${j}`,frame:j*25,value:j%2?1:.6,easing:'linear'}))};l.keyframes=[{...base.keyframes[1],id:'base-'+i,frame:0,transform:l.transform}];delete l.transform;c.layers.push(l);}
  x.name='F4 - 30 layers 300 property keys';useProjectStore.getState().loadProject(x);return x;
 });save('f4-studio.json',studioFixture);
 await st.waitForTimeout(1000);results.studioLayerDOM=await st.locator('[data-layer-id]').count();
 // Capture fixture identity and rendered bounds before assigning performance meaning.
 for(const [name,page]of[['noacg',p],['studio',st]]){
  results.tasks.push({editor:name,body:await page.locator('body').innerText()});
  await page.screenshot({path:out+'/'+name+'-stress-1366.png'});
 }
 for(const width of[1366,1920]){
  for(const [name,page]of[['noacg',p],['studio',st]]){
   await page.setViewportSize({width,height:width===1366?768:1080});
   const record={editor:name,width,selections:[],scrubs:[],errors:[]};results.performance.push(record);
   for(let i=0;i<30;i++){
    const selector=name==='noacg'?`.tlv2-labels .timeline-label[data-part="#stress-${i}"]`:`.timeline-layer-select[title="Select Layer ${i+1}"]`;
    try{const b=page.locator(selector);await b.scrollIntoViewIfNeeded();const start=Date.now();await b.click();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));record.selections.push({layer:i,automationRoundTripMs:Date.now()-start});}catch(e){record.errors.push(String(e));break;}
   }
   const frame=name==='noacg'?page.frames().find(f=>f.url()==='about:srcdoc'):page.mainFrame();
   if(!frame){record.errors.push('No preview frame');continue;}
   const target=name==='noacg'?'#stress-0':'[data-layer-id="stress-0"]';
   record.targetCount=await frame.locator(target).count();
   if(!record.targetCount)continue;
   // Per-rAF measured bounds/opacity. Count changed rendered poses, never callback count.
   await frame.evaluate((sel)=>{window.__poses=[];window.__capture=true;const sample=()=>{if(!window.__capture)return;const e=document.querySelector(sel);if(e){const r=e.getBoundingClientRect();window.__poses.push({t:performance.timeOrigin+performance.now(),x:r.x,y:r.y,w:r.width,h:r.height,opacity:getComputedStyle(e).opacity});}requestAnimationFrame(sample)};requestAnimationFrame(sample)},target);
   const ruler=name==='noacg'?page.getByTestId('tlv2-clip-0'):page.locator('.timeline-ruler');
   try{
    if(name==='noacg'){for(let z=0;z<3;z++)await page.getByTestId('tlv2-zoom-out').click();}
    const box=await ruler.boundingBox();
    for(let i=0;i<10;i++){
     const left=box.x+8,right=Math.min(box.x+box.width*.8,width-320),y=box.y+(name==='noacg'?8:12);
     const start=Date.now();await page.mouse.move(left,y);await page.mouse.down();
     for(let j=0;j<40;j++){await page.mouse.move(left+(right-left)*j/39,y);await page.waitForTimeout(16);}
     await page.mouse.up();await page.waitForTimeout(200);record.scrubs.push({start,end:Date.now()});
    }
   }catch(e){record.errors.push(String(e));}
   record.poses=await frame.evaluate(()=>{window.__capture=false;return window.__poses});
   await page.screenshot({path:out+'/'+name+'-stress-'+width+'.png'});
   save('baseline-measurements.json',results);
  }
 }
 // Current source preservation: unknown format must remain available, never execute it to parse.
 results.preservation=await p.evaluate(async(template)=>{const {parseAnimData,spliceAnimData}=await import('/src/blocks/animData.ts');const data=parseAnimData(template.js);const unknown={...template,js:template.js.replace('"version": 2','"version": 999')};const custom=structuredClone(data);custom.steps[0].layers['#stress-0'].x[1].ease='power2.out';const hand={...template,css:template.css+'\n/* handwritten sentinel */\n.custom{isolation:isolate}',js:spliceAnimData(template.js,custom)+'\n// handwritten sentinel\nfunction ownerHook(){return "keep";}'};return{unknown,hand,unknownParsed:parseAnimData(unknown.js),customParsed:parseAnimData(hand.js)}},fixture);save('f5-preservation.json',results.preservation);
 save('baseline-measurements.json',results);console.log(JSON.stringify({tasks:results.tasks.map(t=>t.editor),performance:results.performance.map(({poses,...r})=>({...r,poseSamples:poses?.length})),browser:results.browser},null,2));
}catch(e){results.error=String(e);save('baseline-measurements.json',results);throw e;}finally{await browser?.close();for(const child of servers)child.kill();}
