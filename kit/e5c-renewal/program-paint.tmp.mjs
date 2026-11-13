import { start, chromium, expect, out, base, json } from './common-paint.tmp.mjs';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { decodePng, findPixelsNear } from '../scripts/png-decode.mjs';
const bytes=await readFile('e5c.local/merged-starter/starter-result.json'), prior=JSON.parse(bytes), show=prior.installation[0];
const result={source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),at:new Date().toISOString(),payloadSource:prior.source,payloadSha256:createHash('sha256').update(bytes).digest('hex'),scope:'ONE narrow settled Program glyph/finite Out/replay observation; no performance target',modelCalls:0,errors:[]};
const stop=await start();let browser;
try {
 browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1366,height:768}});page.setDefaultTimeout(15000);page.on('pageerror',e=>result.errors.push(e.message));await page.goto(base+'/app#/home');await expect(page.getByTestId('home-page')).toBeVisible();
 await page.evaluate(async show=>{const S=await import('/src/model/shows.ts'),D=await import('/src/model/durableStore.ts');const error=S.upsertShows([show]);if(error)throw Error(error);await D.commitDurableWrites();(await import('/src/app/router.ts')).useRouter.getState().navigate({view:'production',id:show.id});},show);
 await expect(page.getByTestId('production-page')).toBeVisible();await page.getByTestId('cue-field-f0').fill('Live harbour update');
 const stage=page.getByTestId('program-stage'),program=stage.getByTitle(show.graphics[0].name,{exact:true}).contentFrame();
 async function painted(label,plays){
  await expect(stage).toHaveAttribute('data-plays',String(plays));await expect(program.locator('#f0')).toHaveText('Live harbour update');await expect(program.locator('.info-card-box')).toHaveCSS('opacity','1');await expect(program.locator('.info-card-box')).toHaveCSS('clip-path','inset(0px 0% 0px 0px)');await expect(program.locator('#f0')).toHaveCSS('transform','matrix(1, 0, 0, 1, 0, 0)');
  const pose=await program.locator('#f0').evaluate(e=>{const r=e.getBoundingClientRect();let opacity=1;const chain=[];for(let p=e;p;p=p.parentElement){const s=getComputedStyle(p);opacity*=Number(s.opacity);chain.push({tag:p.tagName,id:p.id,opacity:s.opacity,visibility:s.visibility,display:s.display});}return {text:e.textContent,color:getComputedStyle(e).color,x:r.x,y:r.y,width:r.width,height:r.height,opacity,chain};});expect(pose.opacity).toBeGreaterThan(.99);expect(pose.width).toBeGreaterThan(0);expect(pose.height).toBeGreaterThan(0);
  const png=await program.locator('#f0').screenshot({path:out+label+'-glyph.png',omitBackground:true}),image=decodePng(png),color=pose.color.match(/[0-9]+/g).slice(0,3).map(Number),pixels=findPixelsNear(image,color,32);expect(pixels.count,'settled operator glyph pixels match computed foreground').toBeGreaterThan(0);await page.screenshot({path:out+label+'-page.png'});result[label]={pose,pixels,pngSha256:createHash('sha256').update(png).digest('hex')};
 }
 await page.getByTestId('verb-take').click();await painted('take',1);
 await page.getByTestId('verb-out').click();await expect(program.locator('.info-card-box')).toHaveCSS('opacity','0');await expect(page.getByTestId('verb-take')).toBeEnabled();await page.screenshot({path:out+'finite-out.png'});result.out={boxOpacity:await program.locator('.info-card-box').evaluate(e=>getComputedStyle(e).opacity)};
 await page.getByTestId('verb-take').click();await painted('replay',2);expect(result.errors).toEqual([]);result.result='PASS';await json('program-paint-result.json',result);console.log('PASS settled local Program operator glyph pixels, finite Out, replay; no timing claim');
} catch(error){result.result='FAILED';result.error=String(error);await json('program-paint-result.json',result);throw error;}finally{await browser?.close();await stop();}
