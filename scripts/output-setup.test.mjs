// guards: src/model/outputSetup.ts, src/control/playoutStatus.ts, src/control/prepareLive.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { outputChoice, readOutputSetup, readDestinationId, destinationUrl, accentColor, routeColor } from '../src/model/outputSetup.ts';
import { bridgeChecks, stampOf } from '../src/control/prepareLive.ts';
import { relevantPlayout, destinationCheck, describePlayoutStatus } from '../src/control/playoutStatus.ts';

test('choices validate profile combinations and never modify a legacy link', () => {
  for (const p of ['obs','vmix','spx','browser']) for (const caspar of [true,false]) assert.deepEqual(readOutputSetup(outputChoice(p,caspar)),outputChoice(p,caspar));
  assert.deepEqual(readOutputSetup(outputChoice(null,true)),outputChoice(null,true));
  assert.equal(readOutputSetup({v:1,destinations:[{id:'x',profile:'obs'},{id:'y',profile:'spx'}]}),null);
  assert.equal(readOutputSetup({v:2,destinations:[]}),null);
  assert.equal(readOutputSetup({v:1,destinations:[{id:'x',profile:'obs'},{id:'x',profile:'casparcg'}]}),null);
  const link='https://noacg.com/output?production=unchanged-private-capability';
  assert.equal(destinationUrl(link),link);
  assert.equal(new URL(destinationUrl(link,'browser')).searchParams.get('production'),'unchanged-private-capability');
  assert.equal(readDestinationId('?destination=browser'),'browser');
  assert.equal(readDestinationId('?destination=%3Cscript%3E'),undefined);
});

test('Bridge relevance cannot be established by studio settings or SPX renderer names', () => {
  const f={configured:true,serverCues:false,peers:[{kind:'output',engine:'CasparCG',name:'CasparCG 1-20'}],expected:[],casparActivity:false};
  assert.deepEqual(relevantPlayout(f),{bridge:false,slot:false});
  assert.deepEqual(relevantPlayout({...f,outputSetup:outputChoice('spx',false)}),{bridge:false,slot:false});
  assert.deepEqual(relevantPlayout({...f,outputSetup:outputChoice('obs',false),serverCues:true}),{bridge:true,slot:false});
  assert.deepEqual(relevantPlayout({...f,configured:false,outputSetup:outputChoice(null,true)}),{bridge:true,slot:false});
  assert.deepEqual(relevantPlayout({...f,casparActivity:true}),{bridge:true,slot:true});
});

test('one output never proves two destinations; untagged outputs are explicitly uncertain', () => {
  const s=outputChoice('obs',true), peers=[{kind:'output',destinationId:'browser'}];
  const check=destinationCheck(s,peers);
  assert.match(check.label,/CasparCG/);
  const f={started:true,unpublished:false,version:'v1',bridge:null,ready:{tone:'ok',label:'Ready',outputs:1,ready:1}};
  assert.equal(describePlayoutStatus({...f,destinationCheck:check}).tone,'warn');
  assert.equal(destinationCheck(s,[...peers,{kind:'output',destinationId:'casparcg'}]),null);
  assert.match(destinationCheck(s,[{kind:'output'}]).label,/not confirmed/);
  assert.equal(destinationCheck(undefined,peers),null);
});

test('cue accents validate independently of the normal route palette', () => {
  const colors={'channel:2':'#9876ab'};
  assert.equal(routeColor(colors,2),'#9876ab');
  assert.equal(routeColor(colors,1),'#7dd3fc');
  assert.equal(accentColor('#ABCDEF'),'#abcdef');
  assert.equal(accentColor('red'),undefined);
  assert.equal(accentColor('url(secret)'),undefined);
  assert.equal(routeColor({'channel:2':'url(secret)'},2),'#c4b5fd');
});


test('a ready browser never substitutes for the selected managed server target', () => {
  const facts={started:true,unpublished:false,version:'v1',managedOutput:true,bridge:{state:'ok',detail:''},ready:{tone:'ok',label:'Ready',outputs:2,ready:2},slot:{holds:'empty',channel:1,where:'1-20'}};
  assert.equal(describePlayoutStatus(facts).tone,'bad');
  assert.equal(describePlayoutStatus({...facts,slot:undefined}).tone,'warn');
  const bridge={configured:true,outputRequired:true,status:{state:'ok'},outputSlug:'private',channel:1,layer:20,items:[],slot:null};
  const lines=bridgeChecks(bridge);assert.equal(stampOf(lines,{n:1,h:'same'},0).warnings,1);
  assert.equal(stampOf(bridgeChecks({...bridge,slot:undefined}),{n:1,h:'same'},0).warnings,1);
  assert.equal(stampOf(bridgeChecks({...bridge,outputRequired:false}),{n:1,h:'same'},0).warnings,0);
});
