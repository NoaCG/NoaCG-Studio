// Run alone through the repository queue. Each mutation owns its headless server.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const geometry='src/blocks/arrangementGeometry.ts',author='src/components/editorFoundation/animationAuthoring.ts',hook='src/components/editorFoundation/useArtworkKeyboard.ts',canvas='src/components/editorFoundation/Canvas.tsx';
const base='src/blocks/baseEdits.ts',textEditor='src/components/editorFoundation/ArtworkTextEditor.tsx';
const originals=new Map([geometry,author,hook,canvas,base,textEditor].map(file=>[file,readFileSync(file)]));
const delay=()=>new Promise(resolve=>setTimeout(resolve,2000));
const replace=(from,to)=>text=>{if(!text.includes(from))throw new Error('Missing mutation: '+from);return text.replace(from,to);};
const guard=prefix=>text=>{const line=text.split('\n').find(line=>line.trimStart().startsWith(prefix));if(!line||!line.includes('throw new Error'))throw new Error('Missing guard: '+prefix);return text.replace(line,line.replace(/if \(.*\) throw new Error/,'if (false) throw new Error'));};
const rows=[
 ['distribution count',geometry,guard('if (parts.length'),null],
 ['finite bounds and identities',geometry,guard('if (new Set'),null],
 ['equal gaps',geometry,replace('sorted.reduce((sum, p) => sum + p[size], 0)','0'),null],
 ['rendered outer endpoints',geometry,replace('last = sorted.reduce((outer, p) => p[axis] + p[size] >= outer[axis] + outer[size] ? p : outer)','last = sorted[sorted.length - 1]'),null],
 ['position precision',base,replace('const x = transformPrecision(patch.x ?? base.x), y = transformPrecision(patch.y ?? base.y);','const x = precise(patch.x ?? base.x), y = precise(patch.y ?? base.y);'),'normalized SVG coordinates'],
 ['scale precision',base,replace('transformPrecision(patch.scaleX ?? base.scaleX)','precise(patch.scaleX ?? base.scaleX)'),'one-pixel keyboard resize'],
 ['parent inverse',author,replace('const change = apply(invert(part.parent ?? [1, 0, 0, 1]), delta);','const change = delta;'),'vertical gaps'],
 ['one source write on release',hook,replace("preview()?.noteInput('keyboard');","session.execute({ documentId: session.documentId, expected: g.expected, transactionId: crypto.randomUUID(), operations: g.operations });"),'held canvas arrows'],
 ['gesture cancellation',hook,replace('active.current = null; session.cancel(false);','session.cancel(false);'),'Escape, blur'],
 ['stale source and view',hook,guard('if (!sameRevision(g.expected'),'Escape, blur'],
 ['canceled repeats stay quiet',hook,replace('if (event.repeat) return true;',''),'Escape, blur'],
 ['text-input ownership',[canvas,textEditor],[text=>replace("event.target === event.currentTarget && tool === 'select'","tool === 'select'")(replace('if (!editorShortcutsLive(event.target)) return;','')(text)),replace('event.stopPropagation();','')],'focus guards'],
 ['Pen ownership',canvas,replace("tool === 'select' && !gesture.active()","tool !== 'anchor' && !gesture.active()"),'focus guards'],
 ['source local axes',author,guard('if (base.axisResizeReason'),'own (SVG|CSS) transform'],
 ['text-box pivot',author,replace('if (!base.anchor) {','if (false) {'),'keyboard text-box resizing'],
 ['resize collapse',author,replace(' || size + distance < 1',''),'keyboard resize refuses collapsing'],
 ['parent-child refusal',author,guard('if (targets.some'),'parent-child selection|one-pixel keyboard resize|keyboard text-box resizing|own (SVG|CSS) transform'],
];
const cases=process.argv[2]?rows.filter(row=>row[0]===process.argv[2]):rows;
if(!cases.length)throw new Error('No matching mutation.');
const run=grep=>spawnSync(process.execPath,grep?['node_modules/@playwright/test/cli.js','test','e2e/editor-arrangement.spec.ts','--workers=1','--grep',grep]:['--test','scripts/editor-arrangement.test.mjs'],{encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024,env:{...process.env,E2E_WORKERS:'3'}});
for(const grep of [null,'normalized SVG coordinates|vertical gaps|held canvas arrows|Escape, blur|focus guards|keyboard resize refuses collapsing|parent-child selection|one-pixel keyboard resize|keyboard text-box resizing|own (SVG|CSS) transform']){
 const result=run(grep);if(result.status!==0){process.stdout.write(result.stdout+result.stderr);throw new Error('Unmodified control failed.');}
}
let survived=0;
try{
 for(const [name,file,mutate,grep] of cases){
  const changes=Array.isArray(file)?file.map((f,i)=>[f,mutate[i]]):[[file,mutate]];
  for(const [f,change] of changes)writeFileSync(f,change(originals.get(f).toString()));await delay();
  const result=run(grep),killed=result.status!==0&&!result.error;
  console.log((killed?'KILLED':'SURVIVED')+': '+name);
  if(!killed){survived++;process.stdout.write(result.stdout+result.stderr);}
  for(const [f] of changes)writeFileSync(f,originals.get(f));await delay();
 }
}finally{
 for(const [file,bytes] of originals)writeFileSync(file,bytes);
 await delay();
 if([...originals].some(([file,bytes])=>!readFileSync(file).equals(bytes)))throw new Error('Source restoration failed.');
 console.log('Every source restored byte-for-byte.');
}
console.log((cases.length-survived)+'/'+cases.length+' mutations killed.');
process.exitCode=survived?1:0;
