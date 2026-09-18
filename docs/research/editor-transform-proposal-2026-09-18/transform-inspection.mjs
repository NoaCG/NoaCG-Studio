import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeFileSync} from 'node:fs';
const out=dirname(fileURLToPath(import.meta.url));
const require=createRequire('C:/Users/ahonemi/.codex/worktrees/editor-baseline-design/NoaCG-Studio/package.json');
const {chromium}=require('playwright');
const browser=await chromium.launch();
const page=await browser.newPage();
const report={kind:'design-study-only',browser:browser.version(),errors:[],checks:{},layouts:[]};
page.on('pageerror',e=>report.errors.push(String(e)));
function check(name,ok){report.checks[name]=ok;if(!ok)throw new Error(name);}
try{
 await page.goto('file:///'+out+'/editor-transform-study-preview.html');
 const f=page.frameLocator('iframe');await f.locator('#nc-art').waitFor();
 const fit=async()=>{const h=await f.locator('#nc-transform-study').evaluate(e=>e.getBoundingClientRect().height);await page.locator('iframe').evaluate((el,h)=>{el.style.height=(h+4)+'px';el.style.minHeight='0';},h);};
 for(const width of [1920,1366,1024,320]){
  await page.setViewportSize({width,height:width===1920?1080:768});await page.emulateMedia({colorScheme:'dark'});await fit();
  const dims=await f.locator('#nc-transform-study').evaluate(e=>({width:innerWidth,scroll:document.documentElement.scrollWidth,canvas:e.querySelector('.nc-preview').getBoundingClientRect().toJSON(),timeline:e.querySelector('.nc-timeline').getBoundingClientRect().toJSON(),height:e.getBoundingClientRect().height}));report.layouts.push({viewport:width,...dims});
  check('no overflow '+width,dims.scroll<=dims.width+1);check('canvas stays above timeline '+width,dims.canvas.bottom<=dims.timeline.top);check('canvas remains visible '+width,dims.canvas.height>120);
  await page.screenshot({path:out+`/transform-dark-${width}.png`,fullPage:true});
 }
 await page.setViewportSize({width:1366,height:768});await fit();
 const input=(group,index=0)=>f.locator(`input[data-group="${group}"][data-index="${index}"]`);
 const set=async(el,value)=>{await el.fill(String(value));await el.press('Tab');};
 const frame=async(n)=>set(f.locator('#nc-frame'),n);
 check('five transform groups',await f.locator('.nc-prop').count()===5);
 await frame(12);await f.getByRole('button',{name:'Opacity animation',exact:true}).click();
 check('first stopwatch key only at current time',await f.locator('[data-lane="opacity"] button').count()===1&&await f.getByRole('button',{name:'Opacity key at frame 12',exact:true}).count()===1);
 await frame(20);await set(input('opacity'),60);check('armed value writes second key',await f.locator('[data-lane="opacity"] button').count()===2);
 await frame(16);check('interpolated value',+(await input('opacity').inputValue())===80);
 await f.getByRole('button',{name:'Opacity animation',exact:true}).click();check('disable retains sampled value',await f.locator('[data-lane="opacity"] button').count()===0&&+(await input('opacity').inputValue())===80);
 await f.locator('#nc-undo').click();check('undo restores keys and sample',await f.locator('[data-lane="opacity"] button').count()===2&&+(await input('opacity').inputValue())===80);
 await f.getByRole('button',{name:'Previous Opacity key',exact:true}).click();check('previous key navigation',+(await f.locator('#nc-frame').inputValue())===12);
 await f.getByRole('button',{name:'Next Opacity key',exact:true}).click();check('next key navigation',+(await f.locator('#nc-frame').inputValue())===20);
 await f.getByRole('button',{name:'Add or remove Opacity key',exact:true}).click();check('diamond removes key',await f.locator('[data-lane="opacity"] button').count()===1);await f.locator('#nc-undo').click();
 await set(input('scale'),120);check('linked scale changes both',+(await input('scale',1).inputValue())===120);await f.locator('#nc-link').click();await set(input('scale',1),80);check('unlinked scale independent',+(await input('scale').inputValue())===120&&+(await input('scale',1).inputValue())===80);
 await set(input('rotation'),2);await set(input('rotation',1),30);check('unwrapped revolutions',await f.locator('#nc-art').getAttribute('transform').then(s=>s.includes('rotate(750)')));
 const pose=()=>f.locator('#nc-art').evaluate(e=>{const m=e.getCTM();return [m.a,m.b,m.c,m.d,m.e,m.f];});
 const before=await pose();await f.locator('#nc-center-anchor').click();const after=await pose();check('center anchor preserves parked pose',before.every((v,i)=>Math.abs(v-after[i])<.001));
 await f.locator('summary').filter({hasText:'Size / Layout'}).click();await set(f.locator('#nc-width'),1300);check('panel width separate from scale',await f.locator('#nc-box').getAttribute('width')==='1300'&&+(await input('scale').inputValue())===120);
 const old=+(await input('position').inputValue()),box=await input('position').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+20,box.y+box.height/2,{steps:5});await page.mouse.up();check('number scrub moves value',Math.abs(+(await input('position').inputValue())-old-20)<.1);await f.locator('#nc-undo').click();check('number scrub one undo',Math.abs(+(await input('position').inputValue())-old)<.1);
 await page.reload();await f.locator('#nc-art').waitFor();await fit();
 await f.locator('summary').filter({hasText:'Operator fields'}).click();const fieldCheck=await f.locator('#nc-editable').boundingBox();check('operator checkbox visible size',fieldCheck.width>=16&&fieldCheck.height>=16);await f.locator('#nc-editable').uncheck();check('decorative text opt out',!(await f.locator('#nc-editable').isChecked()));await f.locator('#nc-undo').click();check('operator field opt out undo',await f.locator('#nc-editable').isChecked());
 await f.locator('#nc-add-step').click();check('add step form visible',await f.locator('#nc-step-form').isVisible());await f.locator('#nc-step-after').selectOption('1');await f.locator('#nc-step-name').fill('Location');await fit();await page.screenshot({path:out+'/transform-add-step-1366.png',fullPage:true});await f.locator('#nc-step-form button[type=submit]').click();check('step inserted before Out',await f.locator('#nc-cues button').allTextContents().then(a=>a.length===4&&a[2].startsWith('Location')&&a[3].startsWith('Out')));
 await f.locator('#nc-edit-out').click();await f.locator('#nc-out-trigger').selectOption('auto');check('auto out settings distinct',await f.locator('#nc-auto-row').isVisible());await f.locator('#nc-out-form button[type=submit]').click();
 await f.locator('#nc-finish-toggle').click();await fit();await page.screenshot({path:out+'/transform-finish-1366.png',fullPage:true});check('both Finish routes present',await f.locator('#nc-direct').isVisible()&&await f.locator('#nc-open-editor').isVisible());await f.locator('#nc-open-editor').click();check('optional handoff no production install',(await f.locator('#nc-status').innerText()).includes('No production entry'));
 await page.reload();await f.locator('#nc-art').waitFor();await page.emulateMedia({colorScheme:'light'});await fit();await page.screenshot({path:out+'/transform-light-1366.png',fullPage:true});
 check('no runtime errors',report.errors.length===0);
}finally{writeFileSync(out+'/transform-inspection.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();}
