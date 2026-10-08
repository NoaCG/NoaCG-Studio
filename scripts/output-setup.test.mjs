// guards: src/model/outputSetup.ts, src/control/playoutStatus.ts, src/control/prepareLive.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { outputChoice, readOutputSetup, readDestinationId, destinationUrl, accentColor, routeColor, casparSwitch, withCasparSwitch } from '../src/model/outputSetup.ts';
import { bridgeChecks, stampOf } from '../src/control/prepareLive.ts';
import { describePlayoutStatus } from '../src/control/playoutStatus.ts';

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

test('the CasparCG switch: the operator decides; until then nothing that plays through CasparCG loses it', () => {
  const base = { setup: { v: 1, destinations: [] }, serverCues: false, legacyActivity: false, accountDefault: null };
  assert.equal(casparSwitch(base), false, 'a new production with no default is browser only');
  assert.equal(casparSwitch({ ...base, accountDefault: true }), true, 'the account default sets a new production');
  assert.equal(casparSwitch({ ...base, setup: outputChoice('obs', true) }), true, 'a CasparCG destination chosen before the switch existed');
  assert.equal(casparSwitch({ ...base, setup: outputChoice('browser', false), serverCues: true }), true, 'server cues keep their Bridge');
  assert.equal(casparSwitch({ ...base, setup: outputChoice('browser', false) }), false);
  assert.equal(casparSwitch({ ...base, setup: undefined, legacyActivity: true }), true, 'a legacy production follows its recorded CasparCG use');
  assert.equal(casparSwitch({ ...base, setup: undefined }), false);
  // The operator's own switch wins over everything derived.
  assert.equal(casparSwitch({ ...base, setup: withCasparSwitch(outputChoice('obs', true), false), serverCues: true }), false);
  assert.equal(casparSwitch({ ...base, setup: withCasparSwitch(undefined, true) }), true);
});

test('setting the switch keeps the browser output, its legacy profile, and validates', () => {
  const on = withCasparSwitch(outputChoice('vmix', false), true);
  assert.deepEqual(on.destinations.map(d => d.profile), ['vmix', 'casparcg']);
  assert.deepEqual(readOutputSetup(on), on, 'the switch survives a read');
  const off = withCasparSwitch(on, false);
  assert.deepEqual(off.destinations.map(d => d.profile), ['vmix']);
  assert.equal(off.caspar, false);
  assert.deepEqual(withCasparSwitch(undefined, false).destinations, [{ id: 'browser', profile: 'browser' }]);
  assert.equal(readOutputSetup({ v: 1, destinations: [], caspar: 'yes' }).caspar, undefined, 'only a real boolean is a switch');
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


test('an empty CasparCG slot shows Load, not a fault, while a browser renderer carries the graphics', () => {
  const facts={started:true,casparOn:true,bridge:{state:'ok',detail:''},ready:{tone:'ok',label:'Ready',outputs:2,ready:2},slot:{holds:'empty',channel:1,where:'1-20'}};
  assert.equal(describePlayoutStatus(facts).tone,'ok');
  assert.equal(describePlayoutStatus(facts).checks.find(c=>c.key==='slot').short,'Not loaded on 1-20');
  assert.equal(describePlayoutStatus({...facts,slotLost:true}).tone,'bad');
  // D3: the slot is Connected only when the renderer ON it reports; OBS reporting is not CasparCG.
  const ours={...facts,slot:{holds:'ours',channel:1,where:'1-20',reporting:false}};
  assert.equal(describePlayoutStatus(ours).checks.find(c=>c.key==='slot').short,'Loading on 1-20');
  assert.equal(describePlayoutStatus({...ours,slot:{...ours.slot,reporting:true}}).checks.find(c=>c.key==='slot').short,'Connected');
  assert.equal(describePlayoutStatus({...ours,slot:{holds:'ours',channel:1,where:'1-20'}}).checks.find(c=>c.key==='slot').short,'Connected','an untagged output: any renderer stands for it');
  const bridge={configured:true,outputRequired:true,status:{state:'ok'},outputSlug:'private',channel:1,layer:20,items:[],slot:null};
  const lines=bridgeChecks(bridge);assert.equal(stampOf(lines,{n:1,h:'same'},0).warnings,1);
  assert.equal(stampOf(bridgeChecks({...bridge,slot:undefined}),{n:1,h:'same'},0).warnings,1);
  assert.equal(stampOf(bridgeChecks({...bridge,outputRequired:false}),{n:1,h:'same'},0).warnings,0);
});
