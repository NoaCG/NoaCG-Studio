// Static research artifact renderer. No product imports, backend or provider calls.
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
const require = createRequire(process.env.MOCKUP_PLAYWRIGHT_PACKAGE || path.resolve('package.json'));
const {chromium} = require('playwright');
const dir = path.dirname(fileURLToPath(import.meta.url));
await fs.mkdir(path.join(dir,'screens'), {recursive:true});
const browser = await chromium.launch({headless:true, args:['--no-sandbox']});
const page = await browser.newPage({viewport:{width:1600,height:1000}, deviceScaleFactor:1});
const errors=[];
page.on('pageerror', e=>errors.push(e.message));
await page.goto('file://'+path.join(dir,'mockups.html'));
await page.evaluate(()=>document.fonts.ready);
const slides=await page.locator('.slide').count();
const records=[];
for(let i=0;i<slides;i++){
  const el=page.locator('.slide').nth(i);
  const id=await el.getAttribute('id');
  const title=await el.getAttribute('data-title');
  await el.screenshot({path:path.join(dir,'screens',id+'.png')});
  records.push({id,title});
}
const overflow=await page.evaluate(()=>Array.from(document.querySelectorAll('.slide')).flatMap(s=>Array.from(s.querySelectorAll('.app,.workspace,.foot,.review-head')).filter(e=>e.scrollHeight>e.clientHeight+2||e.scrollWidth>e.clientWidth+2).map(e=>({slide:s.id,element:e.className,height:[e.scrollHeight,e.clientHeight],width:[e.scrollWidth,e.clientWidth]}))));
await page.pdf({path:path.join(dir,'NoaCG-election-and-custom-workflow.pdf'),printBackground:true,preferCSSPageSize:true});
const gallery=`<!doctype html><html><meta charset="utf-8"><title>NoaCG election and custom graphics — review index</title><style>@font-face{font-family:Inter;src:url(assets/inter.woff2)}*{box-sizing:border-box}body{margin:0;padding:42px;background:#0b0e13;color:#e7ebf0;font:17px Inter,Arial}h1{font-size:34px;margin:8px 0 12px}p{color:#9ba9ba;max-width:1100px;line-height:1.55}a{color:#ffd06a}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:20px;margin-top:28px}.card{background:#151b24;border:1px solid #303a49;border-radius:10px;overflow:hidden;text-decoration:none}.card img{display:block;width:100%}.card div{padding:14px;color:#e7ebf0;font-size:15px;min-height:64px}small{color:#ffbd4b;font:12px monospace;letter-spacing:2px}.links{margin:20px 0}.legend{display:flex;gap:28px;color:#c5cfdb;font-size:14px}</style><small>NOACG STUDIO / DESIGN RESEARCH / 19 OCTOBER MORNING REVIEW</small><h1>From election results to on-air graphics</h1><p>${slides} focused screens: six custom-graphic deltas and five election walkthroughs. Proposed UI uses synthetic data; screen 10 contains actual local output captures. Open images at full size.</p><div class="links"><a href="morning-review.md">Morning assessment</a> · <a href="08-whole-plan-assessment.md">Full plan review</a> · <a href="NoaCG-election-and-custom-workflow.pdf">Download the complete PDF</a> · <a href="election/README.md">Concrete election walkthrough</a> · <a href="second-opinion.md">Pasteable second-opinion brief</a> · <a href="README.md">Full research index</a> · <a href="mockups.html">All screens</a></div><div class="legend"><span>01–06 Custom-graphic deltas</span><span>07–11 Finland election: collection → connection → operation</span></div><div class="grid">${records.map(r=>`<a class="card" href="screens/${r.id}.png"><img src="screens/${r.id}.png" alt="${r.title}"><div>${r.title}</div></a>`).join('')}</div><p>Based on repository UI and main eccb018d4, including PR #1390. No product implementation or hosted write. Read election/README.md for exact files, API request, actual local evidence and remaining qualification.</p></html>`;
await fs.writeFile(path.join(dir,'index.html'),gallery);
await fs.writeFile(path.join(dir,'screens.json'),JSON.stringify(records,null,2)+'\n');
await page.setViewportSize({width:1800,height:1200});
await page.goto('file://'+path.join(dir,'index.html'));
await page.evaluate(()=>document.fonts.ready);
await page.screenshot({path:path.join(dir,'screens','contact-sheet.png'),fullPage:true});
await fs.writeFile(path.join(dir,'render-check.json'),JSON.stringify({screens:slides,pageErrors:errors,overflow},null,2)+'\n');
await browser.close();
console.log(JSON.stringify({screens:slides,pageErrors:errors,overflow},null,2));
if(errors.length||overflow.length)process.exitCode=1;
