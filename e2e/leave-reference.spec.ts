import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
test('Studio cancel New, save native, discard New and reopen saved source',async({page})=>{
 test.setTimeout(180000);const child=spawn(process.env.REFERENCE_EXE!,['--port','4397','--workspace',process.cwd()+'/.noacg/leave-reference','--no-open']);
 try {
  await expect.poll(async()=>{try{return(await fetch('http://127.0.0.1:4397/health')).ok;}catch{return false;}}).toBe(true);
  await page.addInitScript(()=>{Object.defineProperty(window,'showSaveFilePicker',{value:undefined});Object.defineProperty(window,'showOpenFilePicker',{value:undefined});});
  await page.goto('http://127.0.0.1:4397/');await page.getByRole('button',{name:'Add Text',exact:true}).click();
  const rows=page.locator('.layer-list > li'), content=page.locator('.inspector-row:has(> span:text-is("Content")) textarea');
  await content.fill('Keep this saved copy');
  page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'New',exact:true}).click();await expect(rows).toHaveCount(1);await expect(content).toHaveValue('Keep this saved copy');
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Save Project',exact:true}).click();const download=await pending;const path=(await download.path())!;const saved=readFileSync(path,'utf8');
  await content.fill('Throw this experiment away');page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'New',exact:true}).click();await expect(rows).toHaveCount(0);
  expect(readFileSync(path,'utf8')).toBe(saved);
  const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Open',exact:true}).click();await(await chooser).setFiles(path);await expect(rows).toHaveCount(1);await rows.first().click();await expect(content).toHaveValue('Keep this saved copy');
  await page.screenshot({path:test.info().outputPath('studio-reopened.png')});writeFileSync(test.info().outputPath('studio-lifecycle.json'),JSON.stringify({cancelKept:true,newDiscarded:true,savedFileUnchanged:true,reopened:true,pin:'3142fc7d',runtime:'v0.17',nativePicker:'download/input fallback'},null,2));
 }finally{child.kill();}
});
test('Eyevinn switches automatically saved templates and confirms explicit deletion',async({page})=>{
 test.setTimeout(120000);const child=spawn('node',['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4399','--strictPort'],{cwd:process.cwd()+'/.noacg/reference-eyevinn'});
 try {
  await expect.poll(async()=>{try{return(await fetch('http://127.0.0.1:4399/')).ok;}catch{return false;}},{timeout:20000}).toBe(true);await page.goto('http://127.0.0.1:4399/');
  for(const id of ['keep','experiment']){await page.getByRole('button',{name:'New Template',exact:true}).click();await page.locator('#template-id').fill(id);await page.locator('#template-name').fill(id);await page.locator('#template-type').selectOption('custom');await page.getByRole('button',{name:'Create',exact:true}).click();}
  const items=page.locator('.template-item');await expect(items).toHaveCount(2);await page.locator('[data-template-id="keep"]').click();await expect(page.locator('.template-item.active')).toHaveAttribute('data-template-id','keep');
  await page.locator('[data-template-id="experiment"]').hover();page.once('dialog',d=>d.dismiss());await page.locator('[data-template-id="experiment"] .delete-btn').click();await expect(items).toHaveCount(2);
  await page.locator('[data-template-id="experiment"]').hover();page.once('dialog',d=>d.accept());await page.locator('[data-template-id="experiment"] .delete-btn').click();await expect(items).toHaveCount(1);await page.reload();await expect(items).toHaveCount(1);await expect(items).toHaveAttribute('data-template-id','keep');
  await page.screenshot({path:test.info().outputPath('eyevinn-kept.png')});writeFileSync(test.info().outputPath('eyevinn-lifecycle.json'),JSON.stringify({pin:'616841bd949e3a21137579451123f66c292543f0',switchAutoSaved:true,cancelDeletion:true,explicitDeletion:true,otherTemplatePreserved:true},null,2));
 }finally{child.kill();}
});
