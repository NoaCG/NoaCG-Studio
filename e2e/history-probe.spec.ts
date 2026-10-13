import { test } from '@playwright/test';
import { open, draw } from './_layerProperty';
test('inspect real browser history around editor Back', async ({ page }) => {
 await open(page); await draw(page,.3);
 const cdp=await page.context().newCDPSession(page);
 const snap=async(label:string)=>console.log(label,JSON.stringify({cdp:await cdp.send('Page.getNavigationHistory'),state:await page.evaluate(async()=>({state:history.state,length:history.length,href:location.href,route:(await import('/src/app/router.ts')).useRouter.getState().route,guard:(await import('/src/store/saveActions.ts')).useSaveUi.getState().confirmSwitch,events:(window as any).__backEvents}))}));
 await page.evaluate(()=>{(window as any).__backEvents=[]; for(const type of ['popstate','hashchange'])addEventListener(type,()=>{(window as any).__backEvents.push({type,state:history.state,hash:location.hash})});});
 await snap('BEFORE');
 await page.evaluate(()=>history.back()); await page.waitForTimeout(1000); await snap('AFTER1');
 await page.evaluate(()=>history.back()); await page.waitForTimeout(1000); await snap('AFTER2');
 await page.evaluate(()=>history.back()); await page.waitForTimeout(1000); await snap('AFTER3');
});
