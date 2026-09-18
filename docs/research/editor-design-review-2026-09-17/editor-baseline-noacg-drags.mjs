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
const {readFileSync}=await import('node:fs');const {createHash}=await import('node:crypto');
const read=n=>JSON.parse(readFileSync(out+'/'+n,'utf8').replace(/^\uFEFF/,''));const hash=s=>createHash('sha256').update(s).digest('hex');
const report={at:new Date().toISOString(),actions:[],gestures:[]};const save=()=>writeFileSync(out+'/baseline-noacg-drags.json',JSON.stringify(report,null,2));
try{
 await server(project,project,5291,offline);await server(studio,studio+'/apps/editor',5292);browser=await chromium.launch();
 for(const width of[1366,1920])for(const name of['noacg']){
  const p=await browser.newPage({viewport:{width,height:width===1366?768:1080}});p.setDefaultTimeout(12000);const row={editor:name,width,drags:[]};report.gestures.push(row);
  try{
   if(name==='noacg'){
    await p.addInitScript(()=>{try{localStorage.setItem('spx-gfx-prefs',JSON.stringify({advancedMode:true}));}catch{}});await p.goto('http://127.0.0.1:5291/app#/home');await p.locator('.topbar').waitFor();
    await p.evaluate(async t=>{const{useTemplateStore}=await import('/src/store/templateStore.ts');useTemplateStore.getState().applyTemplate(t,{resetSampleData:true});location.hash='';},read('f4-noacg.json'));await p.getByTestId('timeline-v2').waitFor();
   }else{await p.goto('http://127.0.0.1:5292');await p.getByRole('combobox',{name:'Add broadcast recipe'}).waitFor();await p.evaluate(async t=>{const{useProjectStore}=await import('/src/state/projectStore.ts');useProjectStore.getState().loadProject(t);},read('f4-studio.json'));}
   await p.waitForTimeout(700);
   const source=()=>p.evaluate(async n=>{if(n==='noacg'){const{useTemplateStore}=await import('/src/store/templateStore.ts');return JSON.stringify(useTemplateStore.getState().template)}const{useProjectStore}=await import('/src/state/projectStore.ts');return JSON.stringify(useProjectStore.getState().project.compositions[0].layers)},name);
   for(let i=0;i<10;i++){
    const target=name==='noacg'?p.locator('.tlv2-labels .timeline-label[data-part="#stress-0"]'):p.locator('.timeline-layer-select[title="Select Layer 1"]');if(!(await target.getAttribute('class')).includes(' selected'))await target.click();if(name==='noacg'){const b=await p.getByTestId('tlv2-clip-0').boundingBox();await p.mouse.click(b.x+40,b.y+8);await p.getByTestId('inspector-part-label').waitFor();}await p.waitForTimeout(300);
    let x,y;
    if(name==='noacg'){const overlay=await p.getByTestId('canvas-layer').boundingBox();const width=await p.locator('iframe.preview-frame').evaluate(e=>e.offsetWidth);const b=await p.frameLocator('iframe.preview-frame').locator('#stress-0').evaluate(e=>{const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}});x=overlay.x+b.x*overlay.width/width;y=overlay.y+b.y*overlay.width/width;}
    else{const b=await p.locator('[data-layer-id="stress-0"]').boundingBox();x=b.x+b.width/2;y=b.y+b.height/2;}
    const before=await source(),start=Date.now();await p.mouse.move(x,y);await p.mouse.down();for(let j=1;j<=20;j++){await p.mouse.move(x+40*j/20,y+10*j/20);await p.waitForTimeout(20);}await p.mouse.up();await p.waitForTimeout(1000);const after=await source();
    if(name==='studio'){await p.getByRole('button',{name:'Edit',exact:true}).click();await p.getByRole('menuitem',{name:/^Undo /}).first().click();}else await p.keyboard.press('Control+z');await p.waitForTimeout(900);const undo=await source();if(i===0)writeFileSync(out+'/'+name+'-drag-undo-'+width+'.json',undo);if(name==='studio'){await p.getByRole('button',{name:'Edit',exact:true}).click();await p.getByRole('menuitem',{name:/^Redo /}).first().click();}else await p.keyboard.press('Control+Shift+z');await p.waitForTimeout(900);const redo=await source();
    row.drags.push({start,end:Date.now(),before:hash(before),after:hash(after),undo:hash(undo),redo:hash(redo),changed:before!==after,undoExact:before===undo,redoExact:after===redo});
    if(i===0){writeFileSync(out+'/'+name+'-drag-before-'+width+'.json',before);writeFileSync(out+'/'+name+'-drag-after-'+width+'.json',after);await p.screenshot({path:out+'/'+name+'-drag-'+width+'.png'});}
    // Reset fixture between trials so drag coordinates and key workload stay comparable.
    if(name==='noacg')await p.evaluate(async t=>{const{useTemplateStore}=await import('/src/store/templateStore.ts');useTemplateStore.getState().applyTemplate(t,{resetSampleData:true});},read('f4-noacg.json'));
    else await p.evaluate(async t=>{const{useProjectStore}=await import('/src/state/projectStore.ts');useProjectStore.getState().loadProject(t);},read('f4-studio.json'));
    await p.waitForTimeout(550);save();
   }
  }catch(e){row.error=String(e);await p.screenshot({path:out+'/'+name+'-gesture-error-'+width+'.png'});}finally{save();await p.close();}
 }
 console.log(JSON.stringify({actions:report.actions.map(({text,...x})=>x),gestures:report.gestures.map(r=>({...r,drags:r.drags.map(d=>({changed:d.changed,undoExact:d.undoExact,redoExact:d.redoExact}))}))},null,2));
}finally{save();await browser?.close();for(const child of servers)child.kill();}
