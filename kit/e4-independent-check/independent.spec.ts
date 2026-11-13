import {test,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';

test('independent Night desk starter brand ownership and two selected production copies',async({page},info)=>{
 await page.goto('/app#/home'); await expect(page.getByTestId('home-page')).toBeVisible();
 const wizard=page.getByTestId('creation-wizard');if(await wizard.isVisible())await wizard.locator('.gallery-close').click();
 await page.getByTestId('home-projects').getByRole('button',{name:'New project',exact:true}).click();
 const starter=page.getByTestId('project-starter');await starter.getByLabel('Project name',{exact:true}).fill('Independent Night desk');
 await starter.getByLabel('Starter collection',{exact:true}).selectOption('newsroom');
 const checked=await starter.getByRole('checkbox',{checked:true}).count();expect(checked).toBe(3);
 await starter.getByRole('button',{name:'Create project · 3',exact:true}).click();
 await expect(page.getByTestId('editor-foundation')).toBeVisible();
 await page.getByRole('button',{name:/^Project/}).first().click();
 const panel=page.getByTestId('authoring-project');
 const initial=await page.evaluate(async()=>{const p=await import('/src/store/authoringProjects.ts');return structuredClone(p.workspace());});
 expect(initial.documents).toHaveLength(3);const ids=initial.projects[0].documents;
 const checks=panel.getByRole('checkbox');await checks.nth(0).check();await checks.nth(1).check();
 await panel.getByRole('button',{name:'New brand',exact:true}).click();
 await panel.getByLabel('Brand name',{exact:true}).fill('Night desk violet');await panel.getByLabel('Accent value',{exact:true}).fill('#7044cc');await panel.getByLabel('Typeface',{exact:true}).selectOption('oswald');
 await panel.getByLabel('Brand logo',{exact:true}).setInputFiles({name:'night.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="15" fill="#7044cc"/></svg>')});
 await panel.getByRole('button',{name:'Save brand',exact:true}).click();await panel.getByRole('button',{name:'Apply brand',exact:true}).click();await expect(panel.getByTestId('project-note')).toHaveText('Brand applied to 2.');
 const branded=await page.evaluate(async()=>{const p=await import('/src/store/authoringProjects.ts');const e=await import('/src/components/editorFoundation/documentAdapter.ts');const s=e.activeEditorSession();const source=s.port.read();s.undo();const undone=s.port.read();s.redo();return{source,undone,redone:s.port.read(),workspace:structuredClone(p.workspace())};});
 expect(branded.undone).toEqual(initial.documents.find(d=>d.id===ids[0])!.template);expect(branded.redone).toEqual(branded.source);expect(branded.workspace.documents.find(d=>d.id===ids[2])).toEqual(initial.documents.find(d=>d.id===ids[2]));
 await page.evaluate(async()=>{const t=await import('/src/store/templateStore.ts');const c=await import('/src/model/cssVars.ts');const packets=await import('/src/model/packets.ts');const s=t.useTemplateStore.getState();s.applyTemplate({...s.template,css:c.setCssVariable(s.template.css,'text-color','#ffd91c')});const look=packets.loadLooks().find(l=>l.name==='Night desk violet')!;packets.upsertLook({...look,brand:{...look.brand,palette:{...look.brand.palette,accent:'#c74481'}}});await(await import('/src/model/durableStore.ts')).commitDurableWrites();});
 await panel.getByRole('button',{name:'Apply brand',exact:true}).click();await expect(panel.getByTestId('project-note')).toHaveText('Brand applied to 2.');
 const override=await page.evaluate(async()=>{const p=await import('/src/store/authoringProjects.ts');const c=await import('/src/model/cssVars.ts');return p.workspace().documents.map(d=>({id:d.id,color:c.getCssVariable(d.template.css,'text-color'),accent:c.getCssVariable(d.template.css,'accent'),template:d.template}));});
 expect(override.find(d=>d.id===ids[0])!.color).toBe('#ffd91c');expect(override.find(d=>d.id===ids[0])!.accent).toBe('#c74481');expect(override.find(d=>d.id===ids[2])!.template).toEqual(initial.documents.find(d=>d.id===ids[2])!.template);
 await checks.nth(2).check();await panel.getByRole('button',{name:'Save selected',exact:true}).click();await expect(panel.getByTestId('project-note')).toHaveText('3 graphics saved.');
 const showIds=await page.evaluate(async()=>{const s=await import('/src/model/shows.ts');const a=s.createShowNamedChecked('Independent east').show;const b=s.createShowNamedChecked('Independent west').show;await(await import('/src/model/durableStore.ts')).commitDurableWrites();return[a.id,b.id];});
 await checks.nth(1).uncheck();await panel.getByLabel('Install into production').selectOption(showIds[0]);await panel.getByRole('button',{name:'Install selected',exact:true}).click();await expect(panel.getByTestId('project-note')).toHaveText('Installed 2 selected graphics.');
 await checks.nth(0).uncheck();await checks.nth(1).check();await panel.getByLabel('Install into production').selectOption(showIds[1]);await panel.getByRole('button',{name:'Install selected',exact:true}).click();await expect(panel.getByTestId('project-note')).toHaveText('Installed 2 selected graphics.');
 const copies=await page.evaluate(async ids=>{const s=await import('/src/model/shows.ts');return ids.map(id=>s.loadShows().find(x=>x.id===id)!);},showIds);
 const names=initial.documents.map(d=>d.template.name);expect(copies[0].graphics.map(g=>g.name)).toEqual([names[0],names[2]]);expect(copies[1].graphics.map(g=>g.name)).toEqual([names[1],names[2]]);
 expect(copies[0].graphics.map(g=>g.id).some(id=>copies[1].graphics.some(g=>g.id===id))).toBe(false);expect(copies.map(s=>s.cues!.length)).toEqual([2,2]);
 const edited=await page.evaluate(async ids=>{const p=await import('/src/store/authoringProjects.ts');const e=await import('/src/components/editorFoundation/documentAdapter.ts');const a=await import('/src/store/saveActions.ts');const sh=await import('/src/model/shows.ts');await p.openProjectDocument(ids.docs[0]);const s=e.activeEditorSession();s.execute({documentId:s.documentId,expected:s.version(),transactionId:crypto.randomUUID(),operations:[{kind:'text.set',selector:'#f0',text:'Independent later master'}]});if(await a.saveCurrentGraphic()!=='saved')throw Error('master save failed');const east=sh.loadShows().find(x=>x.id===ids.shows[0])!;const before=structuredClone(east);sh.upsertShow({...east,graphics:east.graphics.map((g,i)=>i===1?{...g,template:{...g.template,html:g.template.html+'<!-- east only -->'}}:g)});await(await import('/src/model/durableStore.ts')).commitDurableWrites();return{before,after:ids.shows.map(id=>sh.loadShows().find(x=>x.id===id)!),history:s.canUndo()};},{docs:ids,shows:showIds});
 expect(edited.before).toEqual(copies[0]);expect(edited.after[1]).toEqual(copies[1]);expect(edited.after[0].graphics[1].template.html).toContain('east only');expect(edited.history).toBe(true);
 await page.getByTestId('open-home').click();await expect(page.getByTestId('home-projects')).toContainText('Independent Night desk');
 await page.getByTestId('home-projects').getByRole('button',{name:new RegExp('^'+names[0])}).click();await expect(page.getByTestId('editor-foundation')).toBeVisible();
 const reopened=await page.evaluate(async()=>{const e=await import('/src/components/editorFoundation/documentAdapter.ts');const s=e.activeEditorSession();return{source:s.port.read(),undo:s.canUndo()};});expect(reopened.source.html).toContain('Independent later master');expect(reopened.undo).toBe(true);
 await page.screenshot({path:info.outputPath('night-desk-reopened.png')});
 writeFileSync(info.outputPath('journey.json'),JSON.stringify({ids,initial,branded,override,showIds,copies,edited,reopened},null,2));
});

test('independent lost acknowledgement and output-protected inverse keep exact production bytes',async({page},info)=>{
 const {seedAuthoringProject}=await import('../e2e/_authoringProject');const ids=await seedAuthoringProject(page,['card26']);
 const setup=await page.evaluate(async()=>{const a=await import('/src/store/saveActions.ts');const s=await import('/src/model/shows.ts');const r=await a.saveGraphicAs('Independent acknowledgement source',{kind:'standalone'});if(!r.ok)throw Error(r.error!);const show=s.createShowNamedChecked('Independent lost answer').show;await(await import('/src/model/durableStore.ts')).commitDurableWrites();return{show:show.id,graphic:r.graphicId!};});
 await page.evaluate(async setup=>{const real=IDBObjectStore.prototype.put;let puts=0;const host=window as any;host.lost={};IDBObjectStore.prototype.put=function(value,key){const request=real.call(this,value,key!);if(key==='spx-gfx-project'&&++puts===2){const tx=this.transaction;Object.defineProperty(tx,'oncomplete',{configurable:true,set(handler){tx.addEventListener('complete',()=>{host.lost.committed=true;host.lost.release=handler;},{once:true});}});IDBObjectStore.prototype.put=real;}return request;};void(await import('/src/control/projectInstallation.ts')).installProjectGraphics(setup.show,[setup.graphic]).then(()=>host.lost.resolved=true,e=>host.lost.error=String(e));},setup);
 await expect.poll(()=>page.evaluate(()=>(window as any).lost.committed)).toBe(true);
 expect(await page.evaluate(()=>(window as any).lost.resolved)).toBeUndefined();
 const accepted=await page.evaluate(async target=>(await import('/src/model/shows.ts')).loadShows().find(s=>s.id===target)!,setup.show);expect(accepted.graphics).toHaveLength(1);expect(accepted.cues).toHaveLength(1);
 await page.reload();await expect(page.getByTestId('editor-foundation')).toBeVisible();
 const receipt=await page.evaluate(async target=>{const p=await import('/src/store/authoringProjects.ts');const i=await import('/src/control/projectInstallation.ts');const s=await import('/src/model/shows.ts');const plan=p.workspace().installations!.find(p=>p.target===target)!;await i.retryProjectInstallation(plan.id);return{plan:p.workspace().installations!.find(p=>p.id===plan.id)!,show:s.loadShows().find(s=>s.id===target)!};},setup.show);
 expect(receipt.show).toEqual(accepted);expect(receipt.plan.status).toBe('confirmed');
 const protectedResults=await page.evaluate(async({target,id})=>{const s=await import('/src/model/shows.ts');const i=await import('/src/control/projectInstallation.ts');const d=await import('/src/model/durableStore.ts');const baseline=s.loadShows().find(s=>s.id===target)!;const results=[];for(const flag of ['outputSlug','hostedSlug','publishedAt']){s.upsertShow({...baseline,[flag]:flag==='publishedAt'?'2026-11-13T00:00:00.000Z':'independent-off-air'});await d.commitDurableWrites();const before=JSON.stringify(s.loadShows().find(s=>s.id===target));let error='';try{await i.retryProjectInstallation(id,true);}catch(e){error=String(e);}results.push({flag,error,unchanged:JSON.stringify(s.loadShows().find(s=>s.id===target))===before});}return results;},{target:setup.show,id:receipt.plan.id});
 for(const row of protectedResults){expect(row.error).toContain('prepared for output');expect(row.unchanged).toBe(true);}
 writeFileSync(info.outputPath('lost-and-output-protected.json'),JSON.stringify({setup,accepted,receipt,protectedResults},null,2));
});

test('independent staged packages paint after interrupted In and Out with new operator data',async({context},info)=>{
 const fs=await import('node:fs');const JSZip=(await import('jszip')).default;const records=[];
 for(const target of ['casparcg','spx','html-overlay']){
  const zip=await JSZip.loadAsync(fs.readFileSync((process.env.E4_RECEIVING_DIR || 'e2e/fixtures/editor-projects/receiving')+'/'+target+'.zip'));const names=Object.keys(zip.files).filter(n=>!zip.files[n].dir);const root=names[0].split('/')[0];const page=await context.newPage();await page.setViewportSize({width:1920,height:1080});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://independent-receiver.invalid/**',async route=>{const name=decodeURIComponent(new URL(route.request().url()).pathname.slice(1));const file=zip.file(name);if(!file){await route.fulfill({status:404,body:''});return;}const type=name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':name.endsWith('.woff2')?'font/woff2':'text/html';await route.fulfill({contentType:type,body:await file.async('nodebuffer')});});
  await page.goto('http://independent-receiver.invalid/'+root+'/'+root+'.html');
  const interrupted=await page.evaluate(async()=>{await document.fonts.ready;const w=window as any;w.update(JSON.stringify({f0:'Independent interruption probe'}));w.play();const entering=w.noacgMachineState();w.stop();return entering;});
  await expect.poll(()=>page.evaluate(()=>(window as any).noacgMachineState().groups.main)).toBe('off');await expect(page.locator('.info-card')).toHaveCSS('opacity','0');
  await page.evaluate(()=>{(window as any).play();});await expect(page.locator('#f0')).toHaveText('Independent interruption probe');await expect(page.locator('#f0')).toHaveCSS('transform','matrix(1, 0, 0, 1, 0, 0)');await expect(page.locator('.info-card')).toHaveCSS('opacity','1');
  const outInterruption=await page.evaluate(()=>{const w=window as any;w.stop();const leaving=w.noacgMachineState();w.play();return leaving;});
  await expect(page.locator('.info-card')).toHaveCSS('opacity','1');await expect(page.locator('#f0')).toHaveCSS('transform','matrix(1, 0, 0, 1, 0, 0)');await expect(page.locator('#f0')).toHaveText('Independent interruption probe');
  await page.evaluate(()=>(window as any).next());await expect.poll(()=>page.evaluate(()=>(window as any).noacgStepsPlayed)).toBe(2);await expect(page.locator('.info-card-box')).toHaveCSS('opacity','1');await expect(page.locator('.info-card-box')).toHaveCSS('clip-path','inset(0px 0% 0px 0px)');
  const paint=await page.addStyleTag({content:'* { will-change: auto !important; }'});await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));await paint.evaluate(el=>el.remove());await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));
  const capture=info.outputPath(target+'-interruptions.png');await page.screenshot({path:capture});const assets=await page.evaluate(()=>({font:getComputedStyle(document.querySelector('#f0')!).fontFamily,logo:[...document.images].find(i=>i.src.includes('harbour')||i.src.startsWith('data:image/svg+xml'))?.naturalWidth}));expect(assets.logo).toBe(32);expect(assets.font).toContain('Oswald');expect(errors).toEqual([]);records.push({target,interrupted,outInterruption,assets,capture});await page.close();
 }
 writeFileSync(info.outputPath('independent-interruptions.json'),JSON.stringify(records,null,2));
});
