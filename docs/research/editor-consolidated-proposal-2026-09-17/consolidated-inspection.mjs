import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeFileSync} from 'node:fs';
const out=dirname(fileURLToPath(import.meta.url));
const require=createRequire('C:/Users/ahonemi/.codex/worktrees/editor-baseline-design/NoaCG-Studio/package.json');
const {chromium}=require('playwright');
const browser=await chromium.launch();
const page=await browser.newPage();
const report={kind:'design-prototype-only',errors:[],layouts:[],checks:{},browser:browser.version()};
page.on('pageerror',e=>report.errors.push(String(e)));
function check(name,result){report.checks[name]=result;if(!result)throw Error(name);}
try{
 await page.goto('file:///'+out+'/editor-svg-and-templates-preview.html');
 const f=page.frameLocator('iframe');await f.locator('#ed-headline').waitFor();
 const fit=async()=>{const h=await f.locator('#noacg-editor-proposal').evaluate(e=>e.getBoundingClientRect().height);await page.locator('iframe').evaluate((e,h)=>{e.style.height=(h+4)+'px';e.style.minHeight='0';},h);};
 for(const width of [1920,1366,1024,320]){
  await page.setViewportSize({width,height:width===1920?1080:768});await page.emulateMedia({colorScheme:'dark'});await fit();
  const dims=await f.locator('#noacg-editor-proposal').evaluate(e=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:e.getBoundingClientRect().height,canvas:e.querySelector('.ed-stage').getBoundingClientRect().toJSON(),timeline:e.querySelector('.ed-bottom').getBoundingClientRect().toJSON()}));report.layouts.push({viewport:width,...dims});check('no overflow '+width,dims.scrollWidth<=dims.width+1);
  report.layouts.at(-1).boxes=await f.locator('#noacg-editor-proposal').evaluate(e=>Object.fromEntries(['.ed-center','.ed-stage-area','.ed-stage','.ed-right','.ed-inspector'].map(s=>{const n=e.querySelector(s),c=getComputedStyle(n);return [s,{rect:n.getBoundingClientRect().toJSON(),minHeight:c.minHeight,height:c.height,position:c.position,flex:c.flex}]})));
  check('canvas above timeline '+width,dims.canvas.bottom<=dims.timeline.top);
  await page.screenshot({path:out+`/consolidated-dark-${width}.png`,fullPage:true});
 }
 await page.setViewportSize({width:1920,height:1080});await fit();
 check('initial SVG artwork present',(await f.locator('#ed-project-name').innerText()).includes('Illustrator'));
 check('no global mode',await f.getByRole('button',{name:'Layout',exact:true}).count()===0&&await f.getByRole('button',{name:'Animate',exact:true}).count()===0);
 await f.locator('#ed-next').click();await f.locator('#ed-detail-group').evaluate(e=>new Promise(resolve=>{const check=()=>+e.style.opacity===1?resolve():requestAnimationFrame(check);check();}));
 check('Next reveals detail',+await f.locator('#ed-detail-group').evaluate(e=>e.style.opacity)===1);
 await page.screenshot({path:out+'/consolidated-next-1920.png',fullPage:true});
 const ruler=await f.locator('#ed-ruler').boundingBox();await page.mouse.click(ruler.x+ruler.width*.1,ruler.y+10);check('direct scrub',Math.abs(+await f.locator('#ed-seek').inputValue()-7)<=1);
 check('scrub samples hidden reveal',+await f.locator('#ed-detail-group').evaluate(e=>e.style.opacity)===0);
 await f.locator('#ed-speed').selectOption('2');await f.locator('#ed-frame').click();check('effective frame nudge',Math.abs(+await f.locator('#ed-seek').inputValue()-9)<=1);await f.locator('#ed-speed').selectOption('1');
 await f.locator('#ed-x').fill('180');await f.locator('#ed-x').press('Tab');check('armed edit creates current key',await f.locator('#ed-key-x').innerText()==='◆');await f.locator('#ed-undo').click();check('undo value',await f.locator('#ed-x').inputValue()==='158');
 await f.locator('#ed-arm-x').click();check('property base scope',(await f.locator('#ed-scope').innerText()).includes('base value'));await f.locator('#ed-undo').click();
 await f.locator('#ed-loop').click();await fit();check('local loop keeps canvas',await f.locator('#ed-loop-panel').isVisible()&&await f.locator('.ed-stage').isVisible());await f.locator('#ed-close-loop').click();
 await f.locator('#ed-code-tab').click();check('source dock keeps canvas',await f.locator('#ed-code-panel').isVisible()&&await f.locator('.ed-stage').isVisible());await f.locator('#ed-timeline-tab').click();
 await f.locator('#ed-templates').click();await fit();check('visible category gallery',await f.locator('.ed-template:visible').count()===6);await f.locator('[data-type="Headline"]').click();await f.locator('[aria-label="Template brand"]').selectOption('ember');check('Home brand preview',(await f.locator('#ed-logo-text').textContent())==='ES');await f.locator('[data-item="Holding screen"]').check();await f.locator('#ed-add-set').click();check('selected set rundown preview',(await f.locator('#ed-status').innerText()).includes('Holding screen')&&(await f.locator('#ed-status').innerText()).includes('Nothing has been installed'));
 await page.screenshot({path:out+'/consolidated-templates-1920.png',fullPage:true});
 await page.setViewportSize({width:1366,height:768});await fit();await page.screenshot({path:out+'/consolidated-templates-1366.png',fullPage:true});
 const overlap=await f.locator('.ed-left').evaluate(e=>({dock:e.getBoundingClientRect().bottom,content:e.querySelector('#ed-add-set').getBoundingClientRect().bottom}));report.galleryBounds=overlap;check('gallery fits dock',overlap.content<=overlap.dock+1);
 await f.locator('#ed-category').selectOption('Sports');check('category selection',await f.locator('.ed-template:visible').count()===1);await f.locator('#ed-category').selectOption('All graphics');
 await f.locator('[data-type="Logo bug"]').click();check('logo template distinct',await f.locator('#ed-title-group').evaluate(e=>e.style.display==='none'));await f.locator('[data-type="Holding screen"]').click();check('screen template distinct',await f.locator('#ed-title-group').getAttribute('transform')==='translate(0,-160)');
 await f.locator('#ed-import').click();await f.locator('#ed-project-toggle').click();await page.emulateMedia({colorScheme:'light'});await fit();await page.screenshot({path:out+'/consolidated-light-1366.png',fullPage:true});
 check('no runtime errors',report.errors.length===0);
}finally{writeFileSync(out+'/consolidated-inspection.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();}
