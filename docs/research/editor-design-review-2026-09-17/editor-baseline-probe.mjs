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
try{
 await server(project,project,5291,offline);await server(studio,studio+'/apps/editor',5292);
 browser=await chromium.launch();
 const observations={browser:browser.version(),debounceMs:350,capturedAt:new Date().toISOString()};
 for(const [name,url] of [['noacg','http://127.0.0.1:5291/app#/home'],['studio','http://127.0.0.1:5292']]){
  const page=await browser.newPage({viewport:{width:1366,height:768}});await page.goto(url);await page.waitForLoadState('networkidle');
  await page.screenshot({path:out+'/'+name+'-initial.png'});
  observations[name]={url,text:await page.locator('body').innerText(),buttons:await page.getByRole('button').allTextContents(),inputs:await page.locator('input').evaluateAll(xs=>xs.map(x=>({placeholder:x.placeholder,type:x.type,value:x.value})))};
  if(name==='noacg'){
   await page.getByTestId('home-new-project').click();
   await page.locator('[data-entry="template"]').click();
   await page.locator('.wz-browse-search').fill('Hairline');
   await page.locator('.wz-variant',{hasText:'Hairline'}).first().click();
   for(let i=0;i<4;i++)await page.getByRole('button',{name:'Next →',exact:true}).click();
   await page.getByTestId('wz-finish-name').waitFor();
   observations.noacg.browse=await page.locator('body').innerText();
   observations.noacg.editorDoorCount=await page.getByTestId('wz-finish-editor').count();
   await page.screenshot({path:out+'/noacg-default-finish-1366.png'});
  }else{
   await page.getByRole('combobox',{name:'Add broadcast recipe'}).selectOption('lower-third');
   await page.waitForTimeout(700);
   observations.studio.recipe={text:await page.locator('body').innerText(),buttons:await page.locator('button').evaluateAll(xs=>xs.map(x=>({text:x.innerText,title:x.title,aria:x.getAttribute('aria-label')}))),inputs:await page.locator('input').evaluateAll(xs=>xs.map(x=>({placeholder:x.placeholder,type:x.type,value:x.value,aria:x.getAttribute('aria-label')})))};
   await page.screenshot({path:out+'/studio-recipe-1366.png'});
  }
 }
 const mock=await browser.newPage();const errors=[];mock.on('pageerror',e=>errors.push(String(e)));
 await mock.goto('file:///'+out+'/editor-workspace-preview.html');
 const frame=mock.frameLocator('iframe');await frame.locator('#nc-title').waitFor();
 observations.mockup={errors,viewports:[]};
 for(const width of [1920,1366,1024,320]){
  await mock.setViewportSize({width,height:width===1920?1080:768});await mock.waitForTimeout(200);
  const inner=mock.frames().find(f=>f!==mock.mainFrame());
  observations.mockup.viewports.push(await inner.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:document.body.scrollHeight})));
  await mock.screenshot({path:out+'/proposal-'+width+'.png',fullPage:true});
 }
 await mock.setViewportSize({width:1920,height:1080});
 await frame.locator('#nc-title').fill('Jamie Chen');await frame.locator('#nc-title').press('Tab');
 observations.mockup.edit=await frame.locator('#nc-source').innerText();
 await frame.locator('#nc-undo').click();observations.mockup.undo=await frame.locator('#nc-title').inputValue();
 await frame.locator('#nc-animate').click();await mock.screenshot({path:out+'/proposal-animation-1920.png',fullPage:true});
 await frame.locator('#nc-production').click();await mock.screenshot({path:out+'/proposal-production-1920.png',fullPage:true});
 writeFileSync(out+'/baseline-discovery.json',JSON.stringify(observations,null,2));console.log(JSON.stringify(observations,null,2));
}finally{await browser?.close();for(const child of servers)child.kill();}
