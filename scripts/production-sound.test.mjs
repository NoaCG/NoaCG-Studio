// guards: src/assets/audioHash.ts, src/assets/productionSounds.ts, src/assets/soundBudget.ts, src/assets/soundAssets.ts, src/blocks/productionSoundEdit.ts, src/control/readiness.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { rolldown } from 'rolldown';
import { rawSuffix } from './rolldown-raw.mjs';
async function load(input) {
  const b=await rolldown({input,platform:'neutral',plugins:[rawSuffix],logLevel:'silent'});
  const {output}=await b.generate({format:'esm',codeSplitting:false});await b.close();
  return import('data:text/javascript;base64,'+Buffer.from(output[0].code).toString('base64'));
}
const {audioHash}=await load('src/assets/audioHash.ts');
const {createSoundBudget}=await load('src/assets/soundBudget.ts');
const {soundTopology,withProductionSounds}=await load('src/assets/productionSounds.ts');
const {setProductionSound}=await load('src/blocks/productionSoundEdit.ts');
const {emitAnimRegion}=await load('src/templates/shared/animRuntime.ts');
const {outputReadiness,readOutputReady,outputStateWords}=await import('../src/control/readiness.ts');
test('portable audio identity matches SHA-256 across padding and large-file boundaries',()=>{
  for(const n of [0,1,55,56,63,64,65,1000000]) {const bytes=randomBytes(n);assert.equal(audioHash(bytes),createHash('sha256').update(bytes).digest('hex'));}
});
test('decoded copies are counted across graphics and released with their owning stage',()=>{
  const b=createSoundBudget();for(let i=0;i<8;i++)b.retain(String(i),64*1024*1024);
  assert.throws(()=>b.retain('candidate',1),/512 MiB/);b.release('0');b.retain('candidate',64*1024*1024);
  assert.throws(()=>b.retain('oversize',64*1024*1024+1),/Invalid/);
});
test('timing edits preserve bindings; changing trigger meaning requires explicit removal and rebinding',()=>{
  const d={version:2,root:'#box',speed:1,steps:['In','Reveal','Out'].map(name=>({name,duration:1,ease:'none',layers:{}}))};
  const t={type:'blank',js:emitAnimRegion(d),fields:[],assets:[]};
  const ref={hash:'a'.repeat(64),name:'intro.wav',bytes:44,mime:'audio/wav'};
  const sound={id:'in',asset:`assets/sound-${ref.hash}.wav`,enabled:true,mode:'one-shot',levelDb:0};
  const c=setProductionSound(t,{v:1,assets:[],visuals:{}},'graphic','in',sound,ref);
  assert.equal(withProductionSounds(t),t);
  assert.equal(withProductionSounds(t,c),withProductionSounds(t,JSON.parse(JSON.stringify(c))));
  const hosted={...c,assets:c.assets.map(a=>({...a,storageKey:'publisher/audio/'+a.hash}))};
  assert.equal(withProductionSounds(t,c).js,withProductionSounds(t,hosted).js);
  const timed={...t,js:emitAnimRegion({...d,speed:2,steps:d.steps.map(s=>({...s,duration:2}))})};
  assert.equal(soundTopology(t),soundTopology(timed));assert.equal(withProductionSounds(timed,c).js.includes('Sound triggers changed.'),false);
  const renamed={...t,js:emitAnimRegion({...d,steps:d.steps.map((s,i)=>i===1?{...s,name:'Different action'}:s)})};
  assert.match(withProductionSounds(renamed,c).js,/Sound triggers changed/);
  assert.throws(()=>setProductionSound(renamed,c,'graphic','in',sound),/triggers changed/);
  const cleared=setProductionSound(renamed,c,'graphic','in');assert.equal(cleared.assets.length,1);
  assert.doesNotThrow(()=>setProductionSound(renamed,cleared,'graphic','in',sound));
  const reused=setProductionSound(t,c,'graphic','out',{...sound,id:'out',asset:`assets/sound-${ref.hash}.mp3`},{...ref,name:'renamed.mp3'});
  assert.equal(reused.assets.length,1);assert.equal(reused.visuals.graphic.bindings.out.asset,sound.asset);
});
test('audio faults are Not Ready with actionable words while preserving prepared count and size',()=>{
  const checks=new Map([['Quiz',{done:true,error:null,silent:false,fontsFailed:[],fontsLoading:[],imagesBroken:[],audio:{n:1,of:2,bytes:96000,error:'Output audio is blocked'}}]]);
  const r=outputReadiness({graphics:['Quiz'],checks,version:null});assert.deepEqual(r.sounds,{n:1,of:2,bytes:96000});
  assert.equal(r.is[0].k,'audio');assert.match(outputStateWords(readOutputReady(r)),/Not ready.*sound not prepared/);
});
