import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeFileSync} from 'node:fs';
const out=dirname(fileURLToPath(import.meta.url));
const require=createRequire('C:/Users/ahonemi/.codex/worktrees/editor-baseline-design/NoaCG-Studio/package.json');
const {chromium}=require('playwright');
const browser=await chromium.launch();
const page=await browser.newPage();
const report={errors:[],layouts:[],checks:{}};
page.on('pageerror',e=>report.errors.push(String(e)));
function check(name,result){report.checks[name]=result;if(!result)throw Error(name);}
try{
 await page.goto('file:///'+out+'/editor-professional-preview.html');
 const f=page.frameLocator('iframe');await f.locator('#np-title').waitFor();
 const fit=async()=>{const height=await f.locator('#noacg-pro-editor').evaluate(e=>e.getBoundingClientRect().height);await page.locator('iframe').evaluate((e,h)=>{e.style.height=(h+4)+'px';e.style.minHeight='0';},height);};
 for(const width of [1366,1920,1024,320]){
  await page.setViewportSize({width,height:width===1920?1080:768});await page.emulateMedia({colorScheme:'dark'});await fit();
  const dims=await f.locator('#noacg-pro-editor').evaluate(e=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:e.getBoundingClientRect().height}));report.layouts.push({viewport:width,...dims});check('no overflow '+width,dims.scrollWidth<=dims.width+1);
  await page.screenshot({path:out+`/professional-dark-${width}.png`,fullPage:true});
 }
 await page.setViewportSize({width:1366,height:768});await fit();
 const ruler=await f.locator('#np-ruler').boundingBox();await page.mouse.click(ruler.x+ruler.width*.04,ruler.y+10);
 check('direct ruler scrubs',Number(await f.locator('#np-frame').inputValue())===8);
 const before=await f.locator('#np-graphic').evaluate(e=>e.style.transform);
 const head=await f.locator('#np-head-drag').boundingBox();await page.mouse.move(head.x+head.width/2,head.y+6);await page.mouse.down();await page.mouse.move(ruler.x+ruler.width*.3,ruler.y+7,{steps:5});await page.mouse.up();
 check('playhead drag updates frame',Number(await f.locator('#np-frame').inputValue())===60);check('canvas changes with playhead',before!==await f.locator('#np-graphic').evaluate(e=>e.style.transform));
 const marker=await f.locator('#np-out-drag').boundingBox();await page.mouse.move(marker.x+marker.width/2,marker.y+12);await page.mouse.down();await page.mouse.move(ruler.x+ruler.width*.85,marker.y+12,{steps:4});await page.mouse.up();check('Out marker retimes',Number(await f.locator('#np-out-frame').inputValue())===170);await f.locator('#np-undo').click();check('Out marker undo',Number(await f.locator('#np-out-frame').inputValue())===150);
 const key=await f.locator('[data-key="end"]').boundingBox();await page.mouse.move(key.x+10,key.y+10);await page.mouse.down();await page.mouse.move(ruler.x+ruler.width*.1,key.y+10,{steps:4});await page.mouse.up();check('key drag retimes independently',Number(await f.locator('#np-key-frame').inputValue())===20&&Number(await f.locator('#np-frame').inputValue())===60);await f.locator('#np-undo').click();check('key undo',Number(await f.locator('#np-key-frame').inputValue())===30);
 await f.locator('[data-panel="ai"]').click();check('AI keeps canvas visible',await f.locator('#np-canvas').isVisible());await f.locator('#np-ai-apply').click();check('example edits entrance',(await f.locator('#np-ai-message').innerText()).includes('30f → 12f'));await page.screenshot({path:out+'/professional-ai-1366.png',fullPage:true});await f.locator('#np-undo').click();await f.locator('[data-panel="properties"]').click();check('AI edit undo',Number(await f.locator('#np-key-frame').inputValue())===30);
 await f.locator('[data-panel="data"]').click();await f.locator('#np-data-name').fill('Jamie Chen');check('data sample updates canvas',(await f.locator('#np-person').innerText())==='Jamie Chen');check('data preserves authored title',(await f.locator('#np-title').inputValue())==='Alex Morgan');await f.locator('#np-data-reset').click();await f.locator('[data-panel="properties"]').click();
 await f.locator('#np-trigger').selectOption('auto');await f.locator('#np-delay').fill('1');await f.locator('#np-take').click();await f.locator('#np-preview-state').filter({hasText:'holding'}).waitFor();check('rehearsal reaches hold',true);await f.locator('#np-preview-state').filter({hasText:'Off air'}).waitFor({timeout:9000});check('automatic Out finishes',Number(await f.locator('#np-frame').inputValue())===200);
 await f.locator('#np-trigger').selectOption('manual');await f.locator('#np-frame').fill('50');await f.locator('#np-frame').press('Tab');await page.emulateMedia({colorScheme:'light'});await fit();await page.screenshot({path:out+'/professional-light-1366.png',fullPage:true});
 check('zero runtime errors',report.errors.length===0);
}finally{writeFileSync(out+'/professional-inspection.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();}
