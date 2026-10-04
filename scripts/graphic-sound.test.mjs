// guards: src/blocks/animData.ts, src/blocks/animEdit.ts, src/templates/shared/animRuntime.ts, src/assets/graphicSoundRuntime.ts, src/validation/templateBench.ts, src/validation/validateTemplate.ts, src/export/targets/ograf.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { rolldown } from 'rolldown';
import { rawSuffix } from './rolldown-raw.mjs';

async function load(input) {
  const b=await rolldown({input,platform:'neutral',plugins:[rawSuffix],logLevel:'silent'});
  const {output}=await b.generate({format:'esm',codeSplitting:false}); await b.close();
  return import('data:text/javascript;base64,'+Buffer.from(output[0].code).toString('base64'));
}
const data=await load('src/blocks/animData.ts');
const edit=await load('src/blocks/animEdit.ts');
const runtime=await load('src/templates/shared/animRuntime.ts');
const bench=await load('src/validation/templateBench.ts');
const sound={id:'in',asset:'sounds/in.wav',enabled:true,levelDb:-12,mode:'one-shot'};
const fixture=()=>({version:2,root:'#box',speed:1,steps:[{name:'In',duration:1,ease:'none',layers:{},sound:{...sound}},{name:'Reveal',duration:1,ease:'none',layers:{},sound:{...sound,id:'reveal'}},{name:'Out',duration:1,ease:'none',layers:{}}]});

test('canonical sound data survives strict parse, duplicate, rename and delete with its asset binding',()=>{
  const f=fixture(),js=runtime.emitAnimRegion(f),read=data.parseAnimData(js);
  assert.deepEqual(read,f);
  assert.equal(data.serializeAnimData(read),data.serializeAnimData(f));
  const duplicate=edit.duplicateStep(f,1);
  assert.equal(duplicate.steps[2].sound.asset,sound.asset);
  assert.notEqual(duplicate.steps[1].sound.id,duplicate.steps[2].sound.id);
  assert.deepEqual(f.steps[1].sound,{...sound,id:'reveal'});
  const renamed=edit.renameStep(duplicate,2,'New reveal');
  const deleted=edit.deleteStep(renamed,1,()=> 'rise');
  assert.equal(deleted.steps[1].sound.id,duplicate.steps[2].sound.id);
  assert.equal(deleted.steps[1].sound.asset,sound.asset);
});
test('sound shape rejects paths outside the package and levels the runtime cannot honor',()=>{
  for(const change of [{asset:'https://example.com/a.wav'},{asset:'../a.wav'},{levelDb:7},{levelDb:NaN},{enabled:'yes'},{mode:'auto'}]) {
    const f=fixture();Object.assign(f.steps[0].sound,change);assert.equal(data.isAnimData(f),false,JSON.stringify(change));
    assert.equal(data.animDataFault(runtime.emitAnimRegion(f)),'off-shape-sound');
  }
});
test('only the exact shipped sound decoder is exempt from the network screen',()=>{
  const js=runtime.emitAnimRegion(fixture());assert.deepEqual(bench.unsafeJsConstructs(js),[]);
  assert.equal(bench.unsafeJsConstructs(js+'\nfetch("/private");')[0].rule,'unsafe-js-network');
  assert.equal(bench.unsafeJsConstructs(js.replace('fetch(url)','fetch("/private")'))[0].rule,'unsafe-js-network');
});
