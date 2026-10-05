// gate: none - manually queued source mutation bench; restores every temporary edit byte-for-byte
// guards: src/blocks/editorGroups.ts, src/components/editorFoundation/GroupControls.tsx, e2e/editor-groups.spec.ts
// Run alone through the repository queue. The recognized bench holds the browser slot between cases.
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {transform} from 'sucrase';
import {resolve} from 'node:path';
import {activeRuns,selfAndAncestors} from './e2e-runs.mjs';
import {measured} from './measured.mjs';
// The outer bench remains visible to other checkouts while its own child CLIs exclude it.
if(activeRuns({excludePids:selfAndAncestors()}).length)throw new Error('Another browser job is active. Queue this bench after it finishes.');
const groups='src/blocks/editorGroups.ts',controls='src/components/editorFoundation/GroupControls.tsx';
const originals=new Map([groups,controls].map(file=>[file,readFileSync(file)]));
const delay=()=>new Promise(resolve=>setTimeout(resolve,2000));
const replace=(from,to)=>source=>{if(!source.includes(from))throw new Error('Missing mutation: '+from);return source.replace(from,to);};
const guard=prefix=>source=>{const line=source.split('\n').find(line=>line.trimStart().startsWith(prefix));if(!line?.includes('throw new Error'))throw new Error('Missing guard: '+prefix);return source.replace(line,line.replace(/if \(.*\) throw new Error/,'if (false) throw new Error'));};
const cases=[
 ['removed group marker appearance',groups,replace("  checkWrapperStyle(rulesOf(template).filter(rule => rule.selectorText !== selector), node, 'this group during ungroup');",'  void node;'), 'source wrapper rules refuse group marker'],
 ['new carrier appearance',groups,replace('wrapper.append(...node.childNodes); return [wrapper];','wrapper.append(...node.childNodes); return [];'), 'source wrapper rules refuse carrier marker'],
 ['serialized frame selector meaning',groups,replace('frame.forEach(([key, value]) => wrapper.setAttribute','frame.slice(0, 0).forEach(([key, value]) => wrapper.setAttribute'), 'source wrapper rules refuse frame attributes'],
 ['nonzero serialized frame',groups,replace('fine(box.width) <= 0 || fine(box.height) <= 0','box.width <= 0 || box.height <= 0'), 'serialized group frame'],
 ['new wrapper inheritance',groups,replace("if (property === 'box-sizing' ||",'if (true ||'), 'new wrapper inheritance'],
 ['new wrapper dynamic selector',groups,replace("['root', 'target'].includes(key)", "key === 'root'"), 'new wrapper dynamic selector'],
 ['member blending',groups,replace("if (transformed && node.namespaceURI !== SVG && rulesOf(template).some(rule => {", "if (false && node.namespaceURI !== SVG && rulesOf(template).some(rule => {"), 'member blending'],
 ['contiguous siblings',groups,guard('if (last - first'), 'noncontiguous selection'],
 ['structural selector meaning',groups,replace('if (nodes.some((node, index) => node.isConnected && node.matches(selector) !== matches[index]))','if (false)'), 'structural selectors'],
 ['group effects refusal',groups,replace('if (opacity && Number(opacity) !== 1 || effects.some(property => {','if (false && (opacity && Number(opacity) !== 1 || effects.some(property => {'), 'stale group requests'],
 ['parent inverse',controls,replace('x: (d * (point.x - e) - c * (point.y - f)) / determinant, y: (-b * (point.x - e) + a * (point.y - f)) / determinant','x: point.x, y: point.y'), 'group transform and centered pivot'],
 ['group move carries child keys',groups,replace("...selectors.map(selector => trackOwner(template, data, selector))",'operation.selector'), 'group parent bar moves'],
 ['exact transform carriers',groups,replace('if (!transformed) {','if (true) {'), 'group transform and centered pivot|independent child and group motion'],
];
// The multiline effects guard needs its closing parenthesis changed as part of the same mutation.
cases.find(row=>row[0]==='group effects refusal')[2]=source=>replace('if (opacity && Number(opacity) !== 1 || effects.some(property => {','if (false && (opacity && Number(opacity) !== 1 || effects.some(property => {')(source).replace("key.value !== 1)))) {","key.value !== 1))))) {");
const run=grep=>spawnSync(process.execPath,[resolve('node_modules/@playwright/test/cli.js'),'test','e2e/editor-groups.spec.ts','--workers=1','--grep',grep],{encoding:'utf8',timeout:240000,maxBuffer:16*1024*1024,env:{...process.env,E2E_WORKERS:'3'}});
const control=run(cases.map(row=>row[3]).join('|'));if(control.status!==0){process.stdout.write(control.stdout+control.stderr);throw new Error('Unmodified control failed.');}
console.log('Unmodified control passed.');
let survived=0,restored;
try{
 for(const [name,file,mutate,grep] of cases){
  const changed=mutate(originals.get(file).toString());transform(changed,{transforms:['typescript','jsx'],jsxRuntime:'automatic'});writeFileSync(file,changed);await delay();
  let result=run(grep);
  const assertion=()=>!result.error&&/Error: (?:expect\(|x member)/.test(result.stdout);
  if(result.status!==0&&!assertion()){
   console.log('INCONCLUSIVE: '+name+'; retrying once before accepting any verdict.');process.stdout.write(result.stdout+result.stderr);await delay();result=run(grep);
  }
  if(result.status!==0&&!assertion()){process.stdout.write(result.stdout+result.stderr);throw new Error('Mutation '+name+' did not reach its behavior assertion.');}
  const killed=result.status!==0;
  console.log((killed?'KILLED':'SURVIVED')+': '+name);process.stdout.write(result.stdout+result.stderr);
  if(!killed)survived++;
  writeFileSync(file,originals.get(file));await delay();
 }
}finally{
 for(const[file,bytes]of originals)writeFileSync(file,bytes);await delay();
 restored=[...originals].every(([file,bytes])=>readFileSync(file).equals(bytes));
 console.log(restored?'Every source restored byte-for-byte.':'Source restoration failed.');
}
if(!restored)throw new Error('Source restoration failed.');
measured(cases.length,'group guard mutations');
console.log((cases.length-survived)+'/'+cases.length+' mutations killed.');process.exitCode=survived?1:0;
