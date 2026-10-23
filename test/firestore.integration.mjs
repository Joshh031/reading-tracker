import test from 'node:test';
import assert from 'node:assert/strict';
import {firestoreStore} from '../server/store.js';
import {pipeline} from '../server/pipeline.js';
if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Run only against the Firestore emulator. Production tests are prohibited.');
process.env.FIREBASE_PROJECT_ID='demo-knowledge-vault';
test('Firestore persists, deduplicates, isolates users, and detects conflicting reflection edits',async()=>{
  const store=firestoreStore(),jobs=pipeline(store),url='https://podcasts.apple.com/podcast/id123?i=456',uid='test-'+Date.now();
  const a=await Promise.all([jobs.add(uid,url),jobs.add(uid,url)]);assert.equal(a.filter(x=>x.created).length,1);
  assert.equal((await store.list(uid)).length,1);assert.equal(await store.get(uid+'-other','apple-456'),null);
  await store.saveReflection(uid,'apple-456',{raw:'Only half listened. My own reflection.',listenedPercent:50,organized:'',questions:[]},0);
  await assert.rejects(()=>store.saveReflection(uid,'apple-456',{raw:'stale'},0),e=>e.code==='REFLECTION_CONFLICT');
  const reopened=firestoreStore();assert.equal((await reopened.get(uid,'apple-456')).reflection.raw,'Only half listened. My own reflection.');
  const transcript={hash:'test-hash',segments:Array.from({length:1000},(_,i)=>({id:'s'+i,text:'A synthetic transcript segment. '.repeat(25),speaker:'Test speaker',start:i,end:i+1}))};
  const meta=await store.saveTranscript(uid,'apple-456',transcript);assert.ok(meta.chunks>1);assert.deepEqual((await reopened.transcript(uid,'apple-456',meta)).segments,transcript.segments);
  const leases=await Promise.all([store.acquire(uid,'apple-456'),store.acquire(uid,'apple-456')]);assert.equal(leases.filter(Boolean).length,1);
  await store.release(uid,'apple-456',leases.find(Boolean).lease,{status:'ready'});
  assert.equal((await store.get(uid,'apple-456')).status,'ready');
  assert.equal((await store.syncDaily(uid,'apple-456','2026-10-23')).status,'preview_disabled');
});
test('Firestore client API rejects unauthenticated archive reads',async()=>{
  const url=`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/demo-knowledge-vault/databases/(default)/documents/knowledgeVaultPreviewUsers/test/episodes/apple-456`;
  const response=await fetch(url);assert.equal(response.status,403);
});
