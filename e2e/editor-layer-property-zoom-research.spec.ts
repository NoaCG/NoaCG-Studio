// covers: src/components/editorFoundation/**, src/blocks/{artworkEdits,artworkLayers,editorGroups}.ts, src/model/structure.ts, src/export/**
import { test, expect, chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { source, selected, inspection, row, number, frame, ready, open, seek, select, undo, redo, scrub, draw, point, capture, saveReopen } from './_layerProperty';


test('actual browser 125 percent zoom cumulative qualification', async()=>{
  test.setTimeout(240000);
  const extension=resolve(test.info().outputPath('zoom-extension')); mkdirSync(extension,{recursive:true});
  writeFileSync(extension+'/manifest.json',JSON.stringify({manifest_version:3,name:'Disposable physical browser zoom probe',version:'1.0',permissions:['tabs'],background:{service_worker:'worker.js'}}));
  writeFileSync(extension+'/worker.js','chrome.runtime.onInstalled.addListener(() => {});');
  const context=await chromium.launchPersistentContext(test.info().outputPath('profile'),{headless:false,channel:'chromium',viewport:null,deviceScaleFactor:undefined,isMobile:undefined,baseURL:String(test.info().project.use.baseURL),args:['--window-size=1366,768','--disable-extensions-except='+extension,'--load-extension='+extension]});
  const page=context.pages()[0]; const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
  try {
    const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
    const base=String(test.info().project.use.baseURL); await page.goto(base+'/app?editor=foundation#/new');
    const zoom=await worker.evaluate(async()=>{
      const tabs=await chrome.tabs.query({url:'http://127.0.0.1/*'}),tab=tabs.find(t=>t.url?.includes('/app'));
      if(!tab?.id) throw Error('No application browser tab'); await chrome.tabs.setZoom(tab.id,1.25); return chrome.tabs.getZoom(tab.id);
    }); expect(zoom).toBe(1.25);
    const metrics=await page.evaluate(()=>({innerWidth,innerHeight,outerWidth,outerHeight,devicePixelRatio,visualScale:visualViewport?.scale}));
    writeFileSync(test.info().outputPath('browser-zoom-initial.json'),JSON.stringify({zoom,metrics},null,2));
    expect(metrics.devicePixelRatio).toBe(1.25); expect(metrics.outerWidth).toBe(1366);
  await open(page); const initial=await source(page); await select(page,'#f0');
  await page.getByRole('textbox',{name:'Artwork text',exact:true}).fill('Elena Marquez'); await page.getByRole('button',{name:'Apply text',exact:true}).click(); await expect((await frame(page)).locator('#f0')).toHaveText('Elena Marquez');
  const shape=await draw(page,.45); await page.getByRole('button',{name:'select tool',exact:true}).click(); await select(page,shape); await row(page,shape).locator('.ef-layer').dblclick(); await page.getByRole('textbox',{name:'Layer name'}).fill('Live plate'); await page.getByRole('textbox',{name:'Layer name'}).press('Enter');
  const x=number(page,'Position X'); await page.getByRole('button',{name:'Enable Position X animation',exact:true}).click(); await seek(page,.8); await scrub(page,x,20);
  const edited=await source(page); await undo(page); await redo(page); expect(await source(page)).toEqual(edited); const h=(await inspection(page)).history;
  await scrub(page,x,30,undefined,'Escape'); expect(await source(page)).toEqual(edited); expect((await inspection(page)).history).toEqual(h);
  await page.getByRole('button',{name:'Hide Live plate layer',exact:true}).click(); await expect((await frame(page)).locator(shape)).toBeHidden();
  const saved=await saveReopen(page,'Layer property qualification'); expect(saved.assets).toEqual(initial.assets); expect(saved.html.match(/<div class="graphic-mask">/g)).toEqual(initial.html.match(/<div class="graphic-mask">/g)); expect(saved.html).toContain('id="festival-config"');
  await seek(page,0); const receipts=[];
  for(const target of ['spx','casparcg','ograf']){
    const files=await page.evaluate(async target=>{
      const template=(await import('/src/store/templateStore.ts')).useTemplateStore.getState().template;
      const zip=await (await import('/src/export/registry.ts')).EXPORT_TARGETS.find(item=>item.id===target)!.build(template);
      return Object.fromEntries(await Promise.all(Object.keys(zip.files).filter(name=>!zip.files[name].dir).map(async name=>[name.slice(name.indexOf('/')+1),await zip.file(name)!.async('base64')])));
    },target);
    const output=await page.context().newPage(); const errors:string[]=[]; output.on('pageerror',e=>errors.push(e.message));
    await output.route('http://layer-output.local/**',route=>{const name=new URL(route.request().url()).pathname.slice(1),body=files[name];return route.fulfill({status:body?200:name?404:200,contentType:/\.m?js$/.test(name)?'application/javascript':/\.css$/.test(name)?'text/css':/\.svg$/.test(name)?'image/svg+xml':/\.woff2$/.test(name)?'font/woff2':'text/html',body:body?Buffer.from(body,'base64'):'<html><body></body></html>'});});
    if(target==='ograf'){
      await output.goto('http://layer-output.local/');await output.evaluate(async()=>{const mod=await import('http://layer-output.local/graphic.mjs');customElements.define('qualification-graphic',mod.default);const el=document.createElement('qualification-graphic') as HTMLElement&{load(p:unknown):Promise<unknown>;playAction(p:unknown):Promise<unknown>};document.body.append(el);await el.load({data:{}});await el.playAction({});});
    }else{await output.goto('http://layer-output.local/'+Object.keys(files).find(name=>name.endsWith('.html')&&!name.includes('controlpanel')));await output.evaluate(()=> (window as unknown as {play:()=>void}).play());}
    await expect(output.locator('#f0')).toHaveText('Elena Marquez'); await expect.poll(()=>output.locator('.graphic').evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
    await expect(output.locator(shape)).toBeHidden(); await expect(output.locator(shape)).toHaveAttribute('data-noacg-label','Live plate'); expect(await output.locator('#festival-config').textContent()).toBe('{"slug":"riverlight","season":2026}'); expect(await output.locator('#festival-mark').evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBe(72); expect(errors).toEqual([]);
    for(const asset of initial.assets) if(target!=='casparcg') expect(files[asset.path]).toBe(asset.data.split(',')[1]);
    receipts.push({target,hidden:true,text:'Elena Marquez',errors});await output.close();
  }
  writeFileSync(test.info().outputPath('journey.json'),JSON.stringify({receipts,fields:saved.fields.map(f=>f.field),assets:saved.assets.map(a=>a.path)},null,2));
    await select(page,shape); await page.getByRole('button',{name:'Show Live plate layer',exact:true}).click();
    await expect((await frame(page)).locator(shape)).toBeVisible(); await number(page,'Rotation').scrollIntoViewIfNeeded();
    await expect(page.getByRole('button',{name:'Composition',exact:true})).toBeVisible(); await expect(page.locator('.ef-document-tab')).toBeVisible();
    await expect(page.getByTestId('foundation-timeline')).toBeInViewport();
    await capture(page,test.info().outputPath('actual-125.png'));
    const finalZoom=await worker.evaluate(async()=>{const tabs=await chrome.tabs.query({url:'http://127.0.0.1/*'});return chrome.tabs.getZoom(tabs.find(t=>t.url?.includes('/app'))!.id!);});expect(finalZoom).toBe(1.25);
    writeFileSync(test.info().outputPath('browser-zoom.json'),JSON.stringify({zoom,finalZoom,metrics,errors,canvas:await page.getByTestId('foundation-canvas').boundingBox()},null,2)); expect(errors).toEqual([]);
  } catch(error) { await page.screenshot({path:test.info().outputPath('zoom-failed.png')}); throw error; } finally {await context.close();}
});
