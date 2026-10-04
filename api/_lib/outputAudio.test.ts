import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOutputAudioHandler } from './outputAudio.js';

const hash = 'a'.repeat(64), owner = 'uploader';
let ip = 0;
function request(body: unknown = {version:'published',hash}, token = 'output-capability', method = 'POST') {
  return new Request('https://noacg.studio/api/output/assets',{method,headers:{'content-type':'application/json','x-forwarded-for':`192.0.2.${++ip}`, ...(token ? {authorization:`Bearer ${token}`} : {})}, ...(method === 'POST' ? {body:JSON.stringify(body)} : {})});
}
test('only the exact pinned manifest and database-derived publisher can sign private sound bytes',async()=>{
  const calls: string[] = [];
  const handler = createOutputAudioHandler({
    manifest:async(slug,version)=>slug === 'output-capability' && version === 'published' ? {owner,assets:[{hash,storageKey:`${owner}/audio-${hash}`}]} : null,
    sign:async key=>{ calls.push(key); return 'https://storage.example/signed'; },
  });
  const ok = await handler(request()); assert.equal(ok.status,200); assert.equal(ok.headers.get('cache-control'),'no-store');
  assert.deepEqual(await ok.json(),{url:'https://storage.example/signed'});
  for (const req of [request(undefined,'operator-capability'),request({version:'historical',hash}),request({version:'published',hash:'b'.repeat(64)})]) assert.equal((await handler(req)).status,403);
  assert.equal((await handler(request(undefined,''))).status,401);
  assert.equal((await handler(request(undefined,'output-capability','GET'))).status,405);
  assert.equal((await handler(request({version:'published',hash:'../secret'}))).status,400);
  assert.deepEqual(calls,[`${owner}/audio-${hash}`]);
});
test('JSON cannot authorize another private owner and preparation failures remain retryable',async()=>{
  let called = false;
  const handler = createOutputAudioHandler({manifest:async()=>({owner,assets:[{hash,storageKey:`victim/audio-${hash}`}]}),sign:async()=>{called=true;return 'bad';}});
  assert.equal((await handler(request())).status,403); assert.equal(called,false);
  const unavailable=createOutputAudioHandler({manifest:async()=>{throw Error('down');},sign:async()=>''});
  assert.equal((await unavailable(request())).status,503);
});
