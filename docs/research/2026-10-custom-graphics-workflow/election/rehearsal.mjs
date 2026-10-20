// Runs only against a short-lived loopback stand-in. Never contacts hosted NoaCG or a provider.
import fs from 'node:fs/promises';
import http from 'node:http';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import core from './core.mjs';
import {normalize,read} from './adapter.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url));
const json=async p=>JSON.parse(await fs.readFile(path.join(dir,p),'utf8'));
const write=(p,x)=>fs.writeFile(path.join(dir,p),typeof x==='string'?x:JSON.stringify(x,null,2)+'\n');
const bindings=await json('bindings.json'),cues=await json('prepared-cues.json');
const templates={};for(const file of await fs.readdir(path.join(dir,'templates'))){const t=await json('templates/'+file);templates[t.name]=t;}
const gates=Object.fromEntries(Object.entries(templates).map(([name,t])=>[name,core.publishGate(t,true)]));
await write('evidence/publish-gates.json',gates);
for(const [name,g]of Object.entries(gates))assert.equal(g.ok,true,name+': '+JSON.stringify(g.errors));
const checks=[];const record=(name)=>checks.push({name,result:'PASS'});
record('All four native template fixtures pass the actual publication gate');
for(const t of Object.values(templates))assert.equal(core.parseDefinition(t.html).fields.length,t.fields.length);
record('Actual SPX parser recovers every declared field');
let data={},lastResolved={},sequence=0;const requests=[],queue=[];
const server=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');
  if(req.headers.authorization!=='Bearer local-rehearsal-only'){res.writeHead(401).end('{"ok":false}');return;}
  if(req.method==='GET'&&req.url==='/api/data/state'){res.end(JSON.stringify({ok:true,data,bindings}));return;}
  if(req.method!=='PATCH'||req.url!=='/api/data/patch'){res.writeHead(404).end('{}');return;}
  let body='';for await(const chunk of req)body+=chunk;
  const patch=JSON.parse(body);data=core.applyPatch(data,patch);
  const resolved=core.resolveBindings(data,bindings),diff=core.diffResolved(lastResolved,resolved);lastResolved=resolved;
  const writes=Object.entries(diff).map(([graphic,applied])=>({graphic,event:++sequence,applied}));queue.push(...writes);
  const response={ok:true,data,writes};requests.push({method:'PATCH',path:req.url,body:patch,response});res.end(JSON.stringify(response));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port;
let browser;try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const pages={},errors=[];
 for(const [name,t]of Object.entries(templates)){const page=await browser.newPage({viewport:{width:1600,height:900}});page.on('pageerror',e=>errors.push(e.message));await page.setContent(core.composeDocument(t));await page.evaluate(v=>window.update(v),Object.fromEntries(t.fields.map(f=>[f.field,f.value])));if(cues[name])await page.evaluate(v=>window.update(v),cues[name]);pages[name]=page;}
 async function flush(){for(const row of queue.splice(0)){assert.ok(!('action'in row));await pages[row.graphic].evaluate(v=>window.update(v),row.applied);}}
 async function push(p){const response=await fetch(url+'/api/data/patch',{method:'PATCH',headers:{Authorization:'Bearer local-rehearsal-only','Content-Type':'application/json'},body:JSON.stringify(p)});assert.equal(response.status,200);const body=await response.json();await flush();return body;}
 const first=await read('results-01.json'),second=await read('results-02.json');
 const p1=normalize(first),p2=normalize(second,1);await write('patch-01.json',p1);await write('patch-02.json',p2);
 let response=await push(p1);assert.equal(response.writes.length,4);
 for(const page of Object.values(pages)){assert.equal(await page.locator('#graphic').evaluate(e=>getComputedStyle(e).visibility),'hidden');assert.deepEqual(await page.evaluate(()=>researchActions),{play:0,stop:0,next:0});}
 record('First HTTP patch changes four graphics but does not put any graphic on air');
 // One deliberate operator action, separate from every data write.
 for(const page of Object.values(pages))await page.evaluate(()=>play());
 await pages['Election Party Board'].screenshot({path:path.join(dir,'evidence/party-board-before.png')});
 response=await push(p2);assert.equal(await pages['Election Party Board'].locator('#f1').textContent(),'228,000');assert.equal(await pages['Election Candidate Card'].locator('#f2').textContent(),'3,700');assert.equal(await pages['Election Candidate Card'].locator('#f0').textContent(),'Aino Example');
 record('Second HTTP patch updates KOK 225,000 → 228,000 and Aino 3,500 → 3,700 while cue name stays fixed');
 for(const [name,page]of Object.entries(pages)){await page.screenshot({path:path.join(dir,'evidence/'+name.replaceAll(' ','-').toLowerCase()+'.png')});}
 const count=sequence;response=await push(p2);assert.equal(response.writes.length,0);assert.equal(sequence,count);record('Identical retry produces no changed-field rows');
 const sorted=structuredClone(second);sorted.parties.reverse();sorted.candidates.reverse();assert.deepEqual(normalize(sorted),p2);record('Source row reorder preserves party and composite candidate identities');
 const bad=structuredClone(second);bad.candidates[1].candidate_id=bad.candidates[0].candidate_id;assert.throws(()=>normalize(bad),/duplicate/);
 const missing=structuredClone(second);delete missing.parties[0].votes;assert.throws(()=>normalize(missing),/Invalid/);
 assert.throws(()=>normalize(first,2),/Out-of-order/);record('Adapter refuses duplicate IDs, a missing votes column and older revisions');
 await push(normalize(await read('results-03-correction.json'),2));assert.equal(await pages['Election Candidate Card'].locator('#f2').textContent(),'3,680');record('A newer correction can lower a vote total');
 await push({election:{candidates:{FI2027_02_101:{votes_text:null}}}});assert.equal(await pages['Election Candidate Card'].locator('#f2').textContent(),'3,680');record('JSON null deletes a tree leaf but does not blank its last rendered field');
 await push({election:{headlines:''}});assert.equal(await pages['Election Ticker'].locator('#f0').textContent(),'');record('Explicit empty string clears the connected ticker');
 await push(p2); // Restore illustration, not sender sequence policy.
 const invalid=await fetch(url+'/api/data/patch',{method:'PATCH',headers:{Authorization:'Bearer wrong'},body:'{}'});assert.equal(invalid.status,401);assert.equal(await pages['Election Party Board'].locator('#f1').textContent(),'228,000');record('Rejected local HTTP request leaves current output unchanged');
 const shared={...bindings,'Second candidate graphic':{f0:'election.candidates.FI2027_02_101.votes_text'}};
 const both=core.resolveBindings(p2,shared);assert.equal(both['Second candidate graphic'].f0,both['Election Candidate Card'].f2);record('Two graphics resolve the same keyed value');
 for(const page of Object.values(pages))assert.deepEqual(await page.evaluate(()=>researchActions),{play:1,stop:0,next:0});
 record('All external updates leave play/stop/next counters unchanged after the single operator Take');
 for(const page of Object.values(pages)){for(const img of await page.locator('img').all())assert.equal(await img.evaluate(i=>i.complete&&i.naturalWidth>0),true);}
 assert.deepEqual(errors,[]);record('Bundled images decode successfully and all four actual preview documents report no page errors');
 const summary={baseline:execFileSync('git',['rev-parse','origin/main'],{cwd:dir,encoding:'utf8'}).trim(),scope:'LOCAL LOOPBACK ONLY: actual productionData functions, SPX parser, publication gate, composeDocument and shared field writer; custom stand-in HTTP handler and research templates.',checks,notProven:['Hosted API auth / SQL atomicity / quotas / realtime fan-out','Actual 2027 results-provider integration, access, latency or SLA','Google Sheets reader, D4 override persistence, Pause or recovery UI','Full SVG Import or CLI authoring journey; custom-action NOACG_ANIM event integration','OBS/vMix/CasparCG output and human usability']};
 await write('evidence/report.json',summary);
 // Full local trace includes synthetic assets, never a real credential.
 await write('evidence/http-transcript.json',requests);
 await write('evidence/second-update-summary.json',{request:{election:{parties:{KOK:{votes:228000,votes_text:'228,000'}},candidates:{FI2027_02_101:{votes:3700,votes_text:'3,700'}}}},note:'Readable excerpt. Full atomic snapshot is patch-02.json; real trace is http-transcript.json.',writes:requests[1].response.writes});
 console.log(JSON.stringify({passed:checks.length,pageErrors:errors,publicationGates:Object.keys(gates).length,scope:summary.scope},null,2));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
